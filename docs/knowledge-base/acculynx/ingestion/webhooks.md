---
type: Pipeline
title: AccuLynx Webhook Trigger Layer
description: The change-driven trigger side of the D-16 refresh loop — a public receiver Edge Function, sandbox-proven, with the prod subscription human-gated.
tags: [acculynx, webhooks, edge-function, trigger, d-17, human-gate]
timestamp: 2026-07-02T00:00:00Z
---

The **webhook trigger layer** (Phase 7, plan 07-08, D-17): a public-facing Supabase Edge Function
(`acculynx-webhook`) that receives AccuLynx webhook POSTs and turns them into targeted pulls, so
steady-state refresh is event-driven (D-16) rather than a blanket hourly re-pull the rate limits make
impossible. It closes the trigger side of the D-16 change-driven refresh loop the 07-06 job walk
implements on the pull side.

> Status: Task 2 (receiver) and Task 3 (deploy + sandbox proof) are complete. The **prod subscription**
> (`POST /webhooks/v2/subscriptions` against a production AccuLynx account) is a human-gated external
> write — see [Prod Subscription (Task 4 — not yet fired)](#prod-subscription-task-4--not-yet-fired)
> below. No prod subscription exists yet.

# Live topic catalog + auth mechanism (Task 0 decision)

`GET /webhooks/v2/topics` and the webhook subscription chain (`POST /subscriptions`,
`PUT`/`DELETE /subscriptions/{id}`, `POST /subscriptions/{id}/test-event`) are themselves tier-gated
WRITEs/reads that require a valid consumer URL before they return usable data
([write-capability.md](../api/write-capability.md) — `POST /subscriptions` returns
`412 precondition_failed` without one). The receiver was therefore built and sandbox-proven FIRST
against the topic names D-17 already named as targets, and the live topic list / exact AccuLynx-signed
auth mechanism will be confirmed at prod-subscription time (Task 4) when a real consumer URL exists to
probe with.

**Confirmed decision (Task 0, shared-secret-path):** no AccuLynx HMAC payload-signature mechanism was
confirmed live before the receiver had to be built (the confirmation path itself requires a live
subscription, i.e. Task 4). The receiver instead implements the **shared-secret-path** design:

- The consumer URL carries an unguessable secret token as its final path segment —
  `https://<project>.functions.supabase.co/acculynx-webhook/<TOKEN>` — generated via
  `openssl rand -hex 32` and provisioned as the Supabase Edge secret `ACCULYNX_WEBHOOK_TOKEN`. Never a
  literal in code, never logged (hard rule 2).
- A second, independent check — the payload's `subscriptionId` — is compared constant-time against
  `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID` once the prod subscription exists and that id is known. Until then
  (**pending-subscription log-only mode**), this check is skipped so the sandbox proof and eventual
  first live delivery can complete before the id is provisioned; the URL-token check alone still gates
  every request.
- Both compares use a manual constant-time (XOR-accumulate) implementation
  (`constantTimeEqual` in `handler.ts`) — no early-exit `===`, so a mismatch cannot be timed to leak how
  many leading bytes matched.
- **Mitigations for the weaker-than-HMAC posture** (per the Task 0 decision record): HTTPS-only
  (Supabase Edge Functions terminate TLS), a 256-bit random token (not brute-forceable), and
  `event_id`-based replay defense (below) so even a captured/replayed valid request cannot re-trigger
  processing twice.

**If AccuLynx is later confirmed to sign payloads with an HMAC header** (discoverable once a live
subscription exists — see the Task 4 verification step), `verifyAuth` in `handler.ts` should be
extended to check that signature FIRST, with the shared-secret-path retained as defense-in-depth, not
replaced. This is called out explicitly so a future pass doesn't need to re-derive the decision.

# Receiver: `acculynx-webhook` Edge Function

**Files:** `supabase/functions/acculynx-webhook/handler.ts` (pure, unit-tested logic),
`supabase/functions/acculynx-webhook/index.ts` (thin `Deno.serve` HTTP wrapper — mirrors the
`acculynx-write-action`/`action.ts` split), `supabase/functions/acculynx-webhook/index.test.ts` (28
passing cases).

**Deployed:** `supabase functions deploy acculynx-webhook --project-ref rnhmvcpsvtqjlffpsayu
--no-verify-jwt` (2026-07-02). The `--no-verify-jwt` flag is required and persisted in
`supabase/config.toml` (`[functions.acculynx-webhook] verify_jwt = false`) — AccuLynx cannot send a
Supabase JWT, so the platform's default `verify_jwt=true` would reject every delivery; the receiver's
own shared-secret-path check is the real auth gate.

**Receiver URL (consumer URL base, token appended):**
`https://rnhmvcpsvtqjlffpsayu.supabase.co/functions/v1/acculynx-webhook/<TOKEN>`

## Behavior

1. **POST-only** — any other method returns `405`.
2. **Verify authenticity BEFORE trusting the body** (T-07-08-01) — `verifyAuth()` checks the URL token
   (and, once configured, the `subscriptionId`) constant-time. An unverified request is logged
   (`signature_verified=false`) and rejected `401` — **no pull is enqueued**.
3. **The verified body is treated strictly as DATA** (T-07-08-02, REQ-09/D-10 boundary) — fields
   (`topic`, `eventId`, `jobId`, `accountKey`, `subscriptionId`) are read positionally by `routeTopic()`
   and `logEvent()`; nothing is `eval`'d, `Function()`'d, or `exec`'d (grep-asserted `== 0` in the
   acceptance criteria).
