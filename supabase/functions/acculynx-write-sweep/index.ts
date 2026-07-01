// acculynx-write-sweep — Edge Function entrypoint (Phase 4, plan 04-02)
//
// SANDBOX-ONLY tiered red-team sweep of the 38 documented AccuLynx write operations
// (19 POST / 15 PUT / 4 DELETE). Reads the checklist from acculynx_write_checklist,
// resolves ONLY the sandbox key behind a code-level hard gate, seeds prerequisite
// reference data (contact-types, job-categories, trade-types, lead-sources, states,
// custom-field defs, document-folders, account-types), walks the dependency chain
// (contact -> job -> financials -> worksheet/payments/custom-fields/documents/messages/
// representatives/external-references), red-teams deep-tier endpoints across 5
// dimensions to the D-05 stop rule (shouldStopProbing), smoke-tests the remaining
// endpoints (happy-path + 1 bad-input probe), and records one acculynx_write_probe
// row per attempt (tagged source_account_key='sandbox', run_tag, created_entity_id)
// plus an upsert into acculynx_write_catalog with the evidence-based verdict.
//
// NO secret value in source — only the sandbox secret NAME constant (see sweep.ts).
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertSandbox,
  buildContactAddress,
  buildJobAddress,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
  shouldStopProbing,
  type ProbeSignal,
} from "./sweep.ts";

const ACCULYNX_KEY = Deno.env.get(SANDBOX_SECRET_NAME);
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE_ACCOUNT = "sandbox";
const PACE_MS = 130; // ~8 req/s on the single sandbox key; conservative for mutating calls too
const RUNTIME_BUDGET_MS = 150_000; // higher than read-sweep's 110s — dependency-chain round trips (contact->job->financials) cost more
const MAX_RETRIES = 3;
const BASE = "https://api.acculynx.com/api/v2";

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ChecklistRow {
  operation_id: string;
  path: string;
  base_url: string;
  tier: "deep" | "smoke";
  method: "POST" | "PUT" | "DELETE";
  path_params: string[];
  required_body_fields: string[] | null;
  dependency_chain: string | null;
  red_team_dimensions: string[];
  probeability: "probeable" | "tier_gated" | "blocked-by-dependency";
}

function topKeys(o: unknown): string[] {
  return o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o as object) : [];
}

/**
 * Generalized HTTP call helper for writes — same 429/backoff/retry-after logic as
 * read-sweep's acculynxGet, VERBATIM (Don't-Hand-Roll rate-limit pattern), extended
 * to accept a method + optional JSON body.
 */
async function acculynxCall(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${ACCULYNX_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
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
    const body_ = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, ms, body: body_, isJson };
  }
}

/** Reference-data pre-fetch: safe read-only GETs used to resolve dependent write bodies. */
async function ref(path: string): Promise<any[]> {
  const { body } = await acculynxCall("GET", `${BASE}${path}`);
  return (body as { items?: any[] })?.items ?? [];
}

interface ReferenceData {
  defaultContactTypeId: string | null;
  jobCategoryId: string | null;
  tradeTypeId: string | null;
  leadSourceId: string | null;
  accountTypeId: string | null;
  documentFolderId: string | null;
  customFieldDefinitionId: string | null;
  stateByAbbr: Record<string, { id: number; name: string; abbreviation: string }>;
}

async function prefetchReferenceData(): Promise<ReferenceData> {
  const [contactTypes, jobCategories, tradeTypes, leadSources, states, customFields, docFolders, accountTypes] =
    await Promise.all([
      ref("/contacts/contact-types"),
      ref("/company-settings/job-file-settings/job-categories"),
      ref("/company-settings/job-file-settings/trade-types"),
      ref("/company-settings/leads/lead-sources"),
      ref("/acculynx/countries/1/states"),
      ref("/company-settings/custom-fields"),
      ref("/company-settings/job-file-settings/document-folders"),
      ref("/company-settings/location-settings/account-types"),
    ]);

  const stateByAbbr = Object.fromEntries(
    (states ?? []).map((s: any) => [s.abbreviation, { id: s.id, name: s.name, abbreviation: s.abbreviation }]),
  );

  return {
    defaultContactTypeId: contactTypes.find((t: any) => t.isDefault)?.id ?? contactTypes[0]?.id ?? null,
    jobCategoryId: jobCategories[0]?.id ?? null,
    tradeTypeId: tradeTypes[0]?.id ?? null,
    leadSourceId: leadSources[0]?.id ?? null,
    accountTypeId: accountTypes[0]?.id ?? null,
    documentFolderId: docFolders[0]?.id ?? null,
    customFieldDefinitionId: customFields[0]?.id ?? null,
    stateByAbbr,
  };
}

