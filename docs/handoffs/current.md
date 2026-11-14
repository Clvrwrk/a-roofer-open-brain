# Project Handoff — CenterPoint work tables into the PE apps
**Project:** a-roofers-open-brain (Command Center) + CRM (`Clvrwrk/CRM_PWA`) + PM (`Clvrwrk/pm.proexteriorsus.net`)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain · https://github.com/Clvrwrk/CRM_PWA · https://github.com/Clvrwrk/pm.proexteriorsus.net
**Production URL:** https://cc.proexteriorsus.net (Command Center) · https://crm.proexteriorsus.net (CRM) · https://pm.proexteriorsus.net (PM)
**Date:** 2026-11-13 20:48 PST
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested (`/project-handoff` after the CenterPoint review, data layer, three mockup sets and the PM importer, all on 2026-11-13)

---

## Read this first

- **Goal (Chris):** bring the Commercial / Multi-Family / Service side of the business, which lives in CenterPoint, into the existing Command Center, CRM and PM screens. No new work surfaces. It also rounds out financials the dashboards were missing.
- **What is live:** the data layer only. The six `work_*` tables, the hourly money view, the daily CenterPoint pull and the visit and technician columns are on the shared production database.
- **What is NOT live:** no CenterPoint ticket shows on any screen in any app. Command Center and CRM have mockups only (not signed off). PM has signed-off mockups and a built importer (PR 30) whose migration is **not applied**.
- **Waiting on Chris:** whether to apply PM migration 022 to the live database. That one step puts 46 tickets on the live PM board within five minutes.
- **Claude cannot sign in to a production site.** Every "signed-in page" check below is Chris's to do.
- Linear tracking issue: see "Service / deployment map" at the bottom of this file.

## Accomplished This Session

### 1. Review of the six CenterPoint `work_*` tables (read-only)

- Confirmed row counts on prod Supabase `rnhmvcpsvtqjlffpsayu` against the load report (loaded 2026-11-13 15:46 UTC).
- Found a test company, "CP Support Test Company", holding $533,400.18 of the $1,480,257.48 invoice total. Real service invoicing is about $946,857.
- Found that QuickBooks already holds the CenterPoint invoices (`qbo_invoices.doc_number` = CenterPoint job number). Adding `work_invoices` to company revenue would double count.
- Found that 848 labor rows with no job are day clock-ins that overlap job rows. Job hours are 7,149.11; do not add the two.
- Found `due_date` empty on every invoice, 149 closed or invoiced jobs with $0 invoiced, and 557 of 667 properties not matched to the property spine.

### 2. Phase 1 data layer — PR 75, merged as `edb62dcf`

- `schemas/cleverwork-roofer/343-centerpoint-work-tables.sql`: tracked definition of the six tables (replaces untracked files that collided on number 342).
- `schemas/cleverwork-roofer/344-…`: projection function, with `missing_since` so a row that leaves CenterPoint is marked, never deleted.
- `schemas/cleverwork-roofer/345-…`: read layer. `is_test`, property links by address, `mv_work_job_money`, `v_work_labor_day`, `v_work_invoice_qbo_recon`, and the hourly pg_cron job `centerpoint-work-refresh`.
- `schemas/cleverwork-roofer/346-…`: sync-health expectation for the daily pull.
- `scripts/centerpoint-work-sync.sh` and `deployment/remote/systemd/openbrain-centerpoint-sync.{service,timer}`: daily pull at 19:45 CT on the agent host.
- `app/command-center/src/lib/runtime-registry.ts`: rows for the hourly refresh and the daily timer.
- `docs/78-centerpoint-supabase-mirror.md`: work tables section, rules and open items.
- Migrations 344, 345 and 346 applied to prod and recorded in the ledger by hand.
- Host timer installed at Chris's word ("Yes, install it"). First run succeeded and reported.
- Stale untracked files removed from the main checkout at Chris's word ("Yes, remove them").
- Verified by SQL: 1,004 jobs in the money view, billed $942,487.66, collected $685,701.18, outstanding $256,786.48. QuickBooks comparison: 437 job numbers match, 46 differ.

### 3. Visits and technicians — PR 78, merged as `f4f37734`

