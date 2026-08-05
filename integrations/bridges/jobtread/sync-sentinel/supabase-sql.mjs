/**
 * Throttled Supabase Management-API SQL helper shared by sentinel.mjs and
 * executor.mjs. The endpoint throttles aggressively (429 ThrottlerException),
 * so: minimum interval between calls + exponential backoff on 429/5xx.
 */

export const SUPABASE_PROJECT =
  process.env.JT_SENTINEL_SUPABASE_PROJECT || "rnhmvcpsvtqjlffpsayu";

const MIN_INTERVAL_MS = 1200;
let lastCallAt = 0;

export async function sql(query, { attempts = 6 } = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Missing SUPABASE_ACCESS_TOKEN");
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    let res;
    let text;
    try {
      res = await fetch(
        `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        }
      );
      text = await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        return [];
      }
    }
    lastErr = new Error(`Supabase SQL HTTP ${res.status}: ${text.slice(0, 500)}`);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
      continue;
    }
    break; // non-retryable 4xx
  }
  throw lastErr;
}

export const sqlLit = (s) =>
  s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
export const jsonLit = (obj) => sqlLit(JSON.stringify(obj));