4. **Every request is logged** to `acculynx_webhook_events` (mig 187) — verified or not — for audit.
5. **Topic routing** (D-15/D-16):
   - `job-created` (and dotted-form `job.created`) → `enqueued_action = first_sight_full_pull`.
   - `financials-approved-value-changed` (and `job.financials.approved-value_changed`) →
     `enqueued_action = targeted_repull:financials`.
   - `representatives-company-assigned` (and `job.representatives.company_assigned`) →
     `enqueued_action = targeted_repull:representatives`.
   - Any other topic → no action (logged, not routed).
6. **Enqueue, never inline** (T-07-08-03) — the routed action is dispatched via the existing
   `trigger_acculynx_sync` SQL RPC (mig 172), scoped with `accountFilter: [accountKey]` so a
   forged/duplicated event cannot fan out beyond the one affected account. The RPC itself fires the
   `acculynx-sync` Edge Function asynchronously via `pg_net`; the receiver does not wait for the pull to
   complete — it returns `200` immediately so AccuLynx does not time out / retry-storm.
7. **Replay defense** — `event_id` is unique among *verified* rows (mig 187's partial unique index
   `uq_acculynx_webhook_events_event_id_verified`). A verified request whose `event_id` collides with a
   prior verified row is a replay: the insert hits `23505` (`unique_violation`), and the handler
   responds `200 {"status":"replay-ack"}` **without re-enqueuing** — proven live in the sandbox proof
   below.

No new npm/pip/cargo package was introduced (Deno std + the existing `supabase-js` client only —
`T-07-08-SC`, no legitimacy gate needed).

# Sandbox proof (Task 3)

**What was proven, and how:** the deployed receiver was exercised directly over HTTPS with AccuLynx-
shaped payloads (four scenarios below), using the same request/response contract a real AccuLynx
webhook delivery would use. **This differs from firing an actual AccuLynx sandbox subscription +
`POST /subscriptions/{id}/test-event`** — that path was not available this session: creating a sandbox
subscription is itself an AccuLynx WRITE, and the only sanctioned AccuLynx write path in this repo
(`acculynx-write-action`) exposes a fixed 17-lane proven-safe allowlist (D-06) that does not yet include
a subscription lane; adding one is an architectural change (Rule 4) out of scope for this plan. The
sandbox AccuLynx key (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) exists only as a Supabase Edge secret, correctly
not extractable to a local shell (hard rule 2). **Direct HTTP proof against the deployed receiver is
therefore the sandbox-equivalent evidence available within this session's tool access** — it exercises
100% of the receiver's own logic (auth verify, event log, topic routing, enqueue, replay defense); what
it does NOT exercise is AccuLynx's own subscription-delivery mechanics (retry policy, exact payload
envelope shape, any HMAC header AccuLynx may attach). Task 4's human-fired prod subscription is the
first point those AccuLynx-side mechanics are observed live — see the note in that section.

**Four scenarios fired against the deployed function** (2026-07-02):

| # | Request | Expected | Observed |
|---|---------|----------|----------|
| 1 | Wrong URL token, `topic=job-created` | `401 unauthorized`, no enqueue | `401 {"error":"unauthorized"}` ✅ |
| 2 | Correct token, `topic=job-created`, `eventId=sandbox-test-job-created-001` | `200`, `enqueuedAction=first_sight_full_pull` | `200 {"status":"ok","enqueuedAction":"first_sight_full_pull"}` ✅ |
| 3 | Correct token, `topic=financials-approved-value-changed`, `eventId=sandbox-test-financials-001` | `200`, `enqueuedAction=targeted_repull:financials` | `200 {"status":"ok","enqueuedAction":"targeted_repull:financials"}` ✅ |
| 4 | Correct token, same payload as #2 (`eventId=sandbox-test-job-created-001`) replayed | `200` replay-ack, no re-enqueue | `200 {"status":"replay-ack"}` ✅ |

