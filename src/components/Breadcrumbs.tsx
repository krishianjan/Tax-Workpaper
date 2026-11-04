"use client";

import { usePathname } from "next/navigation";
import { breadcrumbFor } from "@/lib/nav";

// Group › Page breadcrumb, derived from the nav map by longest-prefix match.
export function Breadcrumbs() {
  const pathname = usePathname() ?? "";
  const crumb = breadcrumbFor(pathname);
  if (!crumb || pathname === "/") return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-slate-500">
      <span>{crumb.group}</span>
      <span aria-hidden className="mx-1">›</span>
      <span className="font-medium text-slate-700">{crumb.page}</span>
    </nav>
  );
}
