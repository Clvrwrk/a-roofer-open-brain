---
type: Pipeline
title: AccuLynx Write-Action Layer
description: The human-approval-gated write path — the sole way any AccuLynx production write is ever fired, through the Command Center work-queue.
tags: [acculynx, write, action, approval-gate, idempotency, edge-function, command-center]
timestamp: 2026-07-01T00:00:00Z
---

The read/write **action layer** (Phase 5, REQ-08): a human-approval-gated wrapper around the 17
proven-safe AccuLynx write lanes from Phase 4. An agent *enqueues* a proposed write; a human *previews*
the exact request on the Command Center work-queue and *approves*; only then does the
`acculynx-write-action` Edge Function *execute* it and record an audit row. It is the write-side
counterpart to the [write-sweep](write-sweep.md) red-team harness — that one mapped what is *writable*;
this one is how a write is *actually fired* in production, safely, with a human in the loop.

> Status: this doc is authored during Phase 5 Wave 3 (Plan 05-04). Deploy SHAs, sandbox proof, and the
> first prod payment audit row are filled in as each blocking checkpoint clears.

# Purpose

Phase 4 proved *which* AccuLynx write endpoints work (the 17-lane proven-safe matrix in
[write-capability.md](../api/write-capability.md) / [docs/37](../../../37-acculynx-write-capability-matrix.md)).
Phase 5 makes those writes *usable* without ever letting an agent fire a production write unattended.
The design contract (05-CONTEXT.md):

- **D-02** — a single new Edge Function, `acculynx-write-action`, is the **sole prod-write path**. No other
  component calls AccuLynx with a write verb.
- **D-03** — the dry-run preview and the execute build **byte-identical** requests from one builder
  (`buildWriteRequest`); there is no second "preview" constructor that could drift from what actually fires.
