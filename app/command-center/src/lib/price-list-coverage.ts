/* Price List Coverage — vendor → branch → (non-negotiated) item tree.
   The work surface for negotiated price-list coverage by vendor/branch.
   In-scope = branch is within a PE office's 2-hour drive-time territory,
   OR an order was placed at a branch with no agreement. Default view shows
   in-scope branches; everything else defaults to "no price list needed".
   Sample data (keyed to the live territory branches); the request log + weekly
   follow-up become a Supabase table at go-live (schemas/.../95-price-list-requests.sql). */

import type { VendorTerritorySurface } from "@lib/vendor-territories";
import { buildBaseRows, sourceCls, FALLBACK_BRANCHES, type BranchSlot } from "@lib/price-list";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export const PLC_TODAY = "2026-06-17";
export const PLC_YEARS = [2024, 2025, 2026];
export const PLC_YEAR_FACTORS: Record<number, number> = { 2024: 0.82, 2025: 0.91, 2026: 1.0 };

export type CoverageItem = { sku: string; desc: string; uom: string; qty: number; spend: number; source: string; sourceCls: string; negotiated: boolean };
export type CoverageBranch = {
  vendor: string; branchNo: string; vendorBranchId?: string; branchName: string; office: string; state: string;
  managerName?: string; managerEmail?: string; salesRepName?: string;
  inDriveTime: boolean; hasOrder: boolean; inScope: boolean;
  listStatus: "full" | "partial" | "none"; listCls: string; coverageLabel: string;
  items: CoverageItem[]; nonNegCount: number; itemCount: number;
  requestStatus: "covered" | "requested" | "not_requested"; requestedDate: string; daysOpen: number; nextFollowUp: string;
};
export type CoverageVendor = { vendor: string; branches: CoverageBranch[] };
export type PriceListCoverage = { vendors: CoverageVendor[]; years: number[]; yearFactors: Record<number, number>; today: string };

/* Deterministic branch profiles (cycled across branches) so the demo exercises every case:
   in-drive-time covered/partial/none, an ORDER-TRIGGERED in-scope branch (out of drive-time
   but ordered at a no-agreement branch), and genuinely OUT-OF-SCOPE branches (hidden by default).
   With live data these come from territory status + order history instead. */
type Profile = { inDriveTime: boolean; hasOrder: boolean; listStatus: "full" | "partial" | "none" };
const PROFILES: Profile[] = [
  { inDriveTime: true, hasOrder: false, listStatus: "full" },     // in-scope, covered
  { inDriveTime: true, hasOrder: false, listStatus: "partial" },  // in-scope, partial
  { inDriveTime: true, hasOrder: false, listStatus: "none" },     // in-scope, RED — needs a request
  { inDriveTime: true, hasOrder: false, listStatus: "partial" },
  { inDriveTime: false, hasOrder: true, listStatus: "none" },     // ORDER-TRIGGERED in-scope (out of drive-time)
  { inDriveTime: false, hasOrder: false, listStatus: "full" },    // out of scope — hidden by default
  { inDriveTime: false, hasOrder: false, listStatus: "partial" }, // out of scope — hidden by default
  { inDriveTime: false, hasOrder: false, listStatus: "none" },    // out of scope, no order — hidden by default
];

type Meta = { vendor: string; branchNo: string; branchName: string; office: string; state: string; inDriveTime: boolean };

function metasFromSurface(surface: VendorTerritorySurface | null): Meta[] {
  const out: Meta[] = [];
  for (const b of surface?.branches ?? []) {
    const office = b.assignedOfficeName && b.assignedOfficeName !== "Unassigned" ? b.assignedOfficeName : "";
    if (!office) continue;
    const loc = String((b as any).location ?? "");
    const m = /,\s*([A-Z]{2})\b/.exec(loc);
    out.push({
      vendor: b.vendorName || "ABC Supply",
      branchNo: b.branchNumber || "—",
      branchName: b.branchName || "",
      office,
      state: m ? m[1] : "KS",
      inDriveTime: b.status === "covered" || b.status === "overlap_pending",
    });
    if (out.length >= 30) break;
  }
  if (out.length) return out;
  return FALLBACK_BRANCHES.map((b, i) => ({ ...b, inDriveTime: i % 4 !== 3 }));
}

