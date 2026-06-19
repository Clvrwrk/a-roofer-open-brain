// Accounting → Price Agreement Builder loader (Item 3).
//
// The per-branch worksheet for building/renewing a negotiated price agreement.
// Item set = the curated NEGOTIABLE master (v_negotiable_items = ABC review-class
// A+B, ~857 SKUs / ~454 families; schema 109), shown as top-level FAMILY rows that
// expand to SKU/color variations.
//
// PREFILL (confirmed w/ Chris): per item, the starting price = (1) the branch's
// negotiated agreement price — the lowest across the branch's matched agreements
// (in practice every branch inherits one central agreement, so this = the current
// price), else (2) the most recent invoiced unit price for that item at the
// branch's ship-to IF < 60 days old (v_recent_invoice_price), else (3) 0. No
// region/national fallback.
//
// Persisted edits (proposed prices, overrides, exclusions) live in
// agreement_package_items (schema 110) and are merged on load. Recipient defaults
// to the ABC national account manager (Justin Garza) for all PE offices.
// Vendor-agnostic by item_number; read-write but never sends anything externally.

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
  priorPrice: number | null;
  priorPriceSource: "agreement" | "invoice_60d" | null;
  proposedPrice: number | null; // persisted edit, null = not yet set
  isOverride: boolean;
  excluded: boolean;
}

export interface NegFamily {
  familyId: string;
  familyName: string;
  topClass: string;
  categoryKey: string;
  categoryLabel: string;
  variationCount: number;
  pricedCount: number;
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
  packageId: string | null;
  recipient: { name: string; email: string };
  branches: BranchOption[];
  families: NegFamily[];
  totals: { families: number; items: number; priced: number; proposed: number; spend: number };
}

