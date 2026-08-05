/**
 * Minimal JobTread Pave API client for the Sync Sentinel (docs/80).
 *
 * - Grant key comes from JT_SUPABASE_MIRROR_GRANT_KEY (canonical) or
 *   JOBTREAD_GRANT_KEY (mapping-contract alias). Never logged.
 * - Reads only. The sentinel never mutates JobTread; mutations belong to
 *   executor.mjs playing approved jt_mirror.pending_write rows.
 * - Rate limit ≤4 req/s (B3 executor invariant), retries on 429/5xx.
 */

const PAVE_URL = "https://api.jobtread.com/pave";
export const JT_ORG_ID = process.env.JT_ORG_ID || "22PazeRM5FCH";

const MIN_INTERVAL_MS = 250;
let lastRequestAt = 0;

function grantKey() {
  const key =
    process.env.JT_SUPABASE_MIRROR_GRANT_KEY || process.env.JOBTREAD_GRANT_KEY;
  if (!key) {
    throw new Error(
      "Missing JT_SUPABASE_MIRROR_GRANT_KEY (source ~/.config/cleverwork/master.env)"
    );
  }
  return key;
}

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** POST one Pave query. `query` is the object placed under {"query": ...};
 *  the grant key is injected into query.$ automatically. */
export async function paveQuery(query, { attempts = 4 } = {}) {
  const body = JSON.stringify({
    query: { ...query, $: { ...(query.$ || {}), grantKey: grantKey() } },
  });
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    await throttle();
    try {
      const res = await fetch(PAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      // Never include the request body (carries the grant key) in errors.
      lastErr = new Error(`Pave HTTP ${res.status}: ${text.slice(0, 500)}`);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw lastErr;
}

/**
 * Page through an organization-level connection.
 *
 * @param {string} connection  e.g. "jobs", "accounts", "dailyLogs"
 * @param {object} nodeSelection  Pave selection for each node
 * @param {object} [opts] size (default 100), sortBy, onPage(nodes) callback
 * @returns {Promise<object[]>} all nodes (unless onPage consumes them)
 */
export async function pavePagedOrgConnection(connection, nodeSelection, opts = {}) {
  const size = opts.size || 100;
  const all = [];
  let page = null;
  let pages = 0;
  do {
    const input = { size, ...(opts.sortBy ? { sortBy: opts.sortBy } : {}) };
    if (page) input.page = page;
    const result = await paveQuery({
      organization: {
        $: { id: JT_ORG_ID },
        id: {},
        [connection]: {
          $: input,
          nextPage: {},
          nodes: nodeSelection,
        },
      },
    });
    const conn = result?.organization?.[connection] || {};
    const nodes = conn.nodes || [];
    if (opts.onPage) await opts.onPage(nodes);
    else all.push(...nodes);
    page = conn.nextPage || null;
    pages += 1;
    if (pages > (opts.maxPages || 500)) {
      throw new Error(`Pagination runaway on ${connection} (> ${opts.maxPages || 500} pages)`);
    }
  } while (page);
  return all;
}

/** List the org's registered webhooks (43 possible eventTypes). */
export async function listWebhooks() {
  const result = await paveQuery({
    organization: {
      $: { id: JT_ORG_ID },
      id: {},
      webhooks: {
        $: { size: 50 },
        nodes: { id: {}, url: {}, eventTypes: {}, createdAt: {}, error: {} },
      },
    },
  });
  return result?.organization?.webhooks?.nodes || [];
}

/** List native JT Workflow automations (read-only visibility). */
export async function listWorkflows() {
  const result = await paveQuery({
    organization: {
      $: { id: JT_ORG_ID },
      id: {},
      workflows: {
        $: { size: 100 },
        nodes: { id: {}, name: {}, createdAt: {} },
      },
    },
  });
  return result?.organization?.workflows?.nodes || [];
}
