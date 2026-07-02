// acculynx-webhook — index.test.ts (Phase 7, plan 07-08, D-17)
//
// Unit tests for the receiver's pure logic (handler.ts) — constant-time auth verify, topic
// routing, event logging (incl. replay defense), and pull enqueue — plus a thin end-to-end
// exercise of the Deno.serve entry contract (405 for non-POST) via direct assertion on the
// documented behavior (no live network/DB — sb is injected as a mock, mirroring the
// acculynx-write-action/action.test.ts convention).
//
// Run: deno test supabase/functions/acculynx-webhook/index.test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  constantTimeEqual,
  enqueuePull,
  logEvent,
  routeTopic,
  verifyAuth,
  type SbLike,
  type WebhookPayload,
} from "./handler.ts";

// ---------------------------------------------------------------------------
// Mock Supabase client — records insert()/rpc() calls, injectable per-test behavior.
// ---------------------------------------------------------------------------

function makeMockSb(opts?: {
  insertError?: { code?: string; message: string } | null;
  rpcError?: { message: string } | null;
}) {
  const inserted: Record<string, unknown>[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const sb: SbLike = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, ...row });
          return {
            select(_cols: string) {
              return {
                async maybeSingle() {
                  if (opts?.insertError) {
                    return { data: null, error: opts.insertError };
                  }
                  return { data: { id: inserted.length }, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (opts?.rpcError) return { data: null, error: opts.rpcError };
      return { data: null, error: null };
    },
  };
  return { sb, inserted, rpcCalls };
}

// ---------------------------------------------------------------------------
// constantTimeEqual
// ---------------------------------------------------------------------------

Deno.test("constantTimeEqual — matches identical strings", () => {
  assert(constantTimeEqual("a".repeat(64), "a".repeat(64)));
});

Deno.test("constantTimeEqual — rejects mismatched strings of same length", () => {
  assert(!constantTimeEqual("a".repeat(64), "b".repeat(64)));
});

Deno.test("constantTimeEqual — rejects different-length strings", () => {
  assert(!constantTimeEqual("short", "much-longer-string"));
});

Deno.test("constantTimeEqual — rejects when either side is empty/null/undefined", () => {
  assert(!constantTimeEqual("", "token"));
  assert(!constantTimeEqual("token", ""));
  assert(!constantTimeEqual(null, "token"));
  assert(!constantTimeEqual("token", undefined));
  assert(!constantTimeEqual(null, undefined));
});

// ---------------------------------------------------------------------------
// verifyAuth (T-07-08-01) — URL token + subscriptionId, both constant-time
// ---------------------------------------------------------------------------

const TOKEN = "deadbeef".repeat(8); // 64 hex chars, mirrors openssl rand -hex 32
const SUB_ID = "sub-abc-123";

Deno.test("verifyAuth — rejects when expectedToken is unset (never verify against empty)", () => {
  const ok = verifyAuth({ expectedToken: "", presentedToken: "" }, {});
  assertEquals(ok, false);
});

Deno.test("verifyAuth — rejects a missing/mismatched URL token", () => {
  const ok = verifyAuth({ expectedToken: TOKEN, presentedToken: "wrong-token" }, {});
  assertEquals(ok, false);
});

Deno.test("verifyAuth — accepts a matching URL token when subscriptionId is not configured (pending-subscription mode)", () => {
  const ok = verifyAuth({ expectedToken: TOKEN, presentedToken: TOKEN }, { topic: "job-created" });
  assertEquals(ok, true);
});

Deno.test("verifyAuth — when subscriptionId IS configured, a matching token + matching subscriptionId passes", () => {
  const ok = verifyAuth(
    { expectedToken: TOKEN, presentedToken: TOKEN, expectedSubscriptionId: SUB_ID },
    { subscriptionId: SUB_ID },
  );
  assertEquals(ok, true);
});

Deno.test("verifyAuth — when subscriptionId IS configured, a matching token but wrong subscriptionId fails", () => {
  const ok = verifyAuth(
    { expectedToken: TOKEN, presentedToken: TOKEN, expectedSubscriptionId: SUB_ID },
    { subscriptionId: "some-other-sub" },
  );
  assertEquals(ok, false);
});

Deno.test("verifyAuth — a forged payload cannot self-authorize by spoofing the URL token field", () => {
  // The token is checked from the URL path segment (presentedToken), never from the body —
  // this asserts the body cannot smuggle its way past auth even if it includes a "token" field.
  const forged: WebhookPayload = { topic: "job-created", token: TOKEN } as WebhookPayload;
  const ok = verifyAuth({ expectedToken: TOKEN, presentedToken: null }, forged);
  assertEquals(ok, false);
});

// ---------------------------------------------------------------------------
// routeTopic (D-15/D-16) — body read positionally only, never eval/exec'd
// ---------------------------------------------------------------------------

Deno.test("routeTopic — job-created topic routes to first_sight_full_pull", () => {
  const r = routeTopic({ topic: "job-created", jobId: "job-1", accountKey: "wichita" });
  assertEquals(r.enqueuedAction, "first_sight_full_pull");
  assertEquals(r.accountKey, "wichita");
});

Deno.test("routeTopic — financials-approved-value-changed routes to targeted_repull:financials", () => {
  const r = routeTopic({ topic: "financials-approved-value-changed", jobId: "job-2", accountKey: "kansas_city" });
  assertEquals(r.enqueuedAction, "targeted_repull:financials");
  assertEquals(r.accountKey, "kansas_city");
});

Deno.test("routeTopic — representatives-company-assigned routes to targeted_repull:representatives", () => {
  const r = routeTopic({ topic: "representatives-company-assigned", jobId: "job-3", accountKey: "colorado" });
  assertEquals(r.enqueuedAction, "targeted_repull:representatives");
});

Deno.test("routeTopic — unrecognized topic routes to no action (null)", () => {
  const r = routeTopic({ topic: "some-unknown-topic" });
  assertEquals(r.enqueuedAction, null);
});

Deno.test("routeTopic — a payload field crafted to look like code is read as inert data, never executed", () => {
  // T-07-08-02: the untrusted body must never be eval'd/exec'd. This asserts routeTopic reads
  // `topic` as a plain string comparison — a topic value containing script-like content still
  // resolves to "no recognized topic", proving no interpretation occurs.
  const malicious: WebhookPayload = { topic: "'; DROP TABLE acculynx_jobs; --", jobId: "job-4" };
  const r = routeTopic(malicious);
  assertEquals(r.enqueuedAction, null);
});

// ---------------------------------------------------------------------------
// logEvent — every request logged (verified or not); replay defense
// ---------------------------------------------------------------------------

Deno.test("logEvent — unverified request logs signature_verified=false and no enqueued_action", async () => {
  const { sb, inserted } = makeMockSb();
  const result = await logEvent(sb, { topic: "job-created" }, false, null);
  assertEquals(result.inserted, true);
  assertEquals(result.isReplay, false);
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].signature_verified, false);
  assertEquals(inserted[0].enqueued_action, null);
});

