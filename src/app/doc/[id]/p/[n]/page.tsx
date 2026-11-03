import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { SimulatedRenderer } from "@/lib/render/renderer";
import { locate, splitForHighlight } from "@/lib/evidence/highlight";
import { verifyValue } from "@/lib/evidence/verify";
import { maskPrintedContent, maskValue } from "@/lib/mask";
import { VerificationBadge, Confidence } from "@/components/ui";

export default async function PageViewer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; n: string }>;
  searchParams: Promise<{ ev?: string }>;
}) {
  const { id, n } = await params;
  const { ev: activeEv } = await searchParams;
  const pageNo = Number(n);
  const model = loadModel();
  const doc = model.docById.get(id);
  if (!doc) notFound();
  const session = await getSession();

  const renderer = new SimulatedRenderer(model);
  const rendered = renderer.renderPage(id, pageNo, session.cleared);
  if (!rendered) notFound();

  const page = doc.pages.find((p) => p.page === pageNo)!;
  const active = activeEv ? model.evById.get(activeEv) : undefined;
  const activeOnPage = active && (active.page ?? 1) === pageNo ? active : undefined;

  // Highlight the active value in the raw (unmasked) text, then mask the output.
  const loc = activeOnPage ? locate(activeOnPage, page.printed_content) : { found: false, span: null, needle: null };
  const [before, match, after] = splitForHighlight(page.printed_content, loc.span);

  const fieldEvs = (model.evsByDoc.get(id) ?? []).filter((e) => (e.page ?? 1) === pageNo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/doc/${id}`} className="mono text-sm">
            ← {id}
          </Link>
          <h1 className="text-lg font-semibold">
            {doc.title} — page {pageNo}
          </h1>
        </div>
        <div className="flex gap-1">
          {doc.pages.map((p) => (
            <Link
              key={p.page}
              href={`/doc/${id}/p/${p.page}`}
              className={`chip ${p.page === pageNo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {p.page}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Simulated paper */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
            <span className="font-semibold text-slate-700">{rendered.issuer}</span>
            <span className="chip bg-amber-100 text-amber-800">{rendered.simulatedLabel}</span>
          </div>
          <div className="px-5 py-4">
            <div className="mb-2 text-sm font-semibold text-slate-800">
              {rendered.formTitle} <span className="text-slate-400">· template: {rendered.template}</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[0.8rem] leading-relaxed text-slate-800">
              {activeOnPage && loc.found ? (
                <>
                  {maskPrintedContent(before, session.cleared)}
                  <mark className="bg-yellow-200">{maskPrintedContent(match, session.cleared)}</mark>
                  {maskPrintedContent(after, session.cleared)}
                </>
              ) : (
                rendered.printedContent
              )}
            </pre>
            {activeOnPage && !loc.found ? (
              <div className="mt-2 chip bg-red-100 text-red-800">
                “{maskValue(activeOnPage.value, activeOnPage.value_type, session.cleared)}” not found on page — finding
              </div>
            ) : null}
          </div>
        </div>

        {/* Fields / anchors */}
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Extracted fields on this page</div>
          <ul className="space-y-1 text-sm">
            {fieldEvs.map((e) => {
              const v = verifyValue(model, e);
              const found = locate(e, page.printed_content).found;
              return (
                <li
                  key={e.id}
                  id={e.id}
                  className={`rounded border p-2 ${activeEv === e.id ? "border-sky-400 bg-sky-50" : "border-slate-100"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/doc/${id}/p/${pageNo}?ev=${e.id}#${e.id}`} className="mono text-xs">
                      {e.id}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1">
                      {!found ? <span className="chip bg-red-100 text-red-800">not on page</span> : null}
                      <VerificationBadge status={v.status} />
                      <Confidence value={e.confidence} />
                    </div>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">{e.label ?? e.field}:</span>{" "}
                    <span className="mono">{maskValue(e.value, e.value_type, session.cleared)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