- **D-07 / D-08** — the Command Center dashboard is the authoritative approval surface; Slack is notify-only.
- **D-09** — a prod-target write needs **two barriers**: an explicit prod target + non-empty accountKey
  (barrier #1, `assertTarget` in code) **and** a human approver holding the `approval.decide_prod_write`
  permission (barrier #2, the `PROD_WRITE_APPROVER_EMAILS` roster).

# The enqueue → preview → approve → execute → audit loop

1. **Enqueue** — an agent authenticates per the [workos-agent-auth](../../../../.claude/skills/workos-agent-auth/SKILL.md)
   skill and `POST`s a proposed write to the Command Center. It lands as a pending row.
2. **Preview** — the item appears on the work-queue (HumanUnblockerDashboard) with a readable dry-run
   preview of the *exact* request that will fire (method, path, redacted body). D-03 guarantees the preview
   equals the execute.
3. **Notify** — a notify-only Slack message posts to the configured channel (D-08).
4. **Approve** — a permitted human approves in the dashboard. The decision endpoint invokes
   `acculynx-write-action` synchronously with the full body.
5. **Execute** — the Edge Function resolves the account key per-request, checks the idempotency key against
   `acculynx_write_action_log`, fires the write, and returns the result.
6. **Audit** — every execute writes an `acculynx_write_action_log` row (approver, target, idempotency key,
   redacted request/response) — SC2.

A **rejected** item never invokes the Edge Function (SC4). A **repeated idempotency key** fires no second
write (idempotency guard).

# The two deploy paths (they are separate — this is the deploy contract)

The action layer ships through **two independent deploy pipelines**. Conflating them is the classic
live⇄dev drift trap; keep them distinct.

| Component | Deploy mechanism | What it publishes | Verify |
|-----------|------------------|-------------------|--------|
| `acculynx-write-action` Edge Function | **`supabase functions deploy acculynx-write-action`** (NOT Coolify) | the live write executor holding AccuLynx keys | `supabase functions list` shows it ACTIVE |
| Command Center approval loop | **Coolify** (build from GitHub `main`) | the enqueue route + work-queue surface + decision-endpoint invocation | `GET https://cc.proexteriorsus.net/healthz` `buildCommit` == pushed SHA |

Edge functions deploy separately per the deploy contract and the 05-RESEARCH environment note. The Command
Center converges the `contrib/cleverwork/read-write-action-layer` branch into `main` **first**, then pushes;
`main` is the only thing Coolify builds (CONVENTIONS §13). Explain-then-ship (state change, user-visible
impact, rollback) precedes any push.

**Deploy SHAs (Task 2, 2026-07-01):**
- Edge function `acculynx-write-action`: deployed ACTIVE v1 (id `c8b30930-4cd5-4a14-bef4-8f06ae0bde49`) from contrib `862482e`, via `supabase functions deploy acculynx-write-action --project-ref rnhmvcpsvtqjlffpsayu`.
- Command Center `buildCommit`: **`9da0f841dd430887b27b205091671eb87684f808`** — confirmed live via `GET /healthz` (`status: ok`, `liveSurfaceStatus: live`, no errors) ~105s after `git push origin main` (contrib converged into main by fast-forward, 23 commits: 02e3502 → 9da0f84). Explain-then-ship stated before push.

# The Edge Function request contract

`POST` to the deployed `acculynx-write-action` function. Body:

```jsonc
{
  "lane": "postJobPaymentReceived",   // one of the 17 WriteLane names (see below)
  "accountKey": "<acculynx_accounts key>", // resolved per-request from the registry; required non-empty for prod
  "targetEnv": "sandbox",             // "sandbox" (default) | "prod" (explicit only)
  "payload": { /* lane-specific request body */ },
  "dryRun": true,                     // true = build + preview only, never fires; false = execute
  "idempotencyKey": "<optional>",     // else computed from lane|accountKey|targetEnv|canonical(payload)
  "workKey": "<optional pending-write work_key>"
}
```

- **`assertTarget` is the literal first call** in the handler (D-09 barrier #1): `sandbox` accepts any
  accountKey; `prod` requires a non-empty accountKey (`"prod is never implicit"`); anything else throws
  `"unrecognized targetEnv"`.
- **One builder, shared** — `buildWriteRequest(lane, payload, refData?)` builds the request for both
  `dryRun` and execute; `dryRun` short-circuits *after* the build, before the `acculynxCall` fetch (D-03).
- **Idempotency** — `computeIdempotencyKey` = `sha256(lane|accountKey|targetEnv|canonicalize(payload))`,
  checked against `acculynx_write_action_log` before every execute (D-05). Canonicalization sorts payload
  keys so ordering never produces a spurious different key.
- **Write-only lanes** never attempt a follow-up GET (by construction — the handler has no follow-up-GET
  path for any lane).

## The 17 lanes (authoritative `WriteLane` names)

**Writable (12):** `postContact`, `postJob` (Int32 `jobCategory.id`, STRING `locationAddress`, strict
priority enum), `postJobPaymentReceived`, `postJobPaymentExpense`, `putJobAddress` (STRING state/country),
`putJobInitialAppointment`, `putJobInsurance`, `putJobInsuranceCompany`, `putJobLeadSource`,
`putJobPriority` (strict Low/Normal/High), `deleteJobArOwner`, `deleteJobSalesOwner`.

**Write-only (5, no follow-up GET):** `postWorksheetItem`, `postJobMessage`, `postJobPhotosVideos`
(multipart), `postJobRepresentativeCompany`, `postJobExternalReference` (idempotency anchor).

Confirmed **excluded** from `LANES`: custom-fields (both variants, blocked-by-dependency — no sandbox
CustomFieldType), `PUT /jobs/{id}/trade-types`, `DELETE /jobs/{id}/initial-appointment`, and all
blocked-by-dependency lanes.

## The 3 first-offload lanes (amended D-04)

The first lanes driven end-to-end are the proven-safe set: **job message** (`postJobMessage`), **payment**
(`postJobPaymentReceived` / `postJobPaymentExpense`), and **external reference**
(`postJobExternalReference`). Custom-fields was dropped (blocked-by-dependency). The **first live prod
write is a payment** (D-05).

# Prod-write-approver roster (OQ-2)

**Decision (2026-07-01):** **Primary department owners only.** The `PROD_WRITE_APPROVER_EMAILS` roster
(Coolify env, granting `approval.decide_prod_write`) is the smallest trusted set — the primary owners in
the existing `live-work.ts` `DEPARTMENT_META` ownership model. Smallest blast radius for a money-touching
first write; accepted bottleneck if an owner is unavailable.

> Not yet set in the Coolify env — the roster is only *needed* immediately before the first prod payment
> (Task 5). This session stops after sandbox proof (Task 3), so `PROD_WRITE_APPROVER_EMAILS` is set when
> the prod payment is actually scheduled. Mechanism and roster choice are recorded here now.

# Sandbox proof (Task 3, 2026-07-01)

All 3 first-offload lanes were driven through the full loop (enqueue → surface → approve → edge execute
→ audit) against disposable sandbox job `22e22f5d-fa31-4040-a776-6f75bff842f8`, driven by a
**local_operator** (full `HUMAN_PERMISSIONS`, `departmentAccess: all`) via a localhost Command Center
reading the prod DB and invoking the live edge fn. This session was authorized as "consider approved."

| Lane | work_key | audit id | HTTP | result |
|------|----------|----------|------|--------|
| `postJobPaymentReceived` | `…:p5w3-pay-approve` | 1 | 201 | executed |
| `postJobMessage` | `…:p5w3-msg-approve` | 2 | 201 | executed |
| `postJobExternalReference` | `…:p5w3-extref-approve` | 3 | 201 | executed |
| `postJobMessage` (reject) | `…:p5w3-msg-reject` | — | — | rejected, edge never invoked (SC4) |

- **Idempotency proven:** re-approving the payment (same idempotency key `p5w3-pay-idem-anchor`) returned
  HTTP 200 and produced **no 4th audit row** — exactly one sandbox payment fired.
- **Reject proven (SC4):** the rejected item produced no audit row; the edge function was never invoked.

## Findings from the sandbox proof

1. **Approver capture — FIXED + re-verified (SC2 / T-05-23).** Root cause: the edge audit insert omitted
   the approver, and although `acculynx_pending_write.approver` exists it was never populated. **Fix (no
   migration needed):** the audit log's existing `actor` column now records the approver; `decision.ts`
   passes the approver identity (`actor.email ?? displayName ?? id`) in the edge-invoke body; the edge
   writes it to both `acculynx_pending_write.approver` and `acculynx_write_action_log.actor`, and stamps
   `work_key` on the audit row. A follow-up fix was needed because the handler rebuilt the input object for
   `persistExecutionResult` without `approver` — caught by live sandbox re-verify (index.ts is verified
   live, not unit-tested). **Verified:** approve of `p5w3-fix2-approve` → audit row #5, HTTP 201,
   `pw_approver` and `audit_actor` both = "Local Operator". Edge fn deployed **v3**.
2. **Reject closes the pending write — FIXED + re-verified.** `decision.ts` now sets
   `acculynx_pending_write.status = 'rejected'` (+ records the rejecter) when an acculynx-write-action item
   is rejected — the edge is never invoked on reject, so nothing else transitioned the row off
   `pending_review`. **Verified:** reject of `p5w3-fix-reject` → status `rejected`, approver recorded, no
   audit row. Tests added (`decision.test.ts`): approver-in-body + reject-close.
3. **Double-prefixed workKey — was a test-input error (not a code bug).** Passing a `workKey` that already
   starts with `acculynx-write-action:` yields a doubled display key (the mapper prepends the prefix). The
   fix items used **bare** workKeys and rendered a single canonical prefix. A defensive prefix-strip in the
   enqueue route remains a minor nice-to-have.
4. **Slack notify not delivered (`not_in_channel`) — open config item.** The D-08 notify posted `ok:
   false` because the notify bot is not a member of the target channel. Non-fatal (notify-only), but D-08
   isn't reaching Slack until the bot is invited to the channel (per the slack-agents skill). Config task,
   not code.

# First prod payment (Task 5) — DEFERRED

Not performed this session (user chose "deploy + sandbox only"). Findings #1 and #2 are now fixed,
re-verified, and deployed (edge v3, CC `bb86ca4`). Remaining prerequisites before Task 5: set
`PROD_WRITE_APPROVER_EMAILS` (primary owners) in Coolify + redeploy, then fire the gated prod payment.

# Citations

- Phase 5 plans/summaries: `.planning/phases/05-read-write-action-layer/`
- Write-capability matrix: [write-capability.md](../api/write-capability.md), [docs/37](../../../37-acculynx-write-capability-matrix.md)
- Red-team harness (structural mirror): [write-sweep.md](write-sweep.md)
