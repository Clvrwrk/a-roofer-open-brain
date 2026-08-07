# A3 — Maya: autonomous diagnose → Slack-approved repair (pilot: Friday WIP/AR discrepancies)

**Sponsor:** Chris Hussey · **Date:** 2026-08-07 · **Status:** APPROVED + BUILT 2026-08-07 (Chris: channel #pe-cc-dev-team `C0BNVF99Y74`; approver = Chris only `U0B8SGJJZLJ`; Phase A auto-runs on accounting intakes; 7-day TTL). Shipped: mig 224/224b, scripts/maya-gate.{mjs,sh}, openbrain-maya-gate.timer (15-min, PE-US-AGENTS), wip-triage skill.
**Trigger case:** PEC-186 → PEC-187 (Lucinda's MC-68 $87,007.25 report, 2026-08-07)

## 1 · Problem

When an accounting teammate reports a board discrepancy ("payment not showing"), the full
resolution today requires Chris driving a Claude Code session: trace the number through
`wip_ar_master` → AccuLynx mirror → QBO mirror → sync machinery, find the fault, patch,
deploy, recover the data, and reply to the reporter. PEC-186 sat classified as "requires
human reconciliation" until Chris relayed it manually. Elapsed: ~3.5h from Lucinda's email
to her answer; ~2h of operator attention.

## 2 · Current condition (what already exists)

| Stage | Today |
| --- | --- |
| Intake | ✅ Maya mailbox listener → CAT + PEC issues with source keys (PEC-186 pattern) |
| Diagnose | ❌ human-driven Claude Code session |
| Propose fix | ❌ human-driven |
| Approval | ⚠️ implicit (Chris is at the keyboard); Linear "move to Agent Todo" gate exists but is coarse |
| Execute + verify | ✅ deploy contract exists (explain-then-ship); gated-write precedent exists (`acculynx_pending_write`) |
| Reply to reporter | ✅ AgentMail internal-only send (outbound-guard), proven 2026-08-07 |
| Task routing | ✅ open-agent-engine: Linear **Agent Todo** → engine queue → Claude Code run on PE-US-AGENTS (5-min runner) |

## 3 · Target condition

Lucinda emails ai@ → within the hour, the ticket carries a **diagnosis** (facts, queries,
suspected cause, blast radius) and Chris gets **one Slack message**: *diagnosis + proposed
fix + impact + rollback + `APPROVE PEC-xxx` / `REJECT PEC-xxx`*. Nothing mutating happens
until Chris's approval; after it, the agent executes the exact proposed plan, verifies
through the live call path, closes the ticket, and Maya replies to the reporter (internal
recipients only). Chris's total involvement: read one message, type one word.

## 4 · Analysis — what made today's run automatable

The MC-68 trace was a deterministic ladder: board row → `acculynx_invoices` per-job →
mirror-wide staleness check → QBO payment cross-check → sync watermark/cron state →
code inspection. Steps 1–5 are **pure reads**; only the fix (code/DDL/cursor moves/
triggered syncs) mutates anything. The risky part is not the diagnosis — it's letting an
agent mutate prod without a named human decision. Hence the two-phase design with a
fail-closed approval record.

## 5 · Countermeasure (design)

**Phase A — DIAGNOSE (auto, read-only).**
New engine task type `diagnose` fires when a `[MAYA]` intake lands in Agent Todo (or on a
`diagnose` label). Runs Claude Code on PE-US-AGENTS with:
- a **read-only Postgres role** (new `ob_readonly` role; NOT the service key — diagnosis
  physically cannot write), repo checkout, and the `wip-triage` runbook skill (the exact
  MC-68 query ladder, encoded);
- output: a `## Diagnosis` comment on the PEC issue + a Slack post to **#ob-approvals**
  (Maya bot identity per /slack-agents) with facts, suspected cause, and — when a fix is
  identifiable — the proposed change, user-visible impact, and rollback, ending with
  `Reply: APPROVE PEC-xxx or REJECT PEC-xxx`.

**Phase B — REPAIR (only after explicit Slack approval).**
- Approval = a Slack reply in #ob-approvals matching `APPROVE PEC-xxx` from a Slack user
  ID on the **approver allowlist (Chris only, by user ID — display names don't count)**.
  The listener writes an `agent_fix_approvals` row (issue, slack ts as evidence_ref,
  approver, approved plan hash). **The executor refuses to start without a matching row
  whose plan hash equals the posted proposal — fail closed; a changed plan re-requires
  approval.**
- Execution then follows the existing deploy contract (branch → test → deploy → verify
  live → recovery queries), appends every action to the issue, and Maya sends the
  reporter reply (outbound-guard internal-only, cc admin@ + chussey@aia4.io standing).
- Anything outside the approved plan's scope (new fault discovered mid-repair) → stop,
  post back to Slack, new approval.

**Guardrails carried over unchanged:** QBO read-only forever; outbound-guard internal-only
sends; additive-only migrations; append-only audit; silo doctrine; `silo_assertions()`
must be 0 post-repair for money-touching fixes.

## 6 · Pilot scope (deliberately narrow)

Ticket class: **Friday WIP/AR data discrepancies** (the PEC-186 shape) only. Everything
else stays human-routed. Widen (invoice-audit, CM flow) only after 3 clean pilot runs.

## 7 · Plan

1. Migration: `agent_fix_approvals` + `ob_readonly` role (additive).
2. `wip-triage` runbook skill (today's query ladder + report template).
3. Engine: `diagnose` task type wiring + Slack approval listener (#ob-approvals, phrase
   parser, user-ID allowlist, plan-hash check).
4. Dry run: replay PEC-186 end-to-end with the gate (Chris approves in Slack; executor
   replays the already-applied fix as a no-op verify).
5. Live pilot on the next real discrepancy report.

## 8 · Cost / 10x check

Build ≈ 1–2 sessions on existing rails (engine, Slack bots, AgentMail, deploy contract —
all already in place). Return: each discrepancy report currently costs ~2h operator time
and delays accounting; class recurs weekly (board is now the Friday meeting surface).
Break-even inside a month; the same gate pattern then generalizes to every "agent may fix
prod with permission" workflow — the reusable asset is the **approval gate**, not the
runbook.

## 9 · Open decisions for Chris

1. ~~Approval channel~~ **DECIDED (Chris, 2026-08-07): `#pe-cc-dev-team`** — the standing
   channel for ALL app/code/Linear-issue traffic, approvals included. (Maya's bot must be
   invited; the channel isn't visible to the bot yet.)
2. Approver allowlist: Chris only, or Chris + Chandler?
3. Approval TTL (proposal auto-expires if unapproved after N days — suggest 7)?
4. Phase A auto-run on every `[MAYA]` accounting intake, or only when a human adds the
   `diagnose` label (suggest: auto-run; it's read-only)?
