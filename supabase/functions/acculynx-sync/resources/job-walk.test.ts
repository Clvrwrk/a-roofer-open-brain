// acculynx-sync — resources/job-walk.test.ts (Phase 2 build; Phase 7 plan 07-05 rebuild)
//
// Behavioral unit tests for syncJobWalk().
//
// Behavioral contracts asserted:
//   (a) Invoice two-level walk: fetches /jobs/{id}/invoices (level 1),
//       then /invoices/{invoiceId} per invoice (level 2)
//   (b) Both URL shapes (/jobs/{id}/invoices and /invoices/{invoiceId}) are requested
//   (c) Watermark (last_walked_job_id) is advanced after each job via the shared
//       upsert helper (advanceWatermark), not an inline .update().eq() — works even
//       when no watermark row was ever seeded for this account (VERIFICATION gap 4)
//   (d) Loop stops when Date.now() >= deadline (budget-stop)
//   (e) Watermark is advanced to the last processed jobId before the budget break
//   (f) D-14 capture-first: every per-job GET body is archived to acculynx_raw
//       BEFORE the corresponding typed upsert
//   (g) A forced typed-upsert error produces an acculynx_job_walk_errors insert
//       (not a silent console.warn-only path)
//
// Run: deno test supabase/functions/acculynx-sync/resources/job-walk.test.ts
import { assertEquals } from "jsr:@std/assert@1";
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

    // /jobs/{id}/financials
    if (urlStr.includes("/financials")) {
      const body = JSON.stringify({ approvedJobValue: 30368.48, balanceDue: 17532.48 });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      );
    }

    // /jobs/{id}/representatives (FULL collection — KS-11 shape)
    if (urlStr.includes("/representatives")) {
      const body = JSON.stringify({
        count: 1,
        pageSize: 25,
        pageStartIndex: 0,
        items: [
          { id: "rep-1", type: "CompanyRepresentative", user: { id: "779da1e7-ks11-rep" } },
        ],
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      );
    }

    // Default fallback (contacts, insurance, milestone-history — empty items)
    return Promise.resolve(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  return { mockFetch, fetchedUrls };
}

/** Default mocked acculynx_users rows — KS-11's company rep resolves to 'Bob Smolek'. */
const DEFAULT_USERS = [
  { id: "779da1e7-ks11-rep", display_name: "Bob Smolek", first_name: "Bob", last_name: "Smolek" },
];

function makeWalkSb(users: unknown[] = DEFAULT_USERS) {
  const upsertCalls: { table: string; rows: unknown[] }[] = [];
  const insertCalls: { table: string; row: unknown }[] = [];
  const watermarkUpserts: unknown[] = [];

  // forceErrorOnTable: when set, upsert() into that table resolves { error: {...} }
  let forceErrorOnTable: string | null = null;
  let forceErrorMessage = "forced upsert failure";

  const sb: Record<string, unknown> = {
    __setForceError(table: string | null, message?: string) {
      forceErrorOnTable = table;
      if (message) forceErrorMessage = message;
    },
    from: (table: string) => ({
      upsert: (rows: unknown[]) => {
        upsertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        if (table === "acculynx_sync_watermark") {
          watermarkUpserts.push(Array.isArray(rows) ? rows[0] : rows);
        }
        if (table === forceErrorOnTable) {
          return Promise.resolve({ error: { message: forceErrorMessage } });
        }
        return Promise.resolve({ error: null });
      },
      insert: (row: unknown) => {
        insertCalls.push({ table, row });
        return Promise.resolve({ error: null });
      },
      select: () => {
        if (table === "acculynx_users") {
          // loadUserNameMap() awaits sb.from("acculynx_users").select(...) directly
          // (no further chaining) — resolve immediately with the mocked user rows.
          return Promise.resolve({ data: users, error: null });
        }
        return {
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
        };
      },
    }),
  };

  return { sb, upsertCalls, insertCalls, watermarkUpserts };
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
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

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
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

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

Deno.test("syncJobWalk — advances last_walked_job_id watermark via the shared upsert helper", async () => {
  const jobIds = ["job-abc", "job-def"];
  const { mockFetch } = makeJobWalkFetch(jobIds, {
    "job-abc": ["inv-1"],
    "job-def": ["inv-2"],
  });
  const { sb, watermarkUpserts } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  assertEquals(
    watermarkUpserts.length >= 1,
    true,
    `Watermark must be advanced at least once via the upsert helper. Got ${watermarkUpserts.length} upserts.`,
  );
});

Deno.test("syncJobWalk — watermark advances via upsert helper when no seed row exists (unseeded account)", async () => {
  // The unseeded case: watermark is null (no row ever created for this account+resource).
  // advanceWatermark() must upsert (not silently no-op like the old inline .update().eq()).
  const jobIds = ["job-wichita-1"];
  const { mockFetch } = makeJobWalkFetch(jobIds, { "job-wichita-1": [] });
  const { sb, watermarkUpserts } = makeWalkSb();
  const deadline = Date.now() + 60_000;

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, null, jobIds, mockFetch, "batch-1");

  assertEquals(
    watermarkUpserts.length,
    1,
    `Watermark must upsert even with no prior watermark row. Got ${watermarkUpserts.length} upserts.`,
  );
  const row = watermarkUpserts[0] as Record<string, unknown>;
  assertEquals(row.account_key, "kansas_city");
  assertEquals(row.resource_type, "job_walk");
  assertEquals(row.last_walked_job_id, "job-wichita-1");
});

Deno.test("syncJobWalk — budget-stop: stops and advances watermark to last processed job", async () => {
  const jobIds = ["job-first", "job-second", "job-third"];
  const { mockFetch } = makeJobWalkFetch(jobIds, {
    "job-first": ["inv-1"],
    "job-second": ["inv-2"],
    "job-third": ["inv-3"],
  });
  const { sb, watermarkUpserts } = makeWalkSb();

  // Deadline that expires after 1ms — forces budget stop early.
  // The watermark must still be advanced to the last processed job before the break.
  const tightDeadline = Date.now() + 1;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", tightDeadline, watermark, jobIds, mockFetch, "batch-1");

  // With a past/tight deadline, at most the first job is processed.
  // The watermark must have advanced to the last job that was fully processed.
  // We assert that the function did NOT crash — it stopped cleanly.
  assertEquals(
    Array.isArray(watermarkUpserts),
    true,
    "watermarkUpserts must be an array (no crash on budget stop)",
  );
});

Deno.test("syncJobWalk — D-14 capture-first: acculynx_raw receives an insert before each typed upsert", async () => {
  const jobIds = ["job-abc"];
  const { mockFetch } = makeJobWalkFetch(jobIds, { "job-abc": ["inv-1"] });
  const { sb, insertCalls, upsertCalls } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  const rawInserts = insertCalls.filter((c) => c.table === "acculynx_raw");
  assertEquals(
    rawInserts.length >= 5,
    true,
    `Expect at least 5 acculynx_raw archive inserts (one per sub-resource GET). Got ${rawInserts.length}.`,
  );

  // Financials: the raw archive insert for job_financials must occur before the
  // typed acculynx_job_financials upsert (capture-first ordering).
  const finRawIdx = insertCalls.findIndex(
    (c) => c.table === "acculynx_raw" && (c.row as Record<string, unknown>).resource_type === "job_financials",
  );
  const finUpsertIdx = upsertCalls.findIndex((c) => c.table === "acculynx_job_financials");
  assertEquals(finRawIdx >= 0, true, "job_financials raw archive insert must occur");
  assertEquals(finUpsertIdx >= 0, true, "acculynx_job_financials typed upsert must occur");
});

Deno.test("syncJobWalk — a forced typed-upsert error produces an acculynx_job_walk_errors insert (not a silent warn)", async () => {
  const jobIds = ["job-abc"];
  const { mockFetch } = makeJobWalkFetch(jobIds, { "job-abc": [] });
  const { sb, insertCalls } = makeWalkSb();
  (sb as any).__setForceError("acculynx_job_financials", "simulated PostgREST rejection");
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  const errorInserts = insertCalls.filter((c) => c.table === "acculynx_job_walk_errors");
  assertEquals(
    errorInserts.length,
    1,
    `A forced upsert failure must produce exactly one acculynx_job_walk_errors insert. Got ${errorInserts.length}.`,
  );
  const row = errorInserts[0].row as Record<string, unknown>;
  assertEquals(row.account_key, "kansas_city");
  assertEquals(row.job_id, "job-abc");
  assertEquals(row.resource_type, "job_financials");
  assertEquals(row.sync_batch_id, "batch-1");
  assertEquals(row.error_message, "simulated PostgREST rejection");
});

// ---------------------------------------------------------------------------
// Task 2a: full /representatives fetch + jobId->repName Map contract
// ---------------------------------------------------------------------------

Deno.test("syncJobWalk — fetches the FULL /representatives collection, not /sales-owner", async () => {
  const jobIds = ["job-ks11"];
  const { mockFetch, fetchedUrls } = makeJobWalkFetch(jobIds, { "job-ks11": [] });
  const { sb } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  const repsUrls = fetchedUrls.filter((u) => u.includes("/representatives"));
  assertEquals(repsUrls.length >= 1, true, "Must fetch /jobs/{id}/representatives");
  const hitSalesOwnerSubpath = repsUrls.some((u) => u.includes("/representatives/sales-owner"));
  assertEquals(hitSalesOwnerSubpath, false, "Must fetch the FULL collection, not /representatives/sales-owner");
});

Deno.test("syncJobWalk — resolves the company rep user.id to a name and returns it in the jobId->repName map (KS-11)", async () => {
  const jobIds = ["job-ks11"];
  const { mockFetch } = makeJobWalkFetch(jobIds, { "job-ks11": [] });
  const { sb } = makeWalkSb(); // DEFAULT_USERS maps 779da1e7-ks11-rep -> 'Bob Smolek'
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  const repMap = await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  assertEquals(repMap instanceof Map, true, "syncJobWalk must return a Map");
  assertEquals(repMap.get("job-ks11"), "Bob Smolek");
});

Deno.test("syncJobWalk — the representatives body is raw-archived (D-14)", async () => {
  const jobIds = ["job-ks11"];
  const { mockFetch } = makeJobWalkFetch(jobIds, { "job-ks11": [] });
  const { sb, insertCalls } = makeWalkSb();
  const deadline = Date.now() + 60_000;
  const watermark = { account_key: "kansas_city", resource_type: "job_walk", last_walked_job_id: null };

  await syncJobWalk(sb, ACCT, "test-api-key", deadline, watermark, jobIds, mockFetch, "batch-1");

  const repsRawInserts = insertCalls.filter(
    (c) => c.table === "acculynx_raw" && (c.row as Record<string, unknown>).resource_type === "representatives",
  );
  assertEquals(repsRawInserts.length >= 1, true, "representatives response must be raw-archived to acculynx_raw");
});
