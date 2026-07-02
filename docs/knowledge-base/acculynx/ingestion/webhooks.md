---
type: Pipeline
title: AccuLynx Webhook Trigger Layer
description: The change-driven trigger side of the D-16 refresh loop — a public receiver Edge Function, live-proven against a wichita-only canary prod subscription.
tags: [acculynx, webhooks, edge-function, trigger, d-17, human-gate, canary]
timestamp: 2026-07-02T00:00:00Z
---

The **webhook trigger layer** (Phase 7, plan 07-08, D-17): a public-facing Supabase Edge Function
(`acculynx-webhook`) that receives AccuLynx webhook POSTs and turns them into targeted pulls, so
steady-state refresh is event-driven (D-16) rather than a blanket hourly re-pull the rate limits make
impossible. It closes the trigger side of the D-16 change-driven refresh loop the 07-06 job walk
implements on the pull side.

> Status: **All 8 production accounts have webhook subscriptions created** (human green-lit the
> remaining 7 on 2026-07-02 — see [Rollout: 8/8 accounts subscribed](#rollout-88-accounts-subscribed-2026-07-02)
> below). The receiver's topic-routing map initially used invented topic names and misrouted all
> three live canary deliveries (`topic="unknown"`, `enqueued_action=null`) — this was found and
> fixed same-session; see [Live envelope correction](#live-envelope-correction-2026-07-02) below.
> A SECOND live-fix was required after the 7-account rollout: `verifyAuth()` only recognized the
> single wichita canary `subscriptionId`, so all 7 new accounts' test-events landed
> `signature_verified=false` despite HTTP 200 delivery — see
> [Multi-subscription auth fix](#multi-subscription-auth-fix-2026-07-02-post-plan) below. That fix
> is deployed and unit-tested; **live re-verification (firing test-events for the 7 new
> subscriptions) is BLOCKED in the current session** by sandbox file-access permissions on the
> root `.env` (needed to read each account's AccuLynx Bearer key) — see that section for the
> precise blocker and required next step.

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
  `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID` once the prod subscription exists and that id is known.
  **Update (2026-07-02):** this is no longer pending — the wichita canary subscription exists and
  `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID` is provisioned as `ab5a7544-189b-4892-afe9-b19b5a02f46c`, so this
  check is now active for wichita's deliveries. Pending-subscription log-only mode still applies to any
  future subscription before its id is known (e.g. during the remaining-accounts rollout).
- Both compares use a manual constant-time (XOR-accumulate) implementation
  (`constantTimeEqual` in `handler.ts`) — no early-exit `===`, so a mismatch cannot be timed to leak how
  many leading bytes matched.
- **Mitigations for the weaker-than-HMAC posture** (per the Task 0 decision record): HTTPS-only
  (Supabase Edge Functions terminate TLS), a 256-bit random token (not brute-forceable), and
  `event_id`-based replay defense (below) so even a captured/replayed valid request cannot re-trigger
  processing twice.

**If AccuLynx is later confirmed to sign payloads with an HMAC header** (no HMAC header has been
observed across any live delivery so far, including the canary proof below) — `verifyAuth` in
`handler.ts` should be extended to check that signature FIRST, with the shared-secret-path retained as
defense-in-depth, not replaced. This is called out explicitly so a future pass doesn't need to
re-derive the decision.

# Receiver: `acculynx-webhook` Edge Function

**Files:** `supabase/functions/acculynx-webhook/handler.ts` (pure, unit-tested logic),
`supabase/functions/acculynx-webhook/index.ts` (thin `Deno.serve` HTTP wrapper — mirrors the
`acculynx-write-action`/`action.ts` split), `supabase/functions/acculynx-webhook/index.test.ts` (52
passing cases, including REAL-envelope regression tests added in the live-envelope-correction pass and
multi-subscription auth tests added in the 2026-07-02 post-plan rollout fix).

**Deployed:** `supabase functions deploy acculynx-webhook --project-ref rnhmvcpsvtqjlffpsayu
--no-verify-jwt` (2026-07-02, redeployed twice same day — once after the routing fix, once after the
multi-subscription auth fix below). The `--no-verify-jwt` flag is
required and persisted in `supabase/config.toml` (`[functions.acculynx-webhook] verify_jwt = false`) —
AccuLynx cannot send a
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
5. **Topic routing** (D-15/D-16) — see the corrected [routing table](#topic--enqueued_action-routing-table)
   below for the full real-vs-alias mapping (corrected 2026-07-02):
   - `job_created` (real; `job-created`/`job.created` kept as aliases) →
     `enqueued_action = first_sight_full_pull`.
   - `job.financials.approved-value_changed` (real; `financials-approved-value-changed` alias) →
     `enqueued_action = targeted_repull:financials`.
   - `job.representatives.company_assigned` (real; `representatives-company-assigned` alias) →
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

# Live envelope correction (2026-07-02)

**What went wrong:** the receiver was designed and built (Tasks 0-3) against topic names D-17 had
*named as targets* before any live subscription existed to confirm them against — the invented
dash-form strings `job-created`, `financials-approved-value-changed`,
`representatives-company-assigned`. When the wichita canary subscription (below) fired its first
three real test-events, all three landed in `acculynx_webhook_events` with `signature_verified=true`
(the auth chain worked correctly) but `topic="unknown"` and `enqueued_action=null` — the routing map
simply didn't recognize the real strings.

**Root cause (verified from the stored payload, DB row id 7):** AccuLynx's real envelope is **flat**,
not the `{topic, jobId, accountKey}` shape assumed at design time:

```json
{
  "event": { "job": { "id": "769609b9-...", "companyRepresentative": { "...": "..." } } },
  "eventDateTime": "2026-07-02T20:16:12.98...Z",
  "eventId": "88f261e9-91c6-435e-8528-3bf12a13e2ce",
  "subscriptionId": "ab5a7544-189b-4892-afe9-b19b5a02f46c",
  "topicName": "job.representatives.company_assigned"
}
```

The real topic field is `topicName` (not `topic`), and the three live-observed values are
`job_created`, `job.financials.approved-value_changed`, `job.representatives.company_assigned` — the
dotted forms, confirmed live, not merely an alternate spelling of the dash-form guesses. The affected
job's GUID is nested at `event.job.id`, not a top-level `jobId`. **There is no account identifier
anywhere in the envelope** — AccuLynx doesn't tell the receiver which account a delivery came from.

**Fix applied** (`handler.ts`/`index.ts`, same session):

- The real topic strings are now the PRIMARY routing-map entries; the original invented dash-form
  names are kept as harmless aliases (cost nothing, may still matter if any other integration assumed
  them).
- `extractTopic()`/`extractJobId()` read `topicName`/`event.job.id` first, falling back to the
  legacy `topic`/`jobId` fixture fields — so the Task 3 sandbox-proof fixtures (fired before this
  fix) still route correctly.
- **`accountKeyForSubscription()` + `ACCULYNX_WEBHOOK_ACCOUNT_MAP`** (new): since the envelope carries
  no account field, the account is derived from *which subscription delivered the event* — a stable
  1:1 mapping, because each AccuLynx subscription is created against exactly one production account
  (write-capability.md — the subscription endpoint is keyed by the calling account's Bearer key).
  **Design choice:** a single JSON-object Edge secret, `ACCULYNX_WEBHOOK_ACCOUNT_MAP =
  {"<subscriptionId>": "<account_key>", ...}`, parsed once at module load (not per-request, not a DB
  round-trip). This was chosen over a DB-table mapping as the simplest durable option for the current
  scale (up to 8 subscriptions, one per production account) — a table would add a query per request
  for no benefit at this size; if the account count grows substantially or the map needs to change
  without a redeploy/secret-rotation, revisit as a small lookup table.
- Deployed: `supabase functions deploy acculynx-webhook --project-ref rnhmvcpsvtqjlffpsayu
  --no-verify-jwt` (redeployed same session after the fix).
- Re-fired all three real topics against the live canary — see
  [Canary Subscription (live)](#canary-subscription-live) for the corrected result.

# Sandbox proof (Task 3, historical — see the canary section below for the live-proven result)

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

**Corrected 2026-07-02** — the real (live-confirmed) topic strings are now the primary map entries;
the originally-assumed dash-form names are retained as harmless aliases only (never observed live).

| Topic (REAL, live-confirmed) | Alias (dash-form, never observed live) | `enqueued_action` | Pull |
|---|---|---|---|
| `job_created` | `job-created` / `job.created` | `first_sight_full_pull` | D-15 first-sight full pull for the job's account |
| `job.financials.approved-value_changed` | `financials-approved-value-changed` | `targeted_repull:financials` | D-16 targeted re-pull (account-scoped job walk) |
| `job.representatives.company_assigned` | `representatives-company-assigned` | `targeted_repull:representatives` | D-16 targeted re-pull (account-scoped job walk) |
| anything else | — | `null` | none (logged only) |

The pull is scoped by `accountKey` (via `trigger_acculynx_sync`'s `accountFilter`), not by individual
`job_id` — there is no existing single-job targeted re-fetch entry point in the 07-06 job-walk layer, so
the receiver re-runs that account's job-walk sweep, which re-fetches financials/representatives for all
of that account's jobs. This is coarser than ideal (one webhook re-walks a whole account) but reuses the
existing, already-rate-limit-safe entry point rather than building a new one (plan instruction: "do NOT
run the full pull inline" / "reuse whatever the 07-06 entry points expose").

The `accountKey` used to scope the pull (and logged to `acculynx_webhook_events.account_key`) is
resolved from the delivering `subscriptionId` via `ACCULYNX_WEBHOOK_ACCOUNT_MAP` — see
[Live envelope correction](#live-envelope-correction-2026-07-02) above. An unmapped `subscriptionId`
resolves to `accountKey = null`, which means **no pull is enqueued** (correct fail-closed behavior —
better to silently no-op than fan out a pull against the wrong account).

# Canary subscription (live)

**Human-approved wichita-only prod canary**, created 2026-07-02 after explicit human approval (per the
Task 4 checkpoint below) — the first and, as of this writing, only production AccuLynx webhook
subscription:

| Field | Value |
|---|---|
| Account | `wichita` (production) |
| `subscriptionId` | `ab5a7544-189b-4892-afe9-b19b5a02f46c` |
| Status | `Enabled` |
| Topics | `job_created`, `job.financials.approved-value_changed`, `job.representatives.company_assigned` |
| Consumer URL | `https://rnhmvcpsvtqjlffpsayu.supabase.co/functions/v1/acculynx-webhook/<TOKEN>` |
| Created | 2026-07-02 |

**Secrets provisioned** (Supabase Edge secrets — never a literal in code, never logged, hard rule 2):

- `ACCULYNX_WEBHOOK_TOKEN` — **rotated** at canary-creation time (fresh `openssl rand -hex 32`,
  piped directly into `supabase secrets set`, never displayed).
- `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID` — provisioned as `ab5a7544-189b-4892-afe9-b19b5a02f46c` (ends
  pending-subscription log-only mode; `verifyAuth()`'s second check is now active for this
  subscription).
- `ACCULYNX_WEBHOOK_ACCOUNT_MAP` — provisioned as `{"ab5a7544-189b-4892-afe9-b19b5a02f46c":"wichita"}`
  (added same-session as the routing fix, above).

**Live proof — three real test-events fired via `POST
/webhooks/v2/subscriptions/ab5a7544-.../test-event`** (2026-07-02, using the wichita production Bearer
key read in-place from the environment, never echoed):

| # | `topicName` fired | HTTP response | DB row (`acculynx_webhook_events`) |
|---|---|---|---|
| 1 | `job_created` | `202` | id=8, `signature_verified=true`, `topic=job_created`, `job_id=35588117-73d0-427c-bbe8-384f3b7eaf0b`, `account_key=wichita`, `enqueued_action=first_sight_full_pull` |
| 2 | `job.financials.approved-value_changed` | `202` | id=9, `signature_verified=true`, `topic=job.financials.approved-value_changed`, `job_id=94d98446-59f2-4c14-93b2-e4043ffcf0e9`, `account_key=wichita`, `enqueued_action=targeted_repull:financials` |
| 3 | `job.representatives.company_assigned` | `202` | id=10, `signature_verified=true`, `topic=job.representatives.company_assigned`, `job_id=754891ca-02ea-4c81-9ba9-f39fe4f57a1c`, `account_key=wichita`, `enqueued_action=targeted_repull:representatives` |

All three: HTTP `202` from AccuLynx, correct auth chain (`signature_verified=true`), `event_id`
captured, correct real topic string logged (no longer `unknown`), correct `enqueued_action`, correct
`account_key='wichita'` (resolved via the new subscriptionId map). This supersedes the earlier
same-session result (DB rows 5-7) where all three test-events passed auth but landed
`topic=unknown`/`enqueued_action=null` due to the routing-map bug fixed above.

**Note on test-event job GUIDs:** the `job_id` values above (e.g. `35588117-...`) are AccuLynx
test-event placeholders, not real wichita jobs — `trigger_acculynx_sync` was still correctly invoked
scoped to `accountFilter: ["wichita"]` (the account-level job-walk sweep, not a single-job fetch, per
the routing-table note above), so the enqueue itself succeeds regardless of whether the placeholder
job GUID resolves to anything in the account's real job list. A test-event's downstream pull
legitimately no-op'ing (`processed=false` with a logged reason, if the walk cannot resolve the
placeholder GUID) is expected and acceptable for test events — this is not a production-delivery
failure mode, since real deliveries carry real job GUIDs.

# Rollout: 8/8 accounts subscribed (2026-07-02)

The human green-lit the remaining **7 production accounts** (see [Account Registry](../accounts.md))
on 2026-07-02. The orchestrator created all 7 subscriptions (each its own `POST
/webhooks/v2/subscriptions` call, authenticated with that account's own Bearer key, using the same
shared consumer URL/token and the same three topics) — all 7 calls returned HTTP `200`, and
`ACCULYNX_WEBHOOK_ACCOUNT_MAP` was extended (not replaced) to all 8 entries (subscriptionId prefixes
only, no full ids or secrets committed to docs):

| Account | Subscription id (prefix) |
|---|---|
| `wichita` (canary) | `ab5a7544-...` |
| `colorado` | `9a9682ac-...` |
| `florida` | `514355b8-...` |
| `georgia` | `5a8e9a9f-...` |
| `insurance_program` | `8a4877f9-...` |
| `kansas_city` | `90e9f87f-...` |
| `multi_family_commercial` | `805e0746-...` |
| `texas` | `efa8a7a1-...` |

The orchestrator then fired 7 test-events (one per new subscription) — all delivered (HTTP 200), but
**all 7 landed `signature_verified=false`, `account_key=null`** in `acculynx_webhook_events`. This is
the multi-subscription auth bug documented next, not a delivery or account-map problem.

## Multi-subscription auth fix (2026-07-02, post-plan)

**Root cause (verified in source, `handler.ts`):** `verifyAuth()`'s subscriptionId check compared
`payload.subscriptionId` against the SINGLE env var `ACCULYNX_WEBHOOK_SUBSCRIPTION_ID` — provisioned
at canary time as the wichita subscription's id only. This was a correct design for exactly one
subscription; once 8 subscriptions existed, the other 7 accounts' deliveries legitimately carry a
DIFFERENT `subscriptionId` that can never match that single value, so `verifyAuth()` rejected every
one of them (auth check failed, hence `signature_verified=false` and no `account_key` resolution —
`routeTopic()`/`accountKeyForSubscription()` were never even reached).

**The one-subscription assumption was baked in at design time** (see
[Live envelope correction](#live-envelope-correction-2026-07-02) above) because only the wichita canary
existed when `AuthConfig`/`verifyAuth()` were built — `ACCULYNX_WEBHOOK_ACCOUNT_MAP` was added in that
same pass for *routing* (account resolution) but `verifyAuth()`'s auth check was never updated to also
consult it. **Lesson:** when a design decision is scoped to "the only instance that exists right now"
(one canary subscription), leave an explicit TODO/flag at the exact line that assumption lives in, so
a later rollout to N instances doesn't silently miss updating every place the assumption was encoded —
here it was encoded twice (routing AND auth) and only the routing side got the account-map treatment.

**Fix applied** (`handler.ts`/`index.ts`, this pass): `AuthConfig` gained an `accountMap` field.
`verifyAuth()` now accepts a `subscriptionId` that constant-time-matches EITHER
`expectedSubscriptionId` (back-compat, still covers the wichita canary) OR any key of `accountMap` —
every map key is compared unconditionally (no early exit on the first match), preserving the same
constant-time discipline as the rest of the module so timing cannot reveal which subscription (if any)
matched. `index.ts` wires the already-parsed `WEBHOOK_ACCOUNT_MAP` into `verifyAuth`'s config. Empty
`expectedSubscriptionId` + empty `accountMap` still falls back to pending-subscription log-only mode
unchanged. 5 new unit tests cover: a map-key subscriptionId verifies, an unmapped id still rejects,
back-compat single-id verification still works, and the empty-both log-only path. All 52 deno tests +
`deno check` green.

**Redeployed:** `supabase functions deploy acculynx-webhook --project-ref rnhmvcpsvtqjlffpsayu
--no-verify-jwt` (2026-07-02, this pass). A bogus-token curl against the redeployed receiver still
returns `401`, confirming the auth gate is intact for genuinely unauthenticated requests.

**Live re-verification status: BLOCKED, not yet complete.** Re-firing test-events for the 7 new
subscriptions (per the plan's step 4/5) requires reading each account's
`PE_CC_<ACCOUNT>_ACCULYNX_API_KEY` from the root `.env` to authenticate the
`POST /subscriptions/{id}/test-event` call. In this session, both the `Bash` and `Read` tools were
**permission-denied against the root `.env` and the entire `config/` directory** (a sandbox-level
file-access restriction, not a secret-content filter — even a line-count `grep -c "="` on the file was
denied). No workaround (variable indirection, alternate tool path, etc.) was attempted beyond
confirming the boundary is real; per hard rule 2 and the plan's explicit scope limit ("the ONLY
AccuLynx writes permitted are the listed test-event POSTs"), this was not something to route around.

**What IS verified as of this pass:**
- The auth-fix code change (unit-tested, 52/52 green, `deno check` clean).
- The redeploy succeeded (`supabase functions deploy` returned success).
- A bogus-token request against the live redeployed receiver still 401s (auth gate not broken open).
- DB rows 11-18 (`acculynx_webhook_events`) are the orchestrator's ORIGINAL pre-fix 7 test-event
  fires (received 2026-07-02 21:46-21:50 UTC, before this pass's redeploy) — all
  `signature_verified=false`, `account_key=null`, exactly matching the reported bug. These rows
  predate the fix and are NOT evidence the fix works; they are the failure this fix targets.

**Required next step (needs either human action or a session with `.env`/`config/` read access):**
re-fire one `POST /subscriptions/{id}/test-event` per new subscription (ids listed above, full values
in the account-map secret) and confirm each lands `signature_verified=true` with the correct
`account_key` and a non-null `enqueued_action` — the same pattern already proven for wichita (rows
8/9/10 above). Until that re-fire happens, the 7 non-wichita accounts' PRODUCTION webhook deliveries
will silently fail auth in the same way (fail-closed: `401`, no pull enqueued) even though the code fix
is deployed — this is a delivery-availability gap for 7 of 8 accounts, not a security regression (the
fail-closed posture is exactly what T-07-08-01 requires when auth cannot be confirmed).

## Rollout mechanics (for reference)

- Each additional account's subscription used its own account's Bearer key against the per-account-keyed
  `POST /webhooks/v2/subscriptions` endpoint, the SAME consumer URL/token (a receiver-level shared
  secret, not per-subscription), and the same three topics (`job_created`,
  `job.financials.approved-value_changed`, `job.representatives.company_assigned`).
- **`ACCULYNX_WEBHOOK_SUBSCRIPTION_ID`** (singular) still only tracks the wichita canary's id — now
  formally a back-compat/defense-in-depth check (see the fix above); `accountMap` is the mechanism that
  actually covers all 8 subscriptions for auth purposes.
- **Rollback:** `DELETE /subscriptions/{subscriptionId}` per subscription — no data is destroyed on the
  brain side either way (`acculynx_webhook_events` rows are append-only audit history, hard rule 1).
- **If AccuLynx is later confirmed to sign payloads with an HMAC header** (observable from a live
  subscription's actual headers — none has been seen yet across all deliveries in this session):
  extend `verifyAuth()` to check that signature FIRST, with the shared-secret-path retained as
  defense-in-depth, not replaced.

# Citations

[1] [AccuLynx Webhooks V2 base URL + rate limits](../api/auth-and-limits.md)
[2] [Write Capability Matrix — subscription chain](../api/write-capability.md)
[3] [Write-Action Layer — the 17-lane proven-safe allowlist (D-06)](write-action.md)
[4] [Sync Pipeline — trigger_acculynx_sync / accountFilter](sync-pipeline.md)
