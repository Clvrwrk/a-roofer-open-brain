// acculynx-sync — lib/alerts.test.ts (Phase 3, plan 03-03 Task 1 — no-secret-in-payload contract)
//
// Proves the alert helpers never leak a secret and never throw (fire-and-forget).
// fetch is stubbed to capture the outbound request without hitting the network.
//
// Run: deno test supabase/functions/acculynx-sync/lib/alerts.test.ts --allow-env
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { postSlackAlert, captureSentryError, redact } from "./alerts.ts";

type Captured = { url: string; init: RequestInit };

function stubFetch(): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

// Test 1 — postSlackAlert POSTs {channel,text} to chat.postMessage with the bot token in the header only
Deno.test("postSlackAlert — POSTs {channel,text} to chat.postMessage; token in header, not body", async () => {
  const { calls, restore } = stubFetch();
  try {
    await postSlackAlert("xoxb-REAL-TOKEN", "C0BCUJV0MLY", "cron failed for kansas_city/jobs");
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "https://slack.com/api/chat.postMessage");
    assertEquals((calls[0].init.headers as Record<string, string>).Authorization, "Bearer xoxb-REAL-TOKEN");
    const body = JSON.parse(calls[0].init.body as string);
    assertEquals(body.channel, "C0BCUJV0MLY");
    assertEquals(body.text, "cron failed for kansas_city/jobs");
    assert(!(calls[0].init.body as string).includes("xoxb-REAL-TOKEN"), "bot token must never be in the body");
  } finally { restore(); }
});

// Test 1b — non-2xx / network error never throws (fire-and-forget)
Deno.test("postSlackAlert — never throws on network error", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    await postSlackAlert("xoxb-x", "C0BCUJV0MLY", "msg"); // must not throw
  } finally { globalThis.fetch = orig; }
});

// Test 2 — a Bearer/api-key substring in the MESSAGE is redacted before it leaves the process
Deno.test("postSlackAlert — redacts Bearer/sk- tokens from the message text", async () => {
  const { calls, restore } = stubFetch();
  try {
    await postSlackAlert("xoxb-x", "C0BCUJV0MLY", "failed with Authorization: Bearer sk-live-abc123DEF456 leaked");
    const body = JSON.parse(calls[0].init.body as string);
    assert(!body.text.includes("sk-live-abc123DEF456"), "raw sk- token must not appear");
    assert(!/Bearer\s+sk-live/.test(body.text), "raw Bearer token must not appear");
    assertStringIncludes(body.text, "[REDACTED]");
  } finally { restore(); }
});

// Test 3 — captureSentryError builds an envelope and strips secret-named context keys
Deno.test("captureSentryError — envelope excludes secret-named context keys", async () => {
  const { calls, restore } = stubFetch();
  try {
    await captureSentryError(
      "https://pub12345@o1.ingest.sentry.io/42",
      new Error("multiAccount run threw"),
      { batch_id: "sync-x", account: "kansas_city", apiKey: "sk-live-SHOULD-NOT-APPEAR", authorization: "Bearer nope" },
    );
    assertEquals(calls.length, 1);
    assertStringIncludes(calls[0].url, "o1.ingest.sentry.io/api/42/envelope/");
    assertStringIncludes(calls[0].url, "sentry_key=pub12345");
    const raw = calls[0].init.body as string;
    assert(!raw.includes("sk-live-SHOULD-NOT-APPEAR"), "apiKey context must be stripped");
    assert(!raw.includes("Bearer nope"), "authorization context must be stripped");
    assertStringIncludes(raw, "kansas_city"); // non-secret context is retained
    assertStringIncludes(raw, "multiAccount run threw");
  } finally { restore(); }
});

// Test 3b — captureSentryError never throws on a malformed DSN
Deno.test("captureSentryError — no-op on malformed DSN, never throws", async () => {
  const { calls, restore } = stubFetch();
  try {
    await captureSentryError("not-a-dsn", new Error("x"), {});
    assertEquals(calls.length, 0);
  } finally { restore(); }
});

// redact unit
Deno.test("redact — scrubs xoxb and sntrys tokens too", () => {
  assert(!redact("xoxb-123-abc").includes("xoxb-123-abc"));
  assert(!redact("sntrys_deadbeef").includes("sntrys_deadbeef"));
});