- `schemas/cleverwork-roofer/347-centerpoint-work-visits.sql`: adds `visit_start_date`, `visit_start_time`, `visit_end_date`, `technician_source_id`, `truck_source_id`, `status_changed_at`, `sold_at`, `completed_at` to `work_jobs`; new `work_profiles` (25 staff, names only, no contact details); view `v_work_job_visits`. Applied to prod, ledger name `centerpoint_work_visits`.
- `scripts/centerpoint-work-sync.sh`: now pulls profiles each day.
- `docs/78`: "Visits and technicians" section. `work_jobs.scheduled_at` is the moment a ticket was scheduled, never the visit date.
- Verified by SQL: 612 jobs carry a visit date, equal to the raw count; all 13 technicians resolve to a name.
- Deploy check after the merge: `/healthz` reported `buildCommit` `f4f37734`. Source-branch setting in Coolify not read. Signed-in page not checked.

### 4. Command Center mockups — draft PR 77 (NOT signed off)

- `docs/mockups/centerpoint-command-center/`: `index.html`, four mockup pages (Friday WIP/AR, 13-Week Cash Flow, Sales Pipeline), `brand-audit.md`, `gap-analysis.md`, desktop, tablet and phone screenshots, and `_build/build.py`.
- Each mockup is the real screen as rendered locally with only the CenterPoint changes applied. CenterPoint appears as one more office group, `commercial_service`. No new control, class or token.
- Customer names are numbered aliases (Chris: "Mask names, commit"). The builder asserts that no real name leaks.
- Branch `contrib/cleverwork/centerpoint-cc-mockups`, last commit `0f2b4158` (main merged in after a conflict on `version.ts`, the daily log and docs/78 rule 9).

### 5. CRM mockups — draft PR 314 in CRM_PWA (NOT signed off)

- `docs/mockups/centerpoint-crm/`: My jobs, the job page for CP-25-1795, Jobs board, Weekly WIP/AR and Friday review, with brand audit and gap analysis.
- Branch `contrib/centerpoint-crm-mockups`, last commit `943c2281`.

### 6. PM mockups — PR 29 in pm.proexteriorsus.net (SIGNED OFF by Chris, not merged)

- `docs/mockups/centerpoint-pm/`: Jobs, Schedule and the job panel for CP-25-1966, with brand audit and gap analysis.
- Chris answered all five PM decisions "yes" and said "Signed off". Both are recorded in the PR (commit `4a491c6`).

### 7. PM importer — PR 30 in pm.proexteriorsus.net (built, NOT applied, NOT merged)

- `supabase/migrations/202609140022_centerpoint_import.sql`: accepts `centerpoint` in `scheduler_source_status`; adds `scheduler_private.centerpoint_tickets()` and `scheduler_private.refresh_centerpoint(org)`; patches `public.scheduler_refresh_sources()` so the worker's existing five-minute call also imports CenterPoint.
- `supabase/tests/centerpoint.test.ts`: four database tests (no work tables, first import, second run and lifecycle follow, PM ownership after a command).
- `docs/CENTERPOINT-IMPORT.md`: which tickets come in, the translation table, who owns the lifecycle, what is not built.
- `apps/worker/README.md`: link to the new doc.
- Checks run locally: 241 tests pass, `npx tsc --noEmit` clean, `npm run build` clean. Not run: `scripts/check-concurrency.ts` (needs PostgreSQL 17).
- Read-only preview against live data: 46 tickets would import (15 Completed, 4 In Progress, 5 Scheduled, 9 Sold, 13 Ticket Created). All have a customer and a city and state.
- Branch `contrib/centerpoint-importer`, commit `c7e6a11`.

### 8. Housekeeping

- `~/.claude/settings.json`: `Bash(git push *)` allow rule added at Chris's request (backup `settings.json.bak-2026-11-13` beside it).
- Resume memory `centerpoint-work-tables-merge-resume.md` kept current through the session.

## Git State

**a-roofer-open-brain**
- **Branch holding this handoff:** `contrib/cleverwork/centerpoint-handoff-2026-11-13` (from `origin/main` `60b975c8`)
- **`origin/main`:** `60b975c8` — "Merge pull request #69" (SRS work from another session). Live `/healthz` reports this same commit.
- **Open:** PR 77 (draft), branch `contrib/cleverwork/centerpoint-cc-mockups`, `0f2b4158`.
- **Uncommitted changes:** none.

