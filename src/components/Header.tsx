import Link from "next/link";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { filterNav } from "@/lib/nav";
import { loadBadgeCounts } from "@/lib/navBadges";
import type { Actor } from "@/lib/people/permissions";
import { NavMenu } from "@/components/NavMenu";
import { HeaderSearch } from "@/components/HeaderSearch";

export default async function Header() {
  const session = await getSession();
  const model = loadModel();

  const st = model.staffById.get(session.staff.id);
  const actor: Actor = {
    id: session.staff.id,
    role: session.staff.role as Actor["role"],
    clearance: session.cleared,
    activeFrom: (st as unknown as { active_from?: string })?.active_from ?? "2000-01-01",
  };
  const badges = await loadBadgeCounts(actor);
  const groups = filterNav(actor, badges);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
        <Link href="/" className="shrink-0 text-sm font-semibold text-slate-900 no-underline hover:no-underline">
          Miraflores
        </Link>

        <NavMenu groups={groups} />

        <div className="ml-auto flex items-center gap-2">
          <HeaderSearch />
          <form action="/api/session" method="post" className="flex items-center gap-1 text-xs">
            <select
              name="role"
              aria-label="Acting role"
              defaultValue={session.staff.id}
              className="rounded border border-slate-300 px-1 py-0.5"
            >
              {model.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.role}
                  {s.sensitive_data_clearance ? "" : " (masked)"}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="asOf"
              aria-label="As-of date"
              defaultValue={session.asOf.slice(0, 10)}
              className="rounded border border-slate-300 px-1 py-0.5"
            />
            <button className="rounded bg-slate-900 px-2 py-0.5 text-white">Apply</button>
          </form>
          {!session.cleared ? <span className="chip bg-amber-100 text-amber-800">masked</span> : null}
        </div>
      </div>
    </header>
  );
}
