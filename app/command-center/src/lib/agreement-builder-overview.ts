// Agreement Builder OVERVIEW — PE Office → Vendor → Vendor/Branch skeleton with cost
// roll-up. The branch's negotiated-item catalog (Category → Item → Variation) is loaded
// lazily per branch (loadAgreementBuilder), so this overview only carries per-branch
// totals and the office/vendor rollups.
//
// Cost model (confirmed w/ Chris): per branch, for each negotiable (A+B) item it actually
// buys, set price = persisted proposed → branch negotiated price → historical avg
// (spend/qty, so an un-negotiated item shows no fake savings). Projected cost = Σ set×qty
// over the branch's trailing-36mo volume (v_branch_item_spend); savings = historical
// spend − projected. Rolls up Branch → Vendor → Office.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { SupabaseClient } from "@supabase/supabase-js";

const VENDOR = "ABC Supply Co.";
const VENDOR_ABBR = "ABC";
const NAM_ACCOUNT = "2036874";
const NAM = { name: "Justin Garza", email: "Justin.Garza@abcsupply.com" };
const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const normBranch = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s.replace(/^0+/, "") || s;
};

export interface AbBranch {
  branchNumber: string;
  branchName: string;
  office: string;
  vendor: string;
  paNumber: string; // export id: PA-<VENDOR>#<BRANCH>-<paNumber>
  exportId: string;
  itemCount: number;
  familyCount: number;
  pricedCount: number;
  reviewedCount: number; // Phase B
  projectedCost: number;
  historicalSpend: number;
  savings: number;
  hasPackage: boolean;
}
export interface AbVendor {
  vendor: string;
  branchCount: number;
  projectedCost: number;
  historicalSpend: number;
  savings: number;
  branches: AbBranch[];
}
export interface AbOffice {
  office: string;
  vendorCount: number;
  branchCount: number;
  projectedCost: number;
  historicalSpend: number;
  savings: number;
  vendors: AbVendor[];
}
export interface AgreementBuilderOverview {
  status: "live" | "unconfigured";
  generatedAt: string;
  recipient: { name: string; email: string };
  offices: AbOffice[];
  totals: { offices: number; branches: number; projectedCost: number; historicalSpend: number; savings: number; negotiableItems: number };
}

async function selectAll<T = any>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

