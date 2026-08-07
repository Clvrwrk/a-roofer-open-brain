---
name: wip-triage
description: Diagnose a Friday WIP/AR board discrepancy ("payment not showing", "number looks wrong") by tracing it through wip_ar_master → AccuLynx mirror → QBO mirror → sync machinery. Triggers on "payment not showing", "board wrong", "WIP discrepancy", "missing payment", "diagnose PEC intake", "wip triage". The exact ladder that solved PEC-186/187; also encoded programmatically in scripts/maya-gate.mjs (Phase A).
---

# WIP triage — the discrepancy ladder

Read-only until step 7. Use the `ob_readonly` role when running as an agent
(the Maya gate does this automatically); every claim must carry the query
result behind it. Reference incident: PEC-186 → PEC-187 (MC-68, 2026-08-07).

## The ladder

1. **Board row** — `wip_ar_master` by `job_number`: collected_revenue, outstanding_ar,
   billed_ar, computed_at. Does the board actually disagree with the reporter's claim?
2. **Mirror invoices** — `acculynx_invoices` by `acculynx_job_id`: per-invoice
   `balance_due`, `current_invoice_state`, **`synced_at`**. The board's money is derived
   N = job_financials.balance_due, Q = Σ invoice balance_due (non-void), R = P − Q.
3. **Cross-check the payment is real** — `qbo_payments` by amount and/or CustomerRef
   name suffix (`…:MC-68`). QBO syncs nightly; if the deposit is there, the payment
   happened regardless of what AccuLynx shows.
4. **Mirror freshness** — is it one job or systemic?
   `select count(*) from acculynx_invoices where synced_at > now()-interval '7 days'`.
   Compare the job's `acculynx_jobs.modified_date` (typed column) vs its newest
   `acculynx_raw` archive (`api_endpoint like '%<job_id>%'`): modified > archive =
   **mirror stale** — the change never got re-pulled.
5. **Sync machinery** — `acculynx_sync_watermark` (`resource_type='job_walk'`,
   `last_walked_job_id`): compute the cursor's position vs the job's position in
   `created_date ASC, id ASC` order. `v_acculynx_cron_outcomes` for run health.
   Remember: the hourly sync's headline resources (users/jobs/contacts/estimates/
   crmPipeline) do NOT include invoices/financials — those only refresh inside the
   job-walk (D-15 first-sight / D-16 change-driven; wrap fix PEC-187).
6. **Conclude** — stale mirror row (pilot class, auto-fixable) vs genuine ops state
   (payment never applied in AccuLynx → route to Lucinda) vs code bug (route to dev,
   cite the file/line).
7. **Fix (pilot class, MUTATES — requires the Slack gate)** — `maya_gate_cursor_jump
   (account, job_id)` → `trigger_acculynx_sync({multiAccount:true, accountFilter:[account]})`
   → wait ~2 min → `refresh_wip_ar_master()` → re-read the board row and STATE the
   before/after numbers. Executed automatically by `scripts/maya-gate.mjs` only after
   an `APPROVE PEC-xxx` from the allowlisted approver in #pe-cc-dev-team (C0BNVF99Y74).

## Approval gate contract (do not weaken)

- Proposals + approvals live in `agent_fix_approvals` (mig 224); executor recomputes
  `plan_hash` and refuses on mismatch; approver allowlist is Slack user IDs
  (U0B8SGJJZLJ = Chris/admin), never display names; proposals expire in 7 days.
- Only whitelisted plan types execute (`mirror_refresh`). Code, schema, or deploy
  changes are NEVER auto-executed — an approval on those is a human go-ahead only.
