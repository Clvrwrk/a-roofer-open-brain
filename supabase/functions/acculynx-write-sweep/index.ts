// acculynx-write-sweep — Edge Function entrypoint (Phase 4, plans 04-02 + 04-03)
//
// SANDBOX-ONLY tiered red-team sweep of the 38 documented AccuLynx write operations
// (19 POST / 15 PUT / 4 DELETE). Reads the checklist from acculynx_write_checklist,
// resolves ONLY the sandbox key behind a code-level hard gate, seeds prerequisite
// reference data (contact-types, job-categories, trade-types, lead-sources, states,
// custom-field defs, document-folders, account-types, company users), walks the
// dependency chain (contact -> job -> financials -> worksheet/payments/custom-fields/
// documents/messages/representatives/external-references), red-teams deep-tier
// endpoints across 5 dimensions to the D-05 stop rule (shouldStopProbing), smoke-tests
// the remaining endpoints (happy-path + 1 bad-input probe), and records one
// acculynx_write_probe row per attempt (tagged source_account_key='sandbox', run_tag,
// created_entity_id) plus an upsert into acculynx_write_catalog with the evidence-based
// verdict (classifyVerdict2 — Plan 04-03: reserves 'unsupported' for genuinely-absent
// routes only; a reachable validation 4xx classifies as blocked-by-dependency).
//
// NO secret value in source — only the sandbox secret NAME constant (see sweep.ts).
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertSandbox,
  buildContactAddress,
  buildJobAddress,
  classifyVerdict2,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
  shouldStopProbing,
  type ProbeSignal,
  type VerdictInput,
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
 * to accept a method + optional JSON body OR a pre-built FormData body (Plan 04-03:
 * postJobDocument/postJobPhotoVideo are multipart/form-data per the OpenAPI index,
 * not JSON — sending JSON against them mis-negotiates content-type and the vendor's
 * routing layer returns a bare, non-ProblemDetails 404 that looks like "unsupported"
 * but is actually just the wrong wire format).
 */
