// acculynx-sync — resources/job-walk.ts (Phase 2, plan 02-03)
//
// Per-job sub-resource walk with invoice two-level walk and budget resumption.
//
// For each job in the provided jobIds list (ordered, starting from watermark.last_walked_job_id):
//   1. GET /jobs/{jobId}/contacts → upsert acculynx_job_contacts
//   2. GET /jobs/{jobId}/financials → upsert acculynx_job_financials
//   3. GET /jobs/{jobId}/insurance → upsert acculynx_job_insurance
//   4. GET /jobs/{jobId}/milestone-history → upsert acculynx_job_milestone_history
//   5. GET /jobs/{jobId}/invoices (level 1) → upsert acculynx_invoices headers
//   6. For each invoice: GET /invoices/{invoiceId} (level 2) → upsert acculynx_invoice_lines
//
// Watermark: last_walked_job_id advanced AFTER each job (before budget check)
// so resumption picks up from the next job (Pitfall 5).
//
// GUID path params are URL-encoded (ASVS V5 / T-02-08).
// apiKey is an explicit parameter — never a module-level constant (T-02-04 / Pitfall 3).

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
 * Walk known job IDs to sync sub-resources (invoices, financials, insurance,
 * milestone-history, job-contacts) for a single account.
 *
 * Invoice sub-resource requires a two-level walk:
 *   Level 1: GET /jobs/{jobId}/invoices → list of {id} invoice stubs → upsert acculynx_invoices
 *   Level 2: GET /invoices/{invoiceId} → invoice detail + line items → upsert acculynx_invoice_lines
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market for row stamping)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop and save watermark)
 * @param watermark  - current watermark row (last_walked_job_id for resume)
 * @param jobIds     - ordered list of job IDs to walk (from acculynx_jobs for this account)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncJobWalk(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  jobIds: string[],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const now = new Date().toISOString();
  const lastWalked = watermark?.last_walked_job_id ?? null;

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

    // 1. Job contacts
    await sleep(PACE_MS);
    const { body: contactsBody } = await acculynxGet(
      `${ACCULYNX_BASE}/jobs/${encodedJobId}/contacts`,
      apiKey,
      fetchFn,
    );
    const jobContacts: unknown[] = (contactsBody as { items?: unknown[] })?.items ??
      (Array.isArray(contactsBody) ? (contactsBody as unknown[]) : []);
    if (jobContacts.length > 0) {
      const contactRows = jobContacts.map((c: any) => ({
        ...c,
        job_id: jobId,
        account_key: acct.account_key,
        market: acct.market,
        last_seen_by_api: now,
        synced_at: now,
        raw: c,
      }));
      const { error } = await sb.from("acculynx_job_contacts").upsert(contactRows);
      if (error) console.warn(`[job-walk] job_contacts upsert for ${jobId}: ${error.message}`);
    }

    // 2. Financials (single object, not paginated)
    await sleep(PACE_MS);
    const { body: financialsBody } = await acculynxGet(
      `${ACCULYNX_BASE}/jobs/${encodedJobId}/financials`,
      apiKey,
      fetchFn,
    );
    if (financialsBody && typeof financialsBody === "object" && !Array.isArray(financialsBody)) {
      const finRow = {
        ...(financialsBody as Record<string, unknown>),
        job_id: jobId,
        account_key: acct.account_key,
        market: acct.market,
        last_seen_by_api: now,
        synced_at: now,
        raw: financialsBody,
      };
      const { error } = await sb.from("acculynx_job_financials").upsert([finRow]);
      if (error) console.warn(`[job-walk] job_financials upsert for ${jobId}: ${error.message}`);
    }

    // 3. Insurance (single object)
    await sleep(PACE_MS);
    const { body: insuranceBody } = await acculynxGet(
      `${ACCULYNX_BASE}/jobs/${encodedJobId}/insurance`,
      apiKey,
      fetchFn,
    );
    if (insuranceBody && typeof insuranceBody === "object" && !Array.isArray(insuranceBody)) {
      const insRow = {
        ...(insuranceBody as Record<string, unknown>),
        job_id: jobId,
        account_key: acct.account_key,
        market: acct.market,
        last_seen_by_api: now,
        synced_at: now,
        raw: insuranceBody,
      };
      const { error } = await sb.from("acculynx_job_insurance").upsert([insRow]);
      if (error) console.warn(`[job-walk] job_insurance upsert for ${jobId}: ${error.message}`);
    }

    // 4. Milestone history
    await sleep(PACE_MS);
    const { body: msBody } = await acculynxGet(
      `${ACCULYNX_BASE}/jobs/${encodedJobId}/milestone-history`,
      apiKey,
      fetchFn,
    );
    const msItems: unknown[] = (msBody as { items?: unknown[] })?.items ??
      (Array.isArray(msBody) ? (msBody as unknown[]) : []);
    if (msItems.length > 0) {
      const msRows = msItems.map((m: any) => ({
        ...m,
        job_id: jobId,
        account_key: acct.account_key,
        market: acct.market,
        last_seen_by_api: now,
        synced_at: now,
        raw: m,
      }));
      const { error } = await sb.from("acculynx_job_milestone_history").upsert(msRows);
      if (error) console.warn(`[job-walk] milestone_history upsert for ${jobId}: ${error.message}`);
    }

    // 5. Invoices — Level 1: list of invoice stubs
    await sleep(PACE_MS);
    const { body: invListBody } = await acculynxGet(
      `${ACCULYNX_BASE}/jobs/${encodedJobId}/invoices?pageSize=25&pageStartIndex=0`,
      apiKey,
      fetchFn,
    );
    const invoiceStubs: any[] = (invListBody as { items?: any[] })?.items ??
      (Array.isArray(invListBody) ? (invListBody as any[]) : []);

    if (invoiceStubs.length > 0) {
      // Upsert invoice headers
      const headerRows = invoiceStubs.map((inv: any) => ({
        ...inv,
        job_id: jobId,
        account_key: acct.account_key,
        market: acct.market,
        last_seen_by_api: now,
        synced_at: now,
        raw: inv,
      }));
      const { error: hErr } = await sb.from("acculynx_invoices").upsert(headerRows);
      if (hErr) console.warn(`[job-walk] invoices upsert for ${jobId}: ${hErr.message}`);

      // 6. Level 2: per-invoice detail + line items
      for (const stub of invoiceStubs) {
        if (Date.now() >= deadline) break;
        await sleep(PACE_MS);
        const encodedInvoiceId = encodeURIComponent(stub.id);
        const { body: invDetail } = await acculynxGet(
          `${ACCULYNX_BASE}/invoices/${encodedInvoiceId}`,
          apiKey,
          fetchFn,
        );
        const lines: unknown[] = (invDetail as { lineItems?: unknown[] })?.lineItems ??
          (invDetail as { items?: unknown[] })?.items ?? [];
        if (lines.length > 0) {
          const lineRows = lines.map((l: any) => ({
            ...l,
            invoice_id: stub.id,
            job_id: jobId,
            account_key: acct.account_key,
            market: acct.market,
            last_seen_by_api: now,
            synced_at: now,
            raw: l,
          }));
          const { error: lErr } = await sb.from("acculynx_invoice_lines").upsert(lineRows);
          if (lErr) console.warn(`[job-walk] invoice_lines upsert for ${stub.id}: ${lErr.message}`);
        }
      }
    }

    // Advance watermark AFTER each job is fully processed (before budget check)
    // so next run resumes from the next job (Pitfall 5).
    const { error: wmErr } = await sb
      .from("acculynx_sync_watermark")
      .update({ last_walked_job_id: jobId, last_sync_at: now })
      .eq("account_key", acct.account_key)
      .eq("resource_type", "job_walk");
    if (wmErr) console.warn(`[job-walk] watermark update for ${jobId}: ${wmErr.message}`);
  }
}
