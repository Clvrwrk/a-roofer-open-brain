// acculynx-sync — resources/contacts.ts (Phase 2, plan 02-03)
//
// Full-sweep contacts sync using pageStartIndex pagination.
// Endpoint: GET /contacts?pageSize=50&pageStartIndex={N}
//
// Behavioral contracts (asserted by contacts.test.ts):
//   - URL pagination param: pageStartIndex (NOT recordStartIndex — Pitfall 2)
//   - Stamps account_key AND market on every upserted row (no cross-account bleed, T-02-04)
//   - Sets last_seen_by_api on every upserted row (feeds diff detection)
//   - Budget-stop: stops the page loop when Date.now() >= deadline
//   - apiKey is an explicit parameter — never a module-level constant (Pitfall 3)
//
// Fix (Rule 1 — 2026-06-30): map camelCase API fields to snake_case DB columns;
// removed ...item spread (PostgREST rejects unknown camelCase columns).
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
 * Map a camelCase AccuLynx contact API item to snake_case DB columns.
 * Only maps fields that exist in the acculynx_contacts table schema.
 */
function mapContact(item: any, acct: any, now: string): Record<string, unknown> {
  const mailing = item.mailingAddress ?? {};
  const billing = item.billingAddress ?? {};
  return {
    id: item.id,
    first_name: item.firstName ?? null,
    last_name: item.lastName ?? null,
    salutation: item.salutation ?? null,
    cross_reference: item.crossReference ?? null,
    company_name: item.companyName ?? null,
    mailing_street1: mailing.street1 ?? null,
    mailing_street2: mailing.street2 ?? null,
    mailing_city: mailing.city ?? null,
    mailing_state: mailing.state?.abbreviation ?? mailing.state ?? null,
    mailing_zip: mailing.zipCode ?? null,
    mailing_country: mailing.country?.abbreviation ?? mailing.country ?? null,
    billing_street1: billing.street1 ?? null,
    billing_street2: billing.street2 ?? null,
    billing_city: billing.city ?? null,
    billing_state: billing.state?.abbreviation ?? billing.state ?? null,
    billing_zip: billing.zipCode ?? null,
    billing_country: billing.country?.abbreviation ?? billing.country ?? null,
    raw: item,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
  };
}

/**
 * Sync contacts for a single account via a full-sweep pagination loop.
 * Endpoint: GET /contacts?pageSize=50&pageStartIndex={N}
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
export async function syncContacts(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  // pageStartIndex is a PAGE NUMBER (0-based), NOT a record offset — the AccuLynx
  // pagination quirk (jobs use recordStartIndex = record offset; contacts/estimates use
  // pageStartIndex = page number; docs/knowledge-base/acculynx/api/read-capability.md).
  // Advance ONE page at a time and stop on the last (short/empty) page. The prior code
  // advanced by items.length (50), jumping to page 50 after page 0 — landing past the end
  // and only re-fetching the tail (observed 2026-07-01: wichita contacts stuck at 64 of
  // 1314 = one full page + the 14-row tail page).
  const PAGE_SIZE = 50;
  let pageNo: number = watermark?.last_page_index ?? 0;
  const now = new Date().toISOString();
  let lastApiCount: number | null = null;

  while (Date.now() < deadline) {
    const url = `${ACCULYNX_BASE}/contacts?pageSize=${PAGE_SIZE}&pageStartIndex=${pageNo}`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status !== 200) {
      console.warn(`[contacts] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const typedBody = body as { items?: unknown[]; count?: number };
    const items: unknown[] = typedBody?.items ?? [];

    // Capture the API-reported total count (present on every page response).
    if (typeof typedBody?.count === "number") {
      lastApiCount = typedBody.count;
    }

    if (items.length === 0) break; // empty page — sweep complete

    const rows = items.map((item: any) => mapContact(item, acct, now));

    const { error } = await sb
      .from("acculynx_contacts")
      .upsert(rows, { onConflict: "id" });
    if (error) console.warn(`[contacts] upsert: ${error.message}`);

    pageNo += 1;                          // advance ONE page (page-number semantics)
    if (items.length < PAGE_SIZE) break;  // last (partial) page — sweep complete
  }

  return lastApiCount;
}
