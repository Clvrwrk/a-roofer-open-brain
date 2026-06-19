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
  agreementId: number | null;
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
  items: BranchPriceItem[];
  activeItems: number;
  expiredItems: number;
  agreements: { id: number; number: string; effective: string; expiry: string; active: boolean; itemCount: number }[];
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

export async function loadBranchPriceList(branchNumber: string, invoiceNumber = "", env: RuntimeEnv = getRuntimeEnv()): Promise<BranchPriceList> {
  const base: BranchPriceList = { status: "unconfigured", branchNumber, branchName: "", branchAddress: "", scopedInvoice: "", scopedInvoiceDate: "", scopedAgreementNumber: "", items: [], activeItems: 0, expiredItems: 0, agreements: [], categories: [] };
  const { client } = createServerSupabaseClient(env);
  if (!client || !branchNumber) return base;

  const { data: catData } = await client.from("roof_system_category").select("key,label,sort_order").order("sort_order");
  const categories = ((catData as any[] | null) ?? []).map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));

  // Branch name + address (lives in abc_vendor_branches, not vendor_branches).
  const { data: brRows } = await client.from("abc_vendor_branches").select("branch_name,address_json,city,state,postal").eq("branch_number", branchNumber).limit(1);
  const br = (brRows as any[] | null)?.[0] ?? null;
  const branchName = br?.branch_name ?? "";
  const branchAddress = formatBranchAddress(br);

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
      status: "live", branchNumber, branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber,
      items, activeItems: items.length, expiredItems: 0,
      agreements: [{ id: scopedAgreementId, number: scopedAgreementNumber, effective: scopedAgreementEffective, expiry: scopedAgreementExpiry, active: true, itemCount: items.length }],
      categories,
    };
  }

  // Unscoped path: all agreements for the branch (v_branch_price_list).
  const { data } = await client.from("v_branch_price_list").select("*").eq("branch_number", branchNumber).order("description");
  const rows = (data as any[] | null) ?? [];
  if (rows.length === 0) return { ...base, status: "empty", branchName, branchAddress, scopedInvoice, scopedInvoiceDate, scopedAgreementNumber, categories };

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
    items,
    activeItems: items.filter((i) => i.active).length,
    expiredItems: items.filter((i) => !i.active).length,
    agreements: Array.from(agMap.values()).sort((a, b) => b.itemCount - a.itemCount),
    categories,
  };
}
