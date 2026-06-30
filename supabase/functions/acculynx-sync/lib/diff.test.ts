// acculynx-sync — lib/diff.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// Unit tests for markNotSeen().
// Pure unit tests: mock Supabase client, no live DB, no network.
//
// Key behavioral contracts:
//   - markNotSeen calls .update() with archived_at + archive_reason='not_seen_in_api'
//   - Scoped to .eq('account_key', accountKey)
//   - Scoped to .is('archived_at', null) — only rows not yet archived
//   - Scoped to .lt('last_seen_by_api', sweepStartedAt)
//   - NEVER calls .delete() (hard rule 1: mark, never delete)
//
// Run: deno test supabase/functions/acculynx-sync/lib/diff.test.ts --allow-env
import { assertEquals } from "jsr:@std/assert@1";
import { markNotSeen } from "./diff.ts";

// ---------------------------------------------------------------------------
// Mock Supabase client: tracks all chained calls for assertion
// ---------------------------------------------------------------------------

function makeDiffMock(returnError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];

  const builder: Record<string, unknown> = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return builder;
    },
    lt: (...args: unknown[]) => {
      calls.push({ method: "lt", args });
      return Promise.resolve({ error: returnError });
    },
    // Spy for delete — must NEVER be invoked (hard rule 1).
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return builder;
    },
  };

  return { sb: builder, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("markNotSeen — calls .update() with archived_at and archive_reason='not_seen_in_api'", async () => {
  const { sb, calls } = makeDiffMock();
  const sweepStart = "2026-06-30T08:00:00Z";

  await markNotSeen(sb, "acculynx_contacts", "kansas_city", sweepStart);

  const updateCall = calls.find((c) => c.method === "update");
  assertEquals(updateCall !== undefined, true, ".update() must be called");

  const payload = updateCall?.args[0] as Record<string, unknown>;
  assertEquals(
    typeof payload?.archived_at,
    "string",
    "archived_at must be set (ISO string)",
  );
  assertEquals(
    payload?.archive_reason,
    "not_seen_in_api",
    "archive_reason must be 'not_seen_in_api'",
  );
});

Deno.test("markNotSeen — scopes update to the correct account_key", async () => {
  const { sb, calls } = makeDiffMock();
  await markNotSeen(sb, "acculynx_contacts", "florida", "2026-06-30T08:00:00Z");

  const eqCalls = calls.filter((c) => c.method === "eq");
  const accountKeyEq = eqCalls.find(
    (c) => c.args[0] === "account_key" && c.args[1] === "florida",
  );
  assertEquals(accountKeyEq !== undefined, true, "Must scope to .eq('account_key', accountKey)");
});

Deno.test("markNotSeen — filters to rows where archived_at IS NULL", async () => {
  const { sb, calls } = makeDiffMock();
  await markNotSeen(sb, "acculynx_contacts", "kansas_city", "2026-06-30T08:00:00Z");

  const isCall = calls.find((c) => c.method === "is");
  assertEquals(isCall !== undefined, true, ".is() must be called");
  assertEquals(isCall?.args[0], "archived_at", "is() first arg must be 'archived_at'");
  assertEquals(isCall?.args[1], null, "is() second arg must be null");
});

Deno.test("markNotSeen — filters to rows where last_seen_by_api < sweepStartedAt", async () => {
  const sweepStart = "2026-06-30T08:15:00Z";
  const { sb, calls } = makeDiffMock();
  await markNotSeen(sb, "acculynx_contacts", "kansas_city", sweepStart);

  const ltCall = calls.find((c) => c.method === "lt");
  assertEquals(ltCall !== undefined, true, ".lt() must be called");
  assertEquals(ltCall?.args[0], "last_seen_by_api", "lt() must filter on 'last_seen_by_api'");
  assertEquals(ltCall?.args[1], sweepStart, "lt() must use sweepStartedAt as the threshold");
});

Deno.test("markNotSeen — NEVER calls .delete() (hard rule 1: mark, never delete)", async () => {
  const { sb, calls } = makeDiffMock();
  await markNotSeen(sb, "acculynx_contacts", "kansas_city", "2026-06-30T08:00:00Z");

  const deleteCall = calls.find((c) => c.method === "delete");
  assertEquals(
    deleteCall,
    undefined,
    ".delete() must NEVER be called — rows are archived via .update(), not deleted",
  );
});

Deno.test("markNotSeen — does not throw on Supabase error (warn path)", async () => {
  const { sb } = makeDiffMock({ message: "constraint violation" });
  // Must not throw — error is non-fatal (logged via console.warn).
  await markNotSeen(sb, "acculynx_contacts", "kansas_city", "2026-06-30T08:00:00Z");
});

Deno.test("markNotSeen — operates on the specified table name", async () => {
  const { sb, calls } = makeDiffMock();
  await markNotSeen(sb, "acculynx_jobs", "kansas_city", "2026-06-30T08:00:00Z");

  const fromCall = calls.find((c) => c.method === "from");
  assertEquals(fromCall?.args[0], "acculynx_jobs", "from() must use the passed table name");
});
