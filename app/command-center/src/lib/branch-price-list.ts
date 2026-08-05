// Effective negotiated price list for a vendor branch — exactly the prices the
// Invoice Audit compares against (v_branch_price_list). Opened standalone (new
// window) from the invoice header and the territory side card.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface BranchPriceItem {
  itemNumber: string;
  description: string;
  uom: string;
  unitPrice: number;
  manufacturer: string;
  category: string;
  agreementId: string | number | null;
  agreementNumber: string;
  effective: string;
  expiry: string;
  active: boolean;
  categoryKey: string;
}

export interface BranchPriceList {
  status: "live" | "empty" | "unconfigured";
  branchNumber: string;
  branchName: string;
  branchAddress: string;
  // When opened for a specific invoice, the list is scoped to the agreement that was
  // active on that invoice's date (the price the invoice was actually audited against).
  scopedInvoice: string;
  scopedInvoiceDate: string;
  scopedAgreementNumber: string;
  // R3 (docs/82): when the branch has no direct list, it inherits its PE office's
  // in-force agreements (2-hour window, docs/81 §4) — this names the office.
  inheritedOffice: string;
  items: BranchPriceItem[];
  activeItems: number;
  expiredItems: number;
  agreements: { id: string | number; number: string; effective: string; expiry: string; active: boolean; itemCount: number }[];
  categories: { key: string; label: string; sortOrder: number }[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

// Resolve "Branch #1272 — ABC Supply 1272, 1425 Vernon St, Kansas City, MO 64116".
function formatBranchAddress(br: any): string {
  if (!br) return "";
  const addr = br.address_json ?? {};
  const line1 = addr.addressLine1 ?? addr.addressLine_1 ?? addr.line1 ?? addr.street ?? "";
  const tail = [br.city, [br.state, br.postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, tail].filter(Boolean).join(", ");
}

// R3 (docs/82): the office-inherited price list — the same agreement set the v2 audit
// engine prices against. branch -> vendor_branch -> office -> in-force agreement
// versions at refDate (newest per agreement_number; evergreen). Migration 205: reads the
// all-vendor v_office_vendor_agreements, scoped to the branch's own vendor, so SRS (and
// any future vendor) branches inherit exactly like ABC ones.
async function loadOfficeInheritedList(client: any, branchNumber: string, refDate: string): Promise<{ officeName: string; agreements: { key: string; source: string; number: string; effective: string; expiry: string }[] } | null> {
  const norm = branchNumber.replace(/^0+/, "");
  const { data: vbRows } = await client
    .from("vendor_branches")
    .select("branch_number, vendor_id, pricing_territory_office_id")
    .not("pricing_territory_office_id", "is", null)
    .limit(2000);
  const vb = ((vbRows as any[] | null) ?? []).find((v) => String(v.branch_number ?? "").replace(/^0+/, "") === norm);
  if (!vb) return null;
  const { data: officeRows } = await client.from("office").select("name").eq("id", vb.pricing_territory_office_id).limit(1);
  const officeName = (officeRows as any[] | null)?.[0]?.name ?? "";
  const { data: oavRows } = await client
    .from("v_office_vendor_agreements")
    .select("source, agreement_key, agreement_number, effective_date, expiry_date")
    .eq("office_id", vb.pricing_territory_office_id)
    .eq("vendor_id", vb.vendor_id);
  const versions = ((oavRows as any[] | null) ?? []).filter((a) => !a.effective_date || d10(a.effective_date) <= refDate);
  // newest in-force version per agreement chain (evergreen — expiry never disqualifies)
  const newest = new Map<string, any>();
  for (const a of versions) {
    const cur = newest.get(a.agreement_number);
    if (!cur || d10(a.effective_date) > d10(cur.effective_date)) newest.set(a.agreement_number, a);
  }
  const agreements = [...newest.values()].map((a) => ({
    key: String(a.agreement_key),
    source: String(a.source),
    number: a.agreement_number ?? String(a.agreement_key),
    effective: d10(a.effective_date),
    expiry: d10(a.expiry_date),
  }));
  return agreements.length ? { officeName, agreements } : null;
}

export async function loadBranchPriceList(branchNumber: string, invoiceNumber = "", env: RuntimeEnv = getRuntimeEnv()): Promise<BranchPriceList> {
  const base: BranchPriceList = { status: "unconfigured", branchNumber, branchName: "", branchAddress: "", scopedInvoice: "", scopedInvoiceDate: "", scopedAgreementNumber: "", inheritedOffice: "", items: [], activeItems: 0, expiredItems: 0, agreements: [], categories: [] };
  const { client } = createServerSupabaseClient(env);
  if (!client || !branchNumber) return base;

  const { data: catData } = await client.from("roof_system_category").select("key,label,sort_order").order("sort_order");
  const categories = ((catData as any[] | null) ?? []).map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));

  // Branch name + address (lives in abc_vendor_branches for ABC; fall back to
  // vendor_branches for non-ABC vendors like SRS/QXO).
  const { data: brRows } = await client.from("abc_vendor_branches").select("branch_name,address_json,city,state,postal").eq("branch_number", branchNumber).limit(1);
  const br = (brRows as any[] | null)?.[0] ?? null;
  let branchName = br?.branch_name ?? "";
  let branchAddress = formatBranchAddress(br);
  if (!br) {
    const { data: vbRows } = await client.from("vendor_branches").select("branch_name,address,city,state").eq("branch_number", branchNumber).limit(1);
    const vb = (vbRows as any[] | null)?.[0] ?? null;
    branchName = vb?.branch_name ?? "";
    branchAddress = [vb?.address, [vb?.city, vb?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  }

  // Invoice scoping: find the agreement active on the invoice's date for its ship-to.
  let scopedAgreementId: number | null = null;
  let scopedInvoice = "";
  let scopedInvoiceDate = "";
  let scopedAgreementNumber = "";
  let scopedAgreementEffective = "";
  let scopedAgreementExpiry = "";
  if (invoiceNumber) {
    const { data: invRows } = await client.from("abc_invoices").select("invoice_date,ship_to_number").eq("invoice_number", invoiceNumber).limit(1);
    const inv = (invRows as any[] | null)?.[0] ?? null;
    const invDate = d10(inv?.invoice_date);
    if (inv && invDate && inv.ship_to_number) {
      scopedInvoice = invoiceNumber;
      scopedInvoiceDate = invDate;
      const { data: matchRows } = await client.from("abc_price_agreement_branch_matches").select("abc_price_agreement_id,confidence_score").eq("ship_to_number", inv.ship_to_number);
      const agIds = Array.from(new Set(((matchRows as any[] | null) ?? []).map((m) => m.abc_price_agreement_id).filter((x) => x != null)));
      const confById = new Map<number, number>();
      for (const m of (matchRows as any[] | null) ?? []) confById.set(m.abc_price_agreement_id, Math.max(confById.get(m.abc_price_agreement_id) ?? -1, num(m.confidence_score)));
      if (agIds.length) {
        const { data: agRows } = await client.from("abc_price_agreements").select("id,agreement_number,effective_date,expiry_date").in("id", agIds);
        const activeAtInvoice = ((agRows as any[] | null) ?? []).filter((a) => d10(a.effective_date) <= invDate && (!a.expiry_date || d10(a.expiry_date) >= invDate));
        activeAtInvoice.sort((a, b) => (confById.get(b.id) ?? 0) - (confById.get(a.id) ?? 0) || d10(b.effective_date).localeCompare(d10(a.effective_date)));
        const chosen = activeAtInvoice[0] ?? null;
        if (chosen) {
          scopedAgreementId = chosen.id;
          scopedAgreementNumber = chosen.agreement_number ?? "";
          scopedAgreementEffective = d10(chosen.effective_date);
          scopedAgreementExpiry = d10(chosen.expiry_date);
        }
      }
    }
  }

  // Scoped path: the chosen agreement's full price list straight from abc_price_list_items.
  if (scopedAgreementId != null) {
    const { data: pliRows } = await client.from("abc_price_list_items")
      .select("item_number,description,unit,unit_price,manufacturer,product_category,agreement_id,category_key")
      .eq("agreement_id", scopedAgreementId).order("description");
    const rows = (pliRows as any[] | null) ?? [];
    if (rows.length === 0) return { ...base, status: "empty", branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber, categories };
    const items: BranchPriceItem[] = rows.map((r) => ({
      itemNumber: r.item_number ?? "",
      description: r.description ?? "",
      uom: r.unit ?? "",
      unitPrice: num(r.unit_price),
      manufacturer: r.manufacturer ?? "",
      category: r.product_category ?? "",
      agreementId: r.agreement_id ?? scopedAgreementId,
      agreementNumber: scopedAgreementNumber,
      effective: scopedAgreementEffective,
      expiry: scopedAgreementExpiry,
      active: true, // active as of the invoice date, by construction
      categoryKey: r.category_key ?? "uncategorized",
    }));
    return {
      status: "live", branchNumber, branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber, inheritedOffice: "",
      items, activeItems: items.length, expiredItems: 0,
      agreements: [{ id: scopedAgreementId, number: scopedAgreementNumber, effective: scopedAgreementEffective, expiry: scopedAgreementExpiry, active: true, itemCount: items.length }],
      categories,
    };
  }

  // Unscoped path: all agreements for the branch (v_branch_price_list).
  const { data } = await client.from("v_branch_price_list").select("*").eq("branch_number", branchNumber).order("description");
  const rows = (data as any[] | null) ?? [];
  if (rows.length === 0) {
    // R3 fallback: no direct list — inherit the PE office's in-force agreements
    // (2-hour window, docs/81 §4; same set the audit engine prices against).
    const refDate = scopedInvoiceDate || new Date().toISOString().slice(0, 10);
    const inherited = await loadOfficeInheritedList(client, branchNumber, refDate);
    if (inherited) {
      // Items come from the source each agreement lives in: abc_price_list_items for
      // ABC (int keys) vs price_agreement_items for generic vendors like SRS (uuids).
      const abcIds = inherited.agreements.filter((a) => a.source === "abc").map((a) => Number(a.key));
      const genericIds = inherited.agreements.filter((a) => a.source === "generic").map((a) => a.key);
      const [abcRes, genericRes] = await Promise.all([
        abcIds.length
          ? client.from("abc_price_list_items")
              .select("item_number,description,unit,unit_price,manufacturer,product_category,agreement_id,category_key")
              .in("agreement_id", abcIds).order("description")
          : Promise.resolve({ data: [] }),
        genericIds.length
          ? client.from("price_agreement_items")
              .select("raw_item_number,raw_description,price_uom,negotiated_price,agreement_id")
              .in("agreement_id", genericIds).order("raw_description")
          : Promise.resolve({ data: [] }),
      ]);
      const agByKey = new Map(inherited.agreements.map((a) => [a.key, a]));
      const items: BranchPriceItem[] = [
        ...(((abcRes.data as any[] | null) ?? [])).map((r) => {
          const ag = agByKey.get(String(r.agreement_id));
          return {
            itemNumber: r.item_number ?? "",
            description: r.description ?? "",
            uom: r.unit ?? "",
            unitPrice: num(r.unit_price),
            manufacturer: r.manufacturer ?? "",
            category: r.product_category ?? "",
            agreementId: r.agreement_id ?? null,
            agreementNumber: ag?.number ?? "",
            effective: ag?.effective ?? "",
            expiry: ag?.expiry ?? "",
            active: true, // in force at refDate by construction (evergreen)
            categoryKey: r.category_key ?? "uncategorized",
          };
        }),
        ...(((genericRes.data as any[] | null) ?? [])).map((r) => {
          const ag = agByKey.get(String(r.agreement_id));
          return {
            itemNumber: r.raw_item_number ?? "",
            description: r.raw_description ?? "",
            uom: r.price_uom ?? "",
            unitPrice: num(r.negotiated_price),
            manufacturer: "",
            category: "",
            agreementId: r.agreement_id ?? null,
            agreementNumber: ag?.number ?? "",
            effective: ag?.effective ?? "",
            expiry: ag?.expiry ?? "",
            active: true,
            categoryKey: "uncategorized",
          };
        }),
      ];
      if (items.length) {
        return {
          status: "live", branchNumber, branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber,
          inheritedOffice: inherited.officeName,
          items, activeItems: items.length, expiredItems: 0,
          agreements: inherited.agreements.map((a) => ({
            id: a.key, number: a.number, effective: a.effective, expiry: a.expiry, active: true,
            itemCount: items.filter((i) => String(i.agreementId) === a.key).length,
          })),
          categories,
        };
      }
    }
    return { ...base, status: "empty", branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber, categories };
  }

  const items: BranchPriceItem[] = rows.map((r) => ({
    itemNumber: r.item_number ?? "",
    description: r.description ?? "",
    uom: r.unit ?? "",
    unitPrice: num(r.unit_price),
    manufacturer: r.manufacturer ?? "",
    category: r.product_category ?? "",
    agreementId: r.agreement_id ?? null,
    agreementNumber: r.agreement_number ?? "",
    effective: d10(r.effective_date),
    expiry: d10(r.expiry_date),
    active: !!r.agreement_active,
    categoryKey: r.category_key ?? "uncategorized",
  }));

  const agMap = new Map<number, { id: number; number: string; effective: string; expiry: string; active: boolean; itemCount: number }>();
  for (const it of items) {
    if (it.agreementId == null) continue;
    const a = agMap.get(it.agreementId) ?? { id: it.agreementId, number: it.agreementNumber, effective: it.effective, expiry: it.expiry, active: it.active, itemCount: 0 };
    a.itemCount++;
    agMap.set(it.agreementId, a);
  }

  return {
    status: "live",
    branchNumber,
    branchName,
    branchAddress,
    scopedInvoice,
    scopedInvoiceDate,
    scopedAgreementNumber,
    inheritedOffice: "",
    items,
    activeItems: items.filter((i) => i.active).length,
    expiredItems: items.filter((i) => !i.active).length,
    agreements: Array.from(agMap.values()).sort((a, b) => b.itemCount - a.itemCount),
    categories,
  };
}
