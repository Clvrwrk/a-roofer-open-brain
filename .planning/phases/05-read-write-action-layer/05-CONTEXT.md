# Phase 5: Read/Write Action Layer - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a **human-approval-gated write/action layer** so agents can perform **proven-safe** AccuLynx writes — never autonomously. Every write flows **dry-run preview → explicit human approval → execute → audit-log entry**, on an exploratory `contrib/cleverwork/*` branch. At least one real human task is offloaded **end-to-end** (sandbox-validated first, then a production account with approval).

This phase **builds the production write path** using the Phase 4 evidence matrix (what is safe to write). It does **not** re-discover capability (Phase 4), stand up the dedicated AccuLynx Agent (Phase 6, A3-gated), or build the executive dashboard (Phase 7). No write may fire against a production account without passing the approval gate.

Requirement: **REQ-08** — "A read/write exploratory branch with human-approval-gated write wrappers, beginning to offload specific human tasks."
</domain>

<decisions>
## Implementation Decisions

### Approval-gate substrate
- **D-01: Reuse the existing Command Center work-queue as the human gate.** Do NOT build a new approval store/UI. Each pending AccuLynx write becomes a work-queue item; humans approve/reject through the existing `HumanUnblockerDashboard`, and the audit trail comes from the existing decision machinery. Reuse: `live-work` (`recordLiveWorkDecision`, `serializeLiveWorkQueueItem`, `LiveWorkItem`), `access-control` (`WorkQueueDecision`, actor/permission model, `getAllowedDecisions`), `agent-api` (`serializeWorkQueueItem`, `buildDecisionAuditEvent`), and the `work-queue/[workId]/decision.ts` endpoint.
- **D-02: A new dedicated `acculynx-write-action` Edge Function is the SOLE code path that writes to AccuLynx (prod or sandbox).** No other component may write. It reuses the `acculynx-sync` accounts/auth/rate-limit lib (`acculynxFetch`, accounts registry, 429/backoff, per-key limits) and holds the per-lane wrappers that encode the Phase-4 quirk guardrails. The work-queue decision endpoint invokes it only on `approve`. Keeps AccuLynx keys server-side in the edge tier where `acculynx-sync` / `acculynx-write-sweep` already live; one auditable choke point.
- **D-03: The dry-run preview and the real execute share ONE code path.** The `acculynx-write-action` function takes a `dryRun` flag: it builds + validates the exact request (target account, endpoint, payload, headers) and returns it **without sending**. Execute is the identical path minus the flag → the human provably approves exactly what will fire. No separate preview builder (that would risk preview ≠ execute drift).

### Task offloading (SC3)
- **D-04: All four discussed lanes are in scope** — post a job message (`POST /jobs/{id}/messages`), record a payment (`POST /jobs/{id}/payments/received|expense`), update custom fields (`PUT /jobs/{id}/custom-fields`), add an external reference (`POST /jobs/external-references`).
- **D-05: Payment is the FIRST live production write** (after full sandbox validation). Because the first-ever prod write touches money, its guardrails (amount/account-type validation, idempotency, no double-post) get first-class attention. The other lanes follow on the same proven pipe once payment is proven end-to-end.

### Wrapper coverage set (SC1)
- **D-06: v1 wraps ALL 17 proven-safe lanes** — the 12 `writable` + 5 `write-only` verdicts from the Phase-4 matrix (`acculynx_write_catalog`). Every wrapper carries its lane-specific guardrail (e.g., `jobCategory.id` Int32 coercion, contact `mailingAddress` objects vs job `locationAddress` strings, strict enums, multipart for docs/photos, `POST /jobs` creates an unassigned lead).
- **Out of v1:** the 2 `fragile-with-guardrail` lanes (`PUT /jobs/{id}/trade-types` needs `{items:[{id}]}`; `DELETE /jobs/{id}/initial-appointment` needs a non-empty `{note}` body) → deferred as guarded follow-ups. The 17 `blocked-by-dependency` and 0 `unsupported` are excluded.