export async function loadAgreementBuilderOverview(env: RuntimeEnv = getRuntimeEnv()): Promise<AgreementBuilderOverview> {
  const empty: AgreementBuilderOverview = {
    status: "unconfigured", generatedAt: new Date().toISOString(), recipient: NAM, offices: [],
    totals: { offices: 0, branches: 0, projectedCost: 0, historicalSpend: 0, savings: 0, negotiableItems: 0 },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const [negItems, vol, matches, priceItems, vbRows, officeRows, agRows, pkgRows] = await Promise.all([
    selectAll<any>(client, "v_negotiable_items", "item_number,family_id"),
    selectAll<any>(client, "v_branch_item_spend", "branch_number,item_number,qty_36mo,spend_36mo"),
    selectAll<any>(client, "abc_price_agreement_branch_matches", "branch_number,abc_price_agreement_id"),
    selectAll<any>(client, "abc_price_list_items", "agreement_id,item_number,unit_price"),
    selectAll<any>(client, "vendor_branches", "branch_number,branch_name,pricing_territory_office_id"),
    selectAll<any>(client, "office", "id,name"),
    selectAll<any>(client, "abc_price_agreements", "id,agreement_number"),
    selectAll<any>(client, "agreement_packages", "id,branch_number"),
  ]);
  if (negItems.length === 0) return empty;

  // negotiable item → family
  const negFamily = new Map<string, string>();
  for (const it of negItems) negFamily.set(it.item_number, it.family_id);
  const negSet = new Set(negFamily.keys());

  // agreement_id → (item → lowest unit_price)
  const agPrices = new Map<string, Map<string, number>>();
  for (const p of priceItems) {
    const m = agPrices.get(String(p.agreement_id)) ?? new Map<string, number>();
    const price = num(p.unit_price);
    const prev = m.get(p.item_number);
    if (prev == null || price < prev) m.set(p.item_number, price);
    agPrices.set(String(p.agreement_id), m);
  }
  // agreement id → number (for PA export id)
  const agNumber = new Map<string, string>();
  for (const a of agRows) agNumber.set(String(a.id), a.agreement_number || "");

  // branch (normalized) → negotiated price per item, and the branch's PA agreement number
  const branchNeg = new Map<string, Map<string, number>>();
  const branchPa = new Map<string, string>();
  for (const m of matches) {
    const bn = normBranch(m.branch_number);
    if (!bn) continue;
    const ap = agPrices.get(String(m.abc_price_agreement_id));
    const nm = agNumber.get(String(m.abc_price_agreement_id)) || "";
    if (nm && !/^API-/i.test(nm) && !branchPa.has(bn)) branchPa.set(bn, nm);
    if (!ap) continue;
    const bm = branchNeg.get(bn) ?? new Map<string, number>();
    for (const [item, price] of ap) {
      const prev = bm.get(item);
      if (prev == null || price < prev) bm.set(item, price);
    }
    branchNeg.set(bn, bm);
  }

  // branch (normalized) → office + name
  const officeName = new Map<string, string>();
  for (const o of officeRows) officeName.set(o.id, o.name);
  const branchMeta = new Map<string, { name: string; office: string }>();
  for (const vb of vbRows) {
    const bn = normBranch(vb.branch_number);
    if (!bn || branchMeta.has(bn)) continue;
    branchMeta.set(bn, {
      name: vb.branch_name || `Branch ${bn}`,
      office: vb.pricing_territory_office_id ? (officeName.get(vb.pricing_territory_office_id) ?? "Unassigned") : "Unassigned",
    });
  }

  // branch (normalized) → has a draft package
  const branchHasPkg = new Set<string>();
  for (const p of pkgRows) branchHasPkg.add(normBranch(p.branch_number));

  // branch → its negotiable-item volume rows
  const branchVol = new Map<string, { item: string; qty: number; spend: number }[]>();
  for (const v of vol) {
    if (!negSet.has(v.item_number)) continue;
    const bn = normBranch(v.branch_number);
    const list = branchVol.get(bn) ?? [];
    list.push({ item: v.item_number, qty: num(v.qty_36mo), spend: num(v.spend_36mo) });
    branchVol.set(bn, list);
  }

  // Build branch nodes (only branches that actually buy negotiable items).
  const branches: AbBranch[] = [];
  for (const [bn, rows] of branchVol) {
    const neg = branchNeg.get(bn) ?? new Map<string, number>();
    const meta = branchMeta.get(bn) ?? { name: `Branch ${bn}`, office: "Unassigned" };
    const families = new Set<string>();
    let projected = 0, historical = 0, priced = 0;
    for (const r of rows) {
      const histAvg = r.qty !== 0 ? r.spend / r.qty : 0;
      const negPrice = neg.get(r.item);
      const setPrice = negPrice != null ? negPrice : histAvg; // proposed merged in detail view; overview uses negotiated→historical
      projected += setPrice * r.qty;
      historical += r.spend;
      if (negPrice != null) priced++;
      const fam = negFamily.get(r.item);
      if (fam) families.add(fam);
    }
    const paNumber = branchPa.get(bn) || `${NAM_ACCOUNT}-${bn}`;
    branches.push({
      branchNumber: bn,
      branchName: meta.name,
      office: meta.office,
      vendor: VENDOR,
      paNumber,
      exportId: `PA-${VENDOR_ABBR}#${bn}-${paNumber}`,
      itemCount: rows.length,
      familyCount: families.size,
      pricedCount: priced,
      reviewedCount: 0,
      projectedCost: Math.round(projected),
      historicalSpend: Math.round(historical),
      savings: Math.round(historical - projected),
      hasPackage: branchHasPkg.has(bn),
    });
  }

  // Group Branch → Vendor → Office.
  const officeMap = new Map<string, AbOffice>();
  for (const br of branches) {
    let off = officeMap.get(br.office);
    if (!off) { off = { office: br.office, vendorCount: 0, branchCount: 0, projectedCost: 0, historicalSpend: 0, savings: 0, vendors: [] }; officeMap.set(br.office, off); }
    let ven = off.vendors.find((v) => v.vendor === br.vendor);
    if (!ven) { ven = { vendor: br.vendor, branchCount: 0, projectedCost: 0, historicalSpend: 0, savings: 0, branches: [] }; off.vendors.push(ven); off.vendorCount++; }
    ven.branches.push(br);
    ven.branchCount++; off.branchCount++;
    ven.projectedCost += br.projectedCost; ven.historicalSpend += br.historicalSpend; ven.savings += br.savings;
    off.projectedCost += br.projectedCost; off.historicalSpend += br.historicalSpend; off.savings += br.savings;
  }

  const offices = [...officeMap.values()].map((o) => {
    o.vendors.forEach((v) => v.branches.sort((a, b) => b.historicalSpend - a.historicalSpend));
    o.vendors.sort((a, b) => b.historicalSpend - a.historicalSpend);
    return o;
  }).sort((a, b) => {
    if (a.office === "Unassigned") return 1;
    if (b.office === "Unassigned") return -1;
    return b.historicalSpend - a.historicalSpend;
  });

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    recipient: NAM,
    offices,
    totals: {
      offices: offices.filter((o) => o.office !== "Unassigned").length,
      branches: branches.length,
      projectedCost: branches.reduce((s, b) => s + b.projectedCost, 0),
      historicalSpend: branches.reduce((s, b) => s + b.historicalSpend, 0),
      savings: branches.reduce((s, b) => s + b.savings, 0),
      negotiableItems: negSet.size,
    },
  };
}