async function acculynxCall(
  method: string,
  url: string,
  body?: unknown,
  formData?: FormData,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${ACCULYNX_KEY}`,
        Accept: "application/json",
      };
      if (!formData) headers["Content-Type"] = "application/json";
      res = await fetch(url, {
        method,
        headers,
        body: formData ?? (body ? JSON.stringify(body) : undefined),
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

/** Tiny in-memory 1x1 GIF fixture for multipart document/photo probes — no real file needed. */
function buildProbeFile(name: string, contentType: string): Blob {
  const bytes = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
  ]);
  return new Blob([bytes], { type: contentType });
}

/** Build a multipart/form-data body for the two file-upload write endpoints. */
function buildMultipartBody(op: string, seeds: Record<string, string | null>): FormData {
  const fd = new FormData();
  fd.append("file", buildProbeFile("write-sweep-probe.gif", "image/gif"), "write-sweep-probe.gif");
  if (op === "postJobDocument") {
    fd.append("description", "write-sweep probe document");
    if (seeds.documentFolderId) fd.append("documentFolderId", seeds.documentFolderId);
  } else if (op === "postJobPhotoVideo") {
    fd.append("description", "write-sweep probe photo");
  }
  return fd;
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
  workTypeId: string | null;
  userId: string | null;
  stateByAbbr: Record<string, { id: number; name: string; abbreviation: string }>;
  /** Names any reference GET that came back empty in this sandbox, for evidence-carrying
   * blocked-by-dependency notes (Plan 04-03: never fabricate a synthetic id). */
  missing: string[];
}

async function prefetchReferenceData(): Promise<ReferenceData> {
  const [contactTypes, jobCategories, tradeTypes, leadSources, states, customFields, docFolders, accountTypes, workTypes, users] =
    await Promise.all([
      ref("/contacts/contact-types"),
      ref("/company-settings/job-file-settings/job-categories"),
      ref("/company-settings/job-file-settings/trade-types"),
      ref("/company-settings/leads/lead-sources"),
      ref("/acculynx/countries/1/states"),
      ref("/company-settings/custom-fields"),
      ref("/company-settings/job-file-settings/document-folders"),
      ref("/company-settings/location-settings/account-types"),
      ref("/company-settings/job-file-settings/work-types"),
      ref("/users"),
    ]);

  const stateByAbbr = Object.fromEntries(
    (states ?? []).map((s: any) => [s.abbreviation, { id: s.id, name: s.name, abbreviation: s.abbreviation }]),
  );

  const missing: string[] = [];
  const pick = (arr: any[], name: string, pred?: (x: any) => boolean): string | null => {
    const found = (pred ? arr.find(pred) : undefined) ?? arr[0];
    const id = found?.id ?? null;
    if (id == null) missing.push(name);
    return id != null ? String(id) : null;
  };

  return {
    defaultContactTypeId: pick(contactTypes, "contactTypeId", (t: any) => t.isDefault),
    jobCategoryId: pick(jobCategories, "jobCategoryId"),
    tradeTypeId: pick(tradeTypes, "tradeTypeId"),
    leadSourceId: pick(leadSources, "leadSourceId"),
    accountTypeId: pick(accountTypes, "accountTypeId"),
    documentFolderId: pick(docFolders, "documentFolderId"),
    customFieldDefinitionId: pick(customFields, "customFieldDefinitionId"),
    workTypeId: pick(workTypes, "workTypeId"),
    userId: pick(users, "userId"),
    stateByAbbr,
    missing,
  };
}

/** jobCategory.id is Int32 in AccuLynx (unlike the GUID-string ids elsewhere) — the harvested
 * reference id is stringified by pick(); coerce it back to a number for the API. Returns
 * undefined for null/NaN so the field is omitted rather than sent as an invalid value. */
function intId(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
    jobCategory: intId(refData.jobCategoryId) !== undefined ? { id: intId(refData.jobCategoryId) } : undefined,
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

/** Resolve {param} placeholders in a path from the seeds map. Returns null if any param is unresolvable. */
function resolvePath(path: string, seeds: Record<string, string | null>): string | null {
  let resolved = path;
  for (const p of pathParams(path)) {
    const id = seeds[p];
    if (!id) return null;
    resolved = resolved.replace(`{${p}}`, encodeURIComponent(id));
  }
  return resolved;
}

/** Build a request body for a given operation, using seeds + reference data. Returns undefined for bodyless calls. */
function buildRequestBody(
  op: string,
  seeds: Record<string, string | null>,
  refData: ReferenceData,
  dimension: string | null,
): unknown {
  switch (op) {
    case "putJobCustomFields":
    case "putContactCustomFields":
      return dimension === "bad_input"
        ? { customFields: [] } // empty required array -> expect 400
        : { customFields: seeds.customFieldId ? [{ id: seeds.customFieldId, values: ["write-sweep-probe"] }] : [] };
    case "putJobCustomFieldById":
    case "putContactCustomFieldById":
      return dimension === "bad_input"
        ? { fieldType: "NotARealType", values: ["x"] }
        : { fieldType: "Text", values: ["write-sweep-probe"] };
    case "postWorksheetItem":
      return dimension === "bad_input"
        ? { itemName: "bad-input-probe" } // missing required `price` -> expect 400
        : { price: 100, itemName: "Write-sweep probe item", quantity: 1 };
    case "postPaymentReceived":
      return dimension === "bad_input"
        ? { amount: "not-a-number" }
        : { from: "Write Sweep", amount: 1, paymentDate: new Date().toISOString().slice(0, 10), notes: "probe" };
    case "postPaymentPaid":
      return dimension === "bad_input"
        ? { amount: -1 }
        : {
          to: "Write Sweep Vendor",
          paymentMethod: "Check",
          amount: 1,
          paymentDate: new Date().toISOString().slice(0, 10),
          notes: "probe",
          accountTypeId: seeds.accountTypeId ?? undefined,
        };
    case "postPaymentExpense":
      return dimension === "bad_input"
        ? { amount: "bad" }
        : { to: "Write Sweep Vendor", amount: 1, notes: "probe", accountTypeId: seeds.accountTypeId ?? undefined };
    case "postJobDocument":
      return dimension === "bad_input"
        ? { documentFolderId: "00000000-0000-0000-0000-000000000000" } // foreign/nonexistent id -> expect 404
        : { documentFolderId: seeds.documentFolderId ?? undefined };
    case "postJobPhotoVideo":
      return dimension === "bad_input" ? { fileUri: "not-a-url" } : { description: "write-sweep probe photo" };
    case "postJobMessage":
      return dimension === "bad_input" ? {} : { message: "write-sweep probe message" };
    case "postJobMessageReply":
      return dimension === "bad_input" ? {} : { message: "write-sweep probe reply" };
    case "postCompanyRepresentativeForJob":
    case "postSalesOwnerForJob":
    case "postAROwnerForJob":
      return dimension === "bad_input" ? { id: "00000000-0000-0000-0000-000000000000" } : { id: seeds.userId ?? undefined };
    case "postJobExternalReference":
      return dimension === "bad_input"
        ? { jobId: seeds.jobId, source: "write-sweep" } // missing required projectId -> expect 400
        : { jobId: seeds.jobId, source: "write-sweep", projectId: `probe-${seeds.jobId}` };
    case "postContact":
      return dimension === "bad_input"
        ? { contactTypeIds: [] } // empty required array -> expect 400
        : {
          contactTypeIds: refData.defaultContactTypeId ? [refData.defaultContactTypeId] : [],
          firstName: "Bad",
          lastName: "Input",
        };
    case "postJob":
      return dimension === "bad_input"
        ? { priority: "Urgent" } // invalid strict enum -> expect 404 (Pitfall 2)
        : { contact: { id: seeds.contactId }, priority: "Normal" };
    case "postContactLog":
      // OpenAPI index's contactLogPost schema is thin (only inherited id/_link fields show
      // in the flattened index — the real body shape isn't fully captured there). Best-effort
      // guess is a `message`/`note`-shaped log entry; a 400 here is real evidence the guess is
      // wrong (reachable-but-wrong-shape -> blocked-by-dependency via classifyVerdict2), not
      // proof the route is unsupported.
      return dimension === "bad_input" ? { message: 12345 } : { message: "write-sweep probe log", note: "write-sweep probe log" };
    case "postContactsSearch":
      return dimension === "bad_input"
        ? { sort: "not-a-valid-sort" }
        : { startDate: "2020-01-01", endDate: new Date().toISOString().slice(0, 10), sort: "createdDate" };
    case "postJobsSearch":
      return dimension === "bad_input" ? { pageSize: -1 } : { searchTerm: "write-sweep" };
    case "putJobAddress":
      return dimension === "bad_input"
        ? { ...buildContactAddress({}), state: { abbreviation: "KS" } } // wrong shape: object where string expected
        : buildJobAddress({ city: "Wichita", state: "KS", zipCode: "67203" });
    case "putAdjusterForJob":
      return dimension === "bad_input" ? { claimApproved: "not-a-boolean" } : { adjusterName: "Write Sweep Adjuster" };
    case "putInitialAppointmentForJob":
      return dimension === "bad_input"
        ? { startDate: "not-a-date" }
        : { startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3600_000).toISOString(), notes: "probe" };
    case "putInsuranceForJob":
      return dimension === "bad_input" ? { invalidField: true } : {};
    case "putInsuranceCompanyForJob":
      return dimension === "bad_input"
        ? { insuranceCompanyId: "00000000-0000-0000-0000-000000000000" }
        : { insuranceCompanyName: "Write Sweep Insurance Co" };
    case "putJobCategoriesForJob":
      return dimension === "bad_input" ? { id: "00000000-0000-0000-0000-000000000000" } : { id: intId(seeds.jobCategoryId) };
    case "putLeadSourceForJob":
      return dimension === "bad_input" ? { id: "00000000-0000-0000-0000-000000000000" } : { id: seeds.leadSourceId ?? undefined };
    case "putPriorityForJob":
      return dimension === "bad_input" ? { priority: "Urgent" } : { priority: "High" };
    case "putTradeTypesForJob":
      // OpenAPI index: jobTradeTypeCollection = { items: [...] } (NOT a top-level `tradeTypes`
      // key). Plan 04-03: the prior run's empty-body probe 500'd here — that is real evidence
      // of a guardrail (classifyVerdict2 maps any 500 to fragile-with-guardrail), not a reason
      // to send a still-malformed body; the happy-path uses the verified `items` shape.
      return dimension === "bad_input"
        ? undefined // empty/no body -> documented 500 crash (the guardrail this endpoint reveals)
        : { items: refData.tradeTypeId ? [{ id: refData.tradeTypeId }] : [] };
    case "putWorkTypeForJob":
      return dimension === "bad_input" ? { id: "00000000-0000-0000-0000-000000000000" } : { id: seeds.workTypeId ?? undefined };
    case "postSubscription":
      return dimension === "bad_input"
        ? { consumerUrl: "not-a-url" }
        : { consumerUrl: "https://example.com/write-sweep-hook", techContact: "sandbox@example.com", topicNames: ["job_created"] };
    case "putSubscription":
      return dimension === "bad_input" ? { topicNames: "not-an-array" } : { topicNames: ["job_created"] };
    case "postSubscriptionTestEvent":
      return dimension === "bad_input" ? { topicName: "not_a_real_topic" } : { topicName: "job_created" };
    default:
      return dimension === "bad_input" ? {} : undefined;
  }
}

/** Classify a single probe's raw result into a ProbeSignal (for the stop-rule) + an error-shape string. */
function classifySignal(status: number, body: unknown): ProbeSignal {
  const errShape = status >= 400
    ? `${status}:${topKeys(body).sort().join(",")}`
    : null;
  const guardrail = status === 412
    ? "precondition_failed"
    : status === 416
    ? "payload_too_large"
    : status >= 500
    ? "server_error"
    : null;
  return { status, errorShape: errShape, guardrail };
}

/** Endpoint operation_ids with no independent read-back path (Pitfall 5) — verdict caps at write-only. */
const WRITE_ONLY_OPS = new Set(["postJobMessage", "postJobMessageReply", "postContactLog"]);

/**
 * Per operation_id: [key into the `seeds` map, human-readable evidence label]. The seeds-map
 * key MUST match a real key in the `seeds` object below (Plan 04-03: this drove a bug where
 * the display label "customFieldDefinitionId" was used to look up `seeds.customFieldId` and
 * silently always missed — fixed by separating the lookup key from the label).
 */
const CHILD_ID_SEED_NAME: Record<string, [seedKey: string, label: string]> = {
  postCompanyRepresentativeForJob: ["userId", "userId"],
  postSalesOwnerForJob: ["userId", "userId"],
  postAROwnerForJob: ["userId", "userId"],
  deleteAROwnerForJob: ["userId", "userId (via postAROwnerForJob)"],
  deleteSalesOwnerForJob: ["userId", "userId (via postSalesOwnerForJob)"],
  postPaymentPaid: ["accountTypeId", "accountTypeId"],
  postPaymentExpense: ["accountTypeId", "accountTypeId"],
  putJobCustomFields: ["customFieldId", "customFieldDefinitionId"],
  putContactCustomFields: ["customFieldId", "customFieldDefinitionId"],
  putJobCustomFieldById: ["customFieldId", "customFieldDefinitionId"],
  putContactCustomFieldById: ["customFieldId", "customFieldDefinitionId"],
  postJobDocument: ["documentFolderId", "documentFolderId"],
  putJobCategoriesForJob: ["jobCategoryId", "jobCategoryId"],
  putWorkTypeForJob: ["workTypeId", "workTypeId"],
  postJobMessageReply: ["messageId", "messageId (via postJobMessage)"],
  putSubscription: ["subscriptionId", "subscriptionId (via postSubscription)"],
  deleteSubscription: ["subscriptionId", "subscriptionId (via postSubscription)"],
  postSubscriptionTestEvent: ["subscriptionId", "subscriptionId (via postSubscription)"],
};

/**
 * Map an endpoint's accumulated probe evidence into the acculynx_write_catalog verdict
 * enum via the pure, evidence-correct classifyVerdict2 (Plan 04-03 fix). Thin adapter that
 * assembles a VerdictInput from the harness's mutable probe-loop state; the actual
 * classification logic lives in sweep.ts so it stays unit-testable without a live sandbox.
 */
function classifyVerdictForRow(
  row: ChecklistRow,
  history: ProbeSignal[],
  probeTopKeys: string[][],
  createdEntityId: string | null,
  neverProbed: boolean,
  missingSeedId: boolean,
): string {
  const input: VerdictInput = {
    probeability: row.probeability,
    neverProbed,
    isSearchShaped: row.operation_id === "postJobsSearch" || row.operation_id === "postContactsSearch",
    isWriteOnlyShaped: WRITE_ONLY_OPS.has(row.operation_id),
    probes: history.map((h, i) => ({ status: h.status, topKeys: probeTopKeys[i] ?? [], guardrail: h.guardrail })),
    createdEntityId,
    method: row.method,
    missingChildIdName: missingSeedId ? (CHILD_ID_SEED_NAME[row.operation_id]?.[1] ?? "unknown-child-id") : null,
  };
  return classifyVerdict2(input);
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
    workTypeId: refData.workTypeId,
    userId: refData.userId,
    messageId: null,
    subscriptionId: null,
  };

  // Plan 04-03 bug #1: postContact/postJob are the dependency-root seeds and are
  // provably WRITABLE (their 2xx responses seeded everything downstream), but the prior
  // run never wrote a catalog row for either — they were skipped from the checklist walk
  // below to avoid double-creating the shared parent entities. Write their catalog rows
  // here, directly from the real seed-step evidence (never fabricated).
  for (const s of seedSteps) {
    if (s.op !== "postContact" && s.op !== "postJob") continue;
    const path = s.op === "postContact" ? "/contacts" : "/jobs";
    const succeeded = s.status >= 200 && s.status < 300;
    const createdId = s.op === "postContact" ? contactId : jobId;
    catalogRows.push({
      endpoint_pattern: path,
      method: "POST",
      category: s.op === "postContact" ? "contacts" : "jobs",
      verdict: succeeded ? "writable" : "unsupported",
      tier: "deep",
      red_team_dimensions_covered: [],
      side_effect: succeeded ? "creates_entity" : "no_side_effect",
      guardrail_notes: null,
      source_account_key: SOURCE_ACCOUNT,
      last_probe_status: s.status || null,
      last_probed_at: new Date().toISOString(),
      notes: `dependency-root seed step; status ${s.status}; ${
        succeeded ? `created entity id ${createdId ? "present" : "MISSING despite 2xx"}` : "seed failed"
      } — this id seeded the rest of the sweep's dependency chain`,
      updated_at: new Date().toISOString(),
    });
    bump(succeeded ? "writable" : "unsupported");
  }

  // 3. Tiered walk over the checklist, ordered by dependency (contact/job roots already
  //    seeded above; checklist rows are ordered tier then operation_id by the query).
  for (const rawRow of (checklist ?? [])) {
    const row = rawRow as ChecklistRow;
    if (Date.now() >= deadline) { bump("budget_skipped"); continue; }
    // Roots already seeded directly above — skip re-probing postContact/postJob here to
    // avoid double-creating the dependency-chain entities (they got their own probe rows).
    if (row.operation_id === "postContact" || row.operation_id === "postJob") continue;

    const resolvedPath = resolvePath(row.path, seeds);
    if (resolvedPath === null) {
      probeRows.push({
        probe_batch_id: batchId,
        probe_name: row.operation_id,
        api_endpoint: row.path,
        method: row.method,
        http_status: null,
        response_ms: null,
        result_summary: { verdict: "blocked-by-dependency", reason: "no seed id available in sandbox" },
        payload_sample: null,
        request_body_sample: null,
        error: null,
        red_team_dimension: null,
        side_effect_observed: "no_side_effect",
        created_entity_id: null,
        run_tag: runTag,
        source_account_key: SOURCE_ACCOUNT,
      });
      catalogRows.push({
        endpoint_pattern: row.path,
        method: row.method,
        category: row.tier,
        verdict: "blocked-by-dependency",
        tier: row.tier,
        red_team_dimensions_covered: [],
        side_effect: "no_side_effect",
        guardrail_notes: "no seed id available in sandbox entity graph",
        source_account_key: SOURCE_ACCOUNT,
        last_probe_status: null,
        last_probed_at: new Date().toISOString(),
        notes: `blocked-by-dependency: missing path param seed for ${row.path}`,
        updated_at: new Date().toISOString(),
      });
      bump("blocked-by-dependency");
      continue;
    }

    const url = `${row.base_url}${resolvedPath}`;
    const history: ProbeSignal[] = [];
    let lastCreatedEntityId: string | null = null;
    let anyProbe = false;
    const dimensionsCovered: string[] = [];
    const probeTopKeys: string[][] = [];

    // Dimensions to run: deep tier iterates the full red_team_dimensions list to the
    // stop rule; smoke tier runs happy-path (dimension=null) + exactly 1 bad-input probe.
    const dimensionPlan: (string | null)[] = row.tier === "deep"
      ? [null, ...row.red_team_dimensions] // happy-path first, then each red-team dimension
      : [null, "bad_input"];

    // postJobDocument/postJobPhotoVideo are multipart/form-data per the OpenAPI index
    // (Plan 04-03 fix) — build a FormData body instead of a JSON one for these two.
    const isMultipart = row.operation_id === "postJobDocument" || row.operation_id === "postJobPhotoVideo";

    for (const dimension of dimensionPlan) {
      if (Date.now() >= deadline) break;
      if (row.tier === "deep" && dimension && shouldStopProbing(history)) break;

      let body: unknown;
      let formData: FormData | undefined;
      if (row.method === "DELETE") {
        body = undefined;
      } else if (isMultipart && dimension !== "bad_input") {
        formData = buildMultipartBody(row.operation_id, seeds);
      } else if (isMultipart && dimension === "bad_input") {
        // bad-input probe for the file-upload endpoints: send valid multipart shape but a
        // foreign/nonexistent documentFolderId, still as multipart (sending JSON here would
        // re-introduce the same content-type mismatch bug this plan fixes).
        formData = new FormData();
        formData.append("file", buildProbeFile("write-sweep-bad-input.gif", "image/gif"), "write-sweep-bad-input.gif");
        if (row.operation_id === "postJobDocument") {
          formData.append("documentFolderId", "00000000-0000-0000-0000-000000000000");
        }
      } else {
        body = buildRequestBody(row.operation_id, seeds, refData, dimension);
      }

      if (calls > 0) await sleep(PACE_MS);
      const { status, ms, body: respBody } = await acculynxCall(row.method, url, body, formData);
      calls++;
      anyProbe = true;

      const respTopKeys = topKeys(respBody);
      const signal = classifySignal(status, respBody);
      history.push(signal); // happy-path AND red-team probes count toward stop-rule history
      if (dimension) dimensionsCovered.push(dimension);

      const createdEntityId = (respBody as { id?: string })?.id ?? null;
      if (createdEntityId && status >= 200 && status < 300) lastCreatedEntityId = createdEntityId;

      // Harvest IDs this probe reveals for later dependent probes (e.g. postJobMessage -> messageId).
      if (row.operation_id === "postJobMessage" && createdEntityId) seeds.messageId = createdEntityId;
      if (row.operation_id === "postSubscription" && createdEntityId) seeds.subscriptionId = createdEntityId;

      probeTopKeys.push(respTopKeys);

      probeRows.push({
        probe_batch_id: batchId,
        probe_name: row.operation_id,
        api_endpoint: resolvedPath,
        method: row.method,
        http_status: status,
        response_ms: ms,
        result_summary: { top_keys: respTopKeys, dimension: dimension ?? "happy_path" },
        payload_sample: redactSample(respBody),
        request_body_sample: formData ? { multipart: true, fields: [...formData.keys()] } : (body ? redactSample(body) : null),
        error: status >= 400 ? `HTTP ${status}` : null,
        red_team_dimension: dimension,
        side_effect_observed: status >= 200 && status < 300
          ? (createdEntityId ? "creates_entity" : "mutates_entity")
          : "no_side_effect",
        created_entity_id: createdEntityId,
        run_tag: runTag,
        source_account_key: SOURCE_ACCOUNT,
      });
    }

    // DELETE lifecycle: for the 4 DELETE endpoints, issue a second DELETE to probe
    // idempotency (expect 404 the second time).
    if (row.method === "DELETE" && anyProbe) {
      if (calls > 0) await sleep(PACE_MS);
      const second = await acculynxCall("DELETE", url);
      calls++;
      const secondSignal = classifySignal(second.status, second.body);
      history.push(secondSignal);
      probeTopKeys.push(topKeys(second.body));
      dimensionsCovered.push("idempotency");
      probeRows.push({
        probe_batch_id: batchId,
        probe_name: row.operation_id,
        api_endpoint: resolvedPath,
        method: row.method,
        http_status: second.status,
        response_ms: second.ms,
        result_summary: { top_keys: topKeys(second.body), dimension: "idempotency", note: "second DELETE of same resource" },
        payload_sample: redactSample(second.body),
        request_body_sample: null,
        error: second.status >= 400 ? `HTTP ${second.status}` : null,
        red_team_dimension: "idempotency",
        side_effect_observed: "no_side_effect",
        created_entity_id: null,
        run_tag: runTag,
        source_account_key: SOURCE_ACCOUNT,
      });
    }

    // Detect whether this endpoint's known dependency child-id seed was unavailable in this
    // sandbox (Plan 04-03: name it in evidence rather than silently guessing/faking it).
    const childIdSeedKey = CHILD_ID_SEED_NAME[row.operation_id]?.[0] ?? null;
    const missingSeedId = childIdSeedKey != null && !seeds[childIdSeedKey];

    const verdict = classifyVerdictForRow(row, history, probeTopKeys, lastCreatedEntityId, !anyProbe, missingSeedId);
    bump(verdict);

    const guardrailNote = history.some((h) => h.guardrail) ? history.find((h) => h.guardrail)?.guardrail ?? null : null;
    const missingIdNote = missingSeedId
      ? `missing child id in sandbox: ${CHILD_ID_SEED_NAME[row.operation_id]?.[1]} (reference GET returned no usable id)`
      : null;

    catalogRows.push({
      endpoint_pattern: row.path,
      method: row.method,
      category: row.tier,
      verdict,
      tier: row.tier,
      red_team_dimensions_covered: dimensionsCovered,
      side_effect: lastCreatedEntityId ? "creates_entity" : (verdict === "writable" || verdict === "fragile-with-guardrail" ? "mutates_entity" : "no_side_effect"),
      guardrail_notes: verdict === "fragile-with-guardrail"
        ? (guardrailNote ?? `reachable but failing across ${history.length} probe(s); see result_summary`)
        : guardrailNote,
      source_account_key: SOURCE_ACCOUNT,
      last_probe_status: history.length ? history[history.length - 1].status : null,
      last_probed_at: new Date().toISOString(),
      notes: [`tier ${row.tier}; verdict ${verdict}; probes ${history.length}`, missingIdNote].filter(Boolean).join("; "),
      updated_at: new Date().toISOString(),
    });
  }

  // 4. Persist: insert all probe rows (one batch), upsert catalog on (endpoint_pattern, method).
  if (probeRows.length) {
    const { error } = await sb.from("acculynx_write_probe").insert(probeRows);
    if (error) return json({ error: `probe insert: ${error.message}`, batch_id: batchId }, 500);
  }
  if (catalogRows.length) {
    const { error: catErr } = await sb
      .from("acculynx_write_catalog")
      .upsert(catalogRows, { onConflict: "endpoint_pattern,method" });
    if (catErr) console.warn(`[write-sweep] catalog upsert skipped: ${catErr.message}`);
  }

  return json({
    batch_id: batchId,
    source_account: SOURCE_ACCOUNT,
    checklist_ops: checklist?.length ?? 0,
    probe_rows: probeRows.length,
    calls_made: calls,
    seeds_harvested: {
      contactId: !!contactId,
      jobId: !!jobId,
      financialsId: !!financialsId,
      accountTypeId: !!refData.accountTypeId,
      documentFolderId: !!refData.documentFolderId,
      customFieldDefinitionId: !!refData.customFieldDefinitionId,
      jobCategoryId: !!refData.jobCategoryId,
      workTypeId: !!refData.workTypeId,
      userId: !!refData.userId,
      messageId: !!seeds.messageId,
      subscriptionId: !!seeds.subscriptionId,
    },
    reference_data_missing: refData.missing, // Plan 04-03: names any ref GET that came back empty (evidence for blocked-by-dependency)
    verdicts,
    runtime_ms: Date.now() - started,
  });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
