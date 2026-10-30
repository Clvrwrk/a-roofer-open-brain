## Session — CRM Weekly WIP/AR collection plan

**Goal**: Rebuild CRM Weekly WIP/AR (?view=weekly&tab=team review → Chris: run it, money flow only).
**Deliverables**: CRM PR Clvrwrk/CRM_PWA#152 (branch claude/weekly-collection-plan; migration 20261030010000 not applied);
design-system row (this branch); approval canvas https://claude.ai/artifact/5nejNd4SqELbg17L2hBjcp; build notes ~/weekly-team-view-build/.
**Decisions** (Chris 2026-10-07/08): COLLECT-1–10 / EX-130 — milestones Deductible/Deposit, ACV (insurance), CO/supplement lines,
Final (calculated); QBO running total (partial = missed); review once, back only on a miss or Ops return; Wednesday auto-clear;
Ops audits changes only; AccuLynx jobs default Insurance, owner can switch; CP-25 out of scope; nest Office › Sales rep › Job › plan;
CC Friday board reads the plan after the first Wednesday.
**Open threads**: Chris merges #152; apply migration; pinned release (port 4470); grant wip_ops_review / wip_accounting_attest to named
reviewers; Part B CC board reads plan; payment-plan providers not in v1.

**Shipped 2026-10-08:** PR #152 merged as c125e71b. Migration `crm_collection_plan_20261030010000` applied (ledger 20261008143018). Stage on 4470 run by Chris, switch run by the agent on Chris's authorization at 18:45:13Z. `/healthz` reports c125e71b. The only Sentry issue under the new release is the startup diagnostic. Release record: Clvrwrk/CRM_PWA#153. Rollback is 0d05cd1b on 4469.
