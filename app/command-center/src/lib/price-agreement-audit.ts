// Price Agreement Audit — the agreement lifecycle audit. Every negotiated price
// agreement with its status (active / expiring ≤30d / expired / empty shell),
// coverage, and renewal urgency, over v_price_agreement_audit (live).
//
// Distinct from Invoice Audit (line variance): this audits the AGREEMENTS
// themselves. Surfaces the core issue — the item-bearing agreements are expired.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type PaLifecycle = "active" | "expiring" | "expired" | "no_expiry";

export interface PaAgreement {
  agreementId: number;
  agreementNumber: string;
  versionLabel: string;
  scope: string;
  lifecycle: PaLifecycle;
  staleness: string;
  effective: string;
  expiry: string;
  daysToExpiry: number | null;
  itemCount: number;
  branchCount: number;
  ceoVerified: boolean;
  salesRep: string;
  needsAction: boolean;
}

export interface PriceAgreementAudit {
  status: "live" | "unconfigured";
  generatedAt: string;
  agreements: PaAgreement[];
  totals: { needsAction: number; expired: number; expiring: number; active: number; empty: number; pricedItems: number };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

export async function loadPriceAgreementAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<PriceAgreementAudit> {
  const empty: PriceAgreementAudit = { status: "unconfigured", generatedAt: new Date().toISOString(), agreements: [], totals: { needsAction: 0, expired: 0, expiring: 0, active: 0, empty: 0, pricedItems: 0 } };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const { data } = await client.from("v_price_agreement_audit").select("*");
  const rows = (data as any[] | null) ?? [];
  if (rows.length === 0) return empty;

  const agreements: PaAgreement[] = rows.map((r) => {
    const itemCount = num(r.item_count);
    const lifecycle = (r.lifecycle ?? "no_expiry") as PaLifecycle;
    const needsAction = itemCount > 0 && (lifecycle === "expired" || lifecycle === "expiring");
    return {
      agreementId: num(r.agreement_id),
      agreementNumber: r.agreement_number || `#${r.agreement_id}`,
      versionLabel: r.version_label || "",
      scope: r.branch_number ? `Branch ${r.branch_number}` : r.region_code ? `Region ${r.region_code}` : r.abc_account_number ? `Acct ${r.abc_account_number}` : "—",
      lifecycle,
      staleness: r.staleness_status || "",
      effective: d10(r.effective_date),
      expiry: d10(r.expiry_date),
      daysToExpiry: r.days_to_expiry == null ? null : num(r.days_to_expiry),
      itemCount,
      branchCount: num(r.branch_count),
      ceoVerified: !!r.ceo_verified,
      salesRep: r.sales_rep || "",
      needsAction,
    };
  });

  // Sort: urgent (item-bearing expired) first, then expiring, then by items.
  const rank = (a: PaAgreement) => (a.needsAction && a.lifecycle === "expired" ? 0 : a.needsAction ? 1 : a.itemCount > 0 ? 2 : 3);
  agreements.sort((a, b) => rank(a) - rank(b) || b.itemCount - a.itemCount || (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));

  const itemBearing = agreements.filter((a) => a.itemCount > 0);
  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    agreements,
    totals: {
      needsAction: agreements.filter((a) => a.needsAction).length,
      expired: itemBearing.filter((a) => a.lifecycle === "expired").length,
      expiring: itemBearing.filter((a) => a.lifecycle === "expiring").length,
      active: itemBearing.filter((a) => a.lifecycle === "active" || a.lifecycle === "no_expiry").length,
      empty: agreements.filter((a) => a.itemCount === 0).length,
      pricedItems: agreements.reduce((s, a) => s + a.itemCount, 0),
    },
  };
}
