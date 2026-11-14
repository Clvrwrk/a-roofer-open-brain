# Project Handoff — Pro Exteriors Open Brain / CRM and PM job Activity
**Project:** a-roofers-open-brain + the CRM app (`Clvrwrk/CRM_PWA`) + the PM app (`Clvrwrk/pm.proexteriorsus.net`)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain · https://github.com/Clvrwrk/CRM_PWA · https://github.com/Clvrwrk/pm.proexteriorsus.net
**Production URL:** https://crm.proexteriorsus.net (CRM) · https://pm.proexteriorsus.net (PM) · https://cc.proexteriorsus.net (Command Center)
**Date:** 2026-11-13 20:55 PST (2026-11-14 04:55Z)
**Agent:** Lead Orchestrator (Claude Code), with two child sessions (scheduler host removal, PM Activity nest)
**Reason:** User-requested (/project-handoff after the nested Job Activity run, 2026-11-12 to 2026-11-13)

---

## Accomplished This Session

State below was re-read at 2026-11-14 04:50Z from GitHub, the three `/healthz` endpoints, DNS and the prod database. Anything not re-read is marked.

### 1. AccuLynx Activity Feed check (2026-11-12, no change made)

- Computer use can read the Activity Feed on an open AccuLynx tab in Chrome, as a screenshot only. Chrome is granted view-only, so it cannot scroll or click there.
- The Chrome extension can scroll and click, but only in its own tab group. Whether Chris's AccuLynx login carries into an extension tab was not tested.

### 2. CRM job page: UI/UX audit of the duplicated notes lists (2026-11-12)

Audited from code (CRM `main` at `8bfd54d2`) and Chris's screenshot of KS-143. Findings:

- Two lists showed the same notes (Notes threads above, activity feed below); one event could appear up to four times.
- Replies were flattened in the feed, the two "Notes" counts disagreed, and no long text was clamped.
- Open state was not remembered, against ds rule F-06.

### 3. Mockup, brand audit, gap analysis (mockup-first rule)

- Mockup canvas: https://claude.ai/artifact/GCDpnYRtYAqXR1hPrZm5bu, boards Main, Open, Phone and PM. Chris signed it off on 2026-11-12 ("Looks great, build, publish, deploy").
- Chris's change before sign-off: nest it like invoices. Notes, Emails, Calls, Texts, Uploads, Stage and gates are bars that stay closed until someone opens them.
- Audit and gap analysis: `docs/design/JOB-ACTIVITY-NEST.md` in CRM_PWA. Decision id JOB-ACTIVITY-11.
- Source copy of the boards: `~/activity-mockup-build` (the scratchpad copy is throwaway).

### 4. CRM release: nested Job Activity (live, confirmed by Chris)

