// acculynx-sync — resources/job-walk.ts (Phase 2 build; Phase 7 plans 07-05/07-06 rebuild)
//
// Per-job sub-resource walk with invoice two-level walk and budget resumption.
//
// D-14 (capture-first, map-second): every per-job GET body is archived to the
// append-only acculynx_raw table BEFORE any typed mapping — a mapping failure
// never loses the payload (remediation is re-map-from-raw, not re-call-the-API).
//
// For each job in the provided jobIds list (ordered, starting from watermark.last_walked_job_id):
//   1. GET /jobs/{jobId}/contacts       -> archive -> map -> upsert acculynx_job_contacts
//   2. GET /jobs/{jobId}/financials     -> archive -> map -> upsert acculynx_job_financials
//   3. GET /jobs/{jobId}/insurance      -> archive -> map -> upsert acculynx_job_insurance
//   4. GET /jobs/{jobId}/milestone-history -> archive -> map -> upsert acculynx_job_milestone_history
//   5. GET /jobs/{jobId}/invoices (level 1) -> archive -> map -> upsert acculynx_invoices headers
//   6. For each invoice: GET /invoices/{invoiceId} (level 2) -> archive -> map -> upsert acculynx_invoice_lines
//   7. GET /jobs/{jobId}/representatives (FULL collection, not /sales-owner) -> archive ->
//      resolve the company/primary rep's user.id -> name via acculynx_users -> returned in
//      the jobId->repName Map (07-06 Task 2a; closes the "sales-owner is 204-empty" half of
//      VERIFICATION gap 3 — the full collection carries the company rep sales-owner lacks).
//
// Any typed-upsert failure is INSERTed into acculynx_job_walk_errors (account_key, job_id,
// resource_type, sync_batch_id, error_message, http_status) instead of being swallowed by
// console.warn — this closes VERIFICATION gap 2 (silent failure, no alert visibility).
//
// Watermark: last_walked_job_id advanced AFTER each job (before budget check) via the
// shared advanceWatermark() upsert helper — works even when no watermark row was ever
// seeded for this account (closes the unseeded-row no-op half of VERIFICATION gap 4).
//
// D-15 (first-sight full pull) / D-16 (change-driven re-pull): 07-06 Task 2b layers pull
// SCHEDULING around this walk via shouldWalkJob() — a job with zero prior acculynx_raw
// rows is first-sight and always gets the full per-job endpoint set (D-15, unconditional
// walk below already does this); a job that HAS prior raw archives is only re-walked when
// acculynx_jobs.modified_date is newer than the newest prior archive for that job (D-16) —
// an unchanged, already-fully-pulled job is skipped so the world is not re-pulled hourly
// (6,434 jobs x ~15 endpoints vs the rate limit makes blanket hourly pulls impossible).
// Task 2a's full-representatives fetch + jobId->repName Map contract is unchanged by this
// scheduling layer — it wraps the walk, it does not alter what the walk does per job.
//
// GUID path params are URL-encoded (ASVS V5 / T-02-08).
// apiKey is an explicit parameter — never a module-level constant (T-02-04 / Pitfall 3).

// deno-lint-ignore-file no-explicit-any

import { advanceWatermark } from "../lib/watermark.ts";
import {
  mapInvoiceHeader,
  mapInvoiceLine,
  mapJobContact,
  mapJobFinancials,
  mapJobInsurance,
  mapMilestoneHistoryItem,
} from "../lib/mappers.ts";

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
 * D-14 capture-first: archive a per-job GET body to acculynx_raw before any typed mapping.
 * Mirrors the shape used at index.ts:156 (sync_batch_id, resource_type, api_endpoint,
 * http_status, page_index, payload). Non-fatal: a raw-archive failure is logged but does
 * not block the typed upsert — the archive is best-effort provenance, not a hard gate.
 */
async function archiveRaw(
  sb: any,
  syncBatchId: string | undefined,
  resourceType: string,
  apiEndpoint: string,
  status: number,
  payload: unknown,
): Promise<void> {
  const { error } = await sb.from("acculynx_raw").insert({
    sync_batch_id: syncBatchId ?? null,
    resource_type: resourceType,
    api_endpoint: apiEndpoint,
    http_status: status,
    page_index: null,
    payload,
  });
  if (error) console.warn(`[job-walk] acculynx_raw archive (${resourceType}): ${error.message}`);
}

