import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { currentVersion } from "@/lib/evidence/disposition";
import { runChecks, sortByImpact } from "@/lib/checks/runner";
import { formatDollars } from "@/lib/money";
import { Term } from "@/components/Term";
import { TourTrigger } from "@/components/TourTrigger";

// ---- live findings ---------------------------------------------------------

interface FindingRow {
  title: string;
  explanation: string;
  taxEffectFed: bigint;
  taxEffectCa: bigint;
}

function getLiveFindings(): FindingRow[] {
  try {
    const model = loadModel();
    const versionId = currentVersion(model, new Date().toISOString())?.version ?? "v3";
    const findings = sortByImpact(runChecks({ model, versionId })).filter(
      (f) => f.status === "fail" || f.status === "warn",
    );
    return findings
      .filter((f) => f.taxEffectFed !== 0n || f.taxEffectCa !== 0n || f.explanation)
      .slice(0, 10)
      .map((f) => ({
        title: f.title,
        explanation: f.explanation ?? "",
        taxEffectFed: f.taxEffectFed ?? 0n,
        taxEffectCa: f.taxEffectCa ?? 0n,
      }));
  } catch {
    return [];
  }
}

const FALLBACK_FINDINGS = [
  { title: "RSU basis read as $0", explanation: "Gain taxed twice on N1+N3+N4 lots", taxEffectFed: -1554156n, taxEffectCa: -276508n },
  { title: "1099-K counted twice", explanation: "Business income $12,400 too high on Schedule C", taxEffectFed: -440200n, taxEffectCa: -38440n },
  { title: "Mileage page scanned twice", explanation: "11,800 → 8,100 miles; expense overstated", taxEffectFed: 91945n, taxEffectCa: 8029n },
  { title: "Client estimate over IRS record", explanation: "Federal Q4 payment $1,000 too high", taxEffectFed: 0n, taxEffectCa: 0n },
  { title: "CA payment for 2024 counted in 2025", explanation: "09/15 payment $3,500 misdesignated", taxEffectFed: 0n, taxEffectCa: -350000n },
  { title: "Car valued at $6,000 not $2,900", explanation: "Charity deduction too high by $3,100", taxEffectFed: 80600n, taxEffectCa: 14880n },
  { title: "Same interest on two forms", explanation: "D28/D29 Northlake sweep $1,840 counted twice", taxEffectFed: -64032n, taxEffectCa: -12696n },
  { title: "FX rate for 2024 used on 2025 interest", explanation: "Sparbanken SEK: Δ +$124 at correct 2025 average", taxEffectFed: 4315n, taxEffectCa: 856n },
  { title: "Dependent SSN mismatch in extraction", explanation: "Caught before e-file; corrected via fact correction", taxEffectFed: 0n, taxEffectCa: 0n },
];

// ---- feature cards ---------------------------------------------------------

const FEATURES = [
  {
    num: 1,
    title: "Evidence",
    body: "Click any number and see the exact document, page and field it came from. Click any document and see everywhere it was used, or why it wasn't.",
    href: "/documents",
    icon: "→",
  },
  {
    num: 2,
    title: "Calculation",
    body: "See how every number was built. 27 independent checks compare the engine against a second source — none trust the pipeline.",
    href: "/checks",
    icon: "✓",
  },
  {
    num: 3,
    title: "Change",
    body: "Fix without erasing: who, why, and the tax effect. See what changed since you last looked, compare versions, try what-ifs, and act in bulk with undo.",
    href: "/changes",
    icon: "Δ",
  },
  {
    num: 4,
    title: "Judgment",
    body: "Swings from last year are flagged. Judgment calls, elections, due diligence and penalty choices are recorded with evidence and authority.",
    href: "/decisions",
    icon: "§",
  },
  {
    num: 5,
    title: "People",
    body: "Questions that become evidence, review notes that block filing, and sign-offs that reopen when what they covered changes. Roles are enforced.",
    href: "/review",
    icon: "↑",
  },
  {
    num: 6,
    title: "Filing & after",
    body: "Extension, client signature, e-file, rejection, fix, acceptance, freeze. Amendments on top, notice-response pack, roll-forward.",
    href: "/filing",
    icon: "⊠",
  },
  {
    num: 7,
    title: "Firm",
    body: "Firm standards (versioned), encrypted sensitive data with view logs, time vs budget, global search, staff lifecycle, retention.",
    href: "/firm",
    icon: "⊞",
  },
  {
    num: 8,
    title: "Records",
    body: "17 schedules a CPA expects. Every number links back to its proof. Tie-out footer reconciles each record to the return line it summarises.",
    href: "/records",
    icon: "#",
  },
];

