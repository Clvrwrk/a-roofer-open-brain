// acculynx-sync — resources/estimates.ts (Phase 2, plan 02-03)
//
// Full-sweep estimates sync using pageStartIndex pagination.
// Endpoint: GET /estimates?pageSize=50&pageStartIndex={N}
//
// The list endpoint returns stubs: {id, isPrimary, job: {id, _link}, _link}.
// We upsert the stub fields (id, job_id, is_primary) from the list pass.
// Financial detail (title, profit_margin_rate, etc.) is a Phase 3 enrichment
// via a per-estimate GET /estimates/{id} detail call.
//
// Behavioral contracts:
//   - URL pagination param: pageStartIndex
//   - Stamps account_key AND market on every upserted row (no cross-account bleed, T-02-04)
//   - Sets last_seen_by_api on every upserted row (feeds diff detection)
//   - Budget-stop: stops the page loop when Date.now() >= deadline
//   - apiKey is an explicit parameter — never a module-level constant (Pitfall 3)
//
// Fix (Rule 1 — 2026-06-30): map camelCase API fields to snake_case DB columns;
// removed ...item spread (PostgREST rejects unknown camelCase columns).
// Fix (Rule 1 — 2026-06-30): job_id now uses item.job?.id (list endpoint nests job as object,
// not item.jobId which was the original incorrect reference).
// Fix (Rule 1 — 2026-06-30): onConflict changed from "id,account_key" to "id"
// (table PK is id only; no composite unique constraint exists).

// deno-lint-ignore-file no-explicit-any

const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";
const PACE_MS = 130; // ~8 req/s; keeps us well under the 30 req/s IP limit
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a URL with 429 retry + exponential backoff.
 * apiKey is an explicit parameter to prevent cross-account key bleed (T-02-04).
 */
async function acculynxGet(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
    } catch (e) {
      return { status: 0, body: { fetchError: String(e) } };
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
      attempt++;
      continue;
    }
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, body };
  }
}

/**
 * Map a camelCase AccuLynx estimate API item to snake_case DB columns.
 * List endpoint returns stubs; financial detail fields are null here (Phase 3 enrichment).
 */
function mapEstimate(item: any, acct: any, now: string): Record<string, unknown> {
  return {
    id: item.id,
    job_id: item.job?.id ?? null,
    title: item.title ?? null,
    description: item.description ?? null,
    estimate_number: item.estimateNumber ?? null,
    is_primary: item.isPrimary ?? null,
    created_by_user_id: item.createdBy?.id ?? null,
    created_date: item.createdDate ?? null,
    modified_by_user_id: item.modifiedBy?.id ?? null,
    modified_date: item.modifiedDate ?? null,
    profit_margin_rate: item.profitMarginRate ?? item.financials?.profitMarginRate ?? null,
    profit_margin_total: item.profitMarginTotal ?? item.financials?.profitMarginTotal ?? null,
    tax_rate: item.taxRate ?? item.financials?.taxRate ?? null,
    tax_total: item.taxTotal ?? item.financials?.taxTotal ?? null,
    overhead_rate: item.overheadRate ?? item.financials?.overheadRate ?? null,
    overhead_total: item.overheadTotal ?? item.financials?.overheadTotal ?? null,
    profit_rate: item.profitRate ?? item.financials?.profitRate ?? null,
    profit_total: item.profitTotal ?? item.financials?.profitTotal ?? null,
    total_cost: item.totalCost ?? item.financials?.totalCost ?? null,
    total_price: item.totalPrice ?? item.financials?.totalPrice ?? null,
    notes: item.notes ?? null,
    raw: item,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
  };
}

/**
 * Sync estimates for a single account via a full-sweep pagination loop.
 * Endpoint: GET /estimates?pageSize=50&pageStartIndex={N}
 *
 * Returns the API-reported total count (from the `count` field on the last page
 * that returned items), or null if no pages were fetched. The caller passes this
 * to advanceWatermark as last_api_count so v_acculynx_reconciliation can compute
 * delta_pct without making a live API call.
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (null = first run)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 * @returns          - API-reported total count (for last_api_count watermark field), or null
 */
export async function syncEstimates(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  let pageIndex: number = watermark?.last_page_index ?? 0;
  const now = new Date().toISOString();
  let lastApiCount: number | null = null;

  while (Date.now() < deadline) {
    const url = `${ACCULYNX_BASE}/estimates?pageSize=50&pageStartIndex=${pageIndex}`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status !== 200) {
      console.warn(`[estimates] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const typedBody = body as { items?: unknown[]; count?: number };
    const items: unknown[] = typedBody?.items ?? [];

    // Capture the API-reported total count (present on every page response).
    if (typeof typedBody?.count === "number") {
      lastApiCount = typedBody.count;
    }

    if (items.length === 0) break; // sweep complete

    const rows = items.map((item: any) => mapEstimate(item, acct, now));

    const { error } = await sb
      .from("acculynx_estimates")
      .upsert(rows, { onConflict: "id" });
    if (error) console.warn(`[estimates] upsert: ${error.message}`);

    pageIndex += items.length;
  }

  return lastApiCount;
}
