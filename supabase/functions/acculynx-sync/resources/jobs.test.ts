// acculynx-sync — resources/jobs.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// BEHAVIORAL unit tests for syncJobs() — RED here, GREEN in Plan 03 Task 2.
//
// This file imports from ./jobs.ts which does NOT exist until Plan 03.
// The import failure IS the intended RED state.
//
// Behavioral contracts asserted:
//   (a) URL pagination param is `recordStartIndex` (NOT pageStartIndex — Pitfall 2)
//   (b) URL includes dateFilterType=ModifiedDate (jobs support date filtering)
//   (c) Every upserted row carries account_key AND market from the passed acct
//   (d) last_seen_by_api is set on every upserted row
//   (e) Loop stops when Date.now() >= deadline (budget-stop)
//
// Run: deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost
import { assertEquals } from "jsr:@std/assert@1";

// resources/jobs.ts is a Wave 0 STUB that throws "not implemented".
// All tests in this file will FAIL (RED) because the stub throws before doing
// anything. Plan 03 (GREEN) replaces the stub with the real implementation.
import { syncJobs } from "./jobs.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Minimal canned API page for jobs. */
function makeJobsPages(pages: unknown[][]): () => Promise<Response> {
  let call = 0;
  return () => {
    const items = pages[call] ?? [];
    call++;
    const body = JSON.stringify({ items, count: pages[0]?.length ?? 0 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

function makeUpsertSb() {
  const upsertCalls: { rows: unknown[]; options: unknown }[] = [];
  const sb: Record<string, unknown> = {
    from: () => sb,
    upsert: (rows: unknown[], options: unknown) => {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: null });
    },
  };
  return { sb, upsertCalls };
}

const ACCT = {
  account_key: "florida",
  env_secret_name: "PE_CC_FLORIDA_ACCULYNX_API_KEY",
  label: "Florida",
  market: "fl_other",
  state: "FL",
};

// A minimal watermark (startDate for the date-windowed query).
const WATERMARK = {
  account_key: "florida",
  resource: "jobs",
  last_modified_date: "2026-06-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("syncJobs — URL pagination param is recordStartIndex (not pageStartIndex)", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("recordStartIndex"),
    true,
    `URL must contain 'recordStartIndex' but got: ${firstUrl}`,
  );
  assertEquals(
    firstUrl.includes("pageStartIndex"),
    false,
    `URL must NOT contain 'pageStartIndex' (jobs uses recordStartIndex, not pageStartIndex)`,
  );
});

Deno.test("syncJobs — URL includes dateFilterType=ModifiedDate", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("dateFilterType=ModifiedDate"),
    true,
    `URL must include 'dateFilterType=ModifiedDate' but got: ${firstUrl}`,
  );
});

Deno.test("syncJobs — stamps account_key on every upserted row", async () => {
  const pages = [
    [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }, { id: "j-2", modifiedDate: "2026-06-16T12:00:00Z" }],
    [],
  ];
  const mockFetch = makeJobsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  assertEquals(upsertCalls.length > 0, true, "upsert must be called");
  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.account_key,
        "florida",
        `Every row must carry account_key='florida', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncJobs — stamps market on every upserted row", async () => {
  const pages = [
    [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }],
    [],
  ];
  const mockFetch = makeJobsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.market,
        "fl_other",
        `Every row must carry market='fl_other', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncJobs — sets last_seen_by_api on every upserted row", async () => {
  const pages = [[{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }], []];
  const mockFetch = makeJobsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        typeof row.last_seen_by_api,
        "string",
        "last_seen_by_api must be an ISO string on every row",
      );
    }
  }
});

Deno.test("syncJobs — budget-stop: no fetch beyond a past deadline", async () => {
  let fetchCount = 0;
  const mockFetch = () => {
    fetchCount++;
    const body = JSON.stringify({ items: [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }], count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const pastDeadline = Date.now() - 1;
  await syncJobs(sb, ACCT, "test-api-key", pastDeadline, WATERMARK, mockFetch);

  assertEquals(
    fetchCount,
    0,
    `With a past deadline, syncJobs must make 0 fetch calls, got: ${fetchCount}`,
  );
});

// ---------------------------------------------------------------------------
// Fix SC3: Full-history floor — null watermark must default to 2000-01-01
// ---------------------------------------------------------------------------

Deno.test("syncJobs — null watermark uses 2000-01-01 as startDate (full-history floor)", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    // Return one page then empty to end the loop
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "j-1", modifiedDate: "2020-01-15T12:00:00Z" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  // Pass null watermark — simulates first run for an account
  await syncJobs(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("startDate=2000-01-01"),
    true,
    `Null watermark must use startDate=2000-01-01 for full-history sweep, got URL: ${firstUrl}`,
  );
});

Deno.test("syncJobs — watermark with null last_modified_date uses 2000-01-01 (full-history floor)", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "j-1", modifiedDate: "2020-01-15T12:00:00Z" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  // Watermark row exists but last_modified_date is null (reset for fresh sweep)
  await syncJobs(sb, ACCT, "test-api-key", deadline, { account_key: "florida", resource_type: "jobs", last_modified_date: null }, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("startDate=2000-01-01"),
    true,
    `Watermark with null last_modified_date must use startDate=2000-01-01, got URL: ${firstUrl}`,
  );
});

