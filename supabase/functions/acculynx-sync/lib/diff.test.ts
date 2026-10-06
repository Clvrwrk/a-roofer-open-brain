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
import { markNotSeen, newSweepOutcome, settleSweep, unarchiveSeen } from "./diff.ts";

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

// ---------------------------------------------------------------------------
// 2026-10-05 (migration 325): unarchiveSeen + settleSweep
// ---------------------------------------------------------------------------

/** A chain mock that records every call; update chains end at .select() (unarchive) or .lt() (archive). */
function makeChainMock(restoredIds: string[] = [], selectError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["from", "update", "eq", "is", "gte", "delete"]) {
    b[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return b; };
  }
  b.select = (...args: unknown[]) => {
    calls.push({ method: "select", args });
    return Promise.resolve(selectError ? { data: null, error: selectError } : { data: restoredIds.map((id) => ({ id })), error: null });
  };
  b.lt = (...args: unknown[]) => { calls.push({ method: "lt", args }); return Promise.resolve({ error: null }); };
  return { sb: b, calls };
}

Deno.test("unarchiveSeen — clears archived_at/archive_reason only for not_seen_in_api rows seen since the sweep began", async () => {
  const { sb, calls } = makeChainMock(["e1", "e2"]);
  const n = await unarchiveSeen(sb, "acculynx_estimates", "wichita", "2026-10-05T10:00:00Z");
  assertEquals(n, 2);
  assertEquals(calls.find((c) => c.method === "from")?.args[0], "acculynx_estimates");
  assertEquals(calls.find((c) => c.method === "update")?.args[0], { archived_at: null, archive_reason: null });
  const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args);
  assertEquals(eqs, [["account_key", "wichita"], ["archive_reason", "not_seen_in_api"]]);
  assertEquals(calls.find((c) => c.method === "gte")?.args, ["last_seen_by_api", "2026-10-05T10:00:00Z"]);
  assertEquals(calls.some((c) => c.method === "delete"), false);
});

Deno.test("unarchiveSeen — an error or a throwing client is non-fatal and reports 0", async () => {
  const { sb } = makeChainMock([], { message: "boom" });
  assertEquals(await unarchiveSeen(sb, "acculynx_estimates", "wichita", "t"), 0);
  const throwing = { from: () => { throw new Error("no client"); } };
  assertEquals(await unarchiveSeen(throwing, "acculynx_estimates", "wichita", "t"), 0);
});

Deno.test("settleSweep — a complete sweep restores the re-seen rows and archives the unseen ones", async () => {
  const { sb, calls } = makeChainMock(["c1"]);
  const r = await settleSweep(sb, "acculynx_contacts", "texas", "2026-10-05T10:00:00Z", { complete: true, pages: 3, seen: 120 });
  assertEquals(r, { restored: 1, archived: true });
  const updates = calls.filter((c) => c.method === "update").map((c) => c.args[0] as Record<string, unknown>);
  assertEquals(updates.length, 2);
  assertEquals(updates[0].archived_at, null, "restore runs first");
  assertEquals(updates[1].archive_reason, "not_seen_in_api", "then the archive");
  assertEquals(calls.find((c) => c.method === "lt")?.args, ["last_seen_by_api", "2026-10-05T10:00:00Z"]);
});

Deno.test("settleSweep — a partial sweep restores the re-seen rows but archives nothing", async () => {
  const { sb, calls } = makeChainMock(["e9"]);
  const r = await settleSweep(sb, "acculynx_estimates", "wichita", "2026-10-05T10:00:00Z", newSweepOutcome());
  assertEquals(r, { restored: 1, archived: false });
  const updates = calls.filter((c) => c.method === "update").map((c) => c.args[0] as Record<string, unknown>);
  assertEquals(updates.length, 1, "only the restore update runs");
  assertEquals(updates[0], { archived_at: null, archive_reason: null });
  assertEquals(calls.some((c) => c.method === "lt"), false, "markNotSeen never runs on a partial pass");
});
