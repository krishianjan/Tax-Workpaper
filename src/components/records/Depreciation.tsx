import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line } from "@/lib/checks/helpers";
import { toCents } from "@/lib/money";
import { tieOut, type TieOut } from "@/lib/records/tieout";

interface AssetRow {
  asset_id: string;
  description: string;
  activity: string;
  method: string;
  life_years: number;
  placed_in_service: string;
  cost: number;
  land_value_not_depreciated: number | null;
  federal: { depreciation_2025: number; accumulated_end: number };
  california: { depreciation_2025: number; accumulated_end: number };
  amt: { depreciation_2025: number; difference_from_regular: number };
  disposed: string | null;
  disposition?: { unrecaptured_1250_depreciation?: number; section_1250_ordinary_recapture?: number; sold_with?: string };
}

const n = (x: number) => x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Depreciation({ model, versionId, meta }: RecordCtx) {
  const assets = ((model.versionById.get(versionId) as unknown as { assets?: AssetRow[] })?.assets ?? []) as AssetRow[];
  const caBasisDiff = ((model.versionById.get(versionId) as unknown as { carryovers_out?: { california?: { depreciation_basis_differences?: Record<string, number> } } })?.carryovers_out?.california?.depreciation_basis_differences) ?? {};

  const sacFed = assets.filter((a) => a.asset_id.startsWith("SAC")).reduce((s, a) => s + (toCents(a.federal.depreciation_2025) ?? 0n), 0n);
  const ausFed = assets.filter((a) => a.asset_id.startsWith("AUS")).reduce((s, a) => s + (toCents(a.federal.depreciation_2025) ?? 0n), 0n);

  const tieOuts: TieOut[] = [
    tieOut("Rental A depreciation (SAC-*)", "SchE.18A", sacFed, toCents(line(model, versionId, "SchE.18A")?.value), 100n),
    tieOut("Rental B depreciation (AUS-*)", "SchE.18B", ausFed, toCents(line(model, versionId, "SchE.18B")?.value), 100n),
  ];

  const disposals = assets.filter((a) => a.disposed);

  return (
    <RecordShell title="5. Depreciation by asset" slug="depreciation" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Asset</th>
              <th className="px-2 py-2">Method / life</th>
              <th className="px-2 py-2">In service</th>
              <th className="px-2 py-2 text-right">Cost (land)</th>
              <th className="px-2 py-2 text-right">Fed 2025 / accum</th>
              <th className="px-2 py-2 text-right">CA 2025 / accum</th>
              <th className="px-2 py-2 text-right">AMT 2025 (Δ)</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.asset_id} className={`border-t border-slate-100 align-top ${a.disposed ? "bg-amber-50" : ""}`}>
                <td className="px-2 py-2">
                  <div className="mono">{a.asset_id}</div>
                  <div className="text-slate-500">{a.description}</div>
                  {a.disposed ? <span className="chip bg-amber-100 text-amber-800">disposed {a.disposed}</span> : null}
                </td>
                <td className="px-2 py-2">{a.method}<div className="text-slate-400">{a.life_years} yr</div></td>
                <td className="px-2 py-2 mono">{a.placed_in_service}</td>
                <td className="px-2 py-2 text-right mono">{n(a.cost)}{a.land_value_not_depreciated ? <div className="text-slate-400">({n(a.land_value_not_depreciated)})</div> : null}</td>
                <td className="px-2 py-2 text-right mono">{n(a.federal.depreciation_2025)}<div className="text-slate-400">{n(a.federal.accumulated_end)}</div></td>
                <td className="px-2 py-2 text-right mono">{n(a.california.depreciation_2025)}<div className="text-slate-400">{n(a.california.accumulated_end)}</div></td>
                <td className="px-2 py-2 text-right mono">{n(a.amt.depreciation_2025)}<div className="text-slate-400">Δ {n(a.amt.difference_from_regular)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Disposals → Form 4797</div>
        {disposals.length === 0 ? <p className="text-slate-500">No disposals.</p> : (
          <ul className="space-y-1">
            {disposals.map((a) => (
              <li key={a.asset_id}>
                <span className="mono">{a.asset_id}</span> disposed {a.disposed}: unrecaptured §1250 ={" "}
                <span className="mono">{n(a.disposition?.unrecaptured_1250_depreciation ?? 0)}</span>, §1250 ordinary recapture ={" "}
                <span className="mono">{n(a.disposition?.section_1250_ordinary_recapture ?? 0)}</span> (straight-line residential). {a.disposition?.sold_with}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">California basis differences (out to 2026)</div>
        <ul className="grid grid-cols-2 gap-1 md:grid-cols-4">
          {Object.entries(caBasisDiff).map(([a, amt]) => (
            <li key={a} className="flex justify-between gap-2"><span className="mono">{a}</span><span className="mono">{n(Number(amt))}</span></li>
          ))}
        </ul>
      </div>
    </RecordShell>
  );
}
