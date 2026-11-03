import type { PacketModel } from "../packet/model";

// Parses and resolves every reference format that appears in sources, inputs,
// diagnostics.refs and timeline.refs. Unresolvable refs are reported, never
// crashed on.

export type RefKind =
  | "extracted_value"
  | "document"
  | "doc_page" // doc:<id>#page<n> — a page the pipeline did not extract
  | "client_item"
  | "prior_year"
  | "agency"
  | "asset"
  | "household"
  | "param"
  | "fx"
  | "timeline"
  | "version"
  | "line"
  | "unknown";

export interface ParsedRef {
  raw: string;
  kind: RefKind;
  /** Secondary id (e.g. page number for doc_page). */
  detail?: string;
}

export interface ResolvedRef extends ParsedRef {
  resolved: boolean;
  label: string;
  target?: unknown;
  /** Where to link in the UI, when applicable. */
  href?: string;
  error?: string;
}

export function parseRef(raw: string): ParsedRef {
  const r = raw.trim();
  if (/^ev-\d+$/.test(r)) return { raw: r, kind: "extracted_value" };
  const docPage = r.match(/^doc:(D\d{2})#page(\d+)$/);
  if (docPage) return { raw: r, kind: "doc_page", detail: docPage[2] };
  if (/^D\d{2}$/.test(r)) return { raw: r, kind: "document" };
  if (/^(qa|msg|call)-\d+$/.test(r)) return { raw: r, kind: "client_item" };
  if (r.startsWith("py:/")) return { raw: r, kind: "prior_year", detail: r.slice(3) };
  if (r.startsWith("agency:/")) return { raw: r, kind: "agency", detail: r.slice(7) };
  if (r.startsWith("asset:")) return { raw: r, kind: "asset", detail: r.slice(6) };
  if (r.startsWith("household:")) return { raw: r, kind: "household", detail: r.slice(10) };
  if (r.startsWith("ref:param.")) return { raw: r, kind: "param", detail: r.slice("ref:param.".length) };
  if (r.startsWith("ref:fx.")) return { raw: r, kind: "fx", detail: r.slice("ref:fx.".length) };
  if (r.startsWith("timeline:")) return { raw: r, kind: "timeline", detail: r.slice("timeline:".length) };
  if (/^v\d+$/.test(r)) return { raw: r, kind: "version" };
  // Line key: <FORM>.<line>, e.g. F1040.11, SchCA540NR.1.E, F8949.H.C6, F4562-C.22
  if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(r) && !r.includes(":")) return { raw: r, kind: "line" };
  return { raw: r, kind: "unknown" };
}

/** RFC 6901 JSON Pointer resolution. Returns undefined if any token is missing. */
export function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return root;
  if (!pointer.startsWith("/")) return undefined;
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      const obj = cur as Record<string, unknown>;
      if (!(tok in obj)) return undefined;
      cur = obj[tok];
    } else {
      return undefined;
    }
  }
  return cur;
}

function findAsset(model: PacketModel, assetId: string): unknown {
  for (const v of model.versions) {
    for (const a of v.assets) {
      if ((a as Record<string, unknown>).asset_id === assetId) return a;
    }
  }
  const priorAssets = (model.raw.prior_years as Record<string, unknown>).asset_records;
  if (Array.isArray(priorAssets)) {
    for (const a of priorAssets) {
      if (a && typeof a === "object" && (a as Record<string, unknown>).asset_id === assetId) return a;
    }
  }
  return undefined;
}

/**
 * Resolve a ref. `versionId` is required to resolve line-key refs, which point
 * at other lines in the SAME version only.
 */
