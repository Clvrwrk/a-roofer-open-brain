// acculynx-read-sweep — Edge Function entrypoint (Phase 1, plan 01-02 Task 2)
//
// SANDBOX-ONLY spec-driven sweep of the 86 documented AccuLynx GET operations. Reads the
// checklist from acculynx_get_checklist, resolves ONLY the sandbox key behind a code-level
// hard gate, chains IDs via a HATEOAS list->detail walk, paces <=8 req/s, redacts homeowner
// PII, and records one acculynx_api_probe row per op (tagged source_account_key='sandbox')
// plus an upsert into acculynx_api_catalog. Every checklist op gets a row under some verdict
// so the 01-03 reconciliation (EXCEPT) returns zero.
//
// NO secret value in source — only the sandbox secret NAME constant (see sweep.ts).
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertSandbox,
  paginationParam,
  redactSample,
  SANDBOX_SECRET_NAME,
} from "./sweep.ts";

const ACCULYNX_KEY = Deno.env.get(SANDBOX_SECRET_NAME);
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE_ACCOUNT = "sandbox";
const PACE_MS = 130;            // ~8 req/s on the single sandbox key
const RUNTIME_BUDGET_MS = 110_000;
const MAX_RETRIES = 3;

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ChecklistRow {
  operation_id: string;
  path: string;
  base_url: string;
  tier: "A" | "B" | "C";
  path_params: string[];
  pagination_param: string | null;
  includes_supported: boolean;
  probeability: "probeable" | "tier_gated" | "unprobeable_no_seed";
}

// Which seed-param each operation's response items feed (HATEOAS id harvesting).
const HARVEST: Record<string, { from: "items" | "body"; into: string }[]> = {
  getJobs: [{ from: "items", into: "jobId" }],
  getContacts: [{ from: "items", into: "contactId" }],
  getEstimates: [{ from: "items", into: "estimateId" }],
  getFinancialsSupplementsForCompany: [{ from: "items", into: "supplementId" }],
  getCalendars: [{ from: "items", into: "calendarId" }],
  getUsers: [{ from: "items", into: "userId" }],
  getActiveLeadSources: [{ from: "items", into: "leadSourceId" }],
  getActiveAccountTypes: [{ from: "items", into: "accountTypeId" }],
  getAccuLynxCountries: [{ from: "items", into: "countryId" }],
  getAccuLynxStates: [{ from: "items", into: "stateId" }],
  getMilestones: [{ from: "items", into: "milestone" }],
  getFinancialsForJob: [{ from: "body", into: "financialsId" }],
  getInvoicesForJob: [{ from: "items", into: "invoiceId" }],
  getJobContacts: [{ from: "items", into: "jobContactId" }],
  getEstimateSections: [{ from: "items", into: "estimateSectionId" }],
  getEstimateSectionItems: [{ from: "items", into: "estimateItemId" }],
  getContactCustomFields: [{ from: "items", into: "customFieldId" }],
  getContactEmailAddresses: [{ from: "items", into: "emailId" }],
  getContactPhoneNumber: [{ from: "items", into: "phoneId" }],
  getCurrentJobMilestone: [{ from: "body", into: "milestoneId" }],
  getStatusesForMilestone: [{ from: "items", into: "statusId" }],
  getWorksheetAmendmentsById: [{ from: "items", into: "financialsAmendmentId" }],
  getAppointments: [{ from: "items", into: "appointmentId" }],
  getSubscriptions: [{ from: "items", into: "subscriptionId" }],
};

function topKeys(o: unknown): string[] {
  return o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o as object) : [];
}

