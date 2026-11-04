import Link from "next/link";
import { SectionTitle } from "@/components/ui";
import { RECORDS } from "@/lib/records/registry";

export default function RecordsIndex() {
  const done = RECORDS.filter((r) => r.implemented).length;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Records</h1>
      <p className="text-sm text-slate-500">
        The records a CPA expects — each a generated view over the effective data, with a mode switch (engine · final · filed ·
        amendment), every number linked to its recipe and evidence, and a tie-out footer. Print-ready. {done}/{RECORDS.length}{" "}
        built.
      </p>
      <SectionTitle>All records</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {RECORDS.map((r) => (
          <Link
            key={r.slug}
            href={`/records/${r.slug}`}
            className={`card block p-4 no-underline hover:border-slate-400 ${r.implemented ? "" : "opacity-60"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">
                {r.num}. {r.title}
              </span>
              {r.implemented ? (
                <span className="chip bg-emerald-100 text-emerald-800">ready</span>
              ) : (
                <span className="chip bg-slate-100 text-slate-500">planned</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{r.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
