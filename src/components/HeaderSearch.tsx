"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Global search, present on every page. ⌘K / Ctrl+K focuses it. Submitting goes
// to /search?q= (the route stays; only the nav tab was removed).
export function HeaderSearch() {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="relative hidden sm:block"
    >
      <input
        ref={ref}
        name="q"
        aria-label="Search"
        placeholder="Search…  ⌘K"
        className="w-44 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm focus:w-64 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
    </form>
  );
}