// ---------------------------------------------------------------------------
// Fix SC4: syncJobs returns { apiCount, maxModifiedDate } for watermark persistence
// ---------------------------------------------------------------------------

Deno.test("syncJobs — returns apiCount from the response for last_api_count", async () => {
  let callNum = 0;
  const mockFetch = () => {
    const items = callNum === 0 ? [{ id: "j-1", modifiedDate: "2026-06-15T12:00:00Z" }] : [];
    callNum++;
    const body = JSON.stringify({ items, count: 166 }); // API reports 166 total jobs
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  const result = await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  assertEquals(
    result.apiCount,
    166,
    `syncJobs must return apiCount=166 so caller can persist it as last_api_count`,
  );
});

// ---------------------------------------------------------------------------
// Rule 1 Bug Fix: AccuLynx jobs API repeats last item(s) when recordStartIndex > count
// — must break on offset >= count (not just on empty items array)
// ---------------------------------------------------------------------------

Deno.test("syncJobs — breaks when offset reaches API count (prevents infinite loop)", async () => {
  let fetchCount = 0;
  const mockFetch = () => {
    fetchCount++;
    // Always return 1 item regardless of offset — simulates the AccuLynx behavior
    // where items are repeated when recordStartIndex exceeds count.
    const items = [{ id: "j-1", modifiedDate: "2026-06-30T12:00:00Z" }];
    const body = JSON.stringify({ items, count: 1 }); // count=1 means only 1 total
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  // Null watermark → startDate=2000-01-01 full-history floor
  await syncJobs(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  assertEquals(
    fetchCount,
    1,
    `When count=1 and page returns 1 item, loop must make exactly 1 fetch (not loop forever). Got ${fetchCount}`,
  );
});

Deno.test("syncJobs — returns maxModifiedDate for incremental watermark advancement", async () => {
  let callNum = 0;
  const mockFetch = () => {
    // Two items with different modified dates; sorted ascending so last is the max
    const items = callNum === 0
      ? [
          { id: "j-1", modifiedDate: "2026-06-10T00:00:00Z" },
          { id: "j-2", modifiedDate: "2026-06-15T12:00:00Z" },
        ]
      : [];
    callNum++;
    const body = JSON.stringify({ items, count: 2 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  const result = await syncJobs(sb, ACCT, "test-api-key", deadline, WATERMARK, mockFetch);

  assertEquals(
    typeof result.maxModifiedDate,
    "string",
    "maxModifiedDate must be an ISO string when items were fetched",
  );
  // Must capture the max modifiedDate across all items (2026-06-15)
  assertEquals(
    result.maxModifiedDate?.startsWith("2026-06-15"),
    true,
    `maxModifiedDate must be 2026-06-15 (the max), got: ${result.maxModifiedDate}`,
  );
});

// ---------------------------------------------------------------------------
// mig 181: syncJobs returns apiTotal (unfiltered grand total) for reconciliation.
// Jobs is date-windowed, so apiCount is only the modified window; apiTotal must be
// the true total (full-history probe on incremental runs; the swept count otherwise).
// ---------------------------------------------------------------------------

Deno.test("syncJobs — incremental run probes full-history total into apiTotal", async () => {
  const urls: string[] = [];
  let windowedCalls = 0;
  const mockFetch = (url: string | URL | Request) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("pageSize=1&recordStartIndex=0")) {
      // full-history probe → grand total
      return Promise.resolve(
        new Response(JSON.stringify({ items: [{ id: "j-1" }], count: 166 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    windowedCalls++;
    const items = windowedCalls === 1 ? [{ id: "j-w", modifiedDate: "2026-06-20T00:00:00Z" }] : [];
    return Promise.resolve(
      new Response(JSON.stringify({ items, count: 8 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const { sb } = makeUpsertSb();
  const result = await syncJobs(sb, ACCT, "test-api-key", Date.now() + 60_000, WATERMARK, mockFetch);

  assertEquals(result.apiCount, 8, "apiCount is the windowed (modified-since) count");
  assertEquals(result.apiTotal, 166, "apiTotal is the full-history probe grand total");
  assertEquals(
    urls.some((u) => u.includes("startDate=2000-01-01") && u.includes("pageSize=1&recordStartIndex=0")),
    true,
    "an incremental run must issue exactly the full-history probe",
  );
});

Deno.test("syncJobs — full-history run sets apiTotal without an extra probe", async () => {
  const urls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    urls.push(String(url));
    const items = urls.length === 1 ? [{ id: "j-1", modifiedDate: "2020-01-01T00:00:00Z" }] : [];
    return Promise.resolve(
      new Response(JSON.stringify({ items, count: 166 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const { sb } = makeUpsertSb();
  const result = await syncJobs(
    sb,
    ACCT,
    "test-api-key",
    Date.now() + 60_000,
    { account_key: "florida", resource_type: "jobs", last_modified_date: null },
    mockFetch,
  );

  assertEquals(result.apiTotal, 166, "full-history run: apiTotal reuses the swept count");
  assertEquals(
    urls.some((u) => u.includes("pageSize=1&recordStartIndex=0")),
    false,
    "no separate probe on a full-history run (count already equals the total)",
  );
});
