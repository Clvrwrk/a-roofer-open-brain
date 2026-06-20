// Accounting → Price Agreement Review: confirm/correct the item-id matches for family-level
// price-list PDFs (Denver/Dallas, no item codes) before promoting them to live agreements.
// Reads price_list_pdf_staging (parsed + trigram-matched, migration 139).

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface ReviewRow {
  id: string;
  rawDescription: string;
  price: number;
  uom: string;
  matchedItemNumber: string;
  matchedDescription: string;
  matchedFamily: string;
  matchScore: number;
  matchStatus: string; // high | review | none | confirmed | rejected | promoted
}
export interface ReviewDoc {
  sourceDoc: string;
  office: string;
  branchNumber: string;
  effectiveDate: string;
  rows: ReviewRow[];
  counts: { total: number; high: number; review: number; none: number; confirmed: number; promoted: number };
}
export interface PriceListReview {
  status: "live" | "unconfigured";
  generatedAt: string;
  docs: ReviewDoc[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function loadPriceListReview(env: RuntimeEnv = getRuntimeEnv()): Promise<PriceListReview> {
  const { client } = createServerSupabaseClient(env);
  if (!client) return { status: "unconfigured", generatedAt: new Date().toISOString(), docs: [] };

  const { data } = await client
    .from("price_list_pdf_staging")
    .select("id,source_doc,office,branch_number,effective_date,raw_description,price,uom,matched_item_number,matched_description,matched_family,match_score,match_status")
    .order("source_doc")
    .order("match_score", { ascending: false });
  const rows = (data as any[] | null) ?? [];

  const byDoc = new Map<string, ReviewDoc>();
  for (const r of rows) {
    let d = byDoc.get(r.source_doc);
    if (!d) {
      d = { sourceDoc: r.source_doc, office: r.office ?? "", branchNumber: r.branch_number ?? "", effectiveDate: r.effective_date ? String(r.effective_date).slice(0, 10) : "",
        rows: [], counts: { total: 0, high: 0, review: 0, none: 0, confirmed: 0, promoted: 0 } };
      byDoc.set(r.source_doc, d);
    }
    d.rows.push({
      id: r.id, rawDescription: r.raw_description ?? "", price: num(r.price), uom: r.uom ?? "",
      matchedItemNumber: r.matched_item_number ?? "", matchedDescription: r.matched_description ?? "",
      matchedFamily: r.matched_family ?? "", matchScore: num(r.match_score), matchStatus: r.match_status ?? "pending",
    });
    d.counts.total++;
    const s = r.match_status as string;
    if (s in d.counts) (d.counts as any)[s]++;
  }
  // order rows so the ones needing attention (review/none) float up within a doc
  const rank = (s: string) => (s === "none" ? 0 : s === "review" ? 1 : s === "high" ? 2 : s === "confirmed" ? 3 : 4);
  for (const d of byDoc.values()) d.rows.sort((a, b) => rank(a.matchStatus) - rank(b.matchStatus) || b.matchScore - a.matchScore);

  return { status: "live", generatedAt: new Date().toISOString(), docs: [...byDoc.values()] };
}
