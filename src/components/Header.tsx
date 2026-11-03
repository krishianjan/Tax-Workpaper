import Link from "next/link";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { setSession } from "@/app/actions";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/documents", label: "Documents" },
  { href: "/checks", label: "Checks" },
  { href: "/schedules/8949", label: "8949" },
  { href: "/schedules/books-to-tax", label: "Books→Tax" },
  { href: "/schedules/state-split", label: "State" },
];

export default async function Header() {
  const session = await getSession();
  const model = loadModel();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold text-slate-900 no-underline hover:no-underline">
            Miraflores · Workpaper
          </Link>
          <nav className="flex gap-3 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-slate-600">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <form action={setSession} className="flex items-center gap-2 text-xs">
          <label className="text-slate-500">Role</label>
          <select name="role" defaultValue={session.staff.id} className="rounded border border-slate-300 px-1 py-0.5">
            {model.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.role}
                {s.sensitive_data_clearance ? "" : " (masked)"}
              </option>
            ))}
          </select>
          <label className="text-slate-500">As of</label>
          <input
            type="date"
            name="asOf"
            defaultValue={session.asOf.slice(0, 10)}
            className="rounded border border-slate-300 px-1 py-0.5"
          />
          <button className="rounded bg-slate-900 px-2 py-0.5 text-white">Apply</button>
          {!session.cleared ? (
            <span className="chip bg-amber-100 text-amber-800">sensitive data masked</span>
          ) : null}
        </form>
      </div>
    </header>
  );
}
