// Negotiated Item Catalog — live loader. Top-200 purchased items by real spend
// (abc_line_items ledger, 2023-2026) broken out by branch × year with negotiated
// coverage, in the CatalogData shape the catalog client script already consumes.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { CatalogData, CatalogRow } from "@lib/price-list";

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
const VENDOR = "ABC Supply Co.";

export async function loadNegotiatedCatalog(env: RuntimeEnv = getRuntimeEnv()): Promise<CatalogData> {
  const empty: CatalogData = { rows: [], vendors: [], states: [], offices: [], years: [] };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const { data } = await client.from("v_negotiated_catalog").select("*");
  const raw = (data as any[] | null) ?? [];
  if (raw.length === 0) return empty;

  const rows: CatalogRow[] = raw.map((r) => ({
    sku: r.item_number ?? "",
    desc: r.description ?? "",
    vendor: VENDOR,
    branchNo: r.branch_number ?? "",
    branchName: r.branch_name ?? "",
    office: r.office ?? "Unassigned",
    state: r.branch_state ?? "",
    year: num(r.year),
    spend: num(r.spend),
    qty: num(r.qty),
    source: (r.covered ? "Negotiated" : "No Pricing") as CatalogRow["source"],
    covered: !!r.covered,
  }));

  return {
    rows,
    vendors: [VENDOR],
    states: uniq(rows.map((r) => r.state)),
    offices: uniq(rows.map((r) => r.office)),
    years: Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b),
  };
}
