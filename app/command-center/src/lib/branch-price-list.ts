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
}

export interface BranchPriceList {
  status: "live" | "empty" | "unconfigured";
  branchNumber: string;
  items: BranchPriceItem[];
  activeItems: number;
  expiredItems: number;
  agreements: { id: number; number: string; effective: string; expiry: string; active: boolean; itemCount: number }[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

export async function loadBranchPriceList(branchNumber: string, env: RuntimeEnv = getRuntimeEnv()): Promise<BranchPriceList> {
  const base: BranchPriceList = { status: "unconfigured", branchNumber, items: [], activeItems: 0, expiredItems: 0, agreements: [] };
  const { client } = createServerSupabaseClient(env);
  if (!client || !branchNumber) return base;

  const { data } = await client.from("v_branch_price_list").select("*").eq("branch_number", branchNumber).order("description");
  const rows = (data as any[] | null) ?? [];
  if (rows.length === 0) return { ...base, status: "empty" };

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
    items,
    activeItems: items.filter((i) => i.active).length,
    expiredItems: items.filter((i) => !i.active).length,
    agreements: Array.from(agMap.values()).sort((a, b) => b.itemCount - a.itemCount),
  };
}