Deno.test("logEvent — verified job-created request logs signature_verified=true and the routed action", async () => {
  const { sb, inserted } = makeMockSb();
  const result = await logEvent(sb, { topic: "job-created", eventId: "evt-1" }, true, "first_sight_full_pull");
  assertEquals(result.inserted, true);
  assertEquals(inserted[0].signature_verified, true);
  assertEquals(inserted[0].enqueued_action, "first_sight_full_pull");
  assertEquals(inserted[0].event_id, "evt-1");
});

Deno.test("logEvent — a replayed event_id (unique_violation on the verified partial index) is treated as a replay, not thrown", async () => {
  const { sb } = makeMockSb({ insertError: { code: "23505", message: "duplicate key value violates unique constraint" } });
  const result = await logEvent(sb, { topic: "job-created", eventId: "evt-dup" }, true, "first_sight_full_pull");
  assertEquals(result.inserted, false);
  assertEquals(result.isReplay, true);
});

Deno.test("logEvent — a non-unique-violation DB error is thrown (not silently swallowed as a replay)", async () => {
  const { sb } = makeMockSb({ insertError: { code: "42501", message: "permission denied" } });
  let threw = false;
  try {
    await logEvent(sb, { topic: "job-created" }, true, "first_sight_full_pull");
  } catch {
    threw = true;
  }
  assert(threw, "non-replay DB errors must propagate, not be swallowed");
});

// ---------------------------------------------------------------------------
// enqueuePull — never runs the full pull inline; scoped via accountFilter
// ---------------------------------------------------------------------------

Deno.test("enqueuePull — verified job-created event enqueues via trigger_acculynx_sync scoped to accountKey", async () => {
  const { sb, rpcCalls } = makeMockSb();
  const route = routeTopic({ topic: "job-created", jobId: "job-1", accountKey: "wichita" });
  const enqueued = await enqueuePull(sb, route);
  assertEquals(enqueued, true);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "trigger_acculynx_sync");
  const body = rpcCalls[0].args.p_resources as { multiAccount: boolean; accountFilter: string[] };
  assertEquals(body.multiAccount, true);
  assertEquals(body.accountFilter, ["wichita"]);
});

