// Accounting → Price Agreement Builder loader (Item 3, slice 1: read-only).
//
// The per-branch worksheet for building/renewing a negotiated price agreement.
// Item set = the curated NEGOTIABLE master (v_negotiable_items = ABC review-class
// A+B, ~857 SKUs / ~454 families; schema 109), shown as top-level FAMILY rows that
// expand to their SKU/color variations. Each variation is PREFILLED with this
// branch's latest negotiated price (abc_price_agreement_branch_matches →
// abc_price_list_items by the branch's ship-to), else 0 — the locked prefill rule.
//
// Read-only this slice; editing/persistence (agreement_packages) comes in slice 2.
// Vendor-agnostic by item_number — same shape for any vendor's catalog later.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NegVariation {
  itemNumber: string;
  description: string;
  uom: string;
  reviewClass: string;
  spend36mo: number;
  purchases36mo: number;
  priorPrice: number | null; // this branch's latest negotiated price, null = never negotiated
}

export interface NegFamily {
  familyId: string;
  familyName: string;
  topClass: string; // best (A over B) review class in the family
  variationCount: number;
  pricedCount: number; // variations with a prior price for this branch
  spend36mo: number;
  variations: NegVariation[];
}

export interface BranchOption {
  branchNumber: string;
  branchName: string;
  office: string;
  pricedItems: number;
}

export interface AgreementBuilderData {
  status: "live" | "unconfigured";
  generatedAt: string;
  branch: { number: string; name: string; office: string } | null;
  branches: BranchOption[];
  families: NegFamily[];
  totals: { families: number; items: number; priced: number; spend: number };
}

const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

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

export async function loadAgreementBuilder(branchNumber?: string, env: RuntimeEnv = getRuntimeEnv()): Promise<AgreementBuilderData> {
  const empty: AgreementBuilderData = {
    status: "unconfigured", generatedAt: new Date().toISOString(),
    branch: null, branches: [], families: [], totals: { families: 0, items: 0, priced: 0, spend: 0 },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const [items, matches, priceItems, branchMeta] = await Promise.all([
    selectAll<any>(client, "v_negotiable_items", "*"),
    selectAll<any>(client, "abc_price_agreement_branch_matches", "branch_number,ship_to_number,abc_price_agreement_id,confidence_score"),
    selectAll<any>(client, "abc_price_list_items", "agreement_id,item_number,unit_price"),
    selectAll<any>(client, "abc_vendor_branches", "branch_number,branch_name,city,state"),
  ]);
  if (items.length === 0) return empty;

  // agreement_id → (item_number → unit_price)
  const agPrices = new Map<string, Map<string, number>>();
  for (const p of priceItems) {
    const aid = String(p.agreement_id);
    let m = agPrices.get(aid);
    if (!m) { m = new Map(); agPrices.set(aid, m); }
    const price = num(p.unit_price);
    const prev = m.get(p.item_number);
    if (prev == null || price < prev) m.set(p.item_number, price); // lowest negotiated price wins
  }

  const branchName = new Map<string, { name: string; office: string }>();
  for (const b of branchMeta) {
    branchName.set(b.branch_number, {
      name: b.branch_name || `Branch ${b.branch_number}`,
      office: [b.city, b.state].filter(Boolean).join(", "),
    });
  }

  // branch_number → (item_number → best prior price), via that branch's matched agreements.
  const branchItemPrice = new Map<string, Map<string, number>>();
  for (const m of matches) {
    const bn = m.branch_number;
    if (!bn) continue;
    const ap = agPrices.get(String(m.abc_price_agreement_id));
    if (!ap) continue;
    let bm = branchItemPrice.get(bn);
    if (!bm) { bm = new Map(); branchItemPrice.set(bn, bm); }
    for (const [item, price] of ap) {
      const prev = bm.get(item);
      if (prev == null || price < prev) bm.set(item, price);
    }
  }

  // Branch picker: branches that have any matched agreement, with a count of how
  // many of the A+B items they already have a negotiated price for.
  const negItemSet = new Set(items.map((i) => i.item_number));
  const branches: BranchOption[] = Array.from(branchItemPrice.entries())
    .map(([bn, m]) => {
      let priced = 0;
      for (const item of m.keys()) if (negItemSet.has(item)) priced++;
      const meta = branchName.get(bn);
      return { branchNumber: bn, branchName: meta?.name ?? `Branch ${bn}`, office: meta?.office ?? "", pricedItems: priced };
    })
    .sort((a, b) => b.pricedItems - a.pricedItems || a.branchName.localeCompare(b.branchName));

  const selected = (branchNumber && branches.find((b) => b.branchNumber === branchNumber)) || branches[0] || null;
  const priceMap = selected ? branchItemPrice.get(selected.branchNumber) ?? new Map<string, number>() : new Map<string, number>();

  // Group negotiable items by family.
  const famMap = new Map<string, NegFamily>();
  const classRank = (c: string) => (c === "A" ? 2 : c === "B" ? 1 : 0);
  for (const it of items) {
    const prior = priceMap.has(it.item_number) ? priceMap.get(it.item_number)! : null;
    let fam = famMap.get(it.family_id);
    if (!fam) {
      fam = { familyId: it.family_id, familyName: it.family_name, topClass: it.review_class, variationCount: 0, pricedCount: 0, spend36mo: 0, variations: [] };
      famMap.set(it.family_id, fam);
    }
    fam.variations.push({
      itemNumber: it.item_number,
      description: it.description,
      uom: it.uom ?? "",
      reviewClass: it.review_class,
      spend36mo: num(it.spend_36mo),
      purchases36mo: num(it.purchases_36mo),
      priorPrice: prior,
    });
    fam.variationCount++;
    if (prior != null) fam.pricedCount++;
    fam.spend36mo += num(it.spend_36mo);
    if (classRank(it.review_class) > classRank(fam.topClass)) fam.topClass = it.review_class;
  }

  const families = Array.from(famMap.values())
    .map((f) => ({ ...f, variations: f.variations.sort((a, b) => b.spend36mo - a.spend36mo) }))
    .sort((a, b) => b.spend36mo - a.spend36mo);

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    branch: selected ? { number: selected.branchNumber, name: selected.branchName, office: selected.office } : null,
    branches,
    families,
    totals: {
      families: families.length,
      items: items.length,
      priced: families.reduce((s, f) => s + f.pricedCount, 0),
      spend: Math.round(families.reduce((s, f) => s + f.spend36mo, 0)),
    },
  };
}
