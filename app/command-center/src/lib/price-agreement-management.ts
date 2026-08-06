// Price Agreement Management (docs/83 P1) — the consolidated procurement surface.
// Per PE office × vendor: agreement coverage (migration 205/208, vendor-siloed),
// the Gap Worksheet (docs/83 decision 2: every item bought on 2+ invoices lifetime
// with NO in-force negotiated price), and the Renewal Worksheet (currently
// negotiated items vs what we actually pay). All prices are in the item's pricing
// UOM (docs/46). Purchase history is ABC-sourced today (mv_vendor_office_item_history);
// SRS/QXO history joins automatically once Phase 5 ingests their invoices.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface PamAgreement {
  key: string;
  source: "abc" | "generic";
  number: string;
  effective: string;
  expiry: string;
  itemCount: number;
  inDate: boolean;
}

export interface PamGapItem {
  itemNumber: string;
  description: string;
  uom: string;
  purchaseCount: number;
  totalQty: number;
  lifetimeValue: number;
  minPaid: number;
  maxPaid: number;
  avgPaid: number;
  latestPaid: number;
  apiPrice: number | null;
  lastPurchased: string;
  proposedPrice: number | null;
}

export interface PamRenewalItem {
  itemNumber: string;
  description: string;
  uom: string;
  negotiatedPrice: number;
  agreementNumber: string;
  purchaseCount: number;
  avgPaid: number | null;
  latestPaid: number | null;
  variancePct: number | null;
  proposedPrice: number | null;
}

export interface PamVendorBlock {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  agreements: PamAgreement[];
  gapItems: PamGapItem[];
  renewalItems: PamRenewalItem[];
  gapLifetimeValue: number;
}

export interface PamOfficeBlock {
  officeId: string;
  officeName: string;
  vendors: PamVendorBlock[];
}

