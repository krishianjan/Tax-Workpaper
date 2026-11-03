import { createHash } from "node:crypto";
import type { PacketModel } from "../packet/model";
import type { CheckResult, Area } from "../checks/types";
import type { Effects } from "../effects";
import { ZERO_EFFECTS, addEffects } from "../effects";

// An Issue is ONE real-world problem that may be flagged by several checks
// (D28 basis is hit by VALUE_VS_PRINT and MISSING_OR_ZERO_BASIS). We group
// findings by fingerprint = problem class + primary document (or primary line).
//
// Tax effect NEVER sums raw findings. Within an issue we group findings by the
// line they change and take the largest-magnitude effect per line, then sum
// across DISTINCT lines — so the same change counted by two checks is counted
// once, while genuinely distinct lines (RSU lots N1/N3/N4) add up.

export type IssueKind =
  | "return_error"
  | "extraction_error"
  | "judgment"
  | "scope"
  | "compliance"
  | "completeness"
  | "prior_preparer_open_item"
  | "arithmetic"
  | "informational";

const CLASS: Record<string, { cls: string; kind: IssueKind; title: string }> = {
  MISSING_OR_ZERO_BASIS: { cls: "basis", kind: "return_error", title: "Cost basis missing on security sales" },
  VALUE_VS_PRINT: { cls: "extraction", kind: "extraction_error", title: "Extracted value disagrees with the page" },
  THIRD_PARTY_VS_BOOKS: { cls: "gross_receipts", kind: "return_error", title: "Schedule C gross receipts" },
  DUPLICATE_PAGE: { cls: "mileage", kind: "return_error", title: "Duplicate page inflates a page-summed line" },
  PARTIAL_EXTRACTION: { cls: "broker_detail", kind: "return_error", title: "Transactions on an unread page" },
  BROKER_SUMMARY_VS_DETAIL: { cls: "broker_detail", kind: "return_error", title: "Broker summary vs detail" },
  DUPLICATE_DOCUMENT: { cls: "duplicate", kind: "informational", title: "Duplicate document" },
  CLIENT_ESTIMATE_VS_THIRD_PARTY: { cls: "client_estimate", kind: "return_error", title: "Client estimate vs third-party document" },
  PAYMENTS_VS_AGENCY: { cls: "payments", kind: "return_error", title: "Estimated payments vs agency records" },
  STATE_SOURCE_WAGES: { cls: "state_wages", kind: "judgment", title: "California-source wage split" },
  QUESTIONNAIRE_VS_DOCS: { cls: "questionnaire", kind: "judgment", title: "Questionnaire answer vs documents" },
  IDENTITY_CONSISTENCY: { cls: "identity", kind: "return_error", title: "Identity (SSN) inconsistency" },
  PAYEE_NAME_CONSISTENCY: { cls: "payee_name", kind: "return_error", title: "Payee name inconsistency" },
  PRIOR_YEAR_VARIANCE: { cls: "variance", kind: "informational", title: "Year-over-year variance" },
  BUSINESS_USE_FROM_EVIDENCE: { cls: "business_use", kind: "judgment", title: "Business-use percentage" },
  PERSONAL_IN_BUSINESS: { cls: "personal", kind: "judgment", title: "Personal expense in the business" },
  CARRYOVER_AGREEMENT: { cls: "carryover", kind: "informational", title: "Carryover agreement" },
  VERSION_DIFF: { cls: "arithmetic", kind: "arithmetic", title: "Version diff" },
  SUM_RECOMPUTE: { cls: "arithmetic", kind: "arithmetic", title: "Arithmetic integrity" },
  ENGINE_DIAGNOSTICS: { cls: "diagnostic", kind: "compliance", title: "Engine diagnostic" },
};

const CLS_TITLE: Record<string, string> = {
  basis: "Cost basis missing on security sales",
  extraction: "Extracted value disagrees with the page",
};

const LINE_RE = /^(?:v\d+:)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/;

/** The document a finding is really about: the primary line's source document,
 *  else a Dxx in refs, else the referenced ev's own document. */
function anchorDoc(model: PacketModel, r: CheckResult, versionId: string): string | null {
  const lineKey = primaryLineKey(model, r, versionId);
  if (lineKey) {
    const ln = model.versionById.get(versionId)?.lines.find((l) => l.key === lineKey);
    const evSrc = ln?.sources.find((s) => /^ev-\d+$/.test(s));
    const doc = evSrc ? model.evById.get(evSrc)?.document_id : undefined;
    if (doc) return doc;
  }
  const d = r.refs.find((x) => /^D\d{2}$/.test(x));
  if (d) return d;
  const ev = r.refs.find((x) => /^ev-\d+$/.test(x));
  return ev ? (model.evById.get(ev)?.document_id ?? null) : null;
}

