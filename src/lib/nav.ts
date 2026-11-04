import { can, type Actor, type Action } from "./people/permissions";

// Navigation model. The 22 routes collapse into 6 menu groups. Visibility is
// driven by can(): an item that declares an `action` shows only when the actor
// may perform it; `roles` is an explicit allowlist; `clientVisible` is the only
// way a client sees an item. Hiding is cosmetic — the server commands still
// enforce can() on every write.

export type BadgeKey = "issues" | "review" | "questions" | "changes" | "decisions";

export interface NavItem {
  label: string;
  href: string;
  action?: Action; // gated by can() for staff
  roles?: Array<Actor["role"]>; // explicit allowlist (e.g. admin-only)
  clientVisible?: boolean; // the only items a client may see
  badge?: BadgeKey;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [{ label: "Overview", href: "/", clientVisible: true }],
  },
  {
    key: "evidence",
    label: "Evidence",
    items: [
      { label: "Documents", href: "/documents" },
      { label: "Checks", href: "/checks" },
      { label: "Records", href: "/records" },
    ],
  },
  {
    key: "work",
    label: "Work",
    items: [
      { label: "Issues", href: "/issues", badge: "issues" },
      { label: "Changes", href: "/changes", badge: "changes" },
      { label: "Decisions", href: "/decisions", badge: "decisions" },
      { label: "Variance", href: "/variance" },
      { label: "Completeness", href: "/completeness" },
    ],
  },
  {
    key: "review",
    label: "Review",
    items: [
      { label: "Review notes & sign-offs", href: "/review", badge: "review" },
      { label: "Questions", href: "/questions", clientVisible: true, badge: "questions" },
      { label: "Team", href: "/team" },
    ],
  },
  {
    key: "file",
    label: "File",
    items: [
      { label: "Approve & sign", href: "/client", clientVisible: true },
      { label: "Filing", href: "/filing" },
      { label: "Amendments", href: "/amendments" },
      { label: "Rollforward", href: "/rollforward" },
    ],
  },
  {
    key: "firm",
    label: "Firm",
    items: [
      { label: "Dashboard", href: "/firm" },
      { label: "Time", href: "/firm/time" },
      { label: "Standards", href: "/admin/standards", action: "standards.manage" },
      { label: "Staff", href: "/admin/staff", action: "staff.manage" },
      { label: "Access", href: "/admin/access", roles: ["partner", "firm_administrator"] },
    ],
  },
];

export type BadgeCounts = Partial<Record<BadgeKey, number>>;

export interface ResolvedItem extends NavItem {
  count?: number;
}
export interface ResolvedGroup {
  key: string;
  label: string;
  items: ResolvedItem[];
}

const PERM_CTX = { now: "2999-01-01T00:00:00Z", ownEngagementClientIds: ["cu-01", "cu-02"] };

function itemVisible(item: NavItem, actor: Actor): boolean {
  if (actor.role === "client") return item.clientVisible === true;
  if (item.roles) return item.roles.includes(actor.role);
  if (item.action) return can(actor, item.action, { kind: "nav" }, PERM_CTX).allow;
  return true; // any staff role
}

/** Filter the groups for an actor and attach badge counts (role/mask aware). */
export function filterNav(actor: Actor, badges: BadgeCounts): ResolvedGroup[] {
  const clientBadges: BadgeKey[] = ["questions"]; // a client only sees its own question count
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: g.items
      .filter((it) => itemVisible(it, actor))
      .map((it) => {
        const allowBadge = it.badge && (actor.role !== "client" || clientBadges.includes(it.badge));
        return { ...it, count: allowBadge ? badges[it.badge!] : undefined };
      }),
  })).filter((g) => g.items.length > 0);
}

/** Breadcrumb (Group › Page) for a pathname. Longest-prefix match. */
export function breadcrumbFor(pathname: string): { group: string; page: string } | null {
  let best: { group: string; page: string; len: number } | null = null;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      const match = it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/");
      if (match && (!best || it.href.length > best.len)) best = { group: g.label, page: it.label, len: it.href.length };
    }
  }
  return best ? { group: best.group, page: best.page } : null;
}