export interface PamData {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: PamOfficeBlock[];
  totals: { gapItems: number; gapLifetimeValue: number; renewalItems: number; draftProposals: number };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

// PostgREST caps responses at 1,000 rows — page everything (memory: silent truncation).
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data } = await query(from, from + page - 1);
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function loadPriceAgreementManagement(env: RuntimeEnv = getRuntimeEnv()): Promise<PamData> {
  const empty: PamData = { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], totals: { gapItems: 0, gapLifetimeValue: 0, renewalItems: 0, draftProposals: 0 } };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;
  const today = new Date().toISOString().slice(0, 10);

  const [officeRows, vendorRows, covRows, histRows, apiRows, proposalRows] = await Promise.all([
    fetchAll<any>((a, b) => client.from("office").select("id,name,is_active").range(a, b)),
    fetchAll<any>((a, b) => client.from("vendors").select("id,name,slug,is_active").range(a, b)),
    fetchAll<any>((a, b) => client.from("v_office_vendor_agreements").select("*").range(a, b)),
    fetchAll<any>((a, b) => client.from("mv_vendor_office_item_history").select("*").gte("purchase_count", 2).range(a, b)),
    fetchAll<any>((a, b) => client.from("v_branch_item_api_price").select("item_number,api_price").range(a, b)),
    fetchAll<any>((a, b) => client.from("price_agreement_proposals").select("*").eq("status", "draft").range(a, b)),
  ]);

  const offices = officeRows.filter((o) => o.is_active !== false);
  const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

  // In-force agreement chains per office:vendor (newest per chain, effective <= today; evergreen).
  const chains = new Map<string, Map<string, any>>();
  for (const row of covRows) {
    if (row.effective_date && d10(row.effective_date) > today) continue;
    const key = `${row.office_id}:${row.vendor_id}`;
    const byChain = chains.get(key) ?? new Map<string, any>();
    const chainKey = row.agreement_number ?? row.agreement_key;
    const cur = byChain.get(chainKey);
    if (!cur || d10(row.effective_date) > d10(cur.effective_date)) byChain.set(chainKey, row);
    chains.set(key, byChain);
  }

  // Item price lists for the in-force agreements (both sources), for coverage + renewals.
  const abcIds = [...new Set(covRows.filter((r) => r.source === "abc").map((r) => Number(r.agreement_key)))];
  const genericIds = [...new Set(covRows.filter((r) => r.source === "generic").map((r) => String(r.agreement_key)))];
  const [abcItems, genericItems] = await Promise.all([
    abcIds.length
      ? fetchAll<any>((a, b) => client.from("abc_price_list_items").select("agreement_id,item_number,description,unit,unit_price").in("agreement_id", abcIds).range(a, b))
      : Promise.resolve([]),
    genericIds.length
      ? fetchAll<any>((a, b) => client.from("price_agreement_items").select("agreement_id,raw_item_number,raw_description,price_uom,negotiated_price").in("agreement_id", genericIds).range(a, b))
      : Promise.resolve([]),
  ]);
  const itemsByAgreementKey = new Map<string, { itemNumber: string; description: string; uom: string; price: number }[]>();
  for (const it of abcItems) {
    const list = itemsByAgreementKey.get(String(it.agreement_id)) ?? [];
    list.push({ itemNumber: it.item_number ?? "", description: it.description ?? "", uom: it.unit ?? "", price: num(it.unit_price) });
    itemsByAgreementKey.set(String(it.agreement_id), list);
  }
  for (const it of genericItems) {
    const list = itemsByAgreementKey.get(String(it.agreement_id)) ?? [];
    list.push({ itemNumber: it.raw_item_number ?? "", description: it.raw_description ?? "", uom: it.price_uom ?? "", price: num(it.negotiated_price) });
    itemsByAgreementKey.set(String(it.agreement_id), list);
  }

  const histByOfficeVendor = new Map<string, any[]>();
  for (const h of histRows) {
    const key = `${h.office_id}:${h.vendor_id}`;
    (histByOfficeVendor.get(key) ?? (histByOfficeVendor.set(key, []), histByOfficeVendor.get(key)!)).push(h);
  }

  const apiByItem = new Map<string, number>();
  for (const r of apiRows) {
    const p = num(r.api_price);
    if (!r.item_number || p <= 0) continue;
    const cur = apiByItem.get(r.item_number);
    if (cur == null || p < cur) apiByItem.set(r.item_number, p);
  }

  const proposalByKey = new Map<string, any>();
  for (const p of proposalRows) proposalByKey.set(`${p.office_id}:${p.vendor_id}:${p.item_number}:${p.kind}`, p);

  const totals = { gapItems: 0, gapLifetimeValue: 0, renewalItems: 0, draftProposals: proposalRows.length };
  const officeBlocks: PamOfficeBlock[] = offices.map((office) => {
    const vendorIds = new Set<string>();
    for (const key of chains.keys()) if (key.startsWith(`${office.id}:`)) vendorIds.add(key.slice(String(office.id).length + 1));
    for (const key of histByOfficeVendor.keys()) if (key.startsWith(`${office.id}:`)) vendorIds.add(key.slice(String(office.id).length + 1));

    const vendors: PamVendorBlock[] = [...vendorIds].map((vendorId) => {
      const vendor = vendorById.get(vendorId);
      const key = `${office.id}:${vendorId}`;
      const agreementRows = [...(chains.get(key)?.values() ?? [])];
      const agreements: PamAgreement[] = agreementRows
        .map((r) => ({
          key: String(r.agreement_key),
          source: r.source,
          number: r.agreement_number ?? String(r.agreement_key),
          effective: d10(r.effective_date),
          expiry: d10(r.expiry_date),
          itemCount: num(r.item_count),
          inDate: !r.expiry_date || d10(r.expiry_date) >= today,
        }))
        .sort((a, b) => Number(b.inDate) - Number(a.inDate) || b.effective.localeCompare(a.effective));

      // Negotiated coverage: exact item numbers across the in-force set (lowest price wins).
      const negotiatedByItem = new Map<string, { price: number; uom: string; description: string; agreementNumber: string }>();
      for (const ag of agreements) {
        for (const it of itemsByAgreementKey.get(ag.key) ?? []) {
          if (!it.itemNumber) continue;
          const cur = negotiatedByItem.get(it.itemNumber);
          if (!cur || it.price < cur.price) negotiatedByItem.set(it.itemNumber, { price: it.price, uom: it.uom, description: it.description, agreementNumber: ag.number });
        }
      }

      const hist = histByOfficeVendor.get(key) ?? [];
      const histByItem = new Map(hist.map((h) => [h.item_number, h]));

      const gapItems: PamGapItem[] = hist
        .filter((h) => !negotiatedByItem.has(h.item_number))
        .map((h) => ({
          itemNumber: h.item_number,
          description: h.item_description ?? "",
          uom: h.uom ?? "",
          purchaseCount: num(h.purchase_count),
          totalQty: num(h.total_qty),
          lifetimeValue: num(h.lifetime_value),
          minPaid: num(h.min_paid),
          maxPaid: num(h.max_paid),
          avgPaid: num(h.avg_paid),
          latestPaid: num(h.latest_paid),
          apiPrice: apiByItem.get(h.item_number) ?? null,
          lastPurchased: d10(h.last_purchased),
          proposedPrice: proposalByKey.get(`${key}:${h.item_number}:gap`)?.proposed_price != null ? num(proposalByKey.get(`${key}:${h.item_number}:gap`).proposed_price) : null,
        }))
        .sort((a, b) => b.lifetimeValue - a.lifetimeValue);

      const renewalItems: PamRenewalItem[] = [...negotiatedByItem.entries()]
        .map(([itemNumber, neg]) => {
          const h = histByItem.get(itemNumber);
          const avgPaid = h ? num(h.avg_paid) : null;
          return {
            itemNumber,
            description: neg.description,
            uom: neg.uom,
            negotiatedPrice: neg.price,
            agreementNumber: neg.agreementNumber,
            purchaseCount: h ? num(h.purchase_count) : 0,
            avgPaid,
            latestPaid: h ? num(h.latest_paid) : null,
            variancePct: avgPaid != null && neg.price > 0 ? Math.round(((avgPaid - neg.price) / neg.price) * 1000) / 10 : null,
            proposedPrice: proposalByKey.get(`${key}:${itemNumber}:renewal`)?.proposed_price != null ? num(proposalByKey.get(`${key}:${itemNumber}:renewal`).proposed_price) : null,
          };
        })
        .sort((a, b) => (b.purchaseCount - a.purchaseCount) || a.itemNumber.localeCompare(b.itemNumber));

      const gapLifetimeValue = gapItems.reduce((s, g) => s + g.lifetimeValue, 0);
      totals.gapItems += gapItems.length;
      totals.gapLifetimeValue += gapLifetimeValue;
      totals.renewalItems += renewalItems.length;

      return {
        vendorId,
        vendorName: vendor?.name ?? "Vendor",
        vendorSlug: vendor?.slug ?? "",
        agreements,
        gapItems,
        renewalItems,
        gapLifetimeValue,
      };
    }).sort((a, b) => a.vendorName.localeCompare(b.vendorName));

    return { officeId: office.id, officeName: office.name ?? "Office", vendors: vendors.filter((v) => v.agreements.length || v.gapItems.length) };
  }).filter((o) => o.vendors.length);

  return { status: "live", generatedAt: new Date().toISOString(), offices: officeBlocks, totals };
}
