# Project Handoff — Pro Exteriors Open Brain / PM app (pm.proexteriorsus.net)
**Project:** a-roofers-open-brain + the PM app (`Clvrwrk/pm.proexteriorsus.net`)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain and https://github.com/Clvrwrk/pm.proexteriorsus.net
**Production URL:** https://pm.proexteriorsus.net (PM) · https://cc.proexteriorsus.net (Command Center)
**Date:** 2026-11-13 20:51 PST (2026-11-14 04:51 UTC)
**Agent:** Side session of the Lead Orchestrator (Claude Code)
**Reason:** User-requested (/project-handoff after retiring `scheduler.proexteriorsus.net`, 2026-11-12 to 2026-11-13)
**Linear:** [PEC-993](https://linear.app/cleverwork/issue/PEC-993) (record, Done); comments on PEC-731 and PEC-724

The previous handoff (CRM journey and My jobs, 2026-10-06) is in `docs/handoffs/archive/2026-11-13-2051-prior-current.md`. Its Full Context section is carried forward below; its CRM facts were not re-checked in this session.

---

## Accomplished This Session

Chris asked for `scheduler.proexteriorsus.net` to be deleted outright, with no redirect, so that only `pm.proexteriorsus.net` serves the PM app. That is done and verified from outside. The work ran in the order below; nothing was removed until pm was proven.

### 1. Inventory (read-only)

- `~/Library/Application Support/Claude/side-session-notes/local_d359d942-733b-461d-a1f6-735a9c886050/scheduler-host-removal-inventory.md`: every place the scheduler name lived (host, Cloudflare, WorkOS, both repos, monitoring, local disk), with how each was checked, plus dated updates through completion.
- Finding: the PM repo had targeted pm since 2026-11-04, but the host was never cut over. It still ran `a6b51a3` (14 Sep) on the scheduler name, with a 301 from pm to scheduler, and `/healthz` had no `buildCommit`.

### 2. Release on the Germany host `178.105.220.14`

- Staged the CI image for `c753b1f00d9027b621882c393239dbadba8e3b82` in `/opt/pe-scheduler/artifacts/c753b1f…/` (archive sha256 `158feddd…`, image digest `sha256:87b2038b…`, reviewed `deploy/` scripts). `activate.sh --plan` passed.
- Activated at 2026-11-13 02:09 UTC with `deploy/activate.sh`. Chris attested the receipt's three operator checks. Release state: `/opt/pe-scheduler/releases/20261113T020911Z-c753b1f00d90`.
- Receipts: `/opt/pe-scheduler/verification/identity-preflight-c753b1f.json` and `identity-evidence-c753b1f.json` (on the host only).
- The route file `/data/coolify/proxy/dynamic/scheduler-proexteriors.yml` now matches `Host(pm.proexteriorsus.net)`; `pm-redirect.yml` is gone (a copy is in `…/artifacts/c753b1f…/pre-cutover/`); `.env` has `SCHEDULER_PUBLIC_ORIGIN=https://pm.proexteriorsus.net`.

### 3. Proof before removal

- `/healthz` on pm returned the build commit; `/auth/login` returned 302 to WorkOS with the pm callback; private routes returned 401; a foreign origin got 403.
- Chris confirmed a signed-in board on pm ("Board loads").

### 4. Cloudflare (zone `66fffdaa6473eefad95922a78a0ca5f7`)

Chris signed in; Claude acted in his Chrome session.

- Config rule `0b58c78ed28e465698d7546fb2f3eeec` edited in place: expression is now `http.host eq "pm.proexteriorsus.net"`, name "PM only: validate the origin TLS certificate". Strict origin TLS stays on for pm.
- A record `scheduler` deleted. NXDOMAIN on the zone name servers, 1.1.1.1 and 8.8.8.8.

### 5. WorkOS (client `client_01KTF450QBY957ASEZ8JXZKMV4`)

Same way: Chris signed in, Claude acted.

- Removed redirect URI `https://scheduler.proexteriorsus.net/auth/callback` from the application "Pro Exteriors - Command Center" (Cleverwork's Project, Production).
- Left alone: the app, pm, crm, hr and cc callbacks. cc is still the default.

### 6. Repos

| PR | Merge commit | What changed |
|---|---|---|
| [Clvrwrk/pm.proexteriorsus.net#26](https://github.com/Clvrwrk/pm.proexteriorsus.net/pull/26) | `f77fde8` | `.github/workflows/self-heal.yml` default health URL is pm; `deploy/ACTIVATION.md` redirect step removed; `deploy/README.md` cutover checklist; `README.md` and `docs/CURRENT.md` release state |
| [Clvrwrk/pm.proexteriorsus.net#27](https://github.com/Clvrwrk/pm.proexteriorsus.net/pull/27) | `b4fe939` | `deploy/README.md`: last two checklist boxes ticked |
| [Clvrwrk/a-roofer-open-brain#73](https://github.com/Clvrwrk/a-roofer-open-brain/pull/73) | `ced3258` | `README.md`, `app/PM_PWA/APP-INDEX.md`, repo-name fixes in `docs/120-companycam-integration.md` and `proposals/2026-10-01-crm-job-crews-from-scheduler.md`, daily log `context/memory/2026-11-12.md` |

- PR 73 was merged with admin rights on Chris's explicit yes, because the branch rule needs a review from an account other than the author and the `gh` account is the author. The Command Center redeployed to `ced3258` in 190 seconds.

### 7. Local disk

- `app/PM_PWA/scheduler.proexteriorsus.net/` renamed to `app/PM_PWA/pm.proexteriorsus.net/` in the main checkout; `app/PM_PWA/source` symlink repointed; remote set to `https://github.com/Clvrwrk/pm.proexteriorsus.net.git`; `git worktree repair` run for the four linked worktrees.
- Build worktree `Archives/home-builds/scheduler-host-removal-build/pm` and its merged branch removed.

### 8. Linear

- **PEC-993** created as the record of this job (Done, project PM).
- **PEC-731** comment: the missing `buildCommit` is fixed; PM `main` is ahead of the live build again.
- **PEC-724** comment: the PM worker logs `companycam_api` `access_denied`.

## Git State
- **Brain repo branch:** `contrib/cleverwork/pm-host-handoff`, cut from `origin/main` `60b975c8`. It holds this handoff, the archive copy and the daily-log block. See the PR linked in the session report.
- **Brain `main`:** `60b975c8`; the Command Center reports the same commit on `/healthz`.
- **PM repo `main`:** `c124c2c`. Live build: `c753b1f`. Main is 15 commits ahead, including app code from other sessions.
- **Uncommitted changes:** none.
- **Old worktree branch:** `contrib/cleverwork/pm-host-rename` is merged (PR 73) and can be deleted.

## Task Cut Off
None. The session ended at a clean boundary.

## Next Task — Start Here

**Task:** Bring PM production level with PM `main`, if Chris wants it.

**What to check / do:**
1. Confirm the gap: `gh api repos/Clvrwrk/pm.proexteriorsus.net/compare/c753b1f00d9027b621882c393239dbadba8e3b82...main -q .ahead_by`. Read which commits carry app code and whether any needs a migration (PR 30's migration 022 is not merged and not applied).
2. Tell Chris what would change, the impact and the rollback, and get his go-ahead. He must attest the receipt's operator checks again.
3. Follow `deploy/ACTIVATION.md` in the PM repo: download the `scheduler-image` artifact from the `Verify scheduler` run for the target commit, verify its sha256, copy it to `/opt/pe-scheduler/artifacts/<sha>/` on `root@178.105.220.14` (key `~/.ssh/hetzner_office`, `-o IdentitiesOnly=yes`), run `activate.sh --plan`, then `--activate`.
4. Verify: `/healthz` `buildCommit` equals the target commit, `/auth/login` is a 302 to WorkOS with the pm callback, and Chris confirms a signed-in page.

**If SSH is refused:** the `ops` user (alias `agents`) is refused on this host. Use `root` with `hetzner_office`.

**If a dashboard is needed (Cloudflare, WorkOS):** ask Chris to sign in himself in Chrome, then act in his session. Do not look up credentials; the permission classifier blocks it.

**Prompt to use:** "Read docs/handoffs/current.md. Then check how far PM main is ahead of the live build c753b1f and tell me what an activation would change before doing anything."

## Decisions Made This Session

- **No redirect from the old name (Chris, 2026-11-12).** The scheduler name is deleted, not forwarded. The session cookie is host-only, so everyone signed in again once.
- **Prove pm first, then remove.** The route, DNS record and WorkOS callback for scheduler were removed only after pm passed the outside checks and Chris's signed-in check.
- **Edit the Cloudflare TLS rule in place.** Chris said to delete the scheduler record "and its TLS rule". The rule was the only thing giving the PM origin strict TLS, so it was re-pointed at pm instead of deleted. Deleting it would have left pm on the zone default.
- **Activation does not wait for docs PRs.** The self-heal health URL is a workflow default, not part of the image, so `c753b1f` could be activated before PR 26 merged.
- **Dashboards through Chris's own sign-in.** Claude does not type passwords or codes into production sign-ins and does not look up credentials. Chris signs in, Claude acts in that session.
- **Admin merge only on an explicit yes.** "Merge both" did not cover bypassing the review rule; Chris then said "Yes, admin merge" for PR 73.
- **Local folder renamed** to match the repo name (Chris, 2026-11-12). Source was not deleted.
- **Historical evidence stays as dated records.** `docs/DEPLOYMENT-BASELINE.md`, `docs/verification/*` and similar files in the PM repo still name the scheduler host on purpose.

## Blockers Requiring Human Action

1. **This handoff's PR** needs a review from another account, or Chris's yes to an admin merge. Merging rebuilds the Command Center (docs only, no behaviour change).
2. **PM activation to current `main`** needs Chris's go-ahead and his attestation of the receipt checks.
3. **Signed-in re-check on pm** after the Cloudflare rule edit and the WorkOS change has not been run. Only Chris can do it.
4. **Decide what to do with the rollback containers** on the host (see Verification Commands 6). They are harmless while stopped.
5. **CompanyCam credential** for the PM worker (`access_denied`): PEC-724.

## Verification Commands
1. `curl -s https://pm.proexteriorsus.net/healthz`: should return `{"ok":true,"service":"scheduler-api","buildCommit":"c753b1f00d9027b621882c393239dbadba8e3b82"}` until the next activation.
2. `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://pm.proexteriorsus.net/auth/login`: should return `302` and a WorkOS URL whose `redirect_uri` is `https://pm.proexteriorsus.net/auth/callback`.
3. `dig @1.1.1.1 scheduler.proexteriorsus.net A | grep status`: should show `NXDOMAIN`.
4. `curl -s -o /dev/null -w '%{redirect_url}\n' 'https://api.workos.com/user_management/authorize?client_id=client_01KTF450QBY957ASEZ8JXZKMV4&response_type=code&provider=authkit&redirect_uri=https%3A%2F%2Fscheduler.proexteriorsus.net%2Fauth%2Fcallback'`: should start with `https://error.workos.com/redirect-uri-invalid`. The same request with `pm` in place of `scheduler` should go to the AuthKit sign-in.
5. `curl -s https://cc.proexteriorsus.net/healthz`: `buildCommit` should equal brain `origin/main`.
6. On the host (read-only): `docker ps -a --filter name=pe-scheduler --format '{{.Names}} {{.Status}}'`: `pe-scheduler` and `pe-scheduler-worker` Up; the `pe-scheduler-rollback-*` containers Exited.

All six were checked at 2026-11-14 04:51 UTC except 6, which was last checked on 2026-11-13.

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
- **2026-11-12 → 11-13 (PM host):**
  - `scheduler.proexteriorsus.net` retired; `pm.proexteriorsus.net` serves the PM app alone on `c753b1f` (PEC-993);
  - Cloudflare strict-TLS rule re-pointed at pm, `scheduler` A record deleted;
  - WorkOS scheduler callback removed;
  - PM PRs 26 and 27, brain PR 73;
  - local folder renamed to `app/PM_PWA/pm.proexteriorsus.net/`

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
- **PM app deployment:**
  - It is not a Coolify app. It is plain Docker (`pe-scheduler` API on 127.0.0.1:4460 and `pe-scheduler-worker`) plus one Traefik dynamic route file, released as root by `deploy/activate.sh` in the PM repo.
  - The app has no hard-coded hostname. The origin, the WorkOS callback and the cross-origin check all come from `SCHEDULER_PUBLIC_ORIGIN` in `/opt/pe-scheduler/.env`.
  - The session cookie is host-only, so a hostname change signs everyone out once. There are no inbound webhooks.
  - Service, container and Sentry names still say "scheduler" (`scheduler-api`, `pe-scheduler`, `pm-scheduler`). They are names, not hostnames; leave them.
- **One WorkOS client for five apps:** `client_01KTF450QBY957ASEZ8JXZKMV4` (application "Pro Exteriors - Command Center", Production) serves cc, crm, hr, app and pm. An unauthenticated authorize request shows whether a redirect URI is registered: an unregistered one lands on `error.workos.com/redirect-uri-invalid`.

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
- **WorkOS redirect URIs:** the client is shared, so remove only the URI in question and re-probe all five apps afterwards.
- **PM hostname:** `pm.proexteriorsus.net` only. Do not re-create `scheduler.proexteriorsus.net` or add a redirect unless Chris asks.
- **PM strict TLS:** Cloudflare config rule `0b58c78e…` is what validates the PM origin certificate. Edit it, never delete it.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod Supabase | `rnhmvcpsvtqjlffpsayu`, shared by dev and live. For the applied watermark, query `supabase_migrations.schema_migrations`; never trust a number written here. |
| Command Center deploy | Coolify → `cc.proexteriorsus.net` from `origin/main` on push; verify `/healthz buildCommit`. Coolify host `178.105.220.14` (`~/.ssh/a_roofers_open_brain_ed25519`). |
| CRM deploy | Pinned release modules (`scripts/release-crm-<sha12>.py` + engine `release-property-journey.py`). Each pin derives from the previous one with `~/crm-nesting-build/release/derive-pin.py` / `prepare2.sh <spec>`. Chris runs scp, stage and switch on `178.105.220.14`. Live: `crm-weekly-9a1e4d9e7d35` on 4468; rollback target `crm-weekly-91ad20cf2ae2` on 4467. The next port is 4469. |
| CRM local DB tests | Docker `crm-nest-test` 127.0.0.1:55439 (password in `~/crm-nesting-build/build/.pg-crm-nest`). Lock with `mkdir ~/crm-nesting-build/build/db.lock`. The full chain runner is `build/run-db-chain-myjobs.sh`. |
| CRM Sentry | org `cleverwork`, project `pwa-crm` |
| PM deploy | Germany host `178.105.220.14`, login `root` with `~/.ssh/hetzner_office` (`ops` is refused). `deploy/activate.sh` from `Clvrwrk/pm.proexteriorsus.net`; artifacts in `/opt/pe-scheduler/artifacts/<sha>/`, release state in `/opt/pe-scheduler/releases/`, route file `/data/coolify/proxy/dynamic/scheduler-proexteriors.yml`. Live: `c753b1f` since 2026-11-13 02:09 UTC; rollback target `a6b51a3` (stopped containers). |
| PM DNS and TLS | Cloudflare zone `66fffdaa6473eefad95922a78a0ca5f7`: A record `pm`, proxied; config rule `0b58c78ed28e465698d7546fb2f3eeec` (strict TLS for pm). Dashboard only, through Chris's sign-in. |
| PM Sentry | org `cleverwork`, project `pm-scheduler`; no uptime monitor watches pm |
| PM local clone | `app/PM_PWA/pm.proexteriorsus.net/` in the main checkout (ignored by the brain repo); `app/PM_PWA/source` points at it |
| Dev | port 4399 via `.claude/launch.json` `command-center` |
| Agent host | Hetzner `178.156.203.23` (`~/.ssh/hetzner_office`) |
| Nightly ABC | `scripts/abc-nightly-sync.sh` 03:30 ET |
| pg_cron | job 13 (15 min): matviews + CM claims + reconcile; job 15 (1 min): on-demand refresh; job 18: order↔AccuLynx matview; `crm-acculynx-nightly-sync` 09:30Z |
| Agent auth to live site | Bearer service tokens on `/api/*`; skill `/workos-agent-auth` |
| Slack | per-agent bots per `/slack-agents`; dev traffic → `#pe-cc-dev-team` |
| Linear | team PE-DEV-TEAM (keys `PEC-…`), project PM for the PM app; the Linear connector worked on 2026-11-13 |
