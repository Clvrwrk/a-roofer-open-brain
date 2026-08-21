// Categorization worksurface (docs/103) — bind vendor price-list lines to the
// PE product file so every line carries a real product identity and inherits
// that product's taxonomy.
//
// The queue is product_match_candidate, refreshed by
// refresh_product_match_candidates(). Exact manufacturer-SKU matches that
// resolve to a single product are already applied by that function; what
// reaches this surface is everything a human has to judge.

import { createServerSupabaseClient } from "@lib/supabase.server";

export interface CategorizeCandidate {
  id: string;
  productId: string;
  productName: string;
  majorGroup: string | null;
  category: string | null;
  productType: string | null;
  matchTier: string;
  similarity: number | null;
}

/** One price-line needing a product, with everything proposed for it. */
export interface CategorizeLine {
  sourceTable: string;
  sourceId: string;
  vendorSlug: string;
  itemNumber: string | null;
  description: string;
  evidenceLines: number | null;
  evidenceAmount: number | null;
  candidates: CategorizeCandidate[];
}

export interface CategorizeStats {
  abcTotal: number;
  abcBound: number;
  agreementTotal: number;
  agreementBound: number;
  pendingLines: number;
  pendingCandidates: number;
  unambiguousLines: number;
  evidenceAtStake: number;
}

export interface CategorizeBoard {
  status: "live" | "unconfigured";
  stats: CategorizeStats;
  lines: CategorizeLine[];
  error: string | null;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function empty(error: string): CategorizeBoard {
  return {
    status: "unconfigured",
    stats: { abcTotal: 0, abcBound: 0, agreementTotal: 0, agreementBound: 0,
             pendingLines: 0, pendingCandidates: 0, unambiguousLines: 0, evidenceAtStake: 0 },
    lines: [],
    error,
  };
}

export async function loadCategorizeBoard(limit = 300): Promise<CategorizeBoard> {
  const { client, config } = createServerSupabaseClient();
  if (!client) return empty(`Supabase unconfigured: ${config.missing.join(", ")}`);

  const { data, error } = await client
    .from("v_product_match_review")
    .select("*")
    .eq("review_status", "pending")
    .limit(4000);
  if (error) return empty(error.message);

  // Group candidates under their line. The view is already ordered strongest
  // first, so the first candidate per line is the one to offer.
  const byLine = new Map<string, CategorizeLine>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const key = `${r.source_table}:${r.source_id}`;
    let line = byLine.get(key);
    if (!line) {
      line = {
        sourceTable: String(r.source_table),
        sourceId: String(r.source_id),
        vendorSlug: String(r.vendor_slug ?? ""),
        itemNumber: (r.item_number as string) ?? null,
        description: String(r.line_description ?? ""),
        evidenceLines: r.evidence_lines == null ? null : num(r.evidence_lines),
        evidenceAmount: r.evidence_amount == null ? null : num(r.evidence_amount),
        candidates: [],
      };
      byLine.set(key, line);
    }
    line.candidates.push({
      id: String(r.id),
      productId: String(r.proposed_product_id),
      productName: String(r.product_name ?? ""),
      majorGroup: (r.major_group as string) ?? null,
      category: (r.category as string) ?? null,
      productType: (r.product_type as string) ?? null,
      matchTier: String(r.match_tier ?? ""),
      similarity: r.similarity_score == null ? null : num(r.similarity_score),
    });
  }

  // Work the money first: lines with invoiced dollars behind them, then the
  // ones where there is only one product to choose.
  const lines = [...byLine.values()].sort((a, b) => {
    const amt = (b.evidenceAmount ?? 0) - (a.evidenceAmount ?? 0);
    if (amt !== 0) return amt;
    return a.candidates.length - b.candidates.length;
  });

  const [abcAll, abcBound, paiAll, paiBound] = await Promise.all([
    client.from("abc_price_list_items").select("id", { count: "exact", head: true }),
    client.from("abc_price_list_items").select("id", { count: "exact", head: true }).not("product_id", "is", null),
    client.from("price_agreement_items").select("id", { count: "exact", head: true }),
    client.from("price_agreement_items").select("id", { count: "exact", head: true }).not("product_id", "is", null),
  ]);

  return {
    status: "live",
    stats: {
      abcTotal: abcAll.count ?? 0,
      abcBound: abcBound.count ?? 0,
      agreementTotal: paiAll.count ?? 0,
      agreementBound: paiBound.count ?? 0,
      pendingLines: lines.length,
      pendingCandidates: (data ?? []).length,
      unambiguousLines: lines.filter((l) => l.candidates.length === 1).length,
      evidenceAtStake: Math.round(lines.reduce((s, l) => s + (l.evidenceAmount ?? 0), 0) * 100) / 100,
    },
    lines: lines.slice(0, limit),
    error: null,
  };
}