const FLOW_STEPS = [
  { label: "Load packet", href: "/documents", tip: "74 documents, 3,012 extracted values, 3 engine versions" },
  { label: "Verify against the page", href: "/documents", tip: "Every extracted value matched to its printed content" },
  { label: "Check the engine", href: "/checks", tip: "27 independent checks; confidence is not proof" },
  { label: "Fix as layers", href: "/changes", tip: "Adjustments preserve the original; every write is an event" },
  { label: "Decide & record", href: "/decisions", tip: "Judgment calls versioned with evidence and authority" },
  { label: "Review & sign", href: "/review", tip: "Sign-offs reopen when what they covered changes" },
  { label: "File & freeze", href: "/filing", tip: "Freeze on acceptance; amend on top" },
  { label: "Answer & roll forward", href: "/rollforward", tip: "Notice pack, carryovers, plan next year" },
];

const RULES = [
  {
    rule: "Nothing is overwritten.",
    detail: "Every action is a permanent, tamper-evident event in an append-only, hash-chained log.",
  },
  {
    rule: "Confidence isn't proof.",
    detail: "A value is verified only when it matches its source, or a person confirms it.",
  },
  {
    rule: "The software flags; the CPA decides.",
    detail: "Deterministic checks find inconsistencies. Humans own judgment — no AI in the core.",
  },
];

const ROLES = ["Preparer", "Reviewer", "Partner", "Client", "Administrator", "Next year's preparer", "IRS examiner"];

// ---- page ------------------------------------------------------------------