### Preview + execution surface
- **D-07: The Command Center dashboard is the source of truth** for the dry-run preview and the approve/reject action (rendered in `HumanUnblockerDashboard` alongside the existing work-queue). Agents create the pending write item via the agent API.
- **D-08: Slack notifies on a pending write** (per the `slack-agents` infra) so humans don't miss it — notification only; the dashboard remains the authoritative approve/reject + audit surface.
- **D-09: Production execution requires a second barrier beyond the approval click.** The pending item explicitly names its target account; a **prod** target requires (a) an explicit target/env flag (prod is never the implicit default — sandbox is) AND (b) an approver whose `access-control` permission allows production writes. Belt-and-suspenders so no one approves a prod write without the target being unmistakable and their role permitting it.

### Claude's Discretion
- Exact `acculynx-write-action` internal structure and per-lane wrapper request-shape construction — planner/researcher decide, grounded in the `acculynx-write-sweep` pattern and the Phase-4 quirk guardrails.
- The pending-write record shape (how the payload / dry-run diff / target / exec-result attach to a work-queue item), idempotency-key strategy on execute, and retry/rate-limit behavior on the execute call (reuse `acculynxFetch`'s 429 handling).
- Human-readable rendering of the dry-run preview (how the built request is summarized for the approver).
- How an agent authors the pending item via the agent API, and partial-failure / rollback handling on multi-step writes.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The write evidence this layer is built on (Phase 4 output)
- `docs/37-acculynx-write-capability-matrix.md` — authoritative per-endpoint write matrix (generated from `acculynx_write_catalog`); the 17 proven-safe lanes + per-lane guardrails.
- `docs/knowledge-base/acculynx/api/write-capability.md` — verdict totals + the writable/write-only lists + durable quirks (Int32 `jobCategory.id`, address object-vs-string asymmetry, strict enums, unassigned-lead, multipart, `PUT trade-types` / `DELETE initial-appointment` fragility).
- `docs/knowledge-base/acculynx/ingestion/write-sweep.md` — the `acculynx-write-sweep` harness design (structural template + hard account gate + quirk landmines to mirror in `acculynx-write-action`).
- `acculynx_write_catalog` / `acculynx_write_probe` (prod DB `rnhmvcpsvtqjlffpsayu`) — evidence rows (verdict, tier, side_effect, guardrail_notes) that seed which lanes get wrappers.

### Reused write executor lib
- `supabase/functions/acculynx-sync/` — accounts registry + auth + `acculynxFetch` (429/backoff, per-key 10 req/s, 120s budget) — reuse in `acculynx-write-action`.
- `supabase/functions/acculynx-write-sweep/` (`index.ts`, `sweep.ts`, `sweep.test.ts`) — pattern for the new write-action function (hard account gate, per-lane request construction, pure testable core).

### Reused approval gate (Command Center work-queue)
- `app/command-center/src/lib/live-work.ts` — `recordLiveWorkDecision`, `serializeLiveWorkQueueItem`, `LiveWorkItem`, priorities/status.
- `app/command-center/src/lib/access-control.ts` — `WorkQueueDecision`, actor/permission model, `getAllowedDecisions`, department access checks (the prod-write permission lever, D-09).
- `app/command-center/src/lib/agent-api.ts` — `serializeWorkQueueItem`, `buildDecisionAuditEvent`, `jsonApiResponse`.
- `app/command-center/src/pages/api/agent/work-queue/[workId]/decision.ts` — the decision endpoint the executor hangs off; `WORK_QUEUE_DECISIONS` includes `approve`/`reject`/`needs_more_evidence`/`external_sent`.
- `app/command-center/src/components/unblocker/HumanUnblockerDashboard.astro` — the approve/reject + preview surface (D-07).
- `app/command-center/src/pages/api/agent/` (`intake.ts`, `session.ts`, `work-queue/`) — how agents author work-queue items.

### Notification + agent access
- `.claude/skills/slack-agents/` — per-agent bot identities, tokens, channel IDs for the pending-write Slack notification (D-08).
- `.claude/skills/workos-agent-auth/` — how an agent authenticates to the WorkOS-gated live site `/api/*` (Bearer service token) to create pending items / read state.
- `.claude/skills/coolify/` — deploy discipline for any Command Center changes (edge functions deploy via `supabase functions deploy`, NOT Coolify).

### Governing rules
- `CLAUDE.md` — hard rules 1 (additive/idempotent migrations), 4 (trust-tier), 5 (security boundary), 6 (consent), and the Live⇄Dev converge/explain-then-ship deploy contract.
- `CONVENTIONS.md` §13 — wrap-up / converge discipline; contrib branch merges back into the live branch.
- `context/SOUL.md` — approval boundary: draft/calculate/prepare freely; nothing external without a human.
- `.planning/REQUIREMENTS.md` — REQ-08 (this phase) + out-of-scope (no prod first-tries; no autonomous external writes; no milestone/invoice/material-order write-back — endpoints don't exist).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Command Center work-queue** (`live-work.ts` + `access-control.ts` + `agent-api.ts` + `decision.ts` + `HumanUnblockerDashboard.astro`): the entire human-approval + audit-trail substrate — reused, not rebuilt (D-01).
- **`acculynx-sync` lib**: accounts registry, auth, `acculynxFetch` with 429/backoff and per-key limits — reused by the new write executor (D-02).
- **`acculynx-write-sweep`**: structural template for `acculynx-write-action` (hard account gate, per-lane request construction, pure core + tests).
- **`acculynx_write_catalog`**: the evidence source that enumerates exactly which 17 lanes get wrappers and each lane's guardrail_notes.
- **`slack-agents` / `workos-agent-auth` skills**: notification + agent-auth wiring, already documented.

### Established Patterns
- **Single enforced safety boundary lives in the executor** (mirrors the read-sweep / write-sweep hard-gate precedent): here it's the prod-target flag + approver-permission check (D-09), plus "sandbox is default, prod never implicit."
- **Docs/evidence generated from tables, not hand-maintained** (Phase 4 precedent) — any new write-action-log table follows the same additive/idempotent DDL rule.
- **Preview == execute via one code path** (D-03) — an anti-drift pattern the planner must preserve.

### Integration Points
- New `acculynx-write-action` Edge Function → deploy via `supabase functions deploy` (NOT Coolify).
- Any new tables (e.g., write-action/pending-write log) → applied to prod Supabase `rnhmvcpsvtqjlffpsayu`, additive/idempotent, schema numbering continues past 183.
- Work-queue decision endpoint (`decision.ts`) → invokes the executor on `approve`; Command Center changes deploy via Coolify per the deploy contract.
- Slack pending-write notification → per-agent bot token from `slack-agents`.
- All work on a `contrib/cleverwork/read-write-action-layer` branch, converged back into the live branch (SC1 + CONVENTIONS §13).
</code_context>

<specifics>
## Specific Ideas

- **Payment-first, money-touching guardrails:** the very first prod write is a payment, so idempotency (no double-post), amount/account-type validation, and a crisp dry-run summary of "$X to job Y, account Z" matter most on that lane.
- **Slack = notify only; dashboard = decide + audit.** Explicitly avoid a second authoritative approval surface to reconcile.
- **Sandbox default / prod explicit** is the governing safety stance for D-09 — a wrapper with no explicit prod target hits sandbox.
</specifics>

<deferred>
## Deferred Ideas

- **2 fragile-with-guardrail lanes** (`PUT /jobs/{id}/trade-types`, `DELETE /jobs/{id}/initial-appointment`) → guarded follow-up after the 17 proven-safe lanes ship; both have known non-empty-body guardrails.
- **17 blocked-by-dependency lanes** → not wrappable until the sandbox/company config supplies the missing child ids (documentFolderId, accountTypeId, role-specific CompanyUserId, etc.) — out of Phase 5.
- **Dedicated AccuLynx Agent** (A3-gated) → Phase 6 (REQ-09).
- **Reactive status mirroring via webhooks** → future; only the sandbox webhook-tier signal is noted.
- **Executive Sales Pipeline dashboard** → Phase 7 (REQ-10).

None of the above are in Phase 5 scope — discussion stayed within the action-layer boundary.
</deferred>

---

*Phase: 05-read-write-action-layer*
*Context gathered: 2026-07-01*
