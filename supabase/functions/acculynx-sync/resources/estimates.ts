// acculynx-sync — resources/estimates.ts (Phase 2, plan 02-03)
//
// Full-sweep estimates sync using pageStartIndex pagination.
// Endpoint: GET /estimates?pageSize=50&pageStartIndex={N}
//
// Identical full-sweep shape to contacts.ts; differences:
//   - Endpoint: /estimates
//   - Target table: acculynx_estimates
//   - Stamps job_id from the estimate's jobId field
//
// Behavioral contracts:
//   - URL pagination param: pageStartIndex
//   - Stamps account_key AND market on every upserted row (no cross-account bleed, T-02-04)
//   - Sets last_seen_by_api and job_id on every upserted row
//   - Budget-stop: stops the page loop when Date.now() >= deadline
//   - apiKey is an explicit parameter — never a module-level constant (Pitfall 3)

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
 * Sync estimates for a single account via a full-sweep pagination loop.
 * Endpoint: GET /estimates?pageSize=50&pageStartIndex={N}
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (null = first run)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncEstimates(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  let pageIndex: number = watermark?.last_page_index ?? 0;
  const now = new Date().toISOString();

  while (Date.now() < deadline) {
    const url = `${ACCULYNX_BASE}/estimates?pageSize=50&pageStartIndex=${pageIndex}`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status !== 200) {
      console.warn(`[estimates] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const items: unknown[] = (body as { items?: unknown[] })?.items ?? [];
    if (items.length === 0) break; // sweep complete

    const rows = items.map((item: any) => ({
      ...item,
      account_key: acct.account_key,
      market: acct.market,
      job_id: item.jobId ?? null,
      last_seen_by_api: now,
      synced_at: now,
      raw: item,
    }));

    const { error } = await sb
      .from("acculynx_estimates")
      .upsert(rows, { onConflict: "id,account_key" });
    if (error) console.warn(`[estimates] upsert: ${error.message}`);

    pageIndex += items.length;
  }
}