export function resolveRef(model: PacketModel, raw: string, versionId?: string): ResolvedRef {
  const p = parseRef(raw);
  const base: ResolvedRef = { ...p, resolved: false, label: raw };

  switch (p.kind) {
    case "extracted_value": {
      const ev = model.evById.get(p.raw);
      if (!ev) return { ...base, error: "extracted value not found" };
      return {
        ...base,
        resolved: true,
        target: ev,
        label: `${ev.label ?? ev.field} (${p.raw})`,
        href: `/doc/${ev.document_id}/p/${ev.page ?? 1}#${ev.id}`,
      };
    }
    case "document": {
      const d = model.docById.get(p.raw);
      if (!d) return { ...base, error: "document not found" };
      return { ...base, resolved: true, target: d, label: `${d.title} (${p.raw})`, href: `/doc/${p.raw}` };
    }
    case "doc_page": {
      const d = model.docById.get(p.raw.slice(4).split("#")[0]);
      const docId = p.raw.slice(4).split("#")[0];
      if (!d) return { ...base, error: "document not found" };
      return {
        ...base,
        resolved: true,
        target: d,
        label: `${d.title} — page ${p.detail} (not extracted)`,
        href: `/doc/${docId}/p/${p.detail}`,
      };
    }
    case "client_item": {
      const item = model.clientItemById.get(p.raw);
      if (!item) return { ...base, error: "client item not found" };
      const kind = p.raw.startsWith("qa") ? "Question" : p.raw.startsWith("msg") ? "Message" : "Call note";
      return { ...base, resolved: true, target: item, label: `${kind} ${p.raw}` };
    }
    case "prior_year": {
      const t = resolveJsonPointer(model.raw.prior_years, p.detail!);
      if (t === undefined) return { ...base, error: "prior-year pointer not found" };
      return { ...base, resolved: true, target: t, label: `Prior year ${p.detail}` };
    }
    case "agency": {
      const t = resolveJsonPointer(model.raw.tax_agency_records, p.detail!);
      if (t === undefined) return { ...base, error: "agency pointer not found" };
      return { ...base, resolved: true, target: t, label: `Agency record ${p.detail}` };
    }
    case "asset": {
      const a = findAsset(model, p.detail!);
      if (a === undefined) return { ...base, error: "asset not found" };
      return { ...base, resolved: true, target: a, label: `Asset ${p.detail}` };
    }
    case "household": {
      const people = (model.raw.household as Record<string, unknown>).people;
      const person = Array.isArray(people)
        ? people.find((x) => x && typeof x === "object" && (x as Record<string, unknown>).id === p.detail)
        : undefined;
      if (!person) return { ...base, error: "household member not found" };
      return {
        ...base,
        resolved: true,
        target: person,
        label: `${(person as Record<string, unknown>).name ?? p.detail}`,
      };
    }
    case "param": {
      const t = resolveJsonPointer(model.raw.engine_reference, "/parameters/" + p.detail!.replace(/\./g, "/"));
      if (t === undefined) return { ...base, error: "parameter not found" };
      return { ...base, resolved: true, target: t, label: `Parameter ${p.detail}` };
    }
    case "fx": {
      // ref:fx.SEK.<rate> -> engine_reference.parameters.fx.SEK.<rate>, also fx_rates
      const t =
        resolveJsonPointer(model.raw.engine_reference, "/parameters/fx/" + p.detail!.replace(/\./g, "/")) ??
        resolveJsonPointer(model.raw.fx_rates, "/" + p.detail!.replace(/\./g, "/"));
      if (t === undefined) return { ...base, error: "fx rate not found" };
      return { ...base, resolved: true, target: t, label: `FX ${p.detail}` };
    }
    case "timeline": {
      const t = Array.isArray(model.raw.timeline)
        ? model.raw.timeline.find((e) => (e as Record<string, unknown>).id === p.detail)
        : undefined;
      if (!t) return { ...base, error: "timeline event not found" };
      return { ...base, resolved: true, target: t, label: `Timeline ${p.detail}` };
    }
    case "version": {
      const v = model.versionById.get(p.raw);
      if (!v) return { ...base, error: "version not found" };
      return { ...base, resolved: true, target: v, label: `Return ${p.raw}`, href: `/` };
    }
    case "line": {
      if (!versionId) return { ...base, error: "line ref needs a version context" };
      const lines = model.lineByVersionKey.get(versionId);
      const ln = lines?.get(p.raw);
      if (!ln) return { ...base, error: `line ${p.raw} not in ${versionId}` };
      return {
        ...base,
        resolved: true,
        target: ln,
        label: `${ln.label ?? p.raw} (${p.raw})`,
        href: `/line/${versionId}/${encodeURIComponent(p.raw)}`,
      };
    }
    default:
      return { ...base, error: "unrecognized reference format" };
  }
}

/** Collect every ref in a version's line sources/inputs, diagnostics and timeline. */
export function collectAllRefs(model: PacketModel): Array<{ raw: string; where: string; versionId?: string }> {
  const out: Array<{ raw: string; where: string; versionId?: string }> = [];
  for (const v of model.versions) {
    for (const ln of v.lines) {
      for (const s of ln.sources) out.push({ raw: s, where: `${v.version}:${ln.key}.sources`, versionId: v.version });
      for (const i of ln.inputs) out.push({ raw: i, where: `${v.version}:${ln.key}.inputs`, versionId: v.version });
    }
    for (const d of v.diagnostics) {
      for (const r of d.refs) out.push({ raw: r, where: `${v.version}:diag:${d.code}`, versionId: v.version });
    }
  }
  if (Array.isArray(model.raw.timeline)) {
    for (const e of model.raw.timeline) {
      const refs = (e as Record<string, unknown>).refs;
      if (Array.isArray(refs)) {
        for (const r of refs) out.push({ raw: String(r), where: `timeline:${(e as Record<string, unknown>).id}` });
      }
    }
  }
  return out;
}