export function buildPriceListCoverage(surface: VendorTerritorySurface | null): PriceListCoverage {
  const metas = metasFromSurface(surface);
  const slots: BranchSlot[] = metas.map((m) => ({ vendor: m.vendor, branchNo: m.branchNo, branchName: m.branchName, office: m.office, state: m.state }));
  const baseRows = buildBaseRows(slots);
  const itemsByBranch = new Map<string, any[]>();
  for (const r of baseRows) {
    if (!itemsByBranch.has(r.branchNo)) itemsByBranch.set(r.branchNo, []);
    itemsByBranch.get(r.branchNo)!.push(r);
  }

  const branches: CoverageBranch[] = metas.map((m, idx) => {
    const prof = PROFILES[idx % PROFILES.length];
    const listStatus = prof.listStatus;
    const raw = itemsByBranch.get(m.branchNo) ?? [];
    const items: CoverageItem[] = raw.map((r, j) => {
      let source: string;
      if (listStatus === "full") source = "Negotiated";
      else if (listStatus === "none") source = ["No Pricing", "API Generated", "Invoice Mean", "One-Off Project"][j % 4];
      else source = j % 2 === 0 ? "Negotiated" : ["Invoice Mean", "API Generated", "No Pricing"][j % 3];
      return { sku: r.sku, desc: r.desc, uom: r.uom, qty: r.annualQty, spend: r.annualSpend, source, sourceCls: sourceCls(source), negotiated: source === "Negotiated" };
    });
    const inDriveTime = prof.inDriveTime;
    const hasOrder = prof.hasOrder;
    const inScope = inDriveTime || (hasOrder && listStatus === "none");
    const nonNeg = items.filter((it) => !it.negotiated);
    const listCls = listStatus === "full" ? "pill-green" : listStatus === "partial" ? "pill-yellow" : "pill-red";
    const coverageLabel = listStatus === "full" ? "Full price list" : listStatus === "partial" ? "Partial price list" : "No price list";

    let requestStatus: CoverageBranch["requestStatus"] = "covered";
    let requestedDate = "", daysOpen = 0, nextFollowUp = "";
    if (listStatus === "none") {
      // about half of in-scope no-list branches already have a pending request;
      // the rest stay RED "Not requested" so the Request Price List flow has something to demo
      if (inScope && Math.floor(idx / PROFILES.length) % 2 === 0) {
        requestStatus = "requested";
        const opened = [14, 21, 28][idx % 3];
        requestedDate = ["2026-06-03", "2026-05-27", "2026-05-20"][idx % 3];
        daysOpen = opened;
        nextFollowUp = "2026-06-17";
      } else {
        requestStatus = "not_requested";
      }
    } else if (listStatus === "partial") {
      requestStatus = "covered";
    }

    return {
      vendor: m.vendor, branchNo: m.branchNo, branchName: m.branchName, office: m.office, state: m.state,
      inDriveTime, hasOrder, inScope, listStatus, listCls, coverageLabel,
      items, nonNegCount: nonNeg.length, itemCount: items.length,
      requestStatus, requestedDate, daysOpen, nextFollowUp,
    };
  });

  const vmap = new Map<string, CoverageBranch[]>();
  for (const b of branches) {
    if (!vmap.has(b.vendor)) vmap.set(b.vendor, []);
    vmap.get(b.vendor)!.push(b);
  }
  const vendors: CoverageVendor[] = Array.from(vmap, ([vendor, list]) => ({ vendor, branches: list }));

  return { vendors, years: PLC_YEARS, yearFactors: PLC_YEAR_FACTORS, today: PLC_TODAY };
}

/* ------------------------------------------------------------------ *
 * LIVE loader — reads real branches / drive-time / coverage / contacts
 * from Supabase views (v_price_list_branch, v_price_list_branch_item)
 * + price_refresh_request. Falls back to the sample builder when the
 * DB is unconfigured. See docs/39 + schemas 95-97.
 * ------------------------------------------------------------------ */