/**
 * Load acculynx_users into a Map<id, displayName> for representative name resolution.
 * Mirrors the pattern used by resolveLeadMilestones (index.ts) — an unresolved user.id
 * falls back to the id string itself (never to executing API-supplied text; T-07-06-04
 * untrusted-content boundary, D-10).
 */
async function loadUserNameMap(sb: any): Promise<Map<string, string>> {
  const { data: users } = await sb.from("acculynx_users").select("id, display_name, first_name, last_name");
  const userMap = new Map<string, string>();
  for (const u of users ?? []) {
    const name = u.display_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.id;
    userMap.set(u.id, name);
  }
  return userMap;
}

/**
 * Pick the primary/company representative from a full /jobs/{id}/representatives
 * collection response and resolve its user.id to a display name.
 *
 * Per the KS-11 shape (docs/knowledge-base/acculynx/api/read-capability.md;
 * getRepresentativesForJob -> { count, pageSize, pageStartIndex, items: [{id, type, user}] }):
 * items[0].type === 'CompanyRepresentative', user.id 779da1e7-... -> 'Bob Smolek'.
 * Falls back to the first item with a user.id if no CompanyRepresentative type is present.
 */
function resolveCompanyRepName(
  repsBody: unknown,
  userMap: Map<string, string>,
): string | null {
  const items: any[] = (repsBody as { items?: any[] })?.items ??
    (Array.isArray(repsBody) ? (repsBody as any[]) : []);
  if (items.length === 0) return null;
  const companyRep = items.find((r) => r?.type === "CompanyRepresentative") ?? items[0];
  const userId = companyRep?.user?.id ?? null;
  if (!userId) return null;
  return userMap.get(userId) ?? userId;
}

/** Extract the company/primary representative's user.id from a /representatives body
 * (same selection rule as resolveCompanyRepName), or null when none is present. */
function pickCompanyRepUserId(repsBody: unknown): string | null {
  const items: any[] = (repsBody as { items?: any[] })?.items ??
    (Array.isArray(repsBody) ? (repsBody as any[]) : []);
  if (items.length === 0) return null;
  const companyRep = items.find((r) => r?.type === "CompanyRepresentative") ?? items[0];
  return companyRep?.user?.id ?? null;
}

/**
 * Part 3 hardening (2026-07-06): resolve a job's company-rep name, and when the
 * user.id is NOT already in acculynx_users (the cross-tenant gap that leaked raw
 * GUIDs into primary_salesperson), fetch GET /users/{id} on-demand with THIS
 * account's key, cache the name in userMap, and upsert the user into acculynx_users
 * so it never has to be fetched again. Only ever falls back to the bare user.id when
 * the on-demand fetch also fails to yield a name (unchanged worst-case behavior).
 * The upsert is best-effort — a failure logs and still returns the resolved name.
 */
