import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { buildRecipe, type RecipeNode } from "@/lib/evidence/trace";
import { verifyValue } from "@/lib/evidence/verify";
import { maskValue } from "@/lib/mask";
import { VerificationBadge, Confidence, RefLink } from "@/components/ui";
import type { ResolvedRef } from "@/lib/refs/resolve";

function SourceRow({ s, cleared, model }: { s: ResolvedRef; cleared: boolean; model: ReturnType<typeof loadModel> }) {
  const ev = s.kind === "extracted_value" ? model.evById.get(s.raw) : undefined;
  const v = ev ? verifyValue(model, ev) : null;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="chip bg-slate-100 text-slate-600">{s.kind.replace(/_/g, " ")}</span>
      <RefLink href={s.href} label={s.label} />
      {ev ? <span className="mono text-slate-700">= {maskValue(ev.value, ev.value_type, cleared)}</span> : null}
      {v ? <VerificationBadge status={v.status} /> : null}
      {ev ? <Confidence value={ev.confidence} /> : null}
      {!s.resolved ? <span className="chip bg-red-100 text-red-800">unresolved: {s.error}</span> : null}
    </li>
  );
}

function RecipeTree({
  node,
  cleared,
  model,
  depth = 0,
}: {
  node: RecipeNode;
  cleared: boolean;
  model: ReturnType<typeof loadModel>;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-4 border-l border-slate-200 pl-4" : ""}>
      <div className="card mb-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/line/${node.versionId}/${encodeURIComponent(node.key)}`} className="mono font-semibold">
            {node.key}
          </Link>
          <span className="mono text-slate-800">
            {typeof node.value === "number" ? node.value.toLocaleString() : String(node.value)}
          </span>
        </div>
        <div className="text-sm text-slate-600">{node.label}</div>
        {node.rule ? (
          <div className="mt-1 text-xs text-slate-500">
            <span className="mono">{node.rule}</span>
            {node.ruleText ? ` — ${node.ruleText}` : ""}
          </div>
        ) : null}
        {node.note ? <div className="mt-1 rounded bg-amber-50 p-1 text-xs text-amber-900">{node.note}</div> : null}
        {node.truncated ? (
          <div className="mt-1 chip bg-red-100 text-red-800">stopped: {node.truncated}</div>
        ) : null}
        {node.sources.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {node.sources.map((s, i) => (
              <SourceRow key={i} s={s} cleared={cleared} model={model} />
            ))}
          </ul>
        ) : null}
      </div>
      {node.inputs.length > 0 ? (
        <div>
          <div className="mb-1 ml-1 text-xs uppercase tracking-wide text-slate-400">inputs</div>
          {node.inputs.map((child) => (
            <RecipeTree key={child.key} node={child} cleared={cleared} model={model} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function LinePage({ params }: { params: Promise<{ version: string; key: string }> }) {
  const { version, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const model = loadModel();
  const session = await getSession();

  const recipe = buildRecipe(model, version, key);
  if (!recipe) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          Recipe for <span className="mono">{key}</span> <span className="text-slate-400">in {version}</span>
        </h1>
        <p className="text-sm text-slate-500">
          Trace any number to its exact source: inputs recurse into other lines of the same version; sources resolve to
          documents, client answers, prior years, agency records, assets or parameters — each with its verification status.
        </p>
      </div>
      <RecipeTree node={recipe} cleared={session.cleared} model={model} />
    </div>
  );
}