async function loadFreshPriceListCoverage(env: RuntimeEnv = getRuntimeEnv()): Promise<PriceListCoverage> {
  const { client } = createServerSupabaseClient(env);
  if (!client) return buildPriceListCoverage(null);

  const [branchRes, itemRes, reqRes] = await Promise.all([
    client.from("v_price_list_branch").select("*"),
    client.from("v_price_list_branch_item").select("*"),
    client.from("price_refresh_request").select("vendor_branch_id,status,created_at,sent_at,next_followup_at"),
  ]);
  const branchRows = branchRes.data as any[] | null;
  if (!branchRows || branchRows.length === 0) return buildPriceListCoverage(null);

  const itemsByBranch = new Map<string, any[]>();
  for (const r of (itemRes.data as any[] | null) ?? []) {
    if (!itemsByBranch.has(r.vendor_branch_id)) itemsByBranch.set(r.vendor_branch_id, []);
    itemsByBranch.get(r.vendor_branch_id)!.push(r);
  }
  const reqByBranch = new Map<string, any>();
  for (const r of (reqRes.data as any[] | null) ?? []) if (r.vendor_branch_id) reqByBranch.set(r.vendor_branch_id, r);

  const OPEN = ["awaiting_verification", "approved", "ready_to_send", "sent", "requested"];

  const branches: CoverageBranch[] = branchRows.map((b: any) => {
    const raw = (itemsByBranch.get(b.vendor_branch_id) ?? []).sort((a, z) => (Number(z.qty) || 0) - (Number(a.qty) || 0));
    const items: CoverageItem[] = raw.slice(0, 40).map((r: any) => {
      const negotiated = !!r.negotiated;
      const source = negotiated ? "Negotiated" : "No Pricing";
      const qty = Math.round(Number(r.qty) || 0);
      const spend = Math.round((Number(r.negotiated_price) || 0) * qty * 100) / 100;
      return { sku: r.sku, desc: r.descr, uom: "", qty, spend, source, sourceCls: sourceCls(source), negotiated };
    });
    const total = items.length;
    const negCount = items.filter((i) => i.negotiated).length;
    const regionItems = Number(b.region_negotiated_items) || 0;
    const listStatus: "full" | "partial" | "none" =
      regionItems === 0 ? "none" : total === 0 ? "full" : negCount / total >= 0.8 ? "full" : "partial";
    const listCls = listStatus === "full" ? "pill-green" : listStatus === "partial" ? "pill-yellow" : "pill-red";
    const coverageLabel = listStatus === "full" ? "Full price list" : listStatus === "partial" ? "Partial price list" : "No price list";
    const inDriveTime = !!b.in_drive_time;
    const hasOrder = !!b.has_order;
    const inScope = inDriveTime || (hasOrder && listStatus === "none");
    const nonNeg = items.filter((i) => !i.negotiated);

    const req = reqByBranch.get(b.vendor_branch_id);
    let requestStatus: CoverageBranch["requestStatus"] = "covered";
    let requestedDate = "", daysOpen = 0, nextFollowUp = "";
    if (req && OPEN.includes(req.status)) {
      requestStatus = "requested";
      requestedDate = String(req.sent_at || req.created_at || "").slice(0, 10);
      if (requestedDate) daysOpen = Math.max(0, Math.round((Date.parse(PLC_TODAY) - Date.parse(requestedDate)) / 86400000));
      nextFollowUp = String(req.next_followup_at || "").slice(0, 10);
    } else if (listStatus === "none") {
      requestStatus = "not_requested";
    }

    return {
      vendor: b.vendor || "ABC Supply", branchNo: b.branch_number, vendorBranchId: b.vendor_branch_id || "", branchName: b.branch_name || "",
      office: b.office || "", state: b.state || "",
      managerName: b.manager_name || "", managerEmail: b.manager_email || "", salesRepName: b.sales_rep_name || "",
      inDriveTime, hasOrder, inScope, listStatus, listCls, coverageLabel,
      items, nonNegCount: nonNeg.length, itemCount: total,
      requestStatus, requestedDate, daysOpen, nextFollowUp,
    };
  });

  const vmap = new Map<string, CoverageBranch[]>();
  for (const b of branches) { if (!vmap.has(b.vendor)) vmap.set(b.vendor, []); vmap.get(b.vendor)!.push(b); }
  const vendors: CoverageVendor[] = Array.from(vmap, ([vendor, list]) => ({ vendor, branches: list }));
  return { vendors, years: PLC_YEARS, yearFactors: PLC_YEAR_FACTORS, today: PLC_TODAY };
}

const PRICELISTCOVERAGE_CACHE_TTL_MS = 5 * 60_000;
const PRICELISTCOVERAGE_MAX_STALE_MS = 24 * 60 * 60_000;
const loadPriceListCoverageCache = new Map<string, { expiresAt: number; data: Awaited<ReturnType<typeof loadFreshPriceListCoverage>> }>();
const loadPriceListCoverageInflight = new Map<string, ReturnType<typeof loadFreshPriceListCoverage> | Promise<Awaited<ReturnType<typeof loadFreshPriceListCoverage>>>>();

export function invalidatePriceListCoverageCache() {
  loadPriceListCoverageCache.clear();
  loadPriceListCoverageInflight.clear();
}

export async function loadPriceListCoverage(...args: Parameters<typeof loadFreshPriceListCoverage>): ReturnType<typeof loadFreshPriceListCoverage> {
  const cacheKey = String("default");
  const now = Date.now();
  const cached = loadPriceListCoverageCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as Awaited<ReturnType<typeof loadFreshPriceListCoverage>>;
  let inflight = loadPriceListCoverageInflight.get(cacheKey) as ReturnType<typeof loadFreshPriceListCoverage> | undefined;
  if (!inflight) {
    inflight = loadFreshPriceListCoverage(...args)
      .then((data) => {
        loadPriceListCoverageCache.set(cacheKey, { expiresAt: Date.now() + PRICELISTCOVERAGE_CACHE_TTL_MS, data });
        return data;
      })
      .finally(() => {
        loadPriceListCoverageInflight.delete(cacheKey);
      }) as ReturnType<typeof loadFreshPriceListCoverage>;
    loadPriceListCoverageInflight.set(cacheKey, inflight);
    (inflight as Promise<unknown>).catch(() => undefined);
  }
  if (cached && cached.expiresAt + PRICELISTCOVERAGE_MAX_STALE_MS > now) return cached.data as Awaited<ReturnType<typeof loadFreshPriceListCoverage>>;
  return inflight;
}

