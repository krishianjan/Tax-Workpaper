"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ResolvedGroup } from "@/lib/nav";

function Badge({ count }: { count?: number }) {
  if (!count) return null;
  return <span className="ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-600 px-1.5 text-[0.65rem] font-semibold text-white">{count}</span>;
}

function groupActive(group: ResolvedGroup, pathname: string): boolean {
  return group.items.some((it) => (it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/")));
}

function groupTotal(group: ResolvedGroup): number {
  return group.items.reduce((s, it) => s + (it.count ?? 0), 0);
}

export function NavMenu({ groups }: { groups: ResolvedGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null); // desktop: open dropdown key
  const [mobileOpen, setMobileOpen] = useState(false); // mobile: panel visible
  const [acc, setAcc] = useState<string | null>(null); // mobile: expanded accordion
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // Close menus on navigation.
  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="flex-1">
      {/* Desktop: dropdown menu bar */}
      <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-1">
        {groups.map((g) => {
          const active = groupActive(g, pathname);
          const total = groupTotal(g);
          const isOpen = open === g.key;
          const single = g.items.length === 1;
          if (single) {
            const it = g.items[0];
            return (
              <Link
                key={g.key}
                href={it.href}
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm no-underline ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {g.label}
                <Badge count={it.count} />
              </Link>
            );
          }
          return (
            <div key={g.key} className="relative">
              <button
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : g.key)}
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {g.label}
                {total ? <span className="inline-flex min-w-[1.1rem] justify-center rounded-full bg-sky-600 px-1 text-[0.6rem] font-semibold text-white">{total}</span> : null}
                <span aria-hidden className="text-[0.6rem]">▾</span>
              </button>
              {isOpen ? (
                <div role="menu" className="absolute left-0 z-20 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {g.items.map((it) => (
                    <Link
                      key={it.href}
                      role="menuitem"
                      href={it.href}
                      className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm no-underline ${pathname === it.href ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                      {it.label}
                      <Badge count={it.count} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Mobile: hamburger + accordion */}
      <div className="md:hidden">
        <button
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
        >
          ☰ Menu
        </button>
        {mobileOpen ? (
          <div className="absolute left-0 right-0 z-20 mt-2 max-h-[80vh] overflow-auto border-y border-slate-200 bg-white px-3 py-2 shadow-lg">
            {groups.map((g) => {
              const expanded = acc === g.key;
              const total = groupTotal(g);
              if (g.items.length === 1) {
                const it = g.items[0];
                return (
                  <Link key={g.key} href={it.href} className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm no-underline text-slate-800">
                    {g.label} <Badge count={it.count} />
                  </Link>
                );
              }
              return (
                <div key={g.key} className="border-b border-slate-100">
                  <button
                    aria-expanded={expanded}
                    onClick={() => setAcc(expanded ? null : g.key)}
                    className="flex w-full items-center justify-between py-2 text-sm font-medium text-slate-800"
                  >
                    <span className="flex items-center gap-2">
                      {g.label}
                      {total ? <span className="inline-flex min-w-[1.1rem] justify-center rounded-full bg-sky-600 px-1 text-[0.6rem] font-semibold text-white">{total}</span> : null}
                    </span>
                    <span aria-hidden>{expanded ? "−" : "+"}</span>
                  </button>
                  {expanded ? (
                    <div className="pb-2 pl-3">
                      {g.items.map((it) => (
                        <Link key={it.href} href={it.href} className="flex items-center gap-2 py-1.5 text-sm no-underline text-slate-700">
                          {it.label} <Badge count={it.count} />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
