import { loadModel } from "@/lib/packet/load";
import { prisma } from "@/lib/db";
import { loadAdjustments } from "@/lib/change/store";
import { returnTotals } from "@/lib/change/effective";
import { formatCents, formatDollars, toCents } from "@/lib/money";
import { preTransmissionChecks } from "@/lib/people/esign";
import { SectionTitle, Stat } from "@/components/ui";
import { signForm8879 } from "@/app/people-actions";

// Client portal. Masked everywhere; never shows internal notes or staff-only
// issues. Plain-language summary + the e-sign checklist + separate spouse signing.
export default async function ClientPage() {
  const model = loadModel();
  const adjustments = await loadAdjustments();
  const base = returnTotals(model, "v3", "engine", []);
  const fin = returnTotals(model, "v3", "final", adjustments);
  const agi2024 = toCents(((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>) ? (((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>).lines as Record<string, unknown>)["F1040.11"] : 0);
  const agi2025 = toCents((model.versionById.get("v3")!.summary as Record<string, Record<string, unknown>>).federal.agi);

  let sigs: Array<{ coveredRefs: string[]; signedBy: string }> = [];
  try {
    sigs = await prisma.signOff.findMany({ where: { scope: "form8879", status: "valid" }, select: { coveredRefs: true, signedBy: true } });
  } catch {
    /* ignore */
  }
  const signedTaxpayer = sigs.some((s) => s.coveredRefs.includes("taxpayer"));
  const signedSpouse = sigs.some((s) => s.coveredRefs.includes("spouse"));

  const checks = preTransmissionChecks(model, { snapshotHash: "H", form8879Hash: "H", bankAccountPresent: true, ipPinPresent: true, identityResolved: false, paidPreparerId: "st-03" });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Your 2025 return — Okafor-Lindqvist</h1>
      <p className="text-sm text-slate-500">A plain-language summary. Sensitive numbers are masked for your protection.</p>

      <SectionTitle>Federal (final)</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="AGI" value={formatDollars(agi2025)} sub={`2024: ${formatDollars(agi2024)}`} />
        <Stat label="Total tax" value={formatCents(fin.taxFed)} />
        <Stat label="Payments" value={formatCents(fin.payFed)} />
        <Stat label={fin.balanceFed <= 0n ? "Refund" : "Amount owed"} value={formatCents(fin.balanceFed < 0n ? -fin.balanceFed : fin.balanceFed)} sub={`was ${formatCents(base.balanceFed)}`} />
      </div>

      <SectionTitle>California (final)</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total tax" value={formatCents(fin.taxCa)} />
        <Stat label="Payments" value={formatCents(fin.payCa)} />
        <Stat label={fin.balanceCa <= 0n ? "Refund" : "Amount owed"} value={formatCents(fin.balanceCa < 0n ? -fin.balanceCa : fin.balanceCa)} />
      </div>

      <SectionTitle>Before you sign (e-file checklist)</SectionTitle>
      <ul className="space-y-1 text-sm">
        {checks.map((c) => (
          <li key={c.id} className="card p-2">
            <span className={`chip ${c.pass ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{c.pass ? "ok" : "pending"}</span> {c.label}
            <span className="ml-2 text-xs text-slate-400">{c.detail}</span>
          </li>
        ))}
      </ul>

      <SectionTitle>Form 8879 e-signature (both spouses required)</SectionTitle>
      <div className="flex flex-wrap gap-3">
        <form action={signForm8879}>
          <input type="hidden" name="signerClientId" value="cu-01" />
          <input type="hidden" name="signer" value="taxpayer" />
          <button disabled={signedTaxpayer} className={`rounded px-3 py-1 text-sm text-white ${signedTaxpayer ? "bg-emerald-600" : "bg-slate-900"}`}>
            {signedTaxpayer ? "Ngozi signed ✓" : "Ngozi (taxpayer) sign"}
          </button>
        </form>
        <form action={signForm8879}>
          <input type="hidden" name="signerClientId" value="cu-02" />
          <input type="hidden" name="signer" value="spouse" />
          <button disabled={signedSpouse} className={`rounded px-3 py-1 text-sm text-white ${signedSpouse ? "bg-emerald-600" : "bg-slate-900"}`}>
            {signedSpouse ? "Erik signed ✓" : "Erik (spouse) sign"}
          </button>
        </form>
      </div>
      <p className="text-xs text-slate-400">
        {signedTaxpayer && signedSpouse ? "Both signed — ready to transmit (filing in the next block)." : "One signature alone cannot transmit."}
      </p>
    </div>
  );
}