/** Problem class for a finding, with overrides (a basis-field extraction read
 *  belongs to the basis problem so the two checks collapse into one issue). */
function classify(model: PacketModel, r: CheckResult): { cls: string; kind: IssueKind; title: string } {
  const base = CLASS[r.checkId] ?? { cls: r.checkId, kind: "informational" as IssueKind, title: r.title };
  if (r.checkId === "VALUE_VS_PRINT") {
    const ev = r.refs.find((x) => /^ev-\d+$/.test(x));
    const field = ev ? model.evById.get(ev)?.field ?? "" : "";
    if (/basis/i.test(field)) return { cls: "basis", kind: "return_error", title: CLS_TITLE.basis };
  }
  return base;
}

function findingEffects(r: CheckResult): Effects {
  return {
    taxFed: r.taxEffectFed ?? 0n,
    taxCa: r.taxEffectCa ?? 0n,
    payFed: r.paymentEffectFed ?? 0n,
    payCa: r.paymentEffectCa ?? 0n,
  };
}

function absSum(e: Effects): bigint {
  const a = (x: bigint) => (x < 0n ? -x : x);
  return a(e.taxFed) + a(e.taxCa) + a(e.payFed) + a(e.payCa);
}

/** Primary line key a finding changes, resolving an ev to the line it feeds. */
export function primaryLineKey(model: PacketModel, r: CheckResult, versionId: string): string | null {
  for (const ref of [...(r.refs ?? [])]) {
    const m = ref.match(LINE_RE);
    if (m && !ref.startsWith("ev-") && !/^D\d/.test(ref)) return m[1];
  }
  // ev ref -> the line that sources it
  const evRef = r.refs.find((x) => /^ev-\d+$/.test(x));
  if (evRef) {
    const lines = model.versionById.get(versionId)?.lines ?? [];
    const ln = lines.find((l) => l.sources.includes(evRef));
    if (ln) return ln.key;
  }
  return null;
}

export interface Issue {
  id: string;
  title: string;
  area: Area;
  kind: IssueKind;
  findingIds: string[];
  effects: Effects; // deduped across checks, summed across distinct lines
  materiality: bigint;
  refs: string[];
  judgment: boolean;
  worstStatus: "fail" | "warn" | "info";
}

export function groupIssues(model: PacketModel, findings: CheckResult[], versionId: string): Issue[] {
  const buckets = new Map<string, CheckResult[]>();
  const fpMeta = new Map<string, { cls: string; kind: IssueKind; title: string }>();
  for (const r of findings) {
    const meta = classify(model, r);
    const doc = anchorDoc(model, r, versionId);
    const lineKey = primaryLineKey(model, r, versionId);
    const anchor = doc ?? lineKey ?? r.refs[0] ?? r.id;
    const fp = `${meta.cls}|${anchor}`;
    const arr = buckets.get(fp);
    if (arr) arr.push(r);
    else buckets.set(fp, [r]);
    if (!fpMeta.has(fp)) fpMeta.set(fp, meta);
  }

  const issues: Issue[] = [];
  for (const [fp, group] of buckets) {
    const meta = fpMeta.get(fp) ?? { cls: fp, kind: "informational" as IssueKind, title: group[0].title };

    // Dedupe effects: per distinct primary line, keep the largest-magnitude finding.
    const byLine = new Map<string, CheckResult>();
    for (const r of group) {
      const key = primaryLineKey(model, r, versionId) ?? r.id;
      const cur = byLine.get(key);
      if (!cur || absSum(findingEffects(r)) > absSum(findingEffects(cur))) byLine.set(key, r);
    }
    let effects = ZERO_EFFECTS;
    for (const r of byLine.values()) effects = addEffects(effects, findingEffects(r));

    const judgment = group.every((r) => r.judgment) && group.some((r) => r.judgment);
    const worst: Issue["worstStatus"] = group.some((r) => r.status === "fail")
      ? "fail"
      : group.some((r) => r.status === "warn")
        ? "warn"
        : "info";

    issues.push({
      id: createHash("sha256").update(fp).digest("hex").slice(0, 16),
      title: meta.title,
      area: group[0].area,
      kind: judgment ? "judgment" : meta.kind,
      findingIds: group.map((r) => r.id),
      effects,
      materiality: absSum(effects),
      refs: [...new Set(group.flatMap((r) => r.refs))],
      judgment,
      worstStatus: worst,
    });
  }

  return issues.sort((a, b) => (a.materiality === b.materiality ? a.id.localeCompare(b.id) : a.materiality > b.materiality ? -1 : 1));
}

/** Return-affecting issues only (for the ~15-25 count and ERRORS_FOUND). */
export function returnAffecting(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.kind === "return_error" || i.kind === "extraction_error");
}
