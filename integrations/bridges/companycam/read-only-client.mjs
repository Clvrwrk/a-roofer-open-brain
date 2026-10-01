// CompanyCam Public API v1 — read-only client (docs/120).
//
// GET only, by construction: there is no method here that can create, update or delete
// anything in CompanyCam. The brain mirrors CompanyCam; it never writes back (same posture as
// the QuickBooks read-only client, hard rule 13's spirit).
//
// Auth: a Personal Access Token in COMPANYCAM_ACCESS_TOKEN (1Password: CW_Master /
// CompanyCam-PE-PWA-CRM, field `credential`). Rate limit: 240 GET/min per token; we pace at
// 200/min and honour Retry-After on 429.

const BASE = "https://app.companycam.com/public_api/v1";
const MIN_INTERVAL_MS = 300; // 200 GET/min, under the 240/min ceiling

export function createCompanyCamClient({ token, fetchImpl = fetch, log = () => {} } = {}) {
  if (!token) throw new Error("COMPANYCAM_ACCESS_TOKEN is not set");
  let last = 0;
  let calls = 0;

  async function pace() {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  }

  async function get(path, params = {}) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, x));
      else url.searchParams.set(k, String(v));
    }
    for (let attempt = 1; attempt <= 6; attempt++) {
      await pace();
      calls++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      } catch (err) {
        if (attempt === 6) throw err; // no sleep after the final attempt
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 6) {
        const retry = Number(res.headers.get("retry-after")) || 5 * attempt;
        log(`companycam ${res.status} on ${url.pathname}; retrying in ${retry}s`);
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = body?.errors?.[0]?.code || body?.errors?.[0]?.message || res.statusText;
        const err = new Error(`CompanyCam GET ${url.pathname} → ${res.status} ${code}`);
        err.status = res.status;
        throw err;
      }
      return body;
    }
    throw new Error(`CompanyCam GET ${url.pathname} failed after retries`);
  }

  // Cursor pagination: yields pages of `data` until has_next is false or the caller stops.
  async function* paginate(path, params = {}) {
    let after;
    for (;;) {
      const body = await get(path, { ...params, after });
      yield body.data || [];
      if (!body.meta?.has_next || !body.meta?.next_cursor) return;
      after = body.meta.next_cursor;
    }
  }

  return { get, paginate, get calls() { return calls; } };
}
