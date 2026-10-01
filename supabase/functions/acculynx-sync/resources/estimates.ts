// acculynx-sync — resources/estimates.ts (Phase 2, plan 02-03)
//
// Full-sweep estimates sync using pageStartIndex pagination.
// Endpoint: GET /estimates?pageSize=50&pageStartIndex={N}
//
// The list endpoint returns stubs: {id, isPrimary, job: {id, _link}, _link}.
// The list pass upserts ONLY the stub columns (id, job_id, is_primary, raw) plus bookkeeping; the detail columns
// (title, estimate number, dates, financial totals, notes) come from GET /estimates/{id} in enrichEstimateDetails()
// and are written by UPDATE, so the hourly sweep can never null them again (migration 319, 2026-10-01: title and
// total_price were NULL on all 445 rows because the detail call was never built and the sweep wrote nulls).
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

/** The list pass's row: the stub fields only, never a detail column (an upsert would null it). */
export function mapEstimateStub(item: any, acct: any, now: string): Record<string, unknown> {
  return {
    id: item.id,
    job_id: item.job?.id ?? null,
    is_primary: item.isPrimary ?? null,
    raw: item,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
  };
}

/** The detail pass's update: every detail column from GET /estimates/{id}, plus the full detail payload. */
export function mapEstimateDetail(item: any, now: string): Record<string, unknown> {
  return {
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
    raw_detail: item,
    detail_synced_at: now,
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
  // pageStartIndex is a PAGE NUMBER (0-based), not a record offset — see contacts.ts and
  // docs/knowledge-base/acculynx/api/read-capability.md. Advance one page at a time and
  // stop on the last (short/empty) page; advancing by items.length skips past the end.
  const PAGE_SIZE = 50;
  let pageNo: number = watermark?.last_page_index ?? 0;
  const now = new Date().toISOString();
  let lastApiCount: number | null = null;

  while (Date.now() < deadline) {
    const url = `${ACCULYNX_BASE}/estimates?pageSize=${PAGE_SIZE}&pageStartIndex=${pageNo}`;
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

    if (items.length === 0) break; // empty page — sweep complete

    const rows = items.map((item: any) => mapEstimateStub(item, acct, now));

    const { error } = await sb
      .from("acculynx_estimates")
      .upsert(rows, { onConflict: "id" });
    if (error) console.warn(`[estimates] upsert: ${error.message}`);

    pageNo += 1;                          // advance ONE page (page-number semantics)
    if (items.length < PAGE_SIZE) break;  // last (partial) page — sweep complete
  }

  return lastApiCount;
}

const DETAIL_REFRESH_MS = 24 * 3600 * 1000; // re-read each estimate's detail at most daily
const DETAIL_BATCH = 200;                   // per account per run; ~25 s at the pace above

/**
 * Detail pass: GET /estimates/{id} for this account's estimates that were never detailed or whose detail is older
 * than a day, oldest first, until the batch or the run budget is spent. Writes by UPDATE on id + account_key, so no
 * stub column and no other account's row is touched. A 404 stamps detail_synced_at so a deleted estimate is not
 * re-fetched every hour (the list sweep's markNotSeen archives it). Returns how many rows were updated.
 */
export async function enrichEstimateDetails(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - DETAIL_REFRESH_MS).toISOString();
  const { data, error } = await sb
    .from("acculynx_estimates")
    .select("id")
    .eq("account_key", acct.account_key)
    .is("archived_at", null)
    .or(`detail_synced_at.is.null,detail_synced_at.lt.${stale}`)
    .order("detail_synced_at", { ascending: true, nullsFirst: true })
    .limit(DETAIL_BATCH);
  if (error) {
    console.warn(`[estimates] detail candidates: ${error.message}`);
    return 0;
  }
  let updated = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    if (Date.now() >= deadline) break;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(`${ACCULYNX_BASE}/estimates/${encodeURIComponent(row.id)}`, apiKey, fetchFn);
    let patch: Record<string, unknown>;
    if (status === 200 && body && typeof body === "object") patch = mapEstimateDetail(body, now);
    else if (status === 404) patch = { detail_synced_at: now };
    else {
      console.warn(`[estimates] detail ${status} for ${acct.account_key}`);
      continue;
    }
    const { error: e } = await sb.from("acculynx_estimates").update(patch).eq("id", row.id).eq("account_key", acct.account_key);
    if (e) console.warn(`[estimates] detail update: ${e.message}`);
    else if (status === 200) updated++;
  }
  return updated;
}