/** Seed contact -> job -> financialsId. Stamps run_tag into notes/description fields where supported. */
async function seedDependencyRoot(
  refData: ReferenceData,
  runTag: string,
): Promise<{ contactId: string | null; jobId: string | null; financialsId: string | null; steps: StepResult[] }> {
  const steps: StepResult[] = [];

  const contactBody = {
    contactTypeIds: refData.defaultContactTypeId ? [refData.defaultContactTypeId] : [],
    firstName: "Jordan",
    lastName: `WriteSweep-${runTag}`,
    phoneNumbers: [{ number: "316-555-0100", type: "Mobile", primary: true }],
    emailAddresses: [{ address: `sandbox+${runTag}@example.com`, type: "Personal", primary: true }],
    mailingAddress: buildContactAddress({ city: "Wichita", state: "KS", zipCode: "67203" }),
  };
  const c = await acculynxCall("POST", `${BASE}/contacts`, contactBody);
  steps.push({ op: "postContact", status: c.status, body: c.body, requestBody: contactBody });
  const contactId = (c.body as { id?: string })?.id ?? null;
  if (!contactId) return { contactId: null, jobId: null, financialsId: null, steps };
  await sleep(PACE_MS);

  const jobBody = {
    contact: { id: contactId },
    locationAddress: buildJobAddress({ city: "Wichita", state: "KS", zipCode: "67203" }),
    jobCategory: refData.jobCategoryId ? { id: refData.jobCategoryId } : undefined,
    tradeTypes: refData.tradeTypeId ? [{ id: refData.tradeTypeId }] : undefined,
    leadSource: refData.leadSourceId ? { id: refData.leadSourceId } : undefined,
    priority: "Normal",
  };
  const j = await acculynxCall("POST", `${BASE}/jobs`, jobBody);
  steps.push({ op: "postJob", status: j.status, body: j.body, requestBody: jobBody, createdEntityId: contactId });
  const jobId = (j.body as { id?: string })?.id ?? null;
  if (!jobId) return { contactId, jobId: null, financialsId: null, steps };
  await sleep(PACE_MS);

  // GET /jobs/{jobId}/financials with one short retry on empty/404 (Open Question 1:
  // does financials auto-provisioning happen synchronously with job creation?).
  let financialsId: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const f = await acculynxCall("GET", `${BASE}/jobs/${jobId}/financials`);
    financialsId = (f.body as { id?: string })?.id ?? null;
    if (financialsId) break;
    if (attempt === 0) await sleep(1500); // short provisioning-delay retry (Open Question 1)
  }
  steps.push({ op: "getFinancialsForJob", status: financialsId ? 200 : 0, body: { financialsId }, createdEntityId: jobId });

  return { contactId, jobId, financialsId, steps };
}

interface StepResult {
  op: string;
  status: number;
  body: unknown;
  requestBody?: unknown;
  createdEntityId?: string | null;
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
  const batchId = `wsweep-${new Date(started).toISOString().replace(/[:.]/g, "-")}`;
  const runTag = batchId;

  const { data: checklist, error: clErr } = await sb
    .from("acculynx_write_checklist")
    .select(
      "operation_id, path, base_url, tier, method, path_params, required_body_fields, dependency_chain, red_team_dimensions, probeability",
    )
    .order("tier", { ascending: true })
    .order("operation_id", { ascending: true });
  if (clErr) return json({ error: `checklist load: ${clErr.message}` }, 500);

  const probeRows: Record<string, unknown>[] = [];
  const catalogRows: Record<string, unknown>[] = [];
  const verdicts: Record<string, number> = {};
  let calls = 0;
  const bump = (v: string) => (verdicts[v] = (verdicts[v] ?? 0) + 1);

  // 1. Reference-data pre-fetch (needed to resolve dependent write bodies).
  const refData = await prefetchReferenceData();
  calls += 8;

  // 2. Dependency-root seed: contact -> job -> financialsId.
  const { contactId, jobId, financialsId, steps: seedSteps } = await seedDependencyRoot(refData, runTag);
  calls += seedSteps.length;
  for (const s of seedSteps) {
    probeRows.push({
      probe_batch_id: batchId,
      probe_name: s.op,
      api_endpoint: s.op === "postContact" ? "/contacts" : s.op === "postJob" ? "/jobs" : `/jobs/${jobId}/financials`,
      method: s.op === "getFinancialsForJob" ? "GET" : "POST",
      http_status: s.status || null,
      response_ms: null,
      result_summary: { seed_step: true, top_keys: topKeys(s.body) },
      payload_sample: redactSample(s.body),
      request_body_sample: s.requestBody ? redactSample(s.requestBody) : null,
      error: s.status >= 400 ? `HTTP ${s.status}` : null,
      red_team_dimension: null,
      side_effect_observed: s.op === "getFinancialsForJob" ? "no_side_effect" : "creates_entity",
      created_entity_id: s.createdEntityId ?? (s.op === "postContact" ? (s.body as any)?.id ?? null : null),
      run_tag: runTag,
      source_account_key: SOURCE_ACCOUNT,
    });
  }

  const seeds: Record<string, string | null> = {
    contactId,
    jobId,
    financialsId,
    accountTypeId: refData.accountTypeId,
    documentFolderId: refData.documentFolderId,
    customFieldId: refData.customFieldDefinitionId,
    jobCategoryId: refData.jobCategoryId,
    leadSourceId: refData.leadSourceId,
    workTypeId: null,
    userId: null,
    messageId: null,
    subscriptionId: null,
  };

  // Placeholders consumed by Task 2's tiered walk (kept here so Task 1 alone still type-checks
  // and the checklist/seed/refData plumbing is exercised end-to-end).
  void checklist;
  void probeRows;
  void catalogRows;
  void verdicts;
  void bump;
  void deadline;
  void calls;
  void pathParams;
  void shouldStopProbing;
  const _unusedSignal: ProbeSignal | undefined = undefined;
  void _unusedSignal;
  void seeds;

  return json({
    batch_id: batchId,
    source_account: SOURCE_ACCOUNT,
    checklist_ops: checklist?.length ?? 0,
    calls_made: calls,
    seeds_harvested: { contactId: !!contactId, jobId: !!jobId, financialsId: !!financialsId },
    verdicts,
    runtime_ms: Date.now() - started,
  });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
