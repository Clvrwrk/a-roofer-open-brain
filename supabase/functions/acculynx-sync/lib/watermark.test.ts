// acculynx-sync — lib/watermark.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// Unit tests for readWatermark() and advanceWatermark().
// Pure unit tests: mock Supabase client injected, no live DB, no network.
//
// Key behavioral contracts:
//   - advanceWatermark upserts with onConflict 'account_key,resource'
//   - readWatermark filters by BOTH account_key AND resource
//   - Watermarks for ('kansas_city','contacts') and ('florida','contacts') are independent
//
// Run: deno test supabase/functions/acculynx-sync/lib/watermark.test.ts --allow-env
import { assertEquals } from "jsr:@std/assert@1";
import { readWatermark, advanceWatermark, type WatermarkRow } from "./watermark.ts";

// ---------------------------------------------------------------------------
// Mock Supabase client helpers
// ---------------------------------------------------------------------------

/** Mock that records all chained calls and resolves with canned data. */
function makeReadMock(returnData: WatermarkRow | null, returnError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];

  const builder: Record<string, unknown> = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve({ data: returnData, error: returnError });
    },
  };

  return { sb: builder, calls };
}

/** Mock that records upsert calls and captures options (for onConflict assertion). */
function makeUpsertMock(returnError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];

  const builder: Record<string, unknown> = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
    upsert: (row: unknown, options: unknown) => {
      calls.push({ method: "upsert", args: [row, options] });
      return Promise.resolve({ error: returnError });
    },
  };

  return { sb: builder, calls };
}

// ---------------------------------------------------------------------------
// Tests: advanceWatermark
// ---------------------------------------------------------------------------

Deno.test("advanceWatermark — upserts with onConflict 'account_key,resource'", async () => {
  const { sb, calls } = makeUpsertMock();
  const row: WatermarkRow = {
    account_key: "kansas_city",
    resource: "contacts",
    last_page_index: 50,
    last_sync_at: new Date().toISOString(),
  };
  await advanceWatermark(sb, row);

  const upsertCall = calls.find((c) => c.method === "upsert");
  assertEquals(upsertCall !== undefined, true, "upsert must be called");
  const options = upsertCall?.args[1] as { onConflict?: string };
  assertEquals(
    options?.onConflict,
    "account_key,resource",
    "onConflict must be 'account_key,resource'",
  );
});

Deno.test("advanceWatermark — passes the correct watermark row to upsert", async () => {
  const { sb, calls } = makeUpsertMock();
  const row: WatermarkRow = {
    account_key: "florida",
    resource: "jobs",
    last_modified_date: "2026-06-01T00:00:00Z",
    last_sync_at: new Date().toISOString(),
  };
  await advanceWatermark(sb, row);

  const upsertCall = calls.find((c) => c.method === "upsert");
  const passedRow = upsertCall?.args[0] as WatermarkRow;
  assertEquals(passedRow.account_key, "florida");
  assertEquals(passedRow.resource, "jobs");
  assertEquals(passedRow.last_modified_date, "2026-06-01T00:00:00Z");
});

Deno.test("advanceWatermark — does not throw on Supabase error (warn path)", async () => {
  const { sb } = makeUpsertMock({ message: "network error" });
  const row: WatermarkRow = { account_key: "kansas_city", resource: "contacts" };
  // Must not throw — error is logged via console.warn (non-fatal).
  await advanceWatermark(sb, row);
});

// ---------------------------------------------------------------------------
// Tests: readWatermark
// ---------------------------------------------------------------------------

Deno.test("readWatermark — filters by account_key", async () => {
  const wm: WatermarkRow = { account_key: "kansas_city", resource: "contacts", last_page_index: 0 };
  const { sb, calls } = makeReadMock(wm);

  await readWatermark(sb, "kansas_city", "contacts");

  const eqCalls = calls.filter((c) => c.method === "eq");
  const accountKeyEq = eqCalls.find((c) => c.args[0] === "account_key" && c.args[1] === "kansas_city");
  assertEquals(accountKeyEq !== undefined, true, "Must filter by account_key");
});

Deno.test("readWatermark — filters by resource", async () => {
  const wm: WatermarkRow = { account_key: "kansas_city", resource: "contacts", last_page_index: 0 };
  const { sb, calls } = makeReadMock(wm);

  await readWatermark(sb, "kansas_city", "contacts");

  const eqCalls = calls.filter((c) => c.method === "eq");
  const resourceEq = eqCalls.find((c) => c.args[0] === "resource" && c.args[1] === "contacts");
  assertEquals(resourceEq !== undefined, true, "Must filter by resource");
});

Deno.test("readWatermark — ('kansas_city','contacts') is independent of ('florida','contacts')", async () => {
  // kansas_city contacts watermark
  const kcWm: WatermarkRow = { account_key: "kansas_city", resource: "contacts", last_page_index: 100 };
  const { sb: kcSb } = makeReadMock(kcWm);
  const kcResult = await readWatermark(kcSb, "kansas_city", "contacts");
  assertEquals(kcResult?.account_key, "kansas_city");
  assertEquals(kcResult?.last_page_index, 100);

  // florida contacts watermark — completely separate row
  const flWm: WatermarkRow = { account_key: "florida", resource: "contacts", last_page_index: 25 };
  const { sb: flSb } = makeReadMock(flWm);
  const flResult = await readWatermark(flSb, "florida", "contacts");
  assertEquals(flResult?.account_key, "florida");
  assertEquals(flResult?.last_page_index, 25);

  // The two must differ — they are independent watermarks.
  assertEquals(kcResult?.last_page_index !== flResult?.last_page_index, true);
});

Deno.test("readWatermark — returns null when no row exists yet", async () => {
  const { sb } = makeReadMock(null);
  const result = await readWatermark(sb, "new_account", "contacts");
  assertEquals(result, null);
});