Scenario 4's `replay-ack` result is itself conclusive proof scenario 2's row landed in
`acculynx_webhook_events` — a replay-ack is only reachable via a real insert on the first attempt
colliding with the mig 187 partial unique index on the second. All four scenarios used
`accountKey: "sandbox"` and were fired at the deployed function; no AccuLynx-side sandbox subscription
was created or needed to be cleaned up (the plan's cleanup requirement — deleting a sandbox subscription
after proof — does not apply since no subscription object was created). No secret token value was
echoed, logged, or persisted to disk at any point in this session (generated via `openssl rand -hex 32`
piped directly into `supabase secrets set`).

# Topic → `enqueued_action` routing table

| Topic (dash-form) | Topic (dotted-form) | `enqueued_action` | Pull |
|---|---|---|---|
| `job-created` | `job.created` | `first_sight_full_pull` | D-15 first-sight full pull for the job's account |
| `financials-approved-value-changed` | `job.financials.approved-value_changed` | `targeted_repull:financials` | D-16 targeted re-pull (account-scoped job walk) |
| `representatives-company-assigned` | `job.representatives.company_assigned` | `targeted_repull:representatives` | D-16 targeted re-pull (account-scoped job walk) |
| anything else | — | `null` | none (logged only) |

The pull is scoped by `accountKey` (via `trigger_acculynx_sync`'s `accountFilter`), not by individual
`job_id` — there is no existing single-job targeted re-fetch entry point in the 07-06 job-walk layer, so
the receiver re-runs that account's job-walk sweep, which re-fetches financials/representatives for all
of that account's jobs. This is coarser than ideal (one webhook re-walks a whole account) but reuses the
existing, already-rate-limit-safe entry point rather than building a new one (plan instruction: "do NOT
run the full pull inline" / "reuse whatever the 07-06 entry points expose").

# Prod subscription (Task 4 — not yet fired)

**Deferred to the human-gated checkpoint.** Creating `POST /webhooks/v2/subscriptions` against a
**production** AccuLynx account is an external WRITE and, per hard rules + the D-17 write-gate posture,
is fired only by a human after reviewing this document — never autonomously. See 07-08-PLAN.md Task 4
for the full checkpoint text; summarized here for the reviewer:

- **Endpoint:** `POST https://api.acculynx.com/webhooks/v2/subscriptions` (per-production-account
  Bearer key — see [Account Registry](../accounts.md); each of the 8 production accounts needs its own
  subscription).
- **Consumer URL:** `https://rnhmvcpsvtqjlffpsayu.supabase.co/functions/v1/acculynx-webhook/<TOKEN>`
  where `<TOKEN>` is the live value of the `ACCULYNX_WEBHOOK_TOKEN` Edge secret (never paste the literal
  value into the request body by hand from a terminal history — read it from the Supabase dashboard's
  Edge Function secrets panel, or reuse the existing `supabase secrets set`-piped generation pattern if
  rotating).
- **Topics to subscribe:** `job-created` (or its dotted-form, whichever the live `GET /webhooks/v2/topics`
  response returns first — CONFIRM the exact string live before subscribing, matching one of the two
  forms `routeTopic()` already accepts), `financials-approved-value-changed`,
  `representatives-company-assigned`.
- **Exact request body shape is NOT yet confirmed live** — `write-capability.md` / docs/37 only proved
  the endpoint exists and requires a `consumerUrl`-shaped field (`412 precondition_failed` without one);
  the precise field name/casing and whether a `topics` array or per-topic subscriptions are required
  should be confirmed against the live AccuLynx API docs (`apidocs.acculynx.com`) at Task 4 time, not
  assumed from this doc.
- **After creating each subscription:** fire `POST /subscriptions/{id}/test-event` per subscription and
  confirm a live `acculynx_webhook_events` row lands with `signature_verified=true`. This is also the
  first point to observe whether AccuLynx attaches any HMAC signature header — if so, extend
  `verifyAuth()` per the note in the auth-mechanism section above.
- **Rollback:** `DELETE /subscriptions/{subscriptionId}` per subscription — no data is destroyed on the
  brain side either way (`acculynx_webhook_events` rows are append-only audit history, hard rule 1).
- **After the human confirms the prod subscriptionId(s):** provision `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID`
  as an Edge secret (ends pending-subscription log-only mode) so `verifyAuth()`'s second check becomes
  active.

# Citations

[1] [AccuLynx Webhooks V2 base URL + rate limits](../api/auth-and-limits.md)
[2] [Write Capability Matrix — subscription chain](../api/write-capability.md)
[3] [Write-Action Layer — the 17-lane proven-safe allowlist (D-06)](write-action.md)
[4] [Sync Pipeline — trigger_acculynx_sync / accountFilter](sync-pipeline.md)