const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const NAM = { name: "Justin Garza", email: "Justin.Garza@abcsupply.com" };

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
    branch: null, packageId: null, recipient: NAM, branches: [], families: [],
    totals: { families: 0, items: 0, priced: 0, proposed: 0, spend: 0 },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const [items, matches, priceItems, branchMeta, recentPrices, catRows] = await Promise.all([
    selectAll<any>(client, "v_negotiable_items", "*"),
    selectAll<any>(client, "abc_price_agreement_branch_matches", "branch_number,ship_to_number,abc_price_agreement_id,confidence_score"),
    selectAll<any>(client, "abc_price_list_items", "agreement_id,item_number,unit_price,category_key"),
    selectAll<any>(client, "abc_vendor_branches", "branch_number,branch_name,city,state"),
    selectAll<any>(client, "v_recent_invoice_price", "ship_to_number,item_number,unit_price,invoice_date"),
    selectAll<any>(client, "roof_system_category", "key,label,sort_order"),
  ]);
  if (items.length === 0) return empty;

  // item_number → roof-system category (from priced catalog; covers the negotiable A+B set well).
  const catLabel = new Map<string, string>();
  for (const c of catRows) catLabel.set(c.key, c.label);
  const itemCat = new Map<string, string>();
  for (const p of priceItems) if (p.category_key && !itemCat.has(p.item_number)) itemCat.set(p.item_number, p.category_key);

  // agreement_id → (item_number → lowest unit_price)
  const agPrices = new Map<string, Map<string, number>>();
  for (const p of priceItems) {
    const aid = String(p.agreement_id);
    let m = agPrices.get(aid);
    if (!m) { m = new Map(); agPrices.set(aid, m); }
    const price = num(p.unit_price);
    const prev = m.get(p.item_number);
    if (prev == null || price < prev) m.set(p.item_number, price);
  }

  const branchName = new Map<string, { name: string; office: string }>();
  for (const b of branchMeta) {
    branchName.set(String(b.branch_number), {
      name: b.branch_name || `Branch ${b.branch_number}`,
      office: [b.city, b.state].filter(Boolean).join(", "),
    });
  }

  // branch → its ship-to numbers (for the recent-invoice fallback) and branch →
  // (item → lowest negotiated price) via that branch's matched agreements. Branch
  // ids are normalized to strings so number↔string keys never miss across views.
  const branchShipTos = new Map<string, Set<string>>();
  const branchNegPrice = new Map<string, Map<string, number>>();
  for (const m of matches) {
    const bn = m.branch_number == null ? "" : String(m.branch_number);
    if (!bn) continue;
    if (m.ship_to_number) {
      let s = branchShipTos.get(bn); if (!s) { s = new Set(); branchShipTos.set(bn, s); }
      s.add(String(m.ship_to_number));
    }
    const ap = agPrices.get(String(m.abc_price_agreement_id));
    if (!ap) continue;
    let bm = branchNegPrice.get(bn); if (!bm) { bm = new Map(); branchNegPrice.set(bn, bm); }
    for (const [item, price] of ap) {
      const prev = bm.get(item);
      if (prev == null || price < prev) bm.set(item, price);
    }
  }

  // (ship_to|item) → most-recent invoice price within 60 days
  const recentByShipItem = new Map<string, { price: number; date: string }>();
  for (const r of recentPrices) {
    recentByShipItem.set(`${r.ship_to_number}|${r.item_number}`, { price: num(r.unit_price), date: String(r.invoice_date).slice(0, 10) });
  }

  // Branch picker: branches with a matched agreement, counting priced A+B items.
  const negItemSet = new Set(items.map((i) => i.item_number));
  const branches: BranchOption[] = Array.from(branchNegPrice.entries())
    .map(([bn, m]) => {
      let priced = 0;
      for (const item of m.keys()) if (negItemSet.has(item)) priced++;
      const meta = branchName.get(bn);
      return { branchNumber: bn, branchName: meta?.name ?? `Branch ${bn}`, office: meta?.office ?? "", pricedItems: priced };
    })
    .sort((a, b) => b.pricedItems - a.pricedItems || a.branchName.localeCompare(b.branchName));

  const selected = (branchNumber && branches.find((b) => b.branchNumber === branchNumber)) || branches[0] || null;
  if (!selected) return { ...empty, status: "live", branches };

  const negMap = branchNegPrice.get(selected.branchNumber) ?? new Map<string, number>();
  const shipTos = Array.from(branchShipTos.get(selected.branchNumber) ?? []);

  // Load any persisted draft package for this branch and its item edits.
  const { data: pkgRow } = await client
    .from("agreement_packages")
    .select("id")
    .eq("branch_number", selected.branchNumber)
    .eq("vendor", "ABC Supply Co.")
    .order("package_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const packageId = (pkgRow as any)?.id ?? null;

  const persisted = new Map<string, any>();
  if (packageId) {
    const { data: pkgItems } = await client
      .from("agreement_package_items")
      .select("item_number,proposed_price,is_override,item_status")
      .eq("package_id", packageId);
    for (const it of (pkgItems as any[] | null) ?? []) persisted.set(it.item_number, it);
  }

  // Resolve prior price per item: negotiated → recent-invoice <60d → null(0).
  function priorFor(item: string): { price: number | null; source: "agreement" | "invoice_60d" | null } {
    if (negMap.has(item)) return { price: negMap.get(item)!, source: "agreement" };
    let best: { price: number; date: string } | null = null;
    for (const st of shipTos) {
      const hit = recentByShipItem.get(`${st}|${item}`);
      if (hit && (!best || hit.date > best.date)) best = hit;
    }
    return best ? { price: best.price, source: "invoice_60d" } : { price: null, source: null };
  }

  // Group negotiable items by family.
  const famMap = new Map<string, NegFamily>();
  const classRank = (c: string) => (c === "A" ? 2 : c === "B" ? 1 : 0);
  for (const it of items) {
    const prior = priorFor(it.item_number);
    const p = persisted.get(it.item_number);
    let fam = famMap.get(it.family_id);
    if (!fam) {
      fam = { familyId: it.family_id, familyName: it.family_name, topClass: it.review_class, categoryKey: "uncategorized", categoryLabel: "Uncategorized", variationCount: 0, pricedCount: 0, spend36mo: 0, variations: [] };
      famMap.set(it.family_id, fam);
    }
    fam.variations.push({
      itemNumber: it.item_number,
      description: it.description,
      uom: it.uom ?? "",
      reviewClass: it.review_class,
      spend36mo: num(it.spend_36mo),
      purchases36mo: num(it.purchases_36mo),
      priorPrice: prior.price,
      priorPriceSource: prior.source,
      proposedPrice: p && p.proposed_price != null ? num(p.proposed_price) : null,
      isOverride: !!p?.is_override,
      excluded: p?.item_status === "excluded",
    });
    fam.variationCount++;
    if (prior.price != null) fam.pricedCount++;
    fam.spend36mo += num(it.spend_36mo);
    if (classRank(it.review_class) > classRank(fam.topClass)) fam.topClass = it.review_class;
  }

  const families = Array.from(famMap.values())
    .map((f) => {
      // Family category = the most common roof-system category across its variations.
      const counts = new Map<string, number>();
      for (const v of f.variations) {
        const c = itemCat.get(v.itemNumber) || "uncategorized";
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let categoryKey = "uncategorized", best = -1;
      for (const [c, n] of counts) if (n > best) { best = n; categoryKey = c; }
      return { ...f, categoryKey, categoryLabel: catLabel.get(categoryKey) ?? "Uncategorized", variations: f.variations.sort((a, b) => b.spend36mo - a.spend36mo) };
    })
    .sort((a, b) => b.spend36mo - a.spend36mo);

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    branch: { number: selected.branchNumber, name: selected.branchName, office: selected.office },
    packageId,
    recipient: NAM,
    branches,
    families,
    totals: {
      families: families.length,
      items: items.length,
      priced: families.reduce((s, f) => s + f.pricedCount, 0),
      proposed: families.reduce((s, f) => s + f.variations.filter((v) => v.proposedPrice != null).length, 0),
      spend: Math.round(families.reduce((s, f) => s + f.spend36mo, 0)),
    },
  };
}
