# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify via `/healthz` `buildCommit`)
**Date:** 2026-08-06 09:15 (CT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup + full Linear documentation

> Prior handoff (Invoice Audit v2 close-out, 2026-08-05 22:15) archived under `docs/handoffs/archive/`.
> Linear session record: **PEC-174** (shipped report) · **PEC-175** (URGENT blocker) · **PEC-176** (backlog) · comment on **PEC-100**.

---

## Accomplished This Session

### Friday WIP/AR live board — full stack (docs/85, three build rounds, all deployed)
- `schemas/cleverwork-roofer/215-friday-wip-ar-master.sql` (applied, + 215b/215c fn fixes): `wip_ar_master` — one row per open-balance ledger job (sheet 11 of AR_WIP_Pack v4, credit balances included); `wip_ar_master_updates` audit log; `v_qbo_job_cost_lines`/`v_qbo_job_costs` (job costs parsed from the QBO Customer:Job name suffix `…:MC-68`); `refresh_wip_ar_master()` nightly pg_cron 10:45 UTC; `roll_wip_ar_week()` Thursday 10:30 UTC (HIT/MISS scoring); `wip_accrual_snapshot(p_cutoff)` for the CPA.
- `schemas/cleverwork-roofer/216-friday-wip-round2.sql` (applied): `status_since`/`days_in_status` (from `crm_pipeline.milestone_date`), `expected_cash_amount` (editable Estimated $), `expense_outstanding` (est − realized).
- `app/command-center/src/pages/accounting/friday-wip.astro` + `src/lib/friday-wip.ts`: location-grouped editable board — status = `[AccuLynx status] · reference bucket`; money columns Contract Total / Invoiced Total / Monies Collected / Balance Due / Expense Realized / Expense Outstanding; Days-in-Status chip (HSL green→red 0–365d); Rep filter; Estimated $ feeds the 3-week cash map (est at invoice/cash date, remainder at paid-in-full); brand navy/gold zebra theme sharing the `ivTheme` System/Light/Dark preference with Invoice Audit.
- APIs under `src/pages/api/accounting/friday-wip*`: board JSON; inline `update` (allowlisted editable fields only, every change audited); `accrual.csv?cutoff=` (CPA earned-revenue inputs); `pack` (signed-URL download of newest xlsx); `send` (Maya email).
- `src/layouts/AppShell.astro` + `src/styles/global.css`: sidebar collapse toggle (localStorage, all pages).
- `src/lib/outbound-guard.ts`: `aia4.io` added to internal domains; `send.ts` carries the default distribution — Chris `chussey@aia4.io`, Lucinda `accounting@proexteriorsus.com`, Tabatha `invoices@proexteriorsus.com`, Chandler `chandler@proexteriorsus.com` (`FRIDAY_WIP_RECIPIENTS` env overrides). Send is human-triggered (button + confirm).
- `scripts/wip-pack-thursday.sh` + `deployment/remote/systemd/openbrain-wip-pack-thursday.{service,timer}`: nightly (06:00 CT) pack build → `wip-packs` storage bucket; `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` fix for aspose on Linux.
- **Validation:** Billed AR Σ Q **$777,021.55 ties the v4 workbook exactly**; georgia $810,521.36 to the penny; edit round-trips + audit rows verified against prod; accrual CSV 200/~1s after single-pass rewrite.

### CPA accrual findings (cash → accrual transition)
- **Costs incurred to date: solved** — QBO bill lines ~96% / purchase lines ~50% carry Customer:Job; 100/115 ledger jobs already show costs ($1.15M). Lucinda action: tag every job cost with Customer:Job (untagged card purchases are the only leak).
- **Date cutoffs: shipped** — `wip_accrual_snapshot(p_cutoff)` + Accrual snapshot CSV button.
- **Estimated total costs: gap** — needs the AccuLynx worksheet DETAIL endpoint mirrored (**PEC-176**); target columns already exist on `wip_ar_master`.

### Agent-host cutover (old 5.78.146.161 is DEAD)
- New host discovered via 1Password (`op` CLI) → Hetzner API: **PE-US-AGENTS `178.156.203.23`** (root + `~/.ssh/hetzner_office`). PE.CC.DEV = `178.105.220.14`.
- Repo pulled to `main`; nightly timers installed + enabled: `openbrain-qbo-thursday-sync.timer` (now **nightly** 20:00 CT) and `openbrain-wip-pack-thursday.timer` (**nightly** 06:00 CT) — unit filenames kept, schedules changed.
- QBO prod creds provisioned from 1Password (`op inject` → 600-perm scratch file → `scp`, values never in transcript); host `.env` line 214 syntax fixed (`SLACK_APP_ID_ROWAN` missing `=` crashed every sourcing service); pip + `aspose-cells-python` + Aspose license installed.
- **First pack built and published from the new host: `wip-packs/AR_WIP_Pack_2026-08-06.xlsx` (429 KB)** — the board's Download button serves it end-to-end.

## Git State
- **Branch:** `main` == `origin/main`
- **Last commit:** `99a6a91` — "docs(memory): session 4 — PE-US-AGENTS host cutover, nightly timers live, first pack published" (this handoff commits after)
- **Uncommitted changes:** only this handoff (committed as part of wrapup)
- Contrib branch `contrib/cleverwork/friday-wip-ar` merged into `main` and pushed. Migrations **215–216** applied to prod.

## Task Cut Off
None — session ended at a clean boundary. All three build rounds deployed and verified live (feature build `6581ff9`; `94ef1b1`/`99a6a91` pushed after).

## Next Task — Start Here

**Task:** Restore the QBO nightly sync (**PEC-175**, URGENT)
**What to check / do:**
1. Chris re-authorizes the Intuit production app (same procedure as the 2026-08-02 provisioning) and updates 1Password item `QUICKBOOKS_PROD_REFRESH_TOKEN` (CW_Master vault).
2. Agent: re-provision — `op inject` the four `QUICKBOOKS_PROD_*` values to a 600-perm scratchpad file, `scp` to `root@178.156.203.23:/root/.config/cleverwork/master.env`, delete the local copy.
3. `ssh -i ~/.ssh/hetzner_office root@178.156.203.23 'systemctl start openbrain-qbo-thursday-sync.service'`; tail `~/.qbo-sync/logs/qbo-thursday.log` for a clean finish (the earlier failure was `STATUS=FAIL QBO token refresh failed: invalid_grant`).
4. Next morning, confirm the board's costs moved past Jul 27: `select max(costs_incurred_asof) from wip_ar_master;`

**If invalid_grant again:** the token went stale between save and provisioning — repeat step 1 and run steps 2–3 immediately after.

**Prompt to use:** "Read docs/handoffs/current.md. The QUICKBOOKS_PROD_REFRESH_TOKEN in 1Password has been refreshed — re-provision PE-US-AGENTS and start the QBO sync (PEC-175)."

## Decisions Made This Session

- **QBO mirror cadence weekly → nightly** (Chris): board freshness beats sync cost; timer unit names kept to avoid host churn.
- **Costs-incurred source = QBO Customer:Job tags, NOT the ABC↔AccuLynx match view** (only 179/1,073 invoices match — PO discipline gap, PEC-105); ABC material arrives as QBO bills anyway.
- **Board population = full ledger including credit balances** (fixes workbook 0_EXCEPTIONS check 18); rows leaving the ledger flip `in_ar_population=false`, never deleted.
- **Maya send = AgentMail from `ob-accounting@`, internal recipients only, human-triggered**; humans forward externally; `aia4.io` is internal (owner's domain, PEC-113 CC precedent).
- **Estimated $ semantics:** cash expected at the invoice/cash date; the remainder of Balance Due lands at the paid-in-full date in the cash map.
- **PIF remainder / Prior (last wk) / Hit-Miss columns removed from the UI, kept in the DB** — the Thursday roll still scores HIT/MISS.
- **Sheet-11 money doctrine enforced in SQL:** N = `acculynx_job_financials.balance_due`; Q (the receivable) = Σ non-void `acculynx_invoices.balance_due`; unbilled = N−Q is backlog, never AR.

## Blockers Requiring Human Action

1. **PEC-175 (URGENT): Intuit OAuth re-auth** — refresh token `invalid_grant`; QBO mirror (and the board's Expense Realized) frozen at Jul 27 until Chris re-authorizes and updates 1Password.
2. **Coolify API key** in root `.env` is rotated/dead (401) — re-mint for future env-var operations (push-webhook deploys unaffected).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` should equal `origin/main` HEAD.
2. `ssh -i ~/.ssh/hetzner_office root@178.156.203.23 'systemctl list-timers | grep openbrain'` — abc 07:30 UTC · qbo 01:00 UTC · wip-pack 11:00 UTC · jt-sentinel 17:00 UTC.
3. SQL (prod): `select count(*) filter (where in_ar_population), round(sum(billed_ar),2) from wip_ar_master;` — ~115 jobs, billed AR ≈ $777k (moves with collections).
4. SQL (prod): `select name from storage.objects where bucket_id='wip-packs' order by created_at desc limit 1;` — newest `AR_WIP_Pack_<date>.xlsx`.
5. `cd app/command-center && npm run build && npx vitest run` — build Complete!, 286/286 tests.

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine (Supabase + pgvector, containerized MCPs); property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens (workos-agent-auth skill); AccuLynx→JobTread migration via gated write queue (2026-07-27/28); QuickBooks read-only mirror (docs/74); Slack agent identities (slack-agents skill); AgentMail webhook plumbing; Maya accounting inbox triage (activated 2026-08-05, separate session); Invoice Audit v2 (docs/81: two-axis status model, migs 197–203); docs/82 remediation R1–R6 (office-inherited engine cutover mig 201, CM review gates mig 202, reset v2 mig 203, map cutover, vendor silo); docs/83 Price Agreement Management P1–P3 core (migs 210–211); docs/84 full-GUI audit + W1–W3 fixes (migs 209, 212–214); migrations 204–214 applied 2026-08-05; **Friday WIP/AR live board (docs/85, migs 215–216, 2026-08-06): `wip_ar_master` + editable CC board + nightly Excel pack to `wip-packs` bucket + Maya email + CPA accrual inputs; agent-host cutover to PE-US-AGENTS 178.156.203.23; QBO sync cadence → nightly.**

### Architecture decisions
- Office-inherited, invoice-date-effective, evergreen (PAEXP), lowest-price-wins pricing is THE model everywhere; ship-to matches survive only as a no-regression fallback arm.
- Matviews (`mv_office_agreement_versions`, `mv_invoice_pricing_office`, `mv_vendor_office_item_history`) refresh on a 15-min pg_cron job that also runs `credit_memo_claims_sync_all()`.
- Append-only audit ledger (`invoice_line_audit`; current state via `v_invoice_line_audit_current`); `invoice_line_reaudit` is the claim store.
- Astro SSR + vanilla client scripts; dev server reads prod Supabase; `.claude/launch.json` (gitignored) strips inherited SUPABASE env vars.
- **Friday WIP/AR split of ownership: computed columns belong to `refresh_wip_ar_master()`; human columns belong to the meeting — the refresh never touches them, and the update API only accepts the editable-field allowlist.**

### Key invariants (never violate)
- Additive/idempotent migrations only; archive, never delete (hard rule 1).
- Vendor silo: never key pricing across vendors by bare branch number.
- Compare prices only in the pricing UOM via `price_per_uom` (docs/46).
- Sent/received CMs are history — only draft/approved rows may change.
- `main` is the only deploy branch; verify `/healthz` `buildCommit` after every push.
- QBO is read-only forever (PEC-98); agents never email external domains (outbound-guard, code-enforced).
- Never send Σ N (total job balance) to a lender — billed AR (Σ Q) is the receivable (docs/85 / 10_Recon_Bridge).

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | https://cc.proexteriorsus.net — Coolify app uuid `og0rmt02rff8qti9nlfk3nr7`, builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` (one DB for dev + live) |
| Deploy check | `GET /healthz` → `buildCommit` (≈30–90s after push, ~300s cold) |
| Agent host | **PE-US-AGENTS `178.156.203.23`** (root, `~/.ssh/hetzner_office`); repo `/opt/openbrain/a-roofers-open-brain`; timers: abc 07:30 UTC · qbo nightly 01:00 UTC · wip-pack nightly 11:00 UTC · jt-sentinel 17:00 UTC |
| Old agent host | 5.78.146.161 — **decommissioned 2026-08-06**, do not reference |
| Secrets | 1Password `cleverwork.1password.com` via `op` CLI (CW_Master vault); Hetzner server discovery via item `Hetzner-PE_CC_DEV`; provisioning pattern: `op inject` → scratch file → `scp` → delete |
| Coolify API | token in root `.env` DEAD (401) — needs re-mint; push-webhook deploys unaffected |
| Linear | team **PE-CC-DevTeam** (PEC-…); this session: PEC-174 (report) / PEC-175 (blocker) / PEC-176 (backlog) + PEC-100 comment |
| WIP pack | nightly 06:00 CT → storage bucket `wip-packs`; served by `/api/accounting/friday-wip/pack`; Maya email via `/api/accounting/friday-wip/send` |
