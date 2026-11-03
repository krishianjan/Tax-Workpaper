import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { emitEvent } from "../event";
import { validatePacket, buildModel } from "./model";
import { parseRef, resolveRef } from "../refs/resolve";
import { verifyAll } from "../evidence/verify";
import { computeDispositions } from "../evidence/disposition";
import { computeDocumentLinks, computePageDuplicates } from "../evidence/links";
import { seedFromPacket } from "../firm/standards";
import { collectSensitiveFields } from "../firm/sensitiveCatalog";
import { encryptField, maskToken } from "../firm/sensitive";

export interface ImportReport {
  imported: boolean;
  sha256: string;
  counts: {
    documents: number;
    pages: number;
    extractedValues: number;
    versions: number;
    lines: number;
    verifications: number;
    dispositions: number;
    documentLinks: number;
  };
  unresolvedRefs: Array<{ raw: string; where: string; error?: string }>;
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Import the packet. Same sha256 => no-op (idempotent). A different sha creates a
 * new import and keeps the old one. All writes happen in one transaction.
 */
export async function importPacket(buf: Buffer): Promise<ImportReport> {
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const existing = await prisma.packetImport.findUnique({ where: { sha256 } });
  if (existing) {
    return emptyReport(sha256, false);
  }

  const raw = validatePacket(JSON.parse(buf.toString("utf8")));
  const model = buildModel(raw, sha256);

  // Resolve every reference up front for integrity reporting.
  const unresolved: Array<{ raw: string; where: string; error?: string }> = [];

  let lineCount = 0;
  const verifications = verifyAll(model);
  const dispositions = computeDispositions(model);
  const docLinks = computeDocumentLinks(model);

  await prisma.$transaction(
    async (tx) => {
      // Deactivate prior imports; activate this one.
      await tx.packetImport.updateMany({ data: { isActive: false }, where: { isActive: true } });
      await tx.packetImport.create({
        data: { sha256, raw: raw as unknown as Prisma.InputJsonValue, isActive: true },
      });

      // Layer B — normalized packet
      await tx.document.createMany({
        data: model.documents.map((d) => ({
          id: d.id,
          title: d.title,
          documentType: d.document_type,
          issuer: d.issuer ?? null,
          belongsTo: d.belongs_to ?? null,
          taxYear: d.tax_year ?? null,
          receivedAt: toDate(d.received_at),
          uploadedBy: d.uploaded_by ?? null,
          fileName: d.file_name ?? null,
          pageCount: d.page_count,
          markedCorrected: Boolean(d.marked_corrected),
          extractionStatus: d.extraction.status,
          extractionReason: d.extraction.reason ?? null,
        })),
      });

      await tx.page.createMany({
        data: model.documents.flatMap((d) =>
          d.pages.map((p) => ({ documentId: d.id, pageNo: p.page, printedContent: p.printed_content })),
        ),
      });

      await tx.extractedValue.createMany({
        data: raw.extracted_values.map((e) => ({
          id: e.id,
          documentId: e.document_id,
          pageNo: e.page ?? null,
          field: e.field,
          label: e.label ?? null,
          valueJson: (e.value ?? null) as Prisma.InputJsonValue,
          valueType: e.value_type,
          textAsRead: e.text_as_read ?? "",
          position: (e.position ?? null) as Prisma.InputJsonValue,
          confidence: e.confidence,
        })),
      });

      // Client items
      const clientRows: Prisma.ClientItemCreateManyInput[] = [];
      for (const [bucket, kind] of [
        ["questionnaire", "questionnaire"],
        ["messages", "message"],
        ["call_notes", "call_note"],
      ] as const) {
        const arr = (raw.client as Record<string, unknown>)[bucket];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const o = item as Record<string, unknown>;
            clientRows.push({
              id: String(o.id),
              kind,
              payload: o as Prisma.InputJsonValue,
              at: toDate((o.answered_at ?? o.at ?? o.sent_at) as string | undefined),
            });
          }
        }
      }
      if (clientRows.length) await tx.clientItem.createMany({ data: clientRows });

      // Versions, lines, inputs, sources, diagnostics
      for (const v of model.versions) {
        await tx.returnVersion.create({
          data: {
            id: v.version,
            computedAt: new Date(v.computed_at),
            trigger: v.trigger ?? null,
            summary: v.summary as Prisma.InputJsonValue,
            taxEffectRates: v.tax_effect_rates as Prisma.InputJsonValue,
            documentsUsed: v.documents_used,
            documentsSuperseded: v.documents_superseded,
          },
        });

        await tx.returnLine.createMany({
          data: v.lines.map((ln) => ({
            versionId: v.version,
            key: ln.key,
            jurisdiction: ln.jurisdiction,
            form: ln.form ?? null,
            line: ln.line != null ? String(ln.line) : null,
            label: ln.label ?? null,
            valueJson: (ln.value ?? null) as Prisma.InputJsonValue,
            rule: ln.rule ?? null,
            note: ln.note ?? null,
          })),
        });
        lineCount += v.lines.length;

        const inputs: Prisma.LineInputCreateManyInput[] = [];
        const sources: Prisma.LineSourceCreateManyInput[] = [];
        for (const ln of v.lines) {
          for (const i of ln.inputs) inputs.push({ versionId: v.version, lineKey: ln.key, inputKey: i });
          for (const s of ln.sources) {
            const r = resolveRef(model, s, v.version);
            if (!r.resolved) unresolved.push({ raw: s, where: `${v.version}:${ln.key}.sources`, error: r.error });
            sources.push({
              versionId: v.version,
              lineKey: ln.key,
              refRaw: s,
              refKind: parseRef(s).kind,
              targetId: r.resolved ? s : null,
              resolved: r.resolved,
            });
          }
        }
        if (inputs.length) await tx.lineInput.createMany({ data: inputs });
        if (sources.length) await tx.lineSource.createMany({ data: sources });

        if (v.diagnostics.length) {
          await tx.diagnostic.createMany({
            data: v.diagnostics.map((d) => ({
              versionId: v.version,
              code: d.code,
              severity: d.severity,
              message: d.message,
              refs: d.refs,
            })),
          });
          for (const d of v.diagnostics) {
            for (const r of d.refs) {
              const res = resolveRef(model, r, v.version);
              if (!res.resolved) unresolved.push({ raw: r, where: `${v.version}:diag:${d.code}`, error: res.error });
            }
          }
        }
      }

      // Timeline ref integrity
      if (Array.isArray(raw.timeline)) {
        for (const e of raw.timeline) {
          const refs = (e as Record<string, unknown>).refs;
          if (Array.isArray(refs)) {
            for (const r of refs) {
              const res = resolveRef(model, String(r));
              if (!res.resolved)
                unresolved.push({ raw: String(r), where: `timeline:${(e as Record<string, unknown>).id}`, error: res.error });
            }
          }
        }
      }

      // Staff / client users
      if (model.staff.length)
        await tx.staff.createMany({
          data: model.staff.map((s) => ({
            id: s.id,
            role: s.role,
            credential: s.credential ?? null,
            sensitiveDataClearance: s.sensitive_data_clearance,
          })),
        });
      const clientUsers = (raw.firm as Record<string, unknown>).client_users;
      if (Array.isArray(clientUsers) && clientUsers.length)
        await tx.clientUser.createMany({
          data: clientUsers.map((u) => ({ id: String((u as Record<string, unknown>).id), payload: u as Prisma.InputJsonValue })),
        });

      // Reference blobs
      const blobs: Array<[string, unknown]> = [
        ["prior_years", raw.prior_years],
        ["tax_agency_records", raw.tax_agency_records],
        ["timeline", raw.timeline],
        ["engine_reference", raw.engine_reference],
        ["household", raw.household],
        ["firm", raw.firm],
        ["fx_rates", (raw as Record<string, unknown>).fx_rates ?? {}],
      ];
      await tx.packetBlob.createMany({
        data: blobs.map(([key, payload]) => ({ key, payload: payload as Prisma.InputJsonValue })),
      });

      // Layer C — computed workpaper rows
      await tx.verification.createMany({
        data: verifications.map((vf) => ({
          extractedValueId: vf.extractedValueId,
          status: vf.status,
          method: vf.method,
          sourceText: vf.sourceText,
          note: vf.note,
        })),
      });

      await tx.disposition.createMany({
        data: dispositions.map((d) => ({
          documentId: d.documentId,
          status: d.status,
          reason: d.reason,
          refs: d.refs,
        })),
      });

      if (docLinks.length)
        await tx.documentLink.createMany({
          data: docLinks.map((l) => ({
            fromDocId: l.fromDocId,
            toDocId: l.toDocId,
            kind: l.kind,
            basis: l.basis as Prisma.InputJsonValue,
            method: l.method,
          })),
        });

      const pageLinks: Prisma.PageLinkCreateManyInput[] = [];
      for (const d of model.documents) {
        for (const pd of computePageDuplicates(d)) {
          pageLinks.push({ docId: d.id, pageNo: pd.pageNo, duplicateOfPage: pd.duplicateOfPage });
        }
      }
      if (pageLinks.length) await tx.pageLink.createMany({ data: pageLinks });

      // 7.1 Seed firm standards version 1 from firm.starter_standards.
      await tx.firmStandard.create({
        data: { content: seedFromPacket(model) as unknown as object, createdBy: "system", note: "seeded from packet", active: true },
      });

      // 7.2 Seed the encrypted sensitive-value store (masked tokens elsewhere).
      for (const f of collectSensitiveFields(model)) {
        const enc = encryptField(f.plaintext);
        await tx.sensitiveValue.create({
          data: {
            ref: f.ref,
            kind: f.kind,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            authTag: enc.authTag,
            maskToken: maskToken(f.kind, f.plaintext),
            ownerEntity: f.ownerEntity,
          },
        });
      }

      await emitEvent(tx, {
        actorId: "system",
        type: "packet.imported",
        entityKind: "packet_import",
        entityId: sha256,
        payload: { documents: model.documents.length, extractedValues: raw.extracted_values.length },
      });
    },
    { timeout: 180000, maxWait: 30000 },
  );

  return {
    imported: true,
    sha256,
    counts: {
      documents: model.documents.length,
      pages: model.documents.reduce((n, d) => n + d.pages.length, 0),
      extractedValues: raw.extracted_values.length,
      versions: model.versions.length,
      lines: lineCount,
      verifications: verifications.length,
      dispositions: dispositions.length,
      documentLinks: docLinks.length,
    },
    unresolvedRefs: unresolved,
  };
}

function emptyReport(sha256: string, imported: boolean): ImportReport {
  return {
    imported,
    sha256,
    counts: {
      documents: 0,
      pages: 0,
      extractedValues: 0,
      versions: 0,
      lines: 0,
      verifications: 0,
      dispositions: 0,
      documentLinks: 0,
    },
    unresolvedRefs: [],
  };
}
