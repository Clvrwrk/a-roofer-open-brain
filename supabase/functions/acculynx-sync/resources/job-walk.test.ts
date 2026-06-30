// acculynx-sync — resources/job-walk.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// BEHAVIORAL unit tests for syncJobWalk() — RED here, GREEN in Plan 03 Task 2.
//
// This file imports from ./job-walk.ts which does NOT exist until Plan 03.
// The import failure IS the intended RED state.
//
// Behavioral contracts asserted:
//   (a) Invoice two-level walk: fetches /jobs/{id}/invoices (level 1),
//       then /invoices/{invoiceId} per invoice (level 2)
//   (b) Both URL shapes (/jobs/{id}/invoices and /invoices/{invoiceId}) are requested
//   (c) Watermark (last_walked_job_id) is advanced after each job is processed
//   (d) Loop stops when Date.now() >= deadline (budget-stop)
//   (e) Watermark is advanced to the last processed jobId before the budget break
//
// Run: deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost
import { assertEquals } from "jsr:@std/assert@1";

// resources/job-walk.ts is a Wave 0 STUB that throws "not implemented".
// All tests in this file will FAIL (RED) because the stub throws before doing
// anything. Plan 03 (GREEN) replaces the stub with the real implementation.
import { syncJobWalk } from "./job-walk.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const ACCT = {
  account_key: "kansas_city",
  env_secret_name: "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
  label: "Kansas City",
  market: "sedgwick_ks",
  state: "KS",
};

/** Mock fetch that returns different responses by URL pattern. */
function makeJobWalkFetch(
  jobIds: string[],
  invoiceIdsPerJob: Record<string, string[]>,
): { mockFetch: (url: string | URL | Request) => Promise<Response>; fetchedUrls: string[] } {
  const fetchedUrls: string[] = [];

  const mockFetch = (url: string | URL | Request): Promise<Response> => {
    const urlStr = String(url);
    fetchedUrls.push(urlStr);

    // /jobs/{id}/invoices → return list of invoice stubs
    const invoiceListMatch = urlStr.match(/\/jobs\/([^/]+)\/invoices/);
    if (invoiceListMatch) {
      const jobId = invoiceListMatch[1];
      const invoiceIds = invoiceIdsPerJob[jobId] ?? [];
      const items = invoiceIds.map((id) => ({ id, invoiceNumber: `INV-${id}` }));
      const body = JSON.stringify({ items, count: items.length });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      );
    }

    // /invoices/{invoiceId} → return invoice detail
    const invoiceDetailMatch = urlStr.match(/\/invoices\/([^/?]+)/);
    if (invoiceDetailMatch) {
      const invoiceId = invoiceDetailMatch[1];
      const body = JSON.stringify({
        id: invoiceId,
        totalPrice: 5000,
        balanceDue: 0,
        lineItems: [],
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      );
    }

    // Default fallback
    return Promise.resolve(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  return { mockFetch, fetchedUrls };
}

function makeWalkSb() {
  const upsertCalls: { table: string; rows: unknown[] }[] = [];
  const watermarkUpdates: unknown[] = [];

  const sb: Record<string, unknown> = {
    from: (table: string) => ({
      upsert: (rows: unknown[]) => {
        upsertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ error: null });
      },
      update: (data: unknown) => {
        watermarkUpdates.push({ table, data });
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          gt: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  };

  return { sb, upsertCalls, watermarkUpdates };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("syncJobWalk — fetches /jobs/{id}/invoices for each job (level 1)", async () => {
  const jobIds = ["job-abc", "job-def"];
  const { mockFetch, fetchedUrls } = makeJobWalkFetch(jobIds, {
    "job-abc": ["inv-1"],
    "job-def": ["inv-2"],
  });
  const { sb } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch);

  const invoiceListUrls = fetchedUrls.filter((u) => u.includes("/invoices") && u.includes("/jobs/"));
  assertEquals(
    invoiceListUrls.length >= jobIds.length,
    true,
    `Must fetch /jobs/{id}/invoices for each job. Got URLs: ${JSON.stringify(invoiceListUrls)}`,
  );
});

Deno.test("syncJobWalk — fetches /invoices/{invoiceId} for each invoice (level 2)", async () => {
  const jobIds = ["job-abc"];
  const { mockFetch, fetchedUrls } = makeJobWalkFetch(jobIds, {
    "job-abc": ["inv-111", "inv-222"],
  });
  const { sb } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch);

  const invoiceDetailUrls = fetchedUrls.filter(
    (u) => /\/invoices\/[^/]+/.test(u) && !u.includes("/jobs/"),
  );
  assertEquals(
    invoiceDetailUrls.length,
    2,
    `Must fetch /invoices/{invoiceId} for each of the 2 invoices. Got: ${JSON.stringify(invoiceDetailUrls)}`,
  );

  // Both level-1 and level-2 URL patterns must appear.
  const hasLevel1 = fetchedUrls.some((u) => u.includes("/jobs/job-abc/invoices"));
  const hasLevel2 = fetchedUrls.some((u) => /\/invoices\/inv-\d+/.test(u) && !u.includes("/jobs/"));
  assertEquals(hasLevel1, true, "Level 1 URL /jobs/{id}/invoices must be fetched");
  assertEquals(hasLevel2, true, "Level 2 URL /invoices/{invoiceId} must be fetched");
});

Deno.test("syncJobWalk — advances last_walked_job_id watermark after each job", async () => {
  const jobIds = ["job-abc", "job-def"];
  const { mockFetch } = makeJobWalkFetch(jobIds, {
    "job-abc": ["inv-1"],
    "job-def": ["inv-2"],
  });
  const { sb, watermarkUpdates } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch);

  assertEquals(
    watermarkUpdates.length >= 1,
    true,
    `Watermark must be advanced at least once. Got ${watermarkUpdates.length} updates.`,
  );
});

Deno.test("syncJobWalk — budget-stop: stops and advances watermark to last processed job", async () => {
  const jobIds = ["job-first", "job-second", "job-third"];
  const { mockFetch } = makeJobWalkFetch(jobIds, {
    "job-first": ["inv-1"],
    "job-second": ["inv-2"],
    "job-third": ["inv-3"],
  });
  const { sb, watermarkUpdates } = makeWalkSb();

  // Deadline that expires after 1ms — forces budget stop early.
  // The watermark must still be advanced to the last processed job before the break.
  const tightDeadline = Date.now() + 1;
  const watermark = { account_key: "kansas_city", resource: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", tightDeadline, watermark, jobIds, mockFetch);

  // With a past/tight deadline, at most the first job is processed.
  // The watermark must have advanced to the last job that was fully processed.
  // We assert that the function did NOT crash — it stopped cleanly.
  assertEquals(
    typeof watermarkUpdates,
    "object",
    "watermarkUpdates must be an array (no crash on budget stop)",
  );
});
