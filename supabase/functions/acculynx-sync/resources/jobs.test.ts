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
