// Accounting → Global Price List (Price List Review hierarchy, P4).
//
// Hierarchy: PE Office → GLOBAL PRICE LIST → Vendor → Vendor/Branch → Current agreement → Archived.
// This loader server-renders the office + global-price-list levels and the branch directory; the
// per-branch item detail (current + immediate-prior negotiated price) and the archived-agreement
// history are loaded lazily on expand via /api/price-list-review/branch (15.4k branch-item rows
// must never all ship up front).
//
// Data: v_price_list_global (mig 143) for the office-level aggregate; v_price_list_branch_agreements
// + v_pl_branch_office (mig 144) for the branch directory. All prices already in the item canonical
// price_uom (docs/46) — the UOM column is the single unit per row, so price cells render plain $x.xx.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface GlobalItem {
  itemNumber: string;
  description: string;
  uom: string; // canonical price_uom
  lowestOpenInvoice: number | null;
  openInvoiceSamples: number;
  apiPrice: number | null;
  negMin: number | null;
  negMax: number | null;
  negMean: number | null;
  negSamples: number;
}

export interface BranchSummary {
  branchNumber: string;
  branchName: string;
  city: string;
  state: string;
  itemCount: number; // items on the current agreement
  agreementCount: number; // total agreements matched (current + archived)
  archivedCount: number; // agreementCount - 1
  currentActive: boolean;
  currentEffective: string;
  currentExpiry: string;
}

export interface OfficeNode {
  officeId: string;
  officeName: string;
  globalItems: GlobalItem[];
  branches: BranchSummary[];
  branchCount: number;
  itemCount: number; // distinct global items priced for the office
  expiringSoon: boolean; // any branch agreement expired / no active
}

export interface PriceListReviewHierarchy {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: OfficeNode[];
}

const num = (v: unknown) => (v == null ? null : Number(v));
const n0 = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

export async function loadPriceListReviewHierarchy(env: RuntimeEnv = getRuntimeEnv()): Promise<PriceListReviewHierarchy> {
  const empty: PriceListReviewHierarchy = { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [] };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const fetchAll = async (make: () => any): Promise<any[]> => {
    const PAGE = 1000;
    let from = 0;
    const rows: any[] = [];
    for (;;) {
      const { data } = await make().range(from, from + PAGE - 1);
      const batch = (data as any[] | null) ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  };

  const [globalRows, agreementRows, officeRows, itemDescRows] = await Promise.all([
    fetchAll(() => client.from("v_price_list_global").select("*")),
    fetchAll(() => client.from("v_price_list_branch_agreements").select("*")),
    fetchAll(() => client.from("office").select("id,name")),
    // item_number → description (any agreement line); the global view carries no description.
    fetchAll(() => client.from("abc_price_list_items").select("item_number,description")),
  ]);
  if (globalRows.length === 0 && agreementRows.length === 0) return empty;

  const officeName = new Map<string, string>();
  for (const o of officeRows) officeName.set(o.id, o.name ?? "");

  const descByItem = new Map<string, string>();
  for (const r of itemDescRows) if (r.item_number && !descByItem.has(r.item_number)) descByItem.set(r.item_number, r.description ?? "");

  // ── Office-level global price list ──────────────────────────────────────────
  const officeMap = new Map<string, OfficeNode>();
  const ensureOffice = (officeId: string): OfficeNode => {
    const id = officeId || "unassigned";
    let o = officeMap.get(id);
    if (!o) {
      o = { officeId: id, officeName: officeId ? (officeName.get(officeId) ?? "Office") : "Unassigned", globalItems: [], branches: [], branchCount: 0, itemCount: 0, expiringSoon: false };
      officeMap.set(id, o);
    }
    return o;
  };

  for (const r of globalRows) {
    const o = ensureOffice(r.office_id);
    o.globalItems.push({
      itemNumber: r.item_number ?? "",
      description: descByItem.get(r.item_number) ?? "",
      uom: r.canonical_uom ?? "",
      lowestOpenInvoice: num(r.lowest_open_invoice_price),
      openInvoiceSamples: n0(r.open_invoice_samples),
      apiPrice: num(r.api_price_canonical),
      negMin: num(r.neg_min),
      negMax: num(r.neg_max),
      negMean: num(r.neg_mean),
      negSamples: n0(r.neg_samples),
    });
  }

  // ── Branch directory (current agreement + archived history counts) ──────────
  // Aggregate v_price_list_branch_agreements per branch: rank-1 row = current.
  const byBranch = new Map<string, any[]>();
  for (const r of agreementRows) {
    const list = byBranch.get(r.branch_number) ?? [];
    list.push(r);
    byBranch.set(r.branch_number, list);
  }
  for (const [branchNumber, ags] of byBranch) {
    ags.sort((a, b) => n0(a.recency_rank) - n0(b.recency_rank));
    const current = ags[0];
    if (!current) continue;
    // Only surface branches that actually carry priced items (skip empty per-branch shells).
    if (n0(current.item_count) === 0) continue;
    const o = ensureOffice(current.office_id);
    o.branches.push({
      branchNumber,
      branchName: current.branch_name ?? "",
      city: current.city ?? "",
      state: current.state ?? "",
      itemCount: n0(current.item_count),
      agreementCount: ags.length,
      archivedCount: Math.max(0, ags.length - 1),
      currentActive: !!current.agreement_active,
      currentEffective: d10(current.effective_date),
      currentExpiry: d10(current.expiry_date),
    });
  }

  // v_pl_branch_office carries branch_name/city/state but the agreement view already joins it;
  // fall back to branch number when an office lookup left them blank.
  const offices = [...officeMap.values()];
  for (const o of offices) {
    o.globalItems.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber));
    o.branches.sort((a, b) => (a.branchName || a.branchNumber).localeCompare(b.branchName || b.branchNumber));
    o.branchCount = o.branches.length;
    o.itemCount = o.globalItems.length;
    o.expiringSoon = o.branches.some((b) => !b.currentActive);
  }
  // Offices with the most pricing signal first; Unassigned last.
  offices.sort((a, b) => (a.officeId === "unassigned" ? 1 : 0) - (b.officeId === "unassigned" ? 1 : 0) || b.itemCount - a.itemCount);

  return { status: "live", generatedAt: new Date().toISOString(), offices };
}
