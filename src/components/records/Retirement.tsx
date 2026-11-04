import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { toCents } from "@/lib/money";
import { tieOut, type TieOut } from "@/lib/records/tieout";

export function Retirement({ model, versionId, meta }: RecordCtx) {
  const L = (k: string) => lineValueCents(line(model, versionId, k));
  const lbl = (k: string) => line(model, versionId, k)?.label ?? k;

  const f8606 = ["F8606.1", "F8606.2", "F8606.8", "F8606.11", "F8606.16", "F8606.18"];
  const sepNondeduct = (model.versionById.get(versionId) as unknown as { carryovers_out?: { federal?: Record<string, number> } })?.carryovers_out?.federal?.sep_contribution_not_deductible_for_2025 ?? 0;

  const tieOuts: TieOut[] = [
    tieOut("Taxable IRA conversion", "F1040.4b", L("F8606.18") ?? 0n, L("F1040.4b")),
  ];

  return (
    <RecordShell title="10. Retirement" slug="retirement" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Backdoor Roth — Form 8606</div>
        <table className="w-full text-sm">
          <tbody>
            {f8606.map((k) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="px-3 py-2">{lbl(k)} <span className="text-xs text-slate-400">{k}</span></td>
                <td className="px-3 py-2 text-right"><NumberCell cents={L(k)} lineKey={k} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-xs text-slate-500">
          2024 basis 7,000 (per client; questionnaire said no basis — resolved by Decision) + 2025 contribution 7,000; conversion
          14,026 → taxable 26. The basis conflict is a judgment call.
        </p>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">SEP, 401(k), HSA</div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">SEP deduction (Schedule 1)</td><td className="px-3 py-2 text-right"><NumberCell cents={L("Sch1.16")} lineKey="Sch1.16" /></td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">— of which nondeductible for 2025 (compliance)</td><td className="px-3 py-2 text-right"><NumberCell cents={toCents(sepNondeduct)} /></td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">401(k) — from W-2 box 12 (elective deferral)</td><td className="px-3 py-2 text-right text-slate-500">on W-2</td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">HSA employer contributions (W-2 code W)</td><td className="px-3 py-2 text-right"><NumberCell cents={L("F8889.9")} lineKey="F8889.9" /></td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">HSA deduction</td><td className="px-3 py-2 text-right"><NumberCell cents={L("F8889.13")} lineKey="F8889.13" /></td></tr>
          </tbody>
        </table>
        <p className="px-3 py-2 text-xs text-slate-500">
          California does not conform to HSA deductions — the HSA is a CA addback (see the state-split record). The nondeductible
          SEP (2,786) is a compliance matter the CPA must evaluate.
        </p>
      </div>
    </RecordShell>
  );
}
