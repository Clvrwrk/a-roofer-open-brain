// acculynx-sync — resources/users.ts (2026-07-06 cross-location rep fix)
//
// Per-ACCOUNT users sync. Root cause of "sales rep unknown" for Colorado/Texas/etc:
// jobs and their /representatives are synced per-tenant (each account's own API key),
// but acculynx_users was only ever populated from the single legacy home key
// (legacySyncUsers → Wichita tenant). Every other location is a separate AccuLynx
// tenant with its own users, so a representative's user.id from those tenants had no
// row in acculynx_users — the id→name resolver fell back to writing the raw GUID into
// crm_pipeline.primary_salesperson, which the dashboard renders as unknown.
//
// This module syncs /users with EACH account's own key so all locations' reps
// (e.g. Colorado's Peter Letkeman) land in acculynx_users. Mirrors the pagination /
// upsert conventions of contacts.ts (pageStartIndex = page number; onConflict "id").
// acculynx_users is company-wide (no account_key column) — a user is keyed by its
// AccuLynx id only, so cross-tenant upserts are idempotent on id.

// deno-lint-ignore-file no-explicit-any

const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";
const PACE_MS = 130; // ~8 req/s; well under the 30 req/s IP limit
const MAX_RETRIES = 3;
const PAGE_SIZE = 50;

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

/** Map a camelCase AccuLynx user API item to snake_case acculynx_users columns. */
export function mapUser(u: any, now: string): Record<string, unknown> {
  return {
    id: u.id,
    display_name: u.displayName ?? null,
    first_name: u.firstName ?? null,
    last_name: u.lastName ?? null,
    initials: u.initials ?? null,
    role_id: u.role?.id ?? null,
    role_name: u.role?.name ?? null,
    status: u.status ?? null,
    phone: u.phone ?? null,
    mobile_phone: u.mobilePhone ?? null,
    email: u.email ?? null,
    raw: u,
    synced_at: now,
  };
}

/**
 * Sync users for a single account via a full-sweep pagination loop, using that
 * account's own API key. Endpoint: GET /users?pageSize=50&pageStartIndex={pageNo}.
 *
 * @param sb       - Supabase client (service role)
 * @param acct     - account row (for logging only — users are company-wide, not stamped)
 * @param apiKey   - explicit per-account Bearer key (not module-level — T-02-04)
 * @param deadline - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param fetchFn  - injectable fetch (defaults to global fetch)
 * @returns number of user rows upserted this run
 */
export async function syncUsersForAccount(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const now = new Date().toISOString();
  let pageNo = 0;
  let total = 0;

  while (Date.now() < deadline) {
    const url =
      `${ACCULYNX_BASE}/users?pageSize=${PAGE_SIZE}&pageStartIndex=${pageNo}&status=Active,Inactive,Archived`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status !== 200) {
      console.warn(`[users] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const typed = body as { items?: any[]; count?: number };
    const items: any[] = typed?.items ?? [];
    if (items.length === 0) break;

    const rows = items.map((u) => mapUser(u, now));
    const { error } = await sb.from("acculynx_users").upsert(rows, { onConflict: "id" });
    if (error) console.warn(`[users] upsert for ${acct.account_key}: ${error.message}`);

    total += rows.length;
    pageNo += 1;
    if (items.length < PAGE_SIZE) break; // last (partial) page — sweep complete
  }

  return total;
}
