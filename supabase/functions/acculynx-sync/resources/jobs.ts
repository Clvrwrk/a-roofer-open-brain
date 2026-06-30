// acculynx-sync — resources/jobs.ts (Phase 2, plan 02-03)
//
// Date-windowed incremental jobs sync using recordStartIndex pagination.
// Endpoint: GET /jobs?dateFilterType=ModifiedDate&startDate={wm}&endDate={today}&recordStartIndex={N}
//
// Behavioral contracts (asserted by jobs.test.ts):
//   - URL pagination param: recordStartIndex (NOT pageStartIndex — Pitfall 2)
//   - URL includes dateFilterType=ModifiedDate
//   - Stamps account_key AND market on every upserted row (no cross-account bleed, T-02-04)
//   - Sets last_seen_by_api on every upserted row (feeds diff detection)
//   - Budget-stop: stops the page loop when Date.now() >= deadline
//   - apiKey is an explicit parameter — never a module-level constant (Pitfall 3)
//
// Fix (Rule 1 — 2026-06-30): endDate is required by the AccuLynx jobs API; was missing
// causing 400 responses. Now passes today's date as endDate.
// Fix (Rule 1 — 2026-06-30): map camelCase API fields to snake_case DB columns;
// removed ...item spread (PostgREST rejects unknown camelCase columns).
// Fix (Rule 1 — 2026-06-30): onConflict changed from "id,account_key" to "id"
// (table PK is id only; no composite unique constraint exists).

// deno-lint-ignore-file no-explicit-any

const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";
const PACE_MS = 130; // ~8 req/s; keeps us well under the 30 req/s IP limit
const PAGE_SIZE = 25;
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
 * Map a camelCase AccuLynx job API item to snake_case DB columns.
 * Only maps fields that exist in the acculynx_jobs table schema.
 */
function mapJob(item: any, acct: any, now: string): Record<string, unknown> {
  const loc = item.locationAddress ?? {};
  const geo = item.geoLocation ?? {};
  const initAppt = item.initialAppointment ?? {};
  return {
    id: item.id,
    job_name: item.jobName ?? null,
    job_number: item.jobNumber ?? null,
    priority: item.priority ?? null,
    current_milestone: item.currentMilestone ?? null,
    milestone_date: item.milestoneDate ?? null,
    created_date: item.createdDate ?? null,
    modified_date: item.modifiedDate ?? null,
    lead_dead_reason: item.leadDeadReason ?? null,
    job_category_id: item.jobCategory?.id ?? null,
    job_category_name: item.jobCategory?.name ?? null,
    trade_types: item.tradeTypes ?? [],
    location_street1: loc.street1 ?? null,
    location_city: loc.city ?? null,
    location_state: loc.state?.name ?? null,
    location_state_abbrev: loc.state?.abbreviation ?? null,
    location_zip: loc.zipCode ?? null,
    location_country: loc.country?.abbreviation ?? null,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    lead_source_id: item.leadSource?.id ?? null,
    lead_source_name: item.leadSource?.name ?? null,
    initial_appointment_start: initAppt.startDate ?? null,
    initial_appointment_end: initAppt.endDate ?? null,
    initial_appointment_notes: initAppt.notes ?? null,
    raw: item,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
  };
}

/**
 * Sync jobs for a single account via a date-windowed incremental query.
 * Endpoint: GET /jobs?dateFilterType=ModifiedDate&startDate={wm}&endDate={today}&recordStartIndex={N}
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (last_modified_date for startDate param)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncJobs(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const startDate = watermark?.last_modified_date
    ? new Date(watermark.last_modified_date).toISOString().slice(0, 10)
    : "2000-01-01";
  const endDate = new Date().toISOString().slice(0, 10); // required by AccuLynx jobs API
  let offset = 0;
  const now = new Date().toISOString();

  while (Date.now() < deadline) {
    const url =
      `${ACCULYNX_BASE}/jobs?dateFilterType=ModifiedDate` +
      `&startDate=${startDate}&endDate=${endDate}` +
      `&pageSize=${PAGE_SIZE}&recordStartIndex=${offset}` +
      `&sortBy=ModifiedDate&sortOrder=Ascending`;

    if (offset > 0) await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status !== 200) {
      console.warn(`[jobs] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const items: unknown[] = (body as { items?: unknown[] })?.items ?? [];
    if (items.length === 0) break; // no more pages in this date window

    const rows = items.map((item: any) => mapJob(item, acct, now));

    const { error } = await sb
      .from("acculynx_jobs")
      .upsert(rows, { onConflict: "id" });
    if (error) console.warn(`[jobs] upsert: ${error.message}`);

    offset += items.length;
  }
}