**pm.proexteriorsus.net** (worktree `~/pm-centerpoint-importer-build/repo`)
- **Branch:** `contrib/centerpoint-importer`, last commit `c7e6a11` — "022: import open CenterPoint tickets as PM jobs". PR 30 open.
- PR 29 (mockups) open on `contrib/centerpoint-pm-mockups`.
- **Uncommitted changes:** none.

**CRM_PWA** (worktree `~/crm-centerpoint-mockups-build/repo`)
- **Branch:** `contrib/centerpoint-crm-mockups`, last commit `943c2281`. Draft PR 314 open.

## Task Cut Off

None. The session ended at a clean boundary, waiting on Chris's answer about applying PM migration 022.

## Next Task — Start Here

**Task:** get Chris's decision on PM migration 022, then apply and verify it.

**What to check / do:**
1. Ask Chris: "Apply migration 022 to the live database?" Do not apply without a yes in the current conversation.
2. Before applying, state the change (46 CenterPoint tickets appear on the live PM board), the impact (more rows on Jobs; untouched tickets follow CenterPoint's status) and the rollback (restore the previous `scheduler_refresh_sources()` and `scheduler_source_status()` definitions; imported jobs stay, PM never deletes jobs).
3. Save the two current function definitions first: `select pg_get_functiondef('public.scheduler_refresh_sources()'::regprocedure)` and the same for `public.scheduler_source_status(text,jsonb)`. Keep them in `~/pm-centerpoint-importer-build/` (not `/tmp`).
4. From the main checkout `/Volumes/M1 Application SSD/Projects/Pro Exteriors US APP`, run `supabase db query --linked -f <absolute path to 202609140022_centerpoint_import.sql>`.
5. Insert the ledger row by hand in `supabase_migrations.schema_migrations`. Check how PM's earlier migrations are named in the ledger and follow that pattern (expected: `scheduler_centerpoint_import_022`).
6. Wait one worker cycle (five minutes) or call `select public.scheduler_refresh_sources()`. Then check: `select count(*), stage from scheduler.jobs where source='centerpoint' group by stage`. Expect about 46 rows: 22 planning, 5 scheduled, 4 in_progress, 15 quality. Counts move as CenterPoint changes.
7. Check `scheduler_private.source_state` has a `centerpoint` row with status `current` and that the `acculynx` row's `record_count` did not change.
8. Report with "NOT verified — signed-in PM board not checked" first, and ask Chris to open the PM Jobs screen and confirm the tickets show.
9. PR 30 still needs Greptile and CodeRabbit before merge (PM `AGENTS.md`). PR 30 is code, so the bots apply.

**If the migration raises "Source refresh anchor differs":** the live `scheduler_refresh_sources()` no longer contains ` perform scheduler_private.refresh_trade_packages();`. Read the live definition, move the anchor in the migration to a line that exists, re-run the tests, and push before applying. The `create function` statements above the patch are not `or replace`; if they already ran, the retry must skip them or the migration must be made re-runnable first.

**If the import count is far from 46:** stop and compare with `select * from scheduler_private.centerpoint_tickets() where in_cohort`. Do not delete imported jobs.

**Prompt to use:** "Read docs/handoffs/current.md and the memory file centerpoint-work-tables-merge-resume.md. Then apply PM migration 022 to the live database, record it in the ledger, verify the import by SQL, and tell me what to look at on the PM board."

**Other tasks that can start without that decision**
- Chris reviews the Command Center mockups (PR 77) and CRM mockups (PR 314) and answers the open decisions listed below.
- Check that the 19:45 CT `openbrain-centerpoint-sync` timer fired on its own on 2026-11-13 (01:45 UTC on 2026-11-14).
- Realign the agent host checkout (see blockers).

## Decisions Made This Session

- **No new screens.** CenterPoint work joins the existing Command Center, CRM and PM screens (Chris's opening constraint).
- **CenterPoint is read-only.** Nothing writes back to CenterPoint. A change made in PM does not reach CenterPoint.
- **Do not add `work_invoices` to revenue.** QuickBooks already carries those invoices; adding them double counts.
- **The test company is excluded everywhere** through `is_test` and `mv_work_job_money`. Read money through that view.
- **Rows are never deleted when they leave CenterPoint.** `missing_since` marks them (hard rule 1).
- **Staff names are kept, narrowly.** `work_profiles` holds names of referenced staff only, no contact details. This reverses 343's "no worker name" for one case, because technicians become PM crews.
- **`scheduled_at` is not the visit.** The visit is `visit_start_date` + `visit_start_time`. CenterPoint records no end time.
- **Mockup customer names are aliases.** Real commercial customer names with balances owed do not go in a repo. Builder inputs with AccuLynx names stay in `Archives/home-builds/`.
- **Command Center group name is `commercial_service`** in the mockups (still one of Chris's open decisions).
- **PM, decided by Chris (all "yes"):** technicians become PM crews; Ticket Created and Sold → Planning, Scheduled → Scheduled, In Progress → In progress, Completed → Quality review; Repairs and Leak → Repairs, Reroof and Coating → Roofing; one "Commercial service" office; "Service" is a channel.
- **PM importer choices made by Claude, flagged for Chris, not yet confirmed:**
  - Archived tickets are left out (46 tickets, not the mockup's 47).
  - A ticket nobody has touched in PM keeps following CenterPoint's status. Once PM holds a scope, phase, visit, report, acceptance or any command on it, PM owns the lifecycle and only name, number, site and source stage keep updating.
  - A ticket that is invoiced, closed or archived in CenterPoint stays in PM at its current stage. Untouched completed tickets will collect in Quality review.
  - Planning tickets read "Needs review"; the rest read "Ready" with a note. The mockup's "Scheduled in CenterPoint" label is a screen change and is not in PR 30.
- **PRs 75 and 78 were merged with `--admin` and no bot review** at Chris's word ("Skip review and merge", "Merge it"). CodeRabbit and Greptile auto review is off on a-roofer-open-brain and the `gh` account is the author.

## Blockers Requiring Human Action

1. **Apply PM migration 022?** Chris decides. Nothing shows on the PM board until it is applied.
2. **Signed-in checks Claude cannot do:** the two CenterPoint rows on the Command Center `/agents` board; a signed-in Command Center page after PR 78; the PM Jobs board after 022.
3. **Sign-off on the Command Center mockups (PR 77)** and five decisions: pipeline stage mapping; whether unpaid CenterPoint invoices are Critical AR Tier 1; whether every CenterPoint job is "Commercial" in the Type filter; the group name `commercial_service`; where meeting entries (expected dates, notes) are stored for CenterPoint jobs, since `wip_ar_master` keys on the AccuLynx id.
4. **Sign-off on the CRM mockups (PR 314)** and four decisions: who sees a CenterPoint job on My jobs (it has no CRM owner); statuses in CenterPoint's words or translated; a six-step service strip or no strip; every CenterPoint job "Commercial".
5. **PM crews and calendar visits need two answers:** how long PM should assume a visit lasts, and who supplies crew details for the technicians. Also: what happens when a CenterPoint visit is moved in PM.
6. **Written scope change.** PEC-761 still says CenterPoint is outside the approved provider catalog. A daily CenterPoint pull now runs at Chris's instruction. Chris should confirm the scope change in writing before CenterPoint is added to `BUSINESS_SYNC_PROVIDERS`.
7. **Still-open data decisions:** Friday board shows open-balance jobs only or all tickets; collections source of truth (CenterPoint or QuickBooks); whether to create spine properties for the 557 unmatched; the 46 job numbers that differ from QuickBooks; the 149 $0 jobs.
8. **Agent host checkout.** It sits at `dcb8591` with local edits, and `scripts/centerpoint-work-sync.sh` was copied there by hand (twice). Remove the hand copy before the host fast-forwards to `origin/main`.
9. **Review bots on PM PR 30** (Greptile and CodeRabbit) before merge.

## Verification Commands

1. `curl -s https://cc.proexteriorsus.net/healthz` — should return `"status":"ok"` and `buildCommit` equal to `git rev-parse origin/main` (was `60b975c8…` at handoff).
2. From the main checkout: `supabase db query --linked "select count(*) from public.mv_work_job_money where source='centerpoint'"` — should return about 1,004.
3. `supabase db query --linked "select count(*) from public.work_jobs where visit_start_date is not null"` — should return about 612.
4. `supabase db query --linked "select count(*) from public.work_profiles"` — should return 25 or more.
5. `supabase db query --linked "select count(*) from scheduler.jobs where source='centerpoint'"` — should return 0 until migration 022 is applied, about 46 after.
6. `supabase db query --linked "select name from supabase_migrations.schema_migrations where name ilike '%centerpoint%' order by version"` — should list the work-table migrations including `centerpoint_work_visits`, and no importer row until 022 is applied.
7. `gh pr view 30 -R Clvrwrk/pm.proexteriorsus.net --json state,reviewDecision` — `OPEN` until Chris asks for the merge.
8. In `~/pm-centerpoint-importer-build/repo`: `npm test` — should report 241 passed.
9. On the agent host: `systemctl list-timers openbrain-centerpoint-sync.timer` — should show a next run at 19:45 CT.

## Full Context

### What was built across ALL sessions — additions from 2026-11-13

- CenterPoint work tables, tracked and scheduled: six `work_*` tables, projection with `missing_since`, hourly `mv_work_job_money` refresh, daily host pull, sync-health expectation (migrations 343–346).
- Visit dates, technicians and staff profiles on the work tables (migration 347).
- QuickBooks comparison view `v_work_invoice_qbo_recon` and labor view `v_work_labor_day`.
- Mockup sets with brand audit and gap analysis for Command Center (PR 77), CRM (PR 314) and PM (PR 29).
- PM importer for CenterPoint tickets (PR 30, migration 022, not applied).

### Architecture decisions — additions from 2026-11-13

- One shared production database serves Command Center, CRM and PM. The work tables are owned by the Command Center repo; CRM and PM only read them.
- PM's importer is a database function, `public.scheduler_refresh_sources()`, called by the PM worker every five minutes. CenterPoint was added to that function, not to the worker.
- PM patches existing functions by reading the live definition and replacing an anchor line. A migration fails loudly if the anchor is gone.
- `refresh_centerpoint` takes the same project-before-job advisory locks as operator commands, in id order.
- Do not call `refresh_centerpoint_work()` in the same statement that reads `mv_work_job_money` (error 55006).
- `supabase db query --linked -f <file>` writes no ledger row. Insert the ledger row by hand.
- Mockups are built by a script from a capture of the real screen plus real CenterPoint rows with aliased names. Phone shots need Playwright emulation; headless Chrome will not go under about 500px wide.

### Key invariants — additions from 2026-11-13

- CenterPoint and QuickBooks are read-only. No write, ever.
- Never sum job labor rows and no-job clock-in rows.
- Never count `work_invoices` as new revenue.
- Never commit a real customer name with a balance, an AccuLynx customer list or a rep list.
- Never merge a mockup PR before Chris signs off. Never start UI code before the mockup, brand audit and gap analysis exist and are signed off.
- Never call something live without the commit, source-branch and signed-in checks.

### Service / deployment map — additions from 2026-11-13

| Service | Detail |
|---------|--------|
| Linear tracking issue | PEC-973 — https://linear.app/cleverwork/issue/PEC-973/centerpoint-work-tables-into-command-center-crm-and-pm-no-new-screens |
| Daily CenterPoint pull | systemd `openbrain-centerpoint-sync.timer` on the agent host, 19:45 CT; script `scripts/centerpoint-work-sync.sh` |
| Hourly money refresh | pg_cron job `centerpoint-work-refresh` on prod Supabase |
| PM importer | `public.scheduler_refresh_sources()` → `scheduler_private.refresh_centerpoint(org)`; runs once migration 022 is applied |
| Command Center mockups | a-roofer-open-brain PR 77, `docs/mockups/centerpoint-command-center/` |
| CRM mockups | CRM_PWA PR 314, `docs/mockups/centerpoint-crm/` |
| PM mockups | pm.proexteriorsus.net PR 29, `docs/mockups/centerpoint-pm/` |
| PM importer PR | pm.proexteriorsus.net PR 30 |
| Build folders (M1, survive a restart) | `~/centerpoint-cc-mockups-build`, `~/crm-centerpoint-mockups-build`, `~/pm-centerpoint-mockups-build`, `~/pm-centerpoint-importer-build` → `Archives/home-builds/` |
| Resume memory | `~/.claude/projects/-Volumes-M1-Application-SSD-Projects-Pro-Exteriors-US-APP/memory/centerpoint-work-tables-merge-resume.md` |
| Previous handoff | `docs/handoffs/archive/2026-11-13-2048-pre-centerpoint-merge-handoff.md` |

---

## Carried forward from the 2026-10-06 handoff (unchanged)

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
