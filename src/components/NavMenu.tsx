"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ResolvedGroup } from "@/lib/nav";

// Native <details>/<summary> dropdowns: they open and close with ZERO
// JavaScript, so the nav works even if hydration hasn't run. When JS is present
// we also highlight the active group and auto-close menus after navigation.

function Badge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-600 px-1.5 text-[0.65rem] font-semibold text-white">
      {count}
    </span>
  );
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavMenu({ groups }: { groups: ResolvedGroup[] }) {
  const pathname = usePathname() ?? "";

  // Close any open menu after a client navigation.
  useEffect(() => {
    document.querySelectorAll("details.nav-d[open]").forEach((d) => d.removeAttribute("open"));
  }, [pathname]);

  return (
    <div className="flex-1">
      {/* Desktop menu bar */}
      <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-1">
        {groups.map((g) => {
          const active = g.items.some((it) => isActive(it.href, pathname));
          const total = g.items.reduce((s, it) => s + (it.count ?? 0), 0);

          if (g.items.length === 1) {
            const it = g.items[0];
            return (
              <Link
                key={g.key}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm no-underline ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {g.label}
                <Badge count={it.count} />
              </Link>
            );
          }

          return (
            <details key={g.key} name="navbar" className="nav-d relative">
              <summary
                className={`flex cursor-pointer select-none items-center gap-1 rounded px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {g.label}
                {total ? (
                  <span className="inline-flex min-w-[1.1rem] justify-center rounded-full bg-sky-600 px-1 text-[0.6rem] font-semibold text-white">{total}</span>
                ) : null}
                <span aria-hidden className="text-[0.6rem]">▾</span>
              </summary>
              <div className="absolute left-0 z-50 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {g.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm no-underline ${pathname === it.href ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    {it.label}
                    <Badge count={it.count} />
                  </Link>
                ))}
              </div>
            </details>
          );
        })}
      </nav>

      {/* Mobile hamburger + accordion */}
      <details className="nav-d relative md:hidden">
        <summary className="inline-flex cursor-pointer select-none items-center rounded border border-slate-300 px-2 py-1 text-sm text-slate-700">
          ☰ Menu
        </summary>
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-[80vh] overflow-auto rounded-b-lg border-y border-slate-200 bg-white px-3 py-2 shadow-lg">
          {groups.map((g) => {
            const total = g.items.reduce((s, it) => s + (it.count ?? 0), 0);
            if (g.items.length === 1) {
              const it = g.items[0];
              return (
                <Link key={g.key} href={it.href} className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm no-underline text-slate-800">
                  {g.label}
                  <Badge count={it.count} />
                </Link>
              );
            }
            return (
              <details key={g.key} className="nav-d border-b border-slate-100">
                <summary className="flex cursor-pointer select-none items-center justify-between py-2 text-sm font-medium text-slate-800">
                  <span className="flex items-center gap-2">
                    {g.label}
                    {total ? (
                      <span className="inline-flex min-w-[1.1rem] justify-center rounded-full bg-sky-600 px-1 text-[0.6rem] font-semibold text-white">{total}</span>
                    ) : null}
                  </span>
                  <span aria-hidden>▾</span>
                </summary>
                <div className="pb-2 pl-3">
                  {g.items.map((it) => (
                    <Link key={it.href} href={it.href} className="flex items-center gap-2 py-1.5 text-sm no-underline text-slate-700">
                      {it.label}
                      <Badge count={it.count} />
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    </div>
  );
}
