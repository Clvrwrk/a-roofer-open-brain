// acculynx-sync — resources/contacts.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// BEHAVIORAL unit tests for syncContacts() — RED here, GREEN in Plan 03 Task 2.
//
// This file imports from ./contacts.ts which does NOT exist until Plan 03.
// The import failure IS the intended RED state — it proves the module is absent.
//
// Behavioral contracts asserted:
//   (a) URL pagination param is `pageStartIndex` (NOT recordStartIndex — Pitfall 2)
//   (b) Every upserted row carries account_key AND market from the passed acct
//   (c) last_seen_by_api is set on every upserted row
//   (d) Loop stops when Date.now() >= deadline (budget-stop)
//
// Run: deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost
import { assertEquals } from "jsr:@std/assert@1";

// resources/contacts.ts is a Wave 0 STUB that throws "not implemented".
// All tests in this file will FAIL (RED) because the stub throws before doing
// anything. Plan 03 (GREEN) replaces the stub with the real implementation.
import { syncContacts } from "./contacts.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** A canned API page: 2 contacts, then an empty page to end the loop. */
function makeContactsPages(pages: unknown[][]): () => Promise<Response> {
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
  account_key: "kansas_city",
  env_secret_name: "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
  label: "Kansas City",
  market: "sedgwick_ks",
  state: "KS",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("syncContacts — URL pagination param is pageStartIndex (not recordStartIndex)", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    // Return one page then empty to terminate loop.
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "c-1", firstName: "Test", lastName: "User" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("pageStartIndex"),
    true,
    `URL must contain 'pageStartIndex' but got: ${firstUrl}`,
  );
  assertEquals(
    firstUrl.includes("recordStartIndex"),
    false,
    `URL must NOT contain 'recordStartIndex' (contacts uses pageStartIndex, not recordStartIndex)`,
  );
});

Deno.test("syncContacts — stamps account_key on every upserted row", async () => {
  const pages = [
    [{ id: "c-1" }, { id: "c-2" }],
    [], // empty page terminates loop
  ];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  assertEquals(upsertCalls.length > 0, true, "upsert must be called at least once");
  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.account_key,
        "kansas_city",
        `Every row must carry account_key='kansas_city', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncContacts — stamps market on every upserted row", async () => {
  const pages = [
    [{ id: "c-1" }, { id: "c-2" }],
    [],
  ];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.market,
        "sedgwick_ks",
        `Every row must carry market='sedgwick_ks', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncContacts — sets last_seen_by_api on every upserted row", async () => {
  const pages = [[{ id: "c-1" }], []];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

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

Deno.test("syncContacts — budget-stop: no fetch beyond a past deadline", async () => {
  let fetchCount = 0;
  const mockFetch = () => {
    fetchCount++;
    const items = [{ id: "c-1" }];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  // Deadline already in the past — loop must not call fetch at all (or at most once).
  const pastDeadline = Date.now() - 1;
  await syncContacts(sb, ACCT, "test-api-key", pastDeadline, null, mockFetch);

  assertEquals(
    fetchCount,
    0,
    `With a past deadline, syncContacts must make 0 fetch calls, got: ${fetchCount}`,
  );
});

// ---------------------------------------------------------------------------
// Fix SC4: syncContacts returns API count for last_api_count watermark persistence
// ---------------------------------------------------------------------------

Deno.test("syncContacts — returns the API count from the response for last_api_count", async () => {
  let callNum = 0;
  const mockFetch = () => {
    const items = callNum === 0 ? [{ id: "c-1" }, { id: "c-2" }] : [];
    callNum++;
    const body = JSON.stringify({ items, count: 342 }); // API reports 342 total contacts
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  const apiCount = await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  assertEquals(
    apiCount,
    342,
    `syncContacts must return the API count (342) so caller can persist it as last_api_count`,
  );
});

Deno.test("syncContacts — returns null when no pages were fetched (budget-exhausted before first page)", async () => {
  const mockFetch = () => {
    const body = JSON.stringify({ items: [], count: 0 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const pastDeadline = Date.now() - 1;
  const apiCount = await syncContacts(sb, ACCT, "test-api-key", pastDeadline, null, mockFetch);

  assertEquals(
    apiCount,
    null,
    "syncContacts must return null when budget expired before any fetch (no api_count observed)",
  );
});

// ---------------------------------------------------------------------------
// 2026-07-01 fix: pageStartIndex is a PAGE NUMBER — advance by 1, not items.length.
// Regression guard for the wichita-contacts-stuck-at-64 bug.
// ---------------------------------------------------------------------------

Deno.test("syncContacts — pageStartIndex advances by 1 per page (page-number pagination)", async () => {
  const seenPageStartIndex: number[] = [];
  // 3 full pages of 50, then a short final page of 10 → sweep must fetch pages 0,1,2,3.
  const mockFetch = (url: string | URL | Request) => {
    const u = String(url);
    const m = u.match(/pageStartIndex=(\d+)/);
    const p = m ? Number(m[1]) : -1;
    seenPageStartIndex.push(p);
    const count = 160;
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `c-${p}-${i}` }));
    const items = p < 3 ? full : Array.from({ length: 10 }, (_, i) => ({ id: `c-${p}-${i}` }));
    return Promise.resolve(
      new Response(JSON.stringify({ items, count }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const { sb } = makeUpsertSb();
  const result = await syncContacts(sb, ACCT, "test-api-key", Date.now() + 60_000, null, mockFetch);

  assertEquals(
    seenPageStartIndex,
    [0, 1, 2, 3],
    `pageStartIndex must increment by 1 per page (page number), got: ${JSON.stringify(seenPageStartIndex)}`,
  );
  assertEquals(result, 160, "returns the API-reported total count");
});
