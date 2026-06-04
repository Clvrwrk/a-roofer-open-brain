// smoke_test.ts — runs without network using a mock BrainDb.
// Run: deno test server/tests/   (or via scripts/verify-deployment.sh)
//
// Verifies: tools are registered, argument validation fires, and each tool
// maps to the expected PostgREST RPC with the expected params. No real DB.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { BrainDb } from "../functions/db.ts";
import { callTool, listTools } from "../functions/tools.ts";

/** Records the last rpc call so tests can assert on it. */
function mockDb(): BrainDb & { calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    // deno-lint-ignore require-await
    async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ fn, args });
      return ({ ok: true } as unknown) as T;
    },
  };
}

Deno.test("tools/list exposes the three internal brain tools", () => {
  const names = listTools().map((t) => t.name).sort();
  assertEquals(names, ["brain.property_history", "brain.recall", "brain.remember"]);
});

Deno.test("brain.remember calls upsert_thought with the content", async () => {
  const db = mockDb();
  const res = await callTool(db, "brain.remember", { content: "Replaced roof on 1247 Elm; GAF Timberline HDZ." });
  assert(res.ok, res.error);
  assertEquals(db.calls[0].fn, "upsert_thought");
  assertEquals(db.calls[0].args.p_content, "Replaced roof on 1247 Elm; GAF Timberline HDZ.");
});

Deno.test("brain.recall calls search_thoughts_text", async () => {
  const db = mockDb();
  const res = await callTool(db, "brain.recall", { query: "ice and water shield", limit: 5 });
  assert(res.ok, res.error);
  assertEquals(db.calls[0].fn, "search_thoughts_text");
  assertEquals(db.calls[0].args.p_query, "ice and water shield");
});

Deno.test("brain.property_history calls the consent-gated RPC", async () => {
  const db = mockDb();
  const res = await callTool(db, "brain.property_history", {
    property_id: "00000000-0000-0000-0000-000000000001",
    requesting_client_id: "00000000-0000-0000-0000-000000000002",
    requesting_trade: "remodeling",
  });
  assert(res.ok, res.error);
  assertEquals(db.calls[0].fn, "property_history_for");
});

Deno.test("missing required arg returns an error, not a throw", async () => {
  const db = mockDb();
  const res = await callTool(db, "brain.remember", {});
  assertEquals(res.ok, false);
  assert((res.error ?? "").includes("content"));
});

Deno.test("unknown tool is rejected", async () => {
  const db = mockDb();
  const res = await callTool(db, "brain.delete_everything", {});
  assertEquals(res.ok, false);
});
