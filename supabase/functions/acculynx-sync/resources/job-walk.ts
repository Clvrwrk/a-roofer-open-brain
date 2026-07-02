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
// SCHEDULING around this walk — see shouldFullyPull() below. Task 2a's full-representatives
// fetch + jobId->repName Map contract is unchanged by that layer.
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
 * @param jobIds      - ordered list of job IDs to walk (from acculynx_jobs for this account)
 * @param fetchFn     - injectable fetch function (defaults to global fetch for prod)
 * @param syncBatchId - the batch identifier threaded from index.ts, stamped on raw-archive
 *                      rows and error rows for cross-referencing a single sync run
 * @returns           - Map<jobId, repName> resolved from the full /representatives fetch
 *                      (07-06 Task 2a) — consumed by syncCrmPipeline() for
 *                      crm_pipeline.primary_salesperson.
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

  for (let i = startIdx; i < jobIds.length; i++) {
    if (Date.now() >= deadline) break;

    const jobId = jobIds[i];
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
      const { error } = await sb.from("acculynx_job_milestone_history").upsert(msRows);
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
      const repName = resolveCompanyRepName(repsBody, userMap);
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