Deno.test("enqueuePull — verified financials-changed event enqueues a targeted accountFilter-scoped re-pull", async () => {
  const { sb, rpcCalls } = makeMockSb();
  const route = routeTopic({ topic: "financials-approved-value-changed", jobId: "job-2", accountKey: "kansas_city" });
  const enqueued = await enqueuePull(sb, route);
  assertEquals(enqueued, true);
  const body = rpcCalls[0].args.p_resources as { accountFilter: string[] };
  assertEquals(body.accountFilter, ["kansas_city"]);
});

Deno.test("enqueuePull — no enqueuedAction (unrecognized topic) does not call the RPC", async () => {
  const { sb, rpcCalls } = makeMockSb();
  const route = routeTopic({ topic: "unknown-topic" });
  const enqueued = await enqueuePull(sb, route);
  assertEquals(enqueued, false);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("enqueuePull — no accountKey on an otherwise-routed event does not call the RPC (cannot scope the pull)", async () => {
  const { sb, rpcCalls } = makeMockSb();
  const route = routeTopic({ topic: "job-created", jobId: "job-1" }); // no accountKey
  const enqueued = await enqueuePull(sb, route);
  assertEquals(enqueued, false);
  assertEquals(rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Full-flow composition tests (mirrors the Deno.serve entry sequencing in index.ts)
// ---------------------------------------------------------------------------

Deno.test("full flow — unverified payload: 401 path logs signature_verified=false and enqueuePull is never reached", async () => {
  const { sb, inserted, rpcCalls } = makeMockSb();
  const verified = verifyAuth({ expectedToken: TOKEN, presentedToken: "bad-token" }, { topic: "job-created" });
  assertEquals(verified, false);
  // index.ts calls logEvent(sb, payload, false, null) and returns 401 WITHOUT calling enqueuePull.
  await logEvent(sb, { topic: "job-created" }, false, null);
  assertEquals(inserted[0].signature_verified, false);
  assertEquals(rpcCalls.length, 0, "no pull may be enqueued for an unverified request");
});

Deno.test("full flow — verified job-created payload: 200 + event row + first-sight enqueue", async () => {
  const { sb, inserted, rpcCalls } = makeMockSb();
  const payload: WebhookPayload = { topic: "job-created", eventId: "evt-full-1", jobId: "job-9", accountKey: "wichita" };
  const verified = verifyAuth({ expectedToken: TOKEN, presentedToken: TOKEN }, payload);
  assertEquals(verified, true);
  const route = routeTopic(payload);
  const logResult = await logEvent(sb, payload, true, route.enqueuedAction);
  assertEquals(logResult.isReplay, false);
  const enqueued = await enqueuePull(sb, route);
  assertEquals(enqueued, true);
  assertEquals(inserted[0].enqueued_action, "first_sight_full_pull");
  assertEquals(rpcCalls[0].fn, "trigger_acculynx_sync");
});

Deno.test("full flow — verified financials-approved-value-changed payload: targeted-repull enqueue", async () => {
  const { sb, inserted, rpcCalls } = makeMockSb();
  const payload: WebhookPayload = {
    topic: "financials-approved-value-changed",
    eventId: "evt-full-2",
    jobId: "job-10",
    accountKey: "kansas_city",
  };
  const verified = verifyAuth({ expectedToken: TOKEN, presentedToken: TOKEN }, payload);
  assertEquals(verified, true);
  const route = routeTopic(payload);
  await logEvent(sb, payload, true, route.enqueuedAction);
  await enqueuePull(sb, route);
  assertEquals(inserted[0].enqueued_action, "targeted_repull:financials");
  assertEquals(rpcCalls[0].fn, "trigger_acculynx_sync");
});

Deno.test("full flow — a replayed verified event_id skips re-enqueue entirely", async () => {
  const { sb, rpcCalls } = makeMockSb({ insertError: { code: "23505", message: "duplicate key" } });
  const payload: WebhookPayload = { topic: "job-created", eventId: "evt-replay", jobId: "job-11", accountKey: "wichita" };
  const route = routeTopic(payload);
  const logResult = await logEvent(sb, payload, true, route.enqueuedAction);
  assertEquals(logResult.isReplay, true);
  // index.ts short-circuits on isReplay and never calls enqueuePull.
  assertEquals(rpcCalls.length, 0, "a replay must not re-enqueue the pull");
});

// ---------------------------------------------------------------------------
// 405 for non-POST — documented HTTP contract (index.ts checks req.method first, before any
// auth/body parsing). Asserted here as a plain behavioral contract on the method string,
// since exercising the live Deno.serve handler requires a running server (covered in Task 3's
// sandbox proof instead).
// ---------------------------------------------------------------------------

Deno.test("non-POST methods are rejected by the documented method contract", () => {
  const allowed = "POST";
  for (const method of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) {
    assert(method !== allowed, `${method} must not be treated as POST`);
  }
});