| Item | State |
|---|---|
| [Clvrwrk/CRM_PWA#300](https://github.com/Clvrwrk/CRM_PWA/pull/300) "crm: Job Activity as a nest, closed until opened (JOB-ACTIVITY-11)" | Merged 2026-11-13T02:00Z as `38c0d8dd`. Front end only, no migration. |
| Release t23 | Deployed 2026-11-13T02:03Z on `root@178.105.220.14`: `/opt/crm-t23-38c0d8dd-20261113`, container `crm-weekly-38c0d8dd95ba`. |
| Signed-in check | Chris confirmed the bars on a signed-in Job page on 2026-11-13 ("Looks right"). |
| [Clvrwrk/CRM_PWA#304](https://github.com/Clvrwrk/CRM_PWA/pull/304) "docs: record the t23 CRM release" | Merged 2026-11-13T14:28Z as `977c97b3`. Docs only. |
| Live now | `/healthz` reads `d961dbcb`. Later releases by other sessions replaced t23; `d961dbcb` is 18 commits ahead of `38c0d8dd` and 0 behind, so the nest is still in the running build. |

### 5. scheduler.proexteriorsus.net deleted (child session, complete)

Chris asked for it to be actually deleted so only pm.proexteriorsus.net serves the PM app.

- PM release `c753b1f` activated on the host 2026-11-13T02:09Z. `https://pm.proexteriorsus.net/healthz` reads `c753b1f` (re-read now).
- Cloudflare A record `scheduler` deleted and the TLS rule moved to pm. `dig scheduler.proexteriorsus.net` returns nothing (re-read now).
- WorkOS scheduler callback removed through Chris's signed-in Chrome (child session's report; not re-read).
- [Clvrwrk/pm.proexteriorsus.net#26](https://github.com/Clvrwrk/pm.proexteriorsus.net/pull/26) merged as `f77fde87`; PM docs PR 27 merged as `b4fe939`.
- [Clvrwrk/a-roofer-open-brain#73](https://github.com/Clvrwrk/a-roofer-open-brain/pull/73) "Point PM app references at pm.proexteriorsus.net" merged 2026-11-13T14:29Z as `ced3258c`.
- Local folder renamed to `app/PM_PWA/pm.proexteriorsus.net/`.
- Leftovers: stopped `a6b51a3` rollback containers on the host. Resume note: memory `scheduler-host-removal-resume.md`.

### 6. PM app: nested Job activity with the CRM's note threads (built, NOT deployed)

- Research and options A to D: `~/Library/Application Support/Claude/side-session-notes/local_d359d942-733b-461d-a1f6-735a9c886050/pm-activity-nest-options.md`.
- Chris chose on 2026-11-13: "A, yes, hold" (see Decisions).
- [Clvrwrk/pm.proexteriorsus.net#31](https://github.com/Clvrwrk/pm.proexteriorsus.net/pull/31) "Job activity nest on the History tab, with the CRM's note threads": OPEN, head `30e31d16` (was `059fbb48`), branch `claude/pm-activity-nest`, worktree `~/pm-activity-nest-build`.
- What it holds: migration `supabase/migrations/202609140023_job_crm_effort.sql` (function `public.scheduler_job_crm_effort`), a CRM notes client on the PM server, three routes, the History tab nest, the Inbox at ten rows behind "Show all N", design record `docs/JOB-ACTIVITY-NEST.md`, screenshots at 1440 and 390.
- CI: `secret-scan` failed on the first head `059fbb48` (gitleaks, 1 finding). The PM session fixed it and renumbered the migration from 022 to 023; on the new head `30e31d16` `secret-scan` passes (run 43559006988, re-read 2026-11-14 05:00Z) and "Verify scheduler" was still running. What gitleaks had flagged is in that session's report; it was not re-read here.
- Prod database re-read now: `public.scheduler_job_crm_effort` does not exist and the ledger has no row for it. The hold is intact.

### 7. Linear (PE-DEV-TEAM), updated 2026-11-14 04:53Z

- [PEC-996](https://linear.app/cleverwork/issue/PEC-996): new, Done. Record of the CRM nested Job Activity (JOB-ACTIVITY-11).
- [PEC-995](https://linear.app/cleverwork/issue/PEC-995): new, Done. Record of the scheduler host removal.
- [PEC-743](https://linear.app/cleverwork/issue/PEC-743) (quick note and shared job communication on PM): moved Backlog to In Progress, PR 31 linked, status comment with what the PR covers, what it leaves out, the secret scan and the hold.
- [PEC-721](https://linear.app/cleverwork/issue/PEC-721) (PM slice 5 mapping): comment that the mapping function is written in PR 31 and not applied.
- [PEC-915](https://linear.app/cleverwork/issue/PEC-915) (Activity box position): comment that the box's contents changed in t23; its own acceptance criteria were not re-checked.

## Git State
- **Branch (brain worktree):** `claude/acculynx-activity-feed-access-f339d8`, fast-forwarded to `origin/main` (`60b975c8`) before this handoff commit. The handoff is pushed on this branch with a docs-only PR; `main` requires one approving review and the `verify` check, so the agent cannot merge it.
- **Last commit:** the handoff commit on this branch (see the session report).
- **Uncommitted changes:** none.
- **CRM repo:** `main` holds `38c0d8dd` (PR 300) and `977c97b3` (PR 304). Worktree `~/activity-audit-build` is no longer needed.
- **PM repo:** `main` = `c124c2c3`; production runs `c753b1f`, 15 commits behind `main` (PRs 25 to 28 from other sessions are merged but not released). PR 31 is open on `claude/pm-activity-nest`.

## Task Cut Off
None. The CRM work is closed. The PM work stopped at an open PR by Chris's instruction ("hold").

## Next Task — Start Here

**Task:** Get PM PR 31 ready to merge, then wait for Chris's word before any database change or release.

**What to check / do:**
1. Confirm both checks are green on PR 31's current head: `gh run list --repo Clvrwrk/pm.proexteriorsus.net --branch claude/pm-activity-nest --limit 4`. `secret-scan` already passes on `30e31d16`.
2. Put the built History tab beside the mockup board "PM job" (and "Phone" for an opened thread) and compare, using the PR's screenshots. The PR lists three intended differences; anything else is a defect.
3. Read CodeRabbit's summary on PR 31. Greptile auto-review is off for this repo and CodeRabbit is on the free plan, so "both bots clean" cannot be met as written; say so in the PR.
4. Ask Chris for three separate go-aheads: merge PR 31, apply migration `202609140023` to production, and release PM.
5. On his word, in this order: apply the migration, set `SUPABASE_PUBLISHABLE_KEY` in `/opt/pe-scheduler/.env`, release with `deploy/activate.sh` as root on `178.105.220.14`. The release will also ship PRs 25 to 28; state that before shipping.
6. Verify: `pm.proexteriorsus.net/healthz` `buildCommit` equals the released commit, then Chris opens one job's History tab. Claude cannot sign in to production.

**If the CRM refuses the PM token:** the tab says the notes could not be loaded, and Sentry shows `CRM_NOTES_GATEWAY_REFUSED` or `CRM_NOTES_TOKEN_REFUSED`. Unset `SUPABASE_PUBLISHABLE_KEY` to turn the CRM part off; the tab then shows production history only.

**Prompt to use:** "Read docs/handoffs/current.md. Confirm the checks on pm.proexteriorsus.net PR 31 and compare the built History tab with the PM mockup board. Do not merge, apply the migration or release."

## Decisions Made This Session

- **JOB-ACTIVITY-11 (CRM):** Job Activity is one nest. A navy bar per kind (Notes, Emails, Calls, Texts, Uploads, Stage and gates), one collapsed line per entry, nothing open until someone opens it, open state remembered per job. Threads replace the flat duplicate list. Chris signed off the mockup 2026-11-12 and confirmed the live page 2026-11-13.
- **PM reads CRM notes by option A (Chris, 2026-11-13):** the PM server forwards the signed-in person's own WorkOS access token to the CRM's existing note functions. No CRM change; the PM service key never touches CRM data.
- **No CRM seat, no notes (Chris, 2026-11-13: "yes"):** a PM user without a CRM seat sees a plain "Notes need a CRM seat" state.
- **Hold (Chris, 2026-11-13):** the mapping migration is not applied to production and PM is not released until Chris says so.
- **Rejected:** B (service-key functions that act as any CRM member), C (CRM web API; blocked on a shared session), D (link out only; does not meet the goal).
- **Only pm.proexteriorsus.net exists for the PM app (Chris, 2026-11-12).** The scheduler host, DNS record and WorkOS callback are gone; do not recreate them.
- **Never `gh pr merge --admin` without Chris's explicit yes.** CRM PR 304 was merged normally after three rounds of merging `main` in; brain PR 73 was admin-merged only on his yes.

## Blockers Requiring Human Action

1. **PM PR 31:** Chris's word to merge, to apply migration `202609140023`, and to release PM.
2. **Signed-in check on PM after release:** Chris opens one job's History tab. This is also the first proof that a real PM session token is accepted by the CRM.
3. **This handoff's docs PR in the brain repo:** needs one approving review to merge.
4. **ds follow-ups (not started, need a mockup or a ds change first):** a shared thread component, a gold focus ring on navy bars, and a ds site redeploy for the N-01 line.

## Verification Commands
1. `curl -s https://crm.proexteriorsus.net/healthz | python3 -c 'import json,sys;print(json.load(sys.stdin)["buildCommit"])'`, then `gh api repos/Clvrwrk/CRM_PWA/compare/38c0d8dd...<that commit> --jq .behind_by`: should return `0` (the nest is in the running build).
2. `curl -s https://pm.proexteriorsus.net/healthz`: `buildCommit` should be `c753b1f00d9027b621882c393239dbadba8e3b82` until PM is released again.
3. `dig +short scheduler.proexteriorsus.net @1.1.1.1`: should return nothing.
4. `gh pr view 31 --repo Clvrwrk/pm.proexteriorsus.net --json state,headRefOid,mergeStateStatus`: `OPEN`, `30e31d16…`, until someone pushes or merges.
5. `gh run list --repo Clvrwrk/pm.proexteriorsus.net --branch claude/pm-activity-nest --limit 5`: `secret-scan` must be `success` before merge.
6. SQL (MCP, read-only, project `rnhmvcpsvtqjlffpsayu`): `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scheduler_job_crm_effort';`: `0` while the hold stands, `1` after Chris approves the apply.
7. `curl -s https://cc.proexteriorsus.net/healthz`: `buildCommit` should equal brain `origin/main`.

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
- **2026-11-12 → 11-13 (CRM and PM job Activity):**
  - CRM Job Activity as a nest, closed until opened (JOB-ACTIVITY-11; CRM_PWA #300 `38c0d8dd`, release t23, record in #304);
  - scheduler.proexteriorsus.net removed; pm.proexteriorsus.net is the only PM host (PM #26, #27; brain #73);
  - PM History tab nest with the CRM's note threads, built in PM #31 (open; not merged, migration not applied, not released)

### Architecture decisions
- **PM reads CRM notes with the person's own token (option A, 2026-11-13):** the PM server forwards the signed-in person's short-lived WorkOS access token to `crm.read_job_notes`, `crm.read_job_activity`, `crm.post_job_note` and `crm.mark_note_thread_read` through PostgREST profile `crm`. PM and the CRM share one WorkOS client. The PM service key has no use of schema `crm` and must not get it. The job map is `crm.efforts.acculynx_job_id = scheduler.jobs.source_id` (the id before the colon for trade packages), published as `public.scheduler_job_crm_effort`.
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
- **Site:** https://ds.proexteriorsus.net (`@proexteriors/ds`, rules in CRM_PWA `packages/ds/RULES.md`) since 2026-11-04. The Command Center `/design-system` page and docs/112 are pointers now.
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
| CRM deploy | Pinned release modules (`scripts/release-crm-<sha12>.py` + engine `release-property-journey.py`). Each pin derives from the previous one with `~/crm-nesting-build/release/derive-pin.py` / `prepare2.sh <spec>`. Chris runs scp, stage and switch on `178.105.220.14`. The container and port named in older handoffs are stale: read `/healthz` and the host for the live release (`d961dbcb` on 2026-11-14). Since t23 the agent has run releases as `root@178.105.220.14` with a per-release `t<N>.sh` (rollback `bash t<N>.sh rollback`). There is no Coolify record for the CRM. |
| PM deploy | Not a Coolify app. Plain Docker plus a Traefik dynamic file on `178.105.220.14`, released as root with `deploy/activate.sh` from `Clvrwrk/pm.proexteriorsus.net`; env in `/opt/pe-scheduler/.env`. Live `c753b1f` on 2026-11-14, 15 commits behind `main`. Host login: `root@178.105.220.14` with `~/.ssh/hetzner_office`. |
| CRM local DB tests | Docker `crm-nest-test` 127.0.0.1:55439 (password in `~/crm-nesting-build/build/.pg-crm-nest`). Lock with `mkdir ~/crm-nesting-build/build/db.lock`. The full chain runner is `build/run-db-chain-myjobs.sh`. |
| CRM Sentry | org `cleverwork`, project `pwa-crm` |
| Dev | port 4399 via `.claude/launch.json` `command-center` |
| Agent host | Hetzner `178.156.203.23` (`~/.ssh/hetzner_office`) |
| Nightly ABC | `scripts/abc-nightly-sync.sh` 03:30 ET |
| pg_cron | job 13 (15 min): matviews + CM claims + reconcile; job 15 (1 min): on-demand refresh; job 18: order↔AccuLynx matview; `crm-acculynx-nightly-sync` 09:30Z |
| Agent auth to live site | Bearer service tokens on `/api/*`; skill `/workos-agent-auth` |
| Slack | per-agent bots per `/slack-agents`; dev traffic → `#pe-cc-dev-team` |
| Linear | Team PE-DEV-TEAM (issues `PEC-…`); the MCP worked on 2026-11-13 |
