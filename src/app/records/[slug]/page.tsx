import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { loadAdjustments } from "@/lib/change/store";
import { currentVersion } from "@/lib/evidence/disposition";
import { buildRecordMeta, isRecordMode, type RecordMode } from "@/lib/records/mode";
import { recordBySlug } from "@/lib/records/registry";
import { RecordShell } from "@/components/records/RecordShell";
import { SummaryVsLastYear } from "@/components/records/SummaryVsLastYear";
import { TaxComputation } from "@/components/records/TaxComputation";
import { DocumentIndex } from "@/components/records/DocumentIndex";
import { Payments } from "@/components/records/Payments";
import { Carryovers } from "@/components/records/Carryovers";
import { AreaSummaries } from "@/components/records/AreaSummaries";
import { Depreciation } from "@/components/records/Depreciation";
import { Sales } from "@/components/records/Sales";
import { BooksToTax } from "@/components/records/BooksToTax";
import { Rentals } from "@/components/records/Rentals";
import { K1Lines } from "@/components/records/K1Lines";

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { slug } = await params;
  const { mode: modeParam } = await searchParams;
  const def = recordBySlug(slug);
  if (!def) notFound();

  const mode: RecordMode = isRecordMode(modeParam) ? modeParam : "final";
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";
  const adjustments = await loadAdjustments();
  const meta = buildRecordMeta(model, versionId, mode, adjustments, session.asOf);

  const ctx = { model, versionId, mode, adjustments, meta } as const;

  if (!def.implemented) {
    return (
      <RecordShell title={`${def.num}. ${def.title}`} slug={def.slug} meta={meta}>
        <div className="card p-6 text-sm text-slate-500">
          <p className="mb-2 font-medium text-slate-700">Planned record.</p>
          <p>{def.blurb}</p>
          <p className="mt-3">
            Back to <Link href="/records">all records</Link>.
          </p>
        </div>
      </RecordShell>
    );
  }

  switch (slug) {
    case "summary-vs-last-year":
      return <SummaryVsLastYear {...ctx} />;
    case "tax-computation":
      return <TaxComputation {...ctx} />;
    case "document-index":
      return <DocumentIndex {...ctx} />;
    case "payments":
      return <Payments {...ctx} />;
    case "carryovers":
      return <Carryovers {...ctx} />;
    case "area-summaries":
      return <AreaSummaries {...ctx} />;
    case "depreciation":
      return <Depreciation {...ctx} />;
    case "sales-detail":
      return <Sales {...ctx} />;
    case "books-to-tax":
      return <BooksToTax {...ctx} />;
    case "rentals":
      return <Rentals {...ctx} />;
    case "k1-lines":
      return <K1Lines {...ctx} />;
    default:
      notFound();
  }
}
