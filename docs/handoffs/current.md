# Project Handoff — Pro Exteriors Open Brain / CRM (crm.proexteriorsus.net)
**Project:** a-roofers-open-brain + the CRM app (`Clvrwrk/CRM_PWA`)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain and https://github.com/Clvrwrk/CRM_PWA
**Production URL:** https://crm.proexteriorsus.net (CRM) · https://cc.proexteriorsus.net (Command Center)
**Date:** 2026-10-06 23:41 PDT
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested (/project-handoff after the CRM nesting → journey → role access → My jobs run, 2026-10-05 to 2026-10-07)

---

## Accomplished This Session

Every release below was switched by Chris on the CRM host and verified afterwards: `/healthz buildCommit`, anonymous 401s, the route-generator hash and Sentry. Every migration had a rolled-back prod dry run first and a ledger sha check after. The full records are in the CRM repo at `docs/delivery/FULL-RELEASE-2026-10-0*.md`, in PR #141.

### CRM releases (crm.proexteriorsus.net)

| Release | Switched | Port | What changed |
|---|---|---|---|
| `ca21f94d` (#139) | 2026-10-06 15:16Z | 4465 | Search, Today and lead freshness are set-based (6.5 s to 0.1 s); trade names; Back to the row; Roles dialog fits; phone median labels |
| `61602f2b` (#140) | 2026-10-06 15:53Z | 4466 | Customer journey card on every job: 10 phases, gate list v1 (38 gates), owners, next action, gated moves |
| `91ad20cf` (#142) | 2026-10-06 23:22Z | 4467 | JOURNEY-13: journey-role holders get the job rep's access to every open job their role covers |
| `9a1e4d9e` (#143) | 2026-10-07 06:34Z | 4468 | My jobs as a nest, a Next task on each office bar, actions greyed out with the reason (MY-JOBS-NEST-1–9) |

### CRM migrations applied to prod `rnhmvcpsvtqjlffpsayu` (ledger sha equals file)

| Migration | Ledger |
|---|---|
| `20261023010000_crm_speed_search_worklist` | `20261006044741` |
| `20261023020000_crm_profile_trade_names` | `20261006044927` |
| `20261024010000_crm_job_journey` | `20261006132336` |
| `20261025010000_crm_journey_role_access` | `20261006211939`, sha `d3c8d105…`; Chris applied it |
| `20261025020000_crm_journey_role_lists` | `20261006211940`, sha `7e6e8b46…` |
| `20261026010000_crm_my_jobs_nest` | `20261007052547`, sha `d305422e…`; new functions only |

### Brain repo (this repo, now on main)

- **`schemas/cleverwork-roofer/325-acculynx-unarchive-reseen.sql`:** applied 2026-10-06 (ledger `20261006123149`). It restored 157 wrongly archived AccuLynx estimates and held back 2 that are proven gone. acculynx-sync v54 (commit 874a716d) had already fixed the cause.
- **`docs/knowledge-base/acculynx/ingestion/sync-pipeline.md`:** records the 325 apply.
- **`docs/124-crm-job-journey-gates.md`:** journey live, plus a JOURNEY-13 section.
- **`app/command-center/src/pages/design-system/decisions.astro`:** five CRM decision rows (journey card, JOURNEY-13, My jobs nest, Next task on office bars, greyed-with-reason). Deployed: cc `/healthz` = `404229e8`.
- **`context/memory/2026-10-06-crm-journey.md`:** the session log.

### Other prod changes

- **CRM variables:** P6 readiness version 1 (`e2c6319f…`) submitted as Christopher Hussey at his direction. It is `in_review`, effective 2026-10-08 13:00Z, with the 8 Readiness Policy checks.

## Git State
- **Branch:** `claude/crm-performance-nesting-760bc9` (brain worktree); `main` matches it except for this handoff commit, which is pushed with this file.
- **Last commit:** see the report at the end of this session (the handoff commit).
- **Uncommitted changes:** none.
- **CRM repo:** `main` = `9a1e4d9e` (live). PR #141 (release records for all four releases, docs only) is open. The feature branches are merged.

## Task Cut Off
None. The session ended at a clean boundary: the last release is verified and the records are written.

## Next Task — Start Here

**Task:** Confirm the My jobs release with Chris's signed-in click-through, then pick up the follow-ups below.

**What to check / do:**
1. Ask Chris for the signed-in result. As a journey-role holder, Jobs should open on My jobs with the right reason tags and a Next task link on each office bar. On a covered job, Mark lost, Cancel and Reassign should be greyed with the reason under them. If anything is off, the source is CRM `packages/sales-workspace/src/components/nest/*` and `WhyNot.tsx`.
2. Check whether a second admin approved P6 readiness version 1 before 2026-10-08 13:00Z: `select state, reviewed_by from crm.config_versions order by created_at desc limit 1;`. If it is still `in_review` after that time, approval fails with `effective_date_in_past`; the version must be returned and resubmitted with a new date.
3. Ask Chris to merge CRM PR #141.

**If a CRM release is needed:** use the release kit in `~/crm-nesting-build/release/`. Write a spec with `prev=9a1e4d9e7d35` and port `4469` (copy `spec-9a1e4d9e.json`, update `observed` from the `9a1e4d9e` switch: container `d7ab55db…`, image `sha256:165591fabd34183dee1bf6cc6d95d7ef9ff3bd9d440c4ba063273ead5e6753b3`, route `7d7ed15722912e01ce9e82f5bd4713c7fff0528f57f6b2da75e755c6dbaada84`). Then run `zsh prepare2.sh <spec>`, hand Chris `COMMANDS-*.md`, and verify after his switch.

**Prompt to use:** "Read docs/handoffs/current.md. Check the P6 readiness approval state and PR #141, then ask me for the My jobs click-through result."

## Decisions Made This Session

- **Journey (JOURNEY-1–12):** stage = the 10 journey phases; gate list v1 has 38 gates; inferred means evidence until a person confirms; manual gates never read Met on their own; move back is admin-only; once a person sets the CRM phase, the AccuLynx sync never changes it; conditional waivers into P9 and unconditional into P10; an office with no seat holder shows the company holder.
- **JOURNEY-13:**
  - Holding a journey role gives the rep's access to every open job the role covers.
  - Coverage: an office seat covers its office at every stage; a company seat covers only offices with no holder of that role.
  - Rights: same as the rep. Reassign, cancel, lost, reopen, proposal ready, readiness review and waive, and request assign stay with managers and admins.
  - Sales Consultant (the job's rep) and AI roles grant nothing.
- **My jobs (MY-JOBS-NEST-1–9):**
  - Jobs opens on My jobs, with a toggle to All jobs.
  - The nest is Office › Sales rep › Job type › Estimates.
  - A "why it's mine" reason on every job.
  - One Next task per office bar.
  - Unavailable actions are greyed out with the reason; Chris chose greying over hiding.
- **Rollout rule (learned the hard way, 2026-10-06 21:19–23:22Z):** the CRM's parsers are strict, so a new field or enum value in an existing answer breaks the live app. Ship new data through NEW function names and routes, applied before the app, or ship the parser first.
- **Prod routes for large SQL:** agents can send about 130 KB through the Supabase MCP. The 239 KB JOURNEY-13 dry run was stopped by the safety classifier, and a psql apply script was denied. Keep migrations under about 90 KB, or Chris runs them.

## Blockers Requiring Human Action

1. **Signed-in click-through** of journey, JOURNEY-13 and My jobs: Chris.
2. **P6 readiness approval** by a second admin (Roberto, Chandler, …) in Admin › CRM variables before 2026-10-08 13:00Z.
3. **Merge CRM PR #141** (docs only).
4. **CRM host operations** (stage, switch, rollback over SSH) stay with Chris: the classifier blocks the agent.
5. **Unmerged CRM PRs from earlier work:** #136, #135, #133, #132, #130, #127 and #123. #123 (lien waivers) needs an audience decision for Crew compliance holders.

## Verification Commands
1. `curl -s https://crm.proexteriorsus.net/healthz | python3 -c 'import json,sys;print(json.load(sys.stdin)["buildCommit"])'`: should return `9a1e4d9e7d35944142e25cfa6350668622253b47`.
2. `curl -s -o /dev/null -w '%{http_code}' https://crm.proexteriorsus.net/api/v1/nest/mine`: should return `401`.
3. `curl -s https://cc.proexteriorsus.net/healthz`: `buildCommit` should equal brain `origin/main`.
4. SQL (MCP, read-only): `select name, encode(sha256(convert_to(array_to_string(statements,''),'UTF8')),'hex') from supabase_migrations.schema_migrations where name like 'crm_%2026102%' order by version;`: six rows, each sha equal to its CRM file.

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from prior handoffs (see `docs/handoffs/archive/`), plus:
- Invoice Audit v2 (docs/81), office-inherited pricing, vendor/office/time/UOM silos (migs 119–122, 201, 208, 217)
- Friday WIP/AR board (mig 215), credit-memo claim sets, Agreement Builder + `agreement_gap_queue` (migs 229/229b)
- Materialised audit line + on-demand refresh (migs 272–276); item-aware supersession (277); weekly QB export set (278); vendor arm parity (279); negative-total/CM routing + per-vendor export (280)
- Cash family: 13-week cash flow, cash runway, fixed costs (mig 281)
- Runtime uptime board `/agents` with direct third-party pings (docs/109, 2026-09-11/12); Thursday WIP/AR pack on openpyxl
- Living design system at `/design-system` (docs/112, 2026-09-14)
- **2026-09-15 → 09-22:**
  - triage office-matview race + reconcile scope (289); June line reopen (290);
  - branch 326 re-key + aliases (291); slug-keyed branch aliases + stub office carry (292/292b);
  - June invoice closeout register + reset guard + "Processed — closed" label (293/293b + app);
  - AccuLynx link INS- prefix + client-name fallback (294);
  - weekly export set on the app's pending rule + NOT-paid/ledger guards (295/295b);
  - site-sweep timeout fix + evergreen + design-system exemptions; job-report `started_at`;
  - SRS September ingest + 71 PDFs; QB bank batch 7/31–8/12 rebuilt from the export log
- **2026-10-05 → 10-07 (CRM):**
  - nested Office › Sales rep › Stage surfaces and the corner rule (5e69f758);
  - set-based Search, Today and lead freshness (ca21f94d);
  - the customer journey card (61602f2b);
  - JOURNEY-13 role-holder access (91ad20cf);
  - My jobs nest + Next task + greyed actions (9a1e4d9e);
  - AccuLynx archive repair 325 + sync v54;
  - P6 readiness version submitted

### Architecture decisions
- `v_invoice_audit_line` is the definition of record; every reader goes through `mv_invoice_audit_line`. The matview is refreshed by pg_cron job 13 every 15 min, and on demand via `request_matview_refresh` → job 15. The invoice-level view `v_invoice_audit_invoice` is still live and is the next materialisation candidate.
- The pricing arm resolves an invoice's PE office through `mv_invoice_pricing_office`, which resolves `abc_invoices.vendor_branch_id`, set at ingest through `vendor_branch_alias` (mig 243). Branch identity is the alias row, never the branch-number string.
- Alex's triage refreshes `mv_office_agreement_versions` + `mv_invoice_pricing_office` before evaluating, and fails closed without a pricing-office row (mig 289).
- `invoice_audit_closeout` is a human register: `invoice_audit_reset()` refuses closed-out invoices.
- "Pending" is defined once (app + `v_inv_processed_weekly`): undecided AND visible discrepancy.
- Credit status is derived from the amount, never written onto the vendor mirror.
- Service tokens cannot export QB bank files (`approval.decide`).
- **CRM access model:**
  - **Core rule:** `crm_private.rep_access` keyed by owner, plus `effort_roles` per job, plus journey coverage (`crm_private.journey_cover` / `journey_covers`).
  - **`effort_visible(v,b,e)`** is the single-job predicate. Under View-as it is the target ∩ the admin. It never reads the JWT.
  - **Set readers** compute owners and cover arrays once per call. Never call a per-row access function in a set reader; a static test (D9) pins this.
  - **Manager-only operations** refuse a `journey_role`-only basis (`crm_private.effort_access_basis`).
- **CRM journey:**
  - Gate catalog `crm_private.journey_gate_catalog()` (journey-gates-v1).
  - Confirmations are append-only (`crm.journey_gate_confirmations`).
  - The phase source is `efforts.journey_phase_source`. Once a person sets it (`'crm'`), the AccuLynx import leaves the phase alone.
- **CRM My jobs:**
  - `crm.read_my_nest` returns a NestPage plus reasons and next_tasks.
  - `crm.read_effort_permissions(ids)` returns per-job `can_*` flags. The client greys on false and keeps today's behaviour when the read fails.

### Design system
- **Site:** https://cc.proexteriorsus.net/design-system (docs/112).
- **Type:** Inter 400/600/700/800, body 14px.
- **Colors:** navy `#11133f` authority, flag red `#c22326` the one CTA, gold `#eaa221` attention, hunter green `#3b6b4c` status, smart blue `#0066cc` links.
- **Lists:** ten-row long-list panes.
- **CRM corner rule (S-10):** controls 8px, containers 12px, nested bars 8px, tags 4px; circles only for avatars, dots and counts.
- **CRM disabled pattern:** greyed at 50%, still focusable, with the reason directly under the control (`aria-describedby`); never hidden.

### Key invariants (never violate)
- Four pricing gates: vendor · office · time (item-aware supersession) · UOM. The audit refuses rather than converts, and the lowest price wins a tie.
- A negative total is a credit memo. One QB export file per vendor. `register_exported_at` and `qb_bank_export_log` are one-way.
- A human cancellation or closeout is a decision: surface it, never revive it.
- Nothing external without a human. QBO is read-only. No secrets in code or chat.
- Every agent pass that writes decisions refreshes or verifies the matviews it reads first.
- Every token, component or decision change updates the design-system chapter.
- **CRM migrations:**
  - Additive and idempotent.
  - Prod dry run first (ending in a ROLLBACK_SENTINEL); ledger sha = file sha after.
  - Never change the answer shape of a live function the running app parses: add new function names instead.
  - No overloads in `crm`, and no new defaulted parameters on existing functions (42725).
- **Durable work** lives in `~/crm-nesting-build/`, never only in /tmp: a Mac restart wipes it (global CLAUDE.md).

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod Supabase | `rnhmvcpsvtqjlffpsayu`, shared by dev and live. For the applied watermark, query `supabase_migrations.schema_migrations`; never trust a number written here. |
| Command Center deploy | Coolify → `cc.proexteriorsus.net` from `origin/main` on push; verify `/healthz buildCommit`. Coolify host `178.105.220.14` (`~/.ssh/a_roofers_open_brain_ed25519`). |
| CRM deploy | Pinned release modules (`scripts/release-crm-<sha12>.py` + engine `release-property-journey.py`). Each pin derives from the previous one with `~/crm-nesting-build/release/derive-pin.py` / `prepare2.sh <spec>`. Chris runs scp, stage and switch on `178.105.220.14`. Live: `crm-weekly-9a1e4d9e7d35` on 4468; rollback target `crm-weekly-91ad20cf2ae2` on 4467. The next port is 4469. |
| CRM local DB tests | Docker `crm-nest-test` 127.0.0.1:55439 (password in `~/crm-nesting-build/build/.pg-crm-nest`). Lock with `mkdir ~/crm-nesting-build/build/db.lock`. The full chain runner is `build/run-db-chain-myjobs.sh`. |
| CRM Sentry | org `cleverwork`, project `pwa-crm` |
| Dev | port 4399 via `.claude/launch.json` `command-center` |
| Agent host | Hetzner `178.156.203.23` (`~/.ssh/hetzner_office`) |
| Nightly ABC | `scripts/abc-nightly-sync.sh` 03:30 ET |
| pg_cron | job 13 (15 min): matviews + CM claims + reconcile; job 15 (1 min): on-demand refresh; job 18: order↔AccuLynx matview; `crm-acculynx-nightly-sync` 09:30Z |
| Agent auth to live site | Bearer service tokens on `/api/*`; skill `/workos-agent-auth` |
| Slack | per-agent bots per `/slack-agents`; dev traffic → `#pe-cc-dev-team` |
| Linear | PE-CC-DevTeam; the MCP needs authorisation |
