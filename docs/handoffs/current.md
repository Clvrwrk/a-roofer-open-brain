# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify via `/healthz` `buildCommit`)
**Date:** 2026-08-08 02:10 (CT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup + full Linear update

> Prior handoff (silo marathon, 2026-08-07 00:05) archived as `archive/2026-08-07-0005-silo-marathon.md`.
> Linear this session: **PEC-188** (report) · **PEC-187** (cursor-wrap, Done) · **PEC-186** (closed, Maya replied) · A3 approved+built.

---

## Accomplished This Session (2026-08-07 PM → 08-08 02:10)

### 1 · MC-68 missing payment → job-walk cursor-wrap fix (PEC-187, deployed)
- `supabase/functions/acculynx-sync/resources/job-walk.ts`: the resume logic ran from `last_walked_job_id` to the END of the list with **no wrap** — once an account's initial sweep completed (Jul 2), `startIdx === jobIds.length` forever and existing jobs were never re-walked. The entire invoice/financials mirror froze at initial-sweep values (0/1,660 invoices re-synced in 7+ days) while the sync looked healthy (new jobs still got first-sight walks). Fix: completed sweep wraps to index 0; D-16 still skips unchanged jobs. Regression test added (`job-walk.test.ts`, 15/15). Edge function redeployed (CLI auth via 1P `SUPABASE_ACCESS_TOKEN` item — the repo `.env` copy is stale/401).
- Recovery: `maya_gate_cursor_jump`-style cursor park + targeted sync + `refresh_wip_ar_master()` → MC-68 board row corrected to **Collected $150,587.25 / Balance Due $137,149.75** (the $87,007.25 payment, real in QBO 7/28 and applied in AccuLynx, finally reached the mirror). Full-fleet sweep triggered; hourly cron converges the rest. Commit `1dc9da1`.

### 2 · Maya replied to Lucinda (Chris-directed)
- Lucinda's original email = Maya intake **PEC-186**/CAT-30 (the same MC-68 question). Maya replied from `ob-accounting@agentmail.proexteriorsus.net` to accounting@proexteriorsus.com, cc admin@cc.proexteriorsus.net + chussey@aia4.io (AgentMail thread `8dd85036…`): summary, PEC-187 link, corrected numbers, what to expect. PEC-186 → Done, related to PEC-187.

### 3 · A3 approved + BUILT: Maya diagnose → Slack-approved repair gate
- Decisions (Chris): channel **#pe-cc-dev-team** (`C0BNVF99Y74`, Maya invited, kickoff posted); approver = **Chris only** (Slack user `U0B8SGJJZLJ` = admin@cc); Phase A auto-runs on accounting intakes; 7-day proposal TTL.
- `schemas/cleverwork-roofer/224-agent-fix-approvals.sql` (applied, +224b): `agent_fix_approvals` fail-closed ledger (plan-hash verified, TTL, Slack ts evidence); `ob_readonly` SELECT-only role; `maya_gate_cursor_jump(account, job_id)`.
- `scripts/maya-gate.mjs` + `maya-gate.sh`: **Phase A** diagnoses new `[MAYA] Accounting intake` issues (created after `2026-08-07T22:00Z`; the 14 pre-existing intakes grandfathered) via the wip-triage ladder (REST GETs — cannot mutate), comments Linear, posts pilot-class proposals to the channel; **Phase B** honors `APPROVE|REJECT PEC-xxx` from allowlisted Slack user IDs only, recomputes plan_hash before executing, runs ONLY the whitelisted `mirror_refresh` executor (cursor jump → targeted sync → refresh → verify), reports to channel + ledger. Code/schema changes are never auto-executed.
- `deployment/remote/systemd/openbrain-maya-gate.{service,timer}`: every 15 min on PE-US-AGENTS (installed + enabled; first pass clean). `LINEAR_API_KEY` provisioned to host (`~/.config/cleverwork/linear.env`, from 1P).
- `.claude/skills/wip-triage/SKILL.md`: the PEC-186/187 diagnostic ladder as a runbook.
- **Dry-run staged:** proposal row #1 (PEC-186 replay, `mirror_refresh` MC-68) posted to #pe-cc-dev-team — **awaiting Chris's `APPROVE PEC-186`** as the live gate test.

### 4 · Ticket-opened notices (mig 225, deployed `730d3f0`)
- `schemas/cleverwork-roofer/225-agent-intake-notices.sql` (applied): `agent_intake_notices` dedupe/audit ledger.
- `scripts/maya-gate.mjs` `notices` phase: every new `[MAYA]` intake → ONE email to the original internal sender with the Linear ticket link ("your request is now PEC-xxx and is being worked"); external senders recorded-and-skipped, never emailed; `MAYA_NOTICE_DRY_RUN=1` supported; Linear gets a "notice sent" comment. Dry-run verified against PEC-186 (parsed `accounting@proexteriorsus.com`, sent nothing). Live on the 15-min timer.

## Git State
- **Branch:** `main` == `origin/main`
- **Last commit:** `99ba90f` — "docs(memory): session 9 — ticket-opened notices live" (this handoff commits after)
- **Uncommitted changes:** only this handoff (committed as part of wrapup)
- Migrations applied this session: **224, 224b, 225**. Edge function `acculynx-sync` redeployed (v48+).

## Task Cut Off
None — clean boundary. All four workstreams deployed and verified.

## Next Task — Start Here

Two open threads; pick by Chris's priority:

**Thread A (pending Chris, zero dev work):** the gate's live test — Chris replies `APPROVE PEC-186` in #pe-cc-dev-team; the next 15-min pass executes and reports. If it misbehaves: `journalctl -u openbrain-maya-gate.service` on PE-US-AGENTS + `select * from agent_fix_approvals;`.

**Thread B (the standing dev task, unchanged from the prior handoff):** **PEC-185 deferred silo hardening** (docs/87 §Deferred, items 1–5): invoice_audit_reset vendor scoping; add-line generic office/agreement context; dead-code deletion (`lib/invoice-payment.ts` orphans, `loadInvoiceAudit`/`loadFreshInvoiceAudit`, `loadDecisionDetailCsv`); real typechecker in `check`; `invoice_pipeline_status.vendor_slug` `'abc'`→`'abc-supply'` normalization.

**Prompt to use:** "Read docs/handoffs/current.md and docs/87-vendor-silo-eval.md §Deferred. Implement the deferred silo hardening items 1–5 (PEC-185), verifying each through the live call path."

## Decisions Made This Session

- **#pe-cc-dev-team (`C0BNVF99Y74`) is THE channel for all app/code/Linear-issue Slack traffic** — approvals included; no new channels (superseded the proposed #ob-approvals). Recorded in MEMORY.md + slack-agents skill.
- **Approval = Slack user ID allowlist (U0B8SGJJZLJ), exact-phrase `APPROVE PEC-xxx`, plan-hash-bound, 7-day expiry, fail closed.** Display names never count; a changed plan re-requires approval.
- **Only whitelisted plan types auto-execute** (`mirror_refresh`). Approvals on code/schema plans are recorded go-aheads for humans, never auto-run.
- **Requester notice on every intake ticket** — internal senders only, one per ticket ever, dry-run-testable.
- **Sync walkers must wrap** — a cursor that parks at end-of-list is a silent freezer (PEC-187 class). Regression-test the wrap.
- **Grandfather pre-existing queue items** when arming a new automation (MAYA_GATE_SINCE cutoff) — never let a go-live spam the backlog.

## Blockers Requiring Human Action

1. **Chris: `APPROVE PEC-186` in #pe-cc-dev-team** — fires the gate's live end-to-end test (harmless near-no-op replay).
2. **Redact the Amex CVV** from `08042026_ABC Supply.pdf` p4 in Dropbox (carried from prior handoff).
3. **Repo `.env` hygiene (agent barred from editing):** refresh `SUPABASE_ACCESS_TOKEN` (working copy is in 1P `SUPABASE_ACCESS_TOKEN` item) and fix line 214 `SLACK_APP_ID_ROWAN` missing `=` (host copy already fixed).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `origin/main` HEAD.
2. `ssh -i ~/.ssh/hetzner_office root@178.156.203.23 'systemctl list-timers | grep openbrain'` — abc 07:30 · qbo 01:00 · wip-pack 11:00 · jt-sentinel 17:00 · **maya-gate every 15 min** (UTC).
3. SQL: `select issue_identifier, status from agent_fix_approvals;` — row 1 = PEC-186 (proposed → approved/executed after Chris's reply).
4. SQL: `select count(*) from acculynx_invoices where synced_at > now() - interval '1 day';` — climbing as the wrapped walk converges (was 0/1,660 in 7d pre-fix).
5. SQL: `select count(*) from silo_assertions();` — **0**.
6. SQL: `select max(costs_incurred_asof) from wip_ar_master;` — ≥ yesterday (nightly QBO).

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine; property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens; AccuLynx→JobTread gated write queue; QuickBooks read-only mirror (docs/74); Slack agent identities; AgentMail; Maya accounting inbox + CAT-first runtime (parallel session 8/6); Invoice Audit v2 (docs/81, migs 197–203); docs/82 remediation R1–R6; docs/83 Price Agreement Management; docs/84 GUI audit; Friday WIP/AR live board (docs/85, migs 215–216) + nightly Excel pack + Maya email + CPA accrual inputs; PE-US-AGENTS host (178.156.203.23), QBO nightly sync w/ token-rotation persistence; office silo (migs 217/222) + $3,212.04 claim retraction; vendor payment memos (docs/86, mig 218) w/ 133 invoices paid-verified; CM receipt reconciliation (mig 220); SRS/QXO in Invoice Audit (migs 221) — SRS $2,879.55 at risk; vendor-silo re-key of money tables (mig 223) + nightly silo_assertions() guard (docs/87); **AccuLynx job-walk wrap fix (PEC-187); Maya diagnose→Slack-approved repair gate (A3, migs 224/225, maya-gate.mjs on 15-min timer) + ticket-opened requester notices.**

### Architecture decisions
- Pricing: office-inherited, invoice-date-effective, evergreen (PAEXP), lowest-price-wins **within the (vendor, office) silo**; ship-to matches survive only office-constrained.
- Every money table keys `(vendor_slug, invoice_number)` — invoice numbers are NOT globally unique. Vendor slug vocabulary = `vendors.slug` (`abc-supply`, `srs`, `qxo`); `invoice_pipeline_status` still carries legacy `'abc'` (deferred normalization).
- `v_invoice_audit_invoice_vendor` is the one vendor-lookup seam for UI/API; `lib/branch-price-list.ts` and `price-agreements/propose` are the reference silo implementations.
- 15-min crons: matview refresh → `credit_memo_claims_sync_all()` → `credit_memo_reconcile()` (pg_cron); **maya-gate pass (systemd, PE-US-AGENTS)**. Nightly 09:30 UTC: `silo_assertions()` → action log.
- AccuLynx sub-resources (invoices/financials/milestones) refresh ONLY inside the job-walk (D-15 first-sight / D-16 change-driven / wrap on completed sweep) — the hourly headline resources do not include them.
- Friday WIP/AR: computed columns belong to `refresh_wip_ar_master()`; human columns belong to the meeting; update API allowlist-only.
- **Agent repair actions: fail-closed approval ledger (`agent_fix_approvals`) — Slack-ID allowlist, plan-hash bound, whitelisted executors only.**

### Key invariants (never violate)
- Additive/idempotent migrations only; archive, never delete.
- **A price agreement is specific to (vendor, PE office). No pricing join may cross either boundary; unknown office ⇒ No-Price; fail closed.**
- Compare prices only in the pricing UOM via `price_per_uom` (docs/46).
- Sent/received CMs are history; only draft/approved change.
- `main` is the only deploy branch; verify `/healthz` after every push. **A fix isn't fixed until verified through the LIVE call path.**
- QBO read-only forever; **agents never email external domains** (outbound-guard in-app; mirrored host-side in maya-gate).
- Never send Σ N to a lender — billed AR (Σ Q) is the receivable.
- **Nothing mutating runs from the Maya gate without an allowlisted `APPROVE PEC-xxx` whose plan hash matches.**

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | https://cc.proexteriorsus.net — Coolify app uuid **`lu5txzhyoza7uuz0scwpobv7`** (post-8/4-rebuild), builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` |
| Deploy check | `GET /healthz` → `buildCommit` (~30–90s, ~300s cold) |
| Edge functions | `supabase functions deploy <fn> --project-ref rnhmvcpsvtqjlffpsayu` with `SUPABASE_ACCESS_TOKEN` from 1P (repo `.env` copy stale); MCP deploy tool unusable for multi-file arrays (schema-stripped) |
| Agent host | PE-US-AGENTS `178.156.203.23` (root, `~/.ssh/hetzner_office`); repo `/opt/openbrain/a-roofers-open-brain`; timers: abc 07:30 UTC · qbo nightly 01:00 UTC · wip-pack 11:00 UTC · jt-sentinel 17:00 UTC · **maya-gate */15** |
| Secrets | 1P CW_Master via `op`: `QBO - PROD TOKENS`, `coolify.proexteriorsus.net - Root API`, `SUPABASE_ACCESS_TOKEN`, `LINEAR_API_KEY`, `AGENTMAIL_API_KEY`; provisioning: `op inject` → 600-perm scratch → `scp` → delete |
| Slack | workspace pe-command-center; **#pe-cc-dev-team `C0BNVF99Y74` = all app/code/Linear traffic + approvals**; Maya bot `MAYA_CHEN_BOT_TOKEN`; approver allowlist `U0B8SGJJZLJ` |
| Linear | team PE-CC-DevTeam; this session: PEC-186 (Done) / PEC-187 (Done) / PEC-188 (report) |
| Dev server | `.claude/launch.json` — port **4399** (4321 taken by Cursor) |
