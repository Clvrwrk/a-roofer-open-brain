// Department-first navigation tree for the Command Center left rail.
//
// This is a PRESENTATION layer only — intentionally decoupled from
// `cadence.ts` `departments` (which drives work routing + the [slug]
// sub-routes). Marketing is omitted here per the nav redesign without
// removing it from the data model. Sub-pages that don't have a route yet
// are marked `status: "soon"` and render as non-navigating, badged items
// (no 404s). When a surface ships, give it an `href` and flip to "built".

export type NavStatus = "built" | "soon";

export interface NavLeaf {
  label: string;
  href?: string;
  status: NavStatus;
  note?: string;
}

export interface NavDepartment {
  id: string;
  label: string;
  icon: string;
  items: NavLeaf[];
}

/** Top-level home link, pinned above the department accordion. The territory
 *  map is the home of the app — roofing is regional, so the map is the primary
 *  navigation surface. (The old Work Queue was removed; it returns under AI Agents.) */
export const navHome: NavLeaf = { label: "Territory Map", href: "/", status: "built" };

export const navDepartments: NavDepartment[] = [
  {
    id: "accounting",
    label: "Accounting",
    icon: "accounting",
    items: [
      { label: "Invoice Audit", href: "/accounting/invoice-audit", status: "built" },
      { label: "Fleet Audit", status: "soon" },
      { label: "Tools Audit", status: "soon", note: "Software, subscriptions" },
      { label: "Business Expense Audit", status: "soon", note: "Insurance, CPA, advisors, compliance" },
      { label: "EH&S Audit", status: "soon", note: "Environmental, Health & Safety" },
      { label: "Price Agreement Audit", href: "/abc-price-agreement-gaps", status: "built" },
      { label: "Agreement Builder", href: "/accounting/price-agreement/builder", status: "built", note: "Per-branch negotiable worksheet (A+B), prefilled from prior agreements" },
      { label: "Price List Coverage", href: "/accounting/vendor-regions", status: "built" },
      { label: "Negotiated Catalog", href: "/accounting/price-list/catalog", status: "built" },
      { label: "Price Foundation", href: "/data-quality/price-foundation", status: "built" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "operations",
    items: [
      { label: "Overview", href: "/operations", status: "built", note: "HR & Compliance live here" },
      { label: "Estimate Audit", href: "/operations/estimate-audit", status: "built" },
      { label: "Order Audit", href: "/operations/order-audit", status: "built", note: "ABC orders ↔ AcuLynx job + negotiated coverage" },
      { label: "Proposal Audit", status: "soon", note: "Shares the Estimate Audit tree" },
      { label: "Scheduling", status: "soon" },
      { label: "1099 Employee Mgmt", status: "soon", note: "Tax forms, insurance, 1099" },
      { label: "Inventory / Warehouse", status: "soon" },
      { label: "Client Portal / Comms", status: "soon" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: "sales",
    items: [
      { label: "Overview", href: "/sales", status: "built" },
    ],
  },
  {
    id: "executive",
    label: "Executive",
    icon: "executive",
    items: [
      { label: "Overview", href: "/executive", status: "built" },
      { label: "Weekly Snapshot", href: "/weekly-snapshot", status: "built" },
    ],
  },
  {
    id: "ai-agents",
    label: "AI Agents",
    icon: "ai-agents",
    items: [
      { label: "Work Queue", status: "soon", note: "Returns here — recaptured from the old home" },
      { label: "Agent Monitor", href: "/agents", status: "built" },
      { label: "Project Management", status: "soon" },
      { label: "Builds", status: "soon", note: "When/why/how we deploy & manage new agents" },
      { label: "Agent SOPs", status: "soon", note: "Tasking, thinking, planning, conductor, research, audit" },
      { label: "Deployment Schedule", status: "soon", note: "Roadmap" },
      { label: "Bugs / Maintenance / Enhancements", status: "soon" },
    ],
  },
];

/**
 * Returns the id of the department that owns the current pathname (so the
 * rail can auto-expand it), or null. Uses longest-prefix matching on built
 * leaf hrefs so deep routes (e.g. /accounting/price-list/catalog) resolve.
 */
export function activeDepartmentId(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const dept of navDepartments) {
    for (const item of dept.items) {
      if (!item.href) continue;
      const href = item.href;
      const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
      if (matches && (!best || href.length > best.len)) {
        best = { id: dept.id, len: href.length };
      }
    }
  }
  return best?.id ?? null;
}

/** True when this leaf's href is the current route (longest-prefix aware). */
export function isLeafActive(item: NavLeaf, pathname: string): boolean {
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