async function resolveRepNameWithFetch(
  repsBody: unknown,
  userMap: Map<string, string>,
  sb: any,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<string | null> {
  const userId = pickCompanyRepUserId(repsBody);
  if (!userId) return null;

  const cached = userMap.get(userId);
  if (cached && cached !== userId) return cached; // already resolved to a real name

  // On-demand user lookup for a rep we haven't synced yet (e.g. a rep from a tenant
  // whose per-account users sweep hasn't run this cycle).
  await sleep(PACE_MS);
  const { status, body } = await acculynxGet(`${ACCULYNX_BASE}/users/${encodeURIComponent(userId)}`, apiKey, fetchFn);
  if (status !== 200) return userId; // fetch failed — keep prior GUID-fallback behavior

  const u = body as any;
  const name: string | null = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || null;
  if (!name) return userId;

  userMap.set(userId, name);
  const { error } = await sb.from("acculynx_users").upsert({
    id: userId,
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
    synced_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) console.warn(`[job-walk] on-demand user upsert ${userId}: ${error.message}`);

  return name;
}

/**
 * Record a typed-upsert failure as a counted, queryable row instead of console.warn-only.
 * Feeds check_acculynx_alerts() condition (e) — migration 186.
 */
async function recordWalkError(
  sb: any,
  accountKey: string,
  jobId: string,
  resourceType: string,
  syncBatchId: string | undefined,
  errorMessage: string,
  httpStatus: number | null,
): Promise<void> {
  const { error } = await sb.from("acculynx_job_walk_errors").insert({
    account_key: accountKey,
    job_id: jobId,
    resource_type: resourceType,
    sync_batch_id: syncBatchId ?? null,
    error_message: errorMessage,
    http_status: httpStatus,
  });
  if (error) {
    console.warn(`[job-walk] failed to record job_walk_error (${resourceType}) for ${jobId}: ${error.message}`);
  }
}

/**
 * D-15/D-16 pull-scheduling decision for a single job.
 *
 * D-15 (first-sight full pull): if acculynx_raw has ZERO rows for this job's endpoints
 * (matched via api_endpoint LIKE '%/jobs/{jobId}%' — acculynx_raw has no job_id column,
 * so the job id embedded in the archived path is the join key), this is the job's first
 * sight and it must get the full per-job GET surface — force=true, walk unconditionally.
 *
 * D-16 (change-driven re-pull): if prior raw archives DO exist, only re-walk when
 * acculynx_jobs.modified_date is newer than the newest prior archive's created_at for
 * this job — an unchanged, already-fully-pulled job is skipped (force=false, skip=true).
 * A job with no modified_date on record (never diffed) is conservatively re-walked.
 *
 * @returns { walk: boolean, reason: 'first_sight' | 'changed' | 'unchanged' }
 */
async function shouldWalkJob(
  sb: any,
  jobId: string,
  modifiedDate: string | null | undefined,
): Promise<{ walk: boolean; reason: "first_sight" | "changed" | "unchanged" }> {
  // acculynx_raw's timestamp column is `fetched_at`, not `created_at` (confirmed via
  // information_schema against prod, 07-09 live-DB probe). Selecting a nonexistent column
  // made this query fail silently every call (data always undefined/empty), so
  // newestArchive was ALWAYS null and every job was misclassified as first_sight forever —
  // D-16's change-driven skip never actually skipped a single job, meaning job-walk always
  // consumed its full runtime budget and crm_pipeline was never reached (07-09 Task 1 probe:
  // 3 consecutive wichita runs all logged crmPipeline:"skipped").
  const { data: priorRows } = await sb
    .from("acculynx_raw")
    .select("fetched_at")
    .like("api_endpoint", `%/jobs/${jobId}%`)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const newestArchive = priorRows?.[0]?.fetched_at ?? null;
  if (!newestArchive) {
    // D-15: no prior raw archive for this job at all — first-sight full pull.
    return { walk: true, reason: "first_sight" };
  }

  if (!modifiedDate) {
    // Conservative default: no modified_date to compare against — re-walk rather
    // than risk silently skipping a job that has actually changed.
    return { walk: true, reason: "changed" };
  }

  const modified = new Date(modifiedDate);
  const archived = new Date(newestArchive);
  if (isNaN(modified.getTime()) || isNaN(archived.getTime()) || modified > archived) {
    // D-16: job touched since its last full archive — targeted re-pull.
    return { walk: true, reason: "changed" };
  }

  // D-16: unchanged and already fully pulled — skip, do not blanket re-pull hourly.
  return { walk: false, reason: "unchanged" };
}

/**
 * Walk known job IDs to sync sub-resources (invoices, financials, insurance,
 * milestone-history, job-contacts) for a single account.
 *
 * Invoice sub-resource requires a two-level walk:
 *   Level 1: GET /jobs/{jobId}/invoices → list of {id} invoice stubs → upsert acculynx_invoices
 *   Level 2: GET /invoices/{invoiceId} → invoice detail + line items → upsert acculynx_invoice_lines
 *
 * @param sb          - Supabase client (service role)
 * @param acct        - account row (account_key, market for row stamping)
 * @param apiKey      - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline    - epoch ms budget limit (Date.now() >= deadline → stop and save watermark)
 * @param watermark   - current watermark row (last_walked_job_id for resume)
 * @param jobIds              - ordered list of job IDs to walk (from acculynx_jobs for this account)
 * @param fetchFn             - injectable fetch function (defaults to global fetch for prod)
 * @param syncBatchId         - the batch identifier threaded from index.ts, stamped on raw-archive
 *                              rows and error rows for cross-referencing a single sync run
 * @param modifiedDateByJobId - Map<jobId, acculynx_jobs.modified_date> used by the D-16
 *                              change-driven skip (shouldWalkJob). A job absent from this
 *                              map is treated as having no modified_date on record and is
 *                              conservatively re-walked rather than risk a silent skip.
 * @returns                   - Map<jobId, repName> resolved from the full /representatives
 *                              fetch (07-06 Task 2a) — consumed by syncCrmPipeline() for
 *                              crm_pipeline.primary_salesperson. Skipped jobs (D-16) are
 *                              simply absent from the returned map for this run.
 */
export async function syncJobWalk(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  jobIds: string[],
  fetchFn: typeof fetch = fetch,
  syncBatchId?: string,
  modifiedDateByJobId: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  const now = new Date().toISOString();
  const lastWalked = watermark?.last_walked_job_id ?? null;
  const ctxBase = { account_key: acct.account_key, market: acct.market, now };
  const repNameByJobId = new Map<string, string>();
  const userMap = await loadUserNameMap(sb);

  // Resume from where we left off: skip jobs already walked.
  let startIdx = 0;
  if (lastWalked) {
    const idx = jobIds.indexOf(lastWalked);
    if (idx >= 0) startIdx = idx + 1; // start AFTER the last processed job
  }
  // Wrap-around (2026-08-07, MC-68 incident): once the cursor reached the END of an
  // account's list, startIdx === jobIds.length and this loop never executed again —
  // existing jobs were NEVER re-walked, freezing invoices/financials at their
  // initial-sweep values (payments applied in AccuLynx stayed invisible for weeks).
  // When a sweep is complete, start the next sweep from the top; D-16 still skips
  // every unchanged job, so a wrapped pass only re-pulls jobs whose modified_date
  // moved past their newest archive.
  if (startIdx >= jobIds.length && jobIds.length > 0) startIdx = 0;

  for (let i = startIdx; i < jobIds.length; i++) {
    if (Date.now() >= deadline) break;

    const jobId = jobIds[i];

    // D-15/D-16 pull scheduling: skip an unchanged, already-fully-pulled job rather
    // than blanket re-pulling every job every run. A first-sight job (no prior
    // acculynx_raw rows) always proceeds to the full walk below (D-15).
    const { walk } = await shouldWalkJob(sb, jobId, modifiedDateByJobId.get(jobId));
    if (!walk) {
      // Still advance the watermark past a skipped job so resumption doesn't
      // re-evaluate it every run within the same sweep.
      await advanceWatermark(sb, {
        account_key: acct.account_key,
        resource_type: "job_walk",
        last_walked_job_id: jobId,
        last_sync_at: now,
      });
      continue;
    }

    const encodedJobId = encodeURIComponent(jobId);
    const ctx = { ...ctxBase, job_id: jobId };

    // 1. Job contacts
    await sleep(PACE_MS);
    const contactsEndpoint = `/jobs/${encodedJobId}/contacts`;
    const { status: contactsStatus, body: contactsBody } = await acculynxGet(
      `${ACCULYNX_BASE}${contactsEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "job_contacts", contactsEndpoint, contactsStatus, contactsBody);
    const jobContacts: unknown[] = (contactsBody as { items?: unknown[] })?.items ??
      (Array.isArray(contactsBody) ? (contactsBody as unknown[]) : []);
    if (jobContacts.length > 0) {
      const contactRows = jobContacts.map((c: any) => mapJobContact(c, ctx));
      const { error } = await sb.from("acculynx_job_contacts").upsert(contactRows);
      if (error) {
        await recordWalkError(
          sb,
          acct.account_key,
          jobId,
          "job_contacts",
          syncBatchId,
          error.message,
          contactsStatus,
        );
      }
    }

    // 2. Financials (single object, not paginated)
    await sleep(PACE_MS);
    const financialsEndpoint = `/jobs/${encodedJobId}/financials`;
    const { status: financialsStatus, body: financialsBody } = await acculynxGet(
      `${ACCULYNX_BASE}${financialsEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "job_financials", financialsEndpoint, financialsStatus, financialsBody);
    if (financialsBody && typeof financialsBody === "object" && !Array.isArray(financialsBody)) {
      const finRow = mapJobFinancials(financialsBody, ctx);
      const { error } = await sb.from("acculynx_job_financials").upsert([finRow]);
      if (error) {
        await recordWalkError(
          sb,
          acct.account_key,
          jobId,
          "job_financials",
          syncBatchId,
          error.message,
          financialsStatus,
        );
      }
    }

    // 3. Insurance (single object)
    await sleep(PACE_MS);
    const insuranceEndpoint = `/jobs/${encodedJobId}/insurance`;
    const { status: insuranceStatus, body: insuranceBody } = await acculynxGet(
      `${ACCULYNX_BASE}${insuranceEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "job_insurance", insuranceEndpoint, insuranceStatus, insuranceBody);
    if (insuranceBody && typeof insuranceBody === "object" && !Array.isArray(insuranceBody)) {
      // acculynx_job_insurance.insurance_company_id FKs to acculynx_insurance_carriers.id, a
      // reference table designed in migration 169 ("Shared reference table... ingested in
      // Plan 03") but never actually populated by any sync path — every insurance upsert with
      // a non-null insuranceCompany.id was failing the FK (07-09 live-DB probe: 21/21 recent
      // job_insurance errors were this FK violation). Upsert the carrier stub from the same
      // response body (it already carries insuranceCompany.id/name) before the detail row, so
      // the FK is satisfied without inventing a separate carrier-list sync resource.
      const insuranceBodyAny = insuranceBody as { insuranceCompany?: { id?: string; name?: string } };
      const carrierId = insuranceBodyAny?.insuranceCompany?.id ?? null;
      if (carrierId) {
        const { error: carrierError } = await sb.from("acculynx_insurance_carriers").upsert([{
          id: carrierId,
          name: insuranceBodyAny?.insuranceCompany?.name ?? null,
          account_key: acct.account_key,
          market: acct.market,
          last_seen_by_api: ctx.now,
          synced_at: ctx.now,
        }]);
        if (carrierError) {
          await recordWalkError(
            sb,
            acct.account_key,
            jobId,
            "insurance_carrier",
            syncBatchId,
            carrierError.message,
            insuranceStatus,
          );
        }
      }
      const insRow = mapJobInsurance(insuranceBody, ctx);
      const { error } = await sb.from("acculynx_job_insurance").upsert([insRow]);
      if (error) {
        await recordWalkError(
          sb,
          acct.account_key,
          jobId,
          "job_insurance",
          syncBatchId,
          error.message,
          insuranceStatus,
        );
      }
    }

    // 4. Milestone history
    await sleep(PACE_MS);
    const msEndpoint = `/jobs/${encodedJobId}/milestone-history`;
    const { status: msStatus, body: msBody } = await acculynxGet(
      `${ACCULYNX_BASE}${msEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "milestone_history", msEndpoint, msStatus, msBody);
    const msItems: unknown[] = (msBody as { items?: unknown[] })?.items ??
      (Array.isArray(msBody) ? (msBody as unknown[]) : []);
    if (msItems.length > 0) {
      const msRows = msItems.map((m: any) => mapMilestoneHistoryItem(m, ctx));
      // onConflict targets the natural unique index (job_id, milestone_name, milestone_date):
      // `id` is a GENERATED ALWAYS IDENTITY column on the live table and is never sent in
      // msRows, so the upsert cannot rely on the (unsent) primary key as its default target.
      const { error } = await sb
        .from("acculynx_job_milestone_history")
        .upsert(msRows, { onConflict: "job_id,milestone_name,milestone_date" });
      if (error) {
        await recordWalkError(
          sb,
          acct.account_key,
          jobId,
          "milestone_history",
          syncBatchId,
          error.message,
          msStatus,
        );
      }
    }

    // 5. Invoices — Level 1: list of invoice stubs
    await sleep(PACE_MS);
    const invListEndpoint = `/jobs/${encodedJobId}/invoices?pageSize=25&pageStartIndex=0`;
    const { status: invListStatus, body: invListBody } = await acculynxGet(
      `${ACCULYNX_BASE}${invListEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "invoices", invListEndpoint, invListStatus, invListBody);
    const invoiceStubs: any[] = (invListBody as { items?: any[] })?.items ??
      (Array.isArray(invListBody) ? (invListBody as any[]) : []);

    if (invoiceStubs.length > 0) {
      // Upsert invoice headers
      const headerRows = invoiceStubs.map((inv: any) => mapInvoiceHeader(inv, ctx));
      const { error: hErr } = await sb.from("acculynx_invoices").upsert(headerRows);
      if (hErr) {
        await recordWalkError(
          sb,
          acct.account_key,
          jobId,
          "invoices",
          syncBatchId,
          hErr.message,
          invListStatus,
        );
      }

      // 6. Level 2: per-invoice detail + line items
      for (const stub of invoiceStubs) {
        if (Date.now() >= deadline) break;
        await sleep(PACE_MS);
        const encodedInvoiceId = encodeURIComponent(stub.id);
        const invDetailEndpoint = `/invoices/${encodedInvoiceId}`;
        const { status: invDetailStatus, body: invDetail } = await acculynxGet(
          `${ACCULYNX_BASE}${invDetailEndpoint}`,
          apiKey,
          fetchFn,
        );
        await archiveRaw(sb, syncBatchId, "invoice_lines", invDetailEndpoint, invDetailStatus, invDetail);
        const lines: unknown[] = (invDetail as { lineItems?: unknown[] })?.lineItems ??
          (invDetail as { items?: unknown[] })?.items ?? [];
        if (lines.length > 0) {
          const lineCtx = { ...ctxBase, job_id: jobId, invoice_id: stub.id };
          const lineRows = lines.map((l: any) => mapInvoiceLine(l, lineCtx));
          const { error: lErr } = await sb.from("acculynx_invoice_lines").upsert(lineRows);
          if (lErr) {
            await recordWalkError(
              sb,
              acct.account_key,
              jobId,
              "invoice_lines",
              syncBatchId,
              lErr.message,
              invDetailStatus,
            );
          }
        }
      }
    }

    // 7. Representatives — FULL collection (not /sales-owner, which is 204-empty for
    // KS-11 and any job with no assigned sales-owner). Archived to acculynx_raw (D-14)
    // and resolved to the company/primary rep's name via acculynx_users, returned in
    // the jobId->repName Map that syncCrmPipeline() consumes for primary_salesperson
    // (07-06 Task 2a; VERIFICATION gap 3).
    await sleep(PACE_MS);
    const repsEndpoint = `/jobs/${encodedJobId}/representatives`;
    const { status: repsStatus, body: repsBody } = await acculynxGet(
      `${ACCULYNX_BASE}${repsEndpoint}`,
      apiKey,
      fetchFn,
    );
    await archiveRaw(sb, syncBatchId, "representatives", repsEndpoint, repsStatus, repsBody);
    if (repsStatus === 200) {
      // Part 3 hardening (2026-07-06): resolve via acculynx_users, and on a cache miss
      // fetch GET /users/{id} with this account's key so a cross-tenant rep never leaks
      // as a bare GUID into primary_salesperson.
      const repName = await resolveRepNameWithFetch(repsBody, userMap, sb, apiKey, fetchFn);
      if (repName) repNameByJobId.set(jobId, repName);
    }

    // Advance watermark AFTER each job is fully processed (before budget check)
    // so next run resumes from the next job (Pitfall 5). Uses the shared upsert
    // helper so an account whose (account_key,'job_walk') row was never seeded
    // advances instead of silently no-opping (VERIFICATION gap 4).
    await advanceWatermark(sb, {
      account_key: acct.account_key,
      resource_type: "job_walk",
      last_walked_job_id: jobId,
      last_sync_at: now,
    });
  }

  return repNameByJobId;
}
