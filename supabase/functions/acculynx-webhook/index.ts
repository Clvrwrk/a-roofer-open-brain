// acculynx-webhook — Edge Function entrypoint (Phase 7, plan 07-08, D-17)
//
// Public-facing receiver for AccuLynx webhook POSTs. Thin Deno.serve HTTP boundary — all
// auth-verify / event-log / topic-routing logic lives in handler.ts (pure, unit-tested) so
// this file stays a mechanical wire-up (mirrors the acculynx-write-action / action.ts split).
//
// Consumer URL shape: https://<project>.functions.supabase.co/acculynx-webhook/<TOKEN>
// The TOKEN path segment is the shared-secret (Task 0 decision: shared-secret-path — no HMAC
// signature confirmed live). It is generated via `openssl rand -hex 32` and provisioned as the
// Edge secret ACCULYNX_WEBHOOK_TOKEN — never a literal in this file, never logged (hard rule 2).
//
// Behavior contract (07-08-PLAN.md Task 2):
//   - POST-only; non-POST -> 405.
//   - Verify authenticity BEFORE trusting the body; unverified -> log signature_verified=false,
//     401, NO pull enqueued.
//   - Verified body is treated as untrusted DATA (REQ-09/D-10) — read positionally, never
//     eval/exec'd.
//   - Insert an acculynx_webhook_events row for every request (verified or not) for audit.
//   - Route by topic: job-created -> first-sight full pull (D-15); financials/representatives
//     field-changed -> targeted re-pull (D-16).
//   - Return 200 fast (enqueue, don't pull inline) so AccuLynx does not time out / retry-storm.
//   - A replayed event_id (already logged as verified) is 200-ack'd with no re-enqueue.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enqueuePull, logEvent, routeTopic, verifyAuth, type WebhookPayload } from "./handler.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// hard rule 2: secret VALUES resolved only at runtime via Deno.env — never a literal here,
// never logged. Presence is checked per-request below (auth fails closed if unset).
const WEBHOOK_TOKEN = Deno.env.get("ACCULYNX_WEBHOOK_TOKEN") ?? "";
// Pending-subscription log-only mode (Task 0 decision item 2): empty until the prod
// subscription is created in the human-gated Task 4 checkpoint and its subscriptionId is
// provisioned here. verifyAuth() skips the subscriptionId check when this is empty.
const WEBHOOK_SUBSCRIPTION_ID = Deno.env.get("ACCULYNX_WEBHOOK_SUBSCRIPTION_ID") ?? "";

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // The URL token segment is the last path component:
  // /acculynx-webhook/<TOKEN> (Supabase Edge Functions serve at the function-root path, so
  // the deployed URL itself already carries "acculynx-webhook" — the TOKEN is whatever
  // follows it).
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const presentedToken = segments.length > 0 ? segments[segments.length - 1] : null;

  // The body is UNTRUSTED external input (D-10/REQ-09) from the first byte onward — parsed
  // here only to extract fields positionally; never eval'd/exec'd.
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    payload = {};
  }

  const verified = verifyAuth(
    { expectedToken: WEBHOOK_TOKEN, presentedToken, expectedSubscriptionId: WEBHOOK_SUBSCRIPTION_ID || undefined },
    payload,
  );

  if (!verified) {
    // Unverified: log signature_verified=false, reject 401, NO pull enqueued (T-07-08-01).
    try {
      await logEvent(sb, payload, false, null);
    } catch (e) {
      console.error(`[acculynx-webhook] unverified-event log failed: ${(e as Error).message}`);
    }
    console.warn(`[acculynx-webhook] 401 unverified request (topic=${payload.topic ?? "unknown"})`);
    return json({ error: "unauthorized" }, 401);
  }

  const route = routeTopic(payload);

  let logResult;
  try {
    logResult = await logEvent(sb, payload, true, route.enqueuedAction);
  } catch (e) {
    console.error(`[acculynx-webhook] event log failed: ${(e as Error).message}`);
    return json({ error: "log failed" }, 500);
  }

  if (logResult.isReplay) {
    // Replay defense (T-07-08-03): this event_id already landed as a verified row — ack fast,
    // do NOT re-enqueue or re-process.
    return json({ status: "replay-ack" }, 200);
  }

  try {
    await enqueuePull(sb, route);
  } catch (e) {
    // Enqueue failure does not change the 200 response to AccuLynx (avoid retry-storm on our
    // own downstream error) — it is surfaced via server logs for operator follow-up.
    console.error(`[acculynx-webhook] enqueue failed: ${(e as Error).message}`);
  }

  return json({ status: "ok", enqueuedAction: route.enqueuedAction }, 200);
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