export default function LandingPage() {
  const liveFindings = getLiveFindings();
  const findings = liveFindings.length >= 3 ? liveFindings : FALLBACK_FINDINGS;
  const isLive = liveFindings.length >= 3;

  return (
    <div className="space-y-16 pb-20">
      {/* ── Hero ── */}
      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-700">
          Miraflores · Tax Workpaper Case Study
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Every number on the return, proven.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
          A web-native tax workpaper for{" "}
          <Term term="MFJ">CPAs</Term>. It shows where each number came from, what was done to it, who checked it, and
          what&apos;s still open. It catches the pipeline&apos;s confident mistakes before the IRS does.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <form action="/api/session" method="post">
            <input type="hidden" name="role" value="st-01" />
            <input type="hidden" name="next" value="/overview" />
            <button
              data-testid="cta-preparer"
              className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              Start as Preparer
            </button>
          </form>

          <form action="/api/session" method="post">
            <input type="hidden" name="role" value="st-01" />
            <input type="hidden" name="workspaceId" value="ws-main" />
            <input type="hidden" name="next" value="/overview" />
            <button
              data-testid="cta-worked"
              className="rounded-lg border border-sky-300 bg-sky-50 px-5 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              Open the worked file
            </button>
          </form>

          <TourTrigger
            data-testid="cta-tour"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Take the 2-minute tour
          </TourTrigger>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">The problem</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Software already reads the client&apos;s documents and computes the return. But it can be{" "}
            <strong>confidently wrong</strong>: a 97%-confident read can still be wrong, and a page can be counted twice
            or never read at all.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Traditional workpapers are spreadsheets. They hide those mistakes — confidence scores aren&apos;t proof, and
            a check in a cell doesn&apos;t trace back to the source document.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700">In this file, the pipeline was confident and wrong:</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">✗</span>
              <span><strong>97% confidence</strong> on an <Term term="RSU" /> basis read as $0 — $38,200 of gain taxed twice</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">✗</span>
              <span>A brokerage page was counted <strong>twice</strong> — 11,800 miles became 8,100</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">✗</span>
              <span>The same interest appeared on <strong>two different forms</strong> from related issuers — $1,840 double-counted</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-500">△</span>
              <span>A <Term term="1099-K" /> was counted on top of <Term term="SchC" /> income already in the books</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 8 feature cards ── */}
      <section>
        <h2 className="mb-1 text-xl font-semibold text-slate-900">8 things, one flow</h2>
        <p className="mb-5 text-sm text-slate-500">Each builds on the last. Evidence proves calculation; calculation drives change; change feeds judgment; judgment gates filing.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Link
              key={f.num}
              href={f.href}
              className="card block p-4 no-underline transition-colors hover:border-sky-300"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">
                  {f.num}
                </span>
                <span className="font-semibold text-slate-900">{f.title}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{f.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Flow strip ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">How it works</h2>
        <div className="scroll-box flex gap-2 pb-1">
          {FLOW_STEPS.map((s, i) => (
            <Link
              key={s.label}
              href={s.href}
              title={s.tip}
              className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 no-underline hover:border-sky-300 hover:bg-sky-50"
            >
              {i > 0 && <span className="text-slate-400" aria-hidden>→</span>}
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── What it found ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">What it found in this file</h2>
          {isLive ? (
            <span className="chip bg-emerald-100 text-emerald-800" data-testid="findings-live-badge">live from checks</span>
          ) : (
            <span className="chip bg-amber-100 text-amber-800">fallback — run the app to see live data</span>
          )}
        </div>
        <div className="scroll-box card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Finding</th>
                <th className="px-4 py-2 text-right">Fed Δ tax</th>
                <th className="px-4 py-2 text-right">CA Δ tax</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`} data-testid="finding-row">
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800">{f.title}</p>
                    {f.explanation && <p className="text-xs text-slate-500">{f.explanation}</p>}
                  </td>
                  <td className={`px-4 py-2 text-right mono tabular-nums ${f.taxEffectFed < 0n ? "text-emerald-700" : f.taxEffectFed > 0n ? "text-red-700" : "text-slate-400"}`}>
                    {f.taxEffectFed === 0n ? "—" : formatDollars(f.taxEffectFed)}
                  </td>
                  <td className={`px-4 py-2 text-right mono tabular-nums ${f.taxEffectCa < 0n ? "text-emerald-700" : f.taxEffectCa > 0n ? "text-red-700" : "text-slate-400"}`}>
                    {f.taxEffectCa === 0n ? "—" : formatDollars(f.taxEffectCa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Negative = tax reduced (error was overstating). Positive = tax increased (error was understating).{" "}
          <Link href="/checks">See all 27 checks →</Link>
        </p>
      </section>

      {/* ── Three rules ── */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Built on three rules</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {RULES.map((r) => (
            <div key={r.rule} className="card p-4">
              <p className="font-semibold text-slate-900">{r.rule}</p>
              <p className="mt-1 text-sm text-slate-600">{r.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who uses it ── */}
      <section className="text-center">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Who uses it</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {ROLES.map((r) => (
            <span key={r} className="chip bg-slate-100 text-slate-700">{r}</span>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Next year&apos;s preparer and an IRS examiner read the same record years later.
        </p>
        <div className="mt-6">
          <Link href="/overview" className="text-sm text-sky-700 hover:underline">
            Enter the workpaper →
          </Link>
        </div>
      </section>
    </div>
  );
}