async function acculynxGet(
  url: string,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${ACCULYNX_KEY}`, Accept: "application/json" },
      });
    } catch (e) {
      return { status: 0, ms: Date.now() - t0, body: { fetchError: String(e) }, isJson: false };
    }
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") ?? "";
    const isJson = ct.includes("json");
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
      attempt++;
      continue;
    }
    const body = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, ms, body, isJson };
  }
}

function harvest(op: string, body: unknown, seeds: Record<string, string[]>) {
  const rules = HARVEST[op];
  if (!rules) return;
  for (const r of rules) {
    let ids: string[] = [];
    if (r.from === "items") {
      const items = (body as { items?: unknown[] })?.items ?? [];
      ids = (Array.isArray(items) ? items : [])
        .map((it) => (it as { id?: string; name?: string })?.id ?? (it as { name?: string })?.name)
        .filter(Boolean) as string[];
    } else {
      const id = (body as { id?: string })?.id;
      if (id) ids = [id];
    }
    if (ids.length) {
      seeds[r.into] = [...new Set([...(seeds[r.into] ?? []), ...ids])].slice(0, 3);
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // HARD GATE: enforce sandbox-only in code before any network call.
  try {
    assertSandbox(SANDBOX_SECRET_NAME);
  } catch (e) {
    return json({ error: (e as Error).message }, 403);
  }
  if (!ACCULYNX_KEY) return json({ error: `${SANDBOX_SECRET_NAME} not set in Edge secrets` }, 500);

  const started = Date.now();
  const deadline = started + RUNTIME_BUDGET_MS;
  const batchId = `sweep-${new Date(started).toISOString().replace(/[:.]/g, "-")}`;

  const { data: checklist, error: clErr } = await sb
    .from("acculynx_get_checklist")
    .select("operation_id, path, base_url, tier, path_params, pagination_param, includes_supported, probeability")
    .order("tier", { ascending: true })
    .order("operation_id", { ascending: true });
  if (clErr) return json({ error: `checklist load: ${clErr.message}` }, 500);

  const seeds: Record<string, string[]> = { countryId: ["1"] };
  const probeRows: Record<string, unknown>[] = [];
  const catalogRows: Record<string, unknown>[] = [];
  const verdicts: Record<string, number> = {};
  let calls = 0, seedDataCount = 0;

  const bump = (v: string) => (verdicts[v] = (verdicts[v] ?? 0) + 1);

  for (const rawRow of (checklist ?? [])) {
    const row = rawRow as ChecklistRow;
    if (Date.now() >= deadline) { bump("budget_skipped"); continue; }

    // Reports: no list endpoint for scheduledReportId — record without calling.
    if (row.probeability === "unprobeable_no_seed") {
      probeRows.push(mkProbe(row, batchId, null, "unprobeable", { reason: "no scheduledReportId seed (no list GET)" }));
      bump("unprobeable");
      continue;
    }

    // Resolve path params from seeds; if any missing -> unprobeable (no seed).
    let resolvedPath = row.path;
    let missing = false;
    for (const p of (row.path_params ?? [])) {
      const id = seeds[p]?.[0];
      if (!id) { missing = true; break; }
      resolvedPath = resolvedPath.replace(`{${p}}`, encodeURIComponent(id));
    }
    if (missing) {
      probeRows.push(mkProbe(row, batchId, null, "unprobeable", { reason: "no seed id available in sandbox" }));
      bump("unprobeable");
      continue;
    }

    // Build URL (+ pagination first page for collections).
    const pp = row.pagination_param ?? paginationParam({ pagination_param: row.pagination_param });
    let url = `${row.base_url}${resolvedPath}`;
    const qs: string[] = [];
    if (pp) qs.push(`pageSize=25`, `${pp}=0`);
    if (qs.length) url += `?${qs.join("&")}`;

    if (calls > 0) await sleep(PACE_MS);
    const { status, ms, body, isJson } = await acculynxGet(url);
    calls++;

    const items = (body as { items?: unknown[] })?.items;
    const count = (body as { count?: number })?.count ?? null;
    const itemsOnPage = Array.isArray(items) ? items.length : null;
    const firstItem = Array.isArray(items) && items.length ? items[0] : null;

    // Verdict classification.
    let verdict: string;
    if (status === 200 && Array.isArray(items) && items.length === 0) verdict = "empty";
    else if (status === 200) verdict = "200";
    else if (row.base_url.includes("/webhooks/v2") && (status === 404 || !isJson)) verdict = "tier_gated";
    else verdict = String(status);
    bump(verdict);

    if (status === 200) harvest(row.operation_id, body, seeds);
    if (row.operation_id === "getJobs") seedDataCount = count ?? itemsOnPage ?? 0;

    const result_summary = {
      verdict,
      top_keys: topKeys(body),
      item_keys: firstItem ? topKeys(firstItem) : [],
      reported_count: count,
      pagination_param: pp,
      includes_supported: row.includes_supported,
    };

    probeRows.push({
      probe_batch_id: batchId,
      probe_name: row.operation_id,
      api_endpoint: resolvedPath,
      method: "GET",
      http_status: status,
      response_ms: ms,
      reported_count: count,
      items_on_page: itemsOnPage,
      result_summary,
      payload_sample: redactSample(firstItem ?? body),
      error: status >= 400 ? `HTTP ${status}` : null,
      source_account_key: SOURCE_ACCOUNT,
    });

    catalogRows.push({
      endpoint_pattern: row.path,
      method: "GET",
      category: row.tier,
      is_collection: Array.isArray(items),
      requires_param: (row.path_params ?? []).length ? row.path_params.join(",") : null,
      response_keys: topKeys(body),
      last_probe_status: status,
      last_probed_at: new Date().toISOString(),
      notes: `tier ${row.tier}; verdict ${verdict}; pagination ${pp ?? "none"}`,
      source_account_key: SOURCE_ACCOUNT,
      updated_at: new Date().toISOString(),
    });
  }

  // Persist: insert all probe rows (one batch), upsert catalog on (endpoint_pattern, method).
  if (probeRows.length) {
    const { error } = await sb.from("acculynx_api_probe").insert(probeRows);
    if (error) return json({ error: `probe insert: ${error.message}`, batch_id: batchId }, 500);
  }
  if (catalogRows.length) {
    // Catalog enrichment is best-effort (no unique constraint guaranteed on the live table);
    // the probe rows are the authoritative evidence for the 01-03 reconciliation.
    const { error: catErr } = await sb
      .from("acculynx_api_catalog")
      .upsert(catalogRows, { onConflict: "endpoint_pattern,method" });
    if (catErr) console.warn(`[sweep] catalog upsert skipped: ${catErr.message}`);
  }

  return json({
    batch_id: batchId,
    source_account: SOURCE_ACCOUNT,
    checklist_ops: checklist?.length ?? 0,
    probe_rows: probeRows.length,
    calls_made: calls,
    sandbox_jobs_seed_count: seedDataCount,
    seeds_harvested: Object.fromEntries(Object.entries(seeds).map(([k, v]) => [k, v.length])),
    verdicts,
    runtime_ms: Date.now() - started,
  });
});

function mkProbe(
  row: ChecklistRow,
  batchId: string,
  status: number | null,
  verdict: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    probe_batch_id: batchId,
    probe_name: row.operation_id,
    api_endpoint: row.path,
    method: "GET",
    http_status: status,
    response_ms: null,
    reported_count: null,
    items_on_page: null,
    result_summary: { verdict, ...extra },
    payload_sample: null,
    error: null,
    source_account_key: SOURCE_ACCOUNT,
  };
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
