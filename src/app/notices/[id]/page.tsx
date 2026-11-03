import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadModel } from "@/lib/packet/load";
import { mapNoticeItems, L566_ITEM_MAP, destroyAfter, underLegalHold } from "@/lib/filing/notice";
import { SectionTitle, RefLink } from "@/components/ui";

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = loadModel();
  let notice: { id: string; agency: string; type: string; responseDue: Date | null; status: string; items: unknown; legalHold: boolean } | null = null;
  try {
    notice = await prisma.notice.findUnique({ where: { id } });
  } catch {
    /* ignore */
  }
  // Fall back to the packet definition if not yet replayed into the DB.
  if (!notice) {
    const n = ((model.raw.tax_agency_records as Record<string, unknown>).notices as Array<Record<string, unknown>>).find((x) => x.id === id);
    if (!n) notFound();
    notice = { id: String(n.id), agency: String(n.agency), type: String(n.type), responseDue: n.response_due ? new Date(String(n.response_due)) : null, status: "open", items: n.items_under_examination, legalHold: true };
  }

  const items = mapNoticeItems((notice.items as string[]) ?? [], L566_ITEM_MAP);
  const filedAt = "2026-07-14T00:00:00Z";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{notice.id} — {notice.type}</h1>
        <p className="text-sm text-slate-500">
          {notice.agency} · response due {notice.responseDue?.toISOString().slice(0, 10) ?? "—"} ·{" "}
          <span className={`chip ${underLegalHold(1) ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}>legal hold (blocks destruction)</span>{" "}
          retention until {destroyAfter(filedAt).slice(0, 10)}
        </p>
      </div>

      <SectionTitle>Examination items → mapped evidence</SectionTitle>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.index} className="card p-3 text-sm">
            <div className="font-medium">Item {it.index + 1}</div>
            <p className="mt-1 text-slate-600">{it.text}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs uppercase text-slate-400">lines:</span>
              {it.mapping.lines.map((k) => <RefLink key={k} href={`/line/v3/${encodeURIComponent(k)}`} label={k} />)}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="text-xs uppercase text-slate-400">documents:</span>
              {it.mapping.documents.map((d) => <RefLink key={d} href={`/doc/${d}`} label={d} />)}
            </div>
            {it.mapping.adjustments?.length ? (
              <div className="mt-1 text-xs text-slate-500">adjustments: {it.mapping.adjustments.join(", ")}</div>
            ) : null}
          </div>
        ))}
      </div>

      <SectionTitle>Response pack</SectionTitle>
      <p className="text-sm text-slate-600">
        Built from the frozen filed snapshot: each item&apos;s lines with traces, the source documents (simulated renders),
        the adjustments, decisions, sign-offs, and an event-log excerpt — with a manifest listing every file&apos;s sha256
        and the snapshot hash, so it verifies without the app. (Bundle export wires to the storage adapter.)
      </p>
      <Link href="/filing" className="text-sm">← back to filing</Link>
    </div>
  );
}
