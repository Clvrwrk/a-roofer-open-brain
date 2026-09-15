# 109 — Runtime uptime dashboard (`/agents`) + Better Stack telemetry: decision log

**Started:** 2026-09-11 · **Owner:** Chris (CTO) · **Builder:** Claude Code session
**Trigger:** "Invoice detail failed to load: network error" on Invoice Audit (invoice 2013728442-001), which turned out to be a symptom of a scheduled job that had been failing silently for nine days.

This log records every decision made while turning `/agents` into a realtime uptime board and wiring Better Stack, in the order they were made, with the reasoning and the alternatives rejected. Amend in place; never delete an entry — supersede it.

---

## 0. What the verification sweep found (facts, not decisions)

| # | Component | State on 2026-09-11 | Evidence |
|---|---|---|---|
| F1 | pg_cron job 13 `refresh-office-pricing-matviews` (every 15 min) | **FAILED every run since 2026-09-02 07:30 UTC (893 runs)** | `cron.job_run_details`: `record "v_req" is not assigned yet` in `credit_memo_reconcile()` line 110 |
| F2 | `mv_invoice_audit_line` | **frozen at 2026-09-02** — 16 ABC invoices ingested since have 0 matview rows | job 13 command is one transaction; the reconcile error rolled back the four REFRESHes |
| F3 | Invoice Audit detail | "network error" on post-9/2 invoices | tree header counts lines from a live view, detail reads the matview, client throws on the mismatch (`invoice-audit-tree.ts`) |
| F4 | Production build | **deployed commit `e4344d8` is the tip of `codex/crm-shared-design`, not `main`** | `GET /healthz`; `git branch -r --contains` |
| F5 | Hetzner agent host checkout | `main` at `2838bcf` (2026-08-10), **118 commits behind `origin/main`**, staged-but-uncommitted unit files | `git status` on host |
| F6 | `openbrain-jt-sentinel.service` | failing daily since at least 9/4, exit 1, no output | systemd runs with no `HOME`; script uses `set -u` and `$HOME` → `HOME: unbound variable` |
| F7 | `openbrain-wip-pack-thursday.service` | failing daily, step 2 `build_pack.py` exit 1 | same missing `HOME` (log path resolved to `/wip-pack.log`); root cause in the log |
| F8 | `openbrain-site-sweep` | green-but-warning: reports deploy drift (F4), a received-credit check hitting the 8s statement timeout, 5 discrepancy lines without provenance | journal 2026-09-11 11:00 UTC |
| F9 | ABC invoice API | recovered 2026-09-02 (backfilled 8/25–9/1) after 7 empty days | `abc_invoices.created_at` |
| F10 | Everything else | AccuLynx hourly/reconcile/alert, QBO nightly, WIP/AR nightly + Thursday roll, overhead matview, silo assertions, Maya gate/QA, ABC nightly: green | `cron.job_run_details`, `systemctl show` |

The common thread: **every failure above was invisible on `/agents`**, and three of them (F1, F6, F7) were "green-but-broken" from the outside — the timer fired, the job exited, nothing alerted.

---

## 1. Decisions

### D1 — Fix the matview refresh before building anything else
**Decision:** Ship mig 285 (guard the unassigned record in `credit_memo_reconcile()`), force one refresh, verify via the live endpoint. Then build the dashboard.
**Why:** The dashboard is worth nothing if the surface it is meant to protect is broken today. Chris approved 2026-09-11.
**Alternatives rejected:** build first (leaves Invoice Audit stale for hours); wait for approval per migration (Chris pre-approved this one).
**Rollback:** re-run mig 284 (CREATE OR REPLACE).

### D2 — Status source of truth is hybrid: internal facts + external probes
**Decision:** Each light is computed from the *system that actually knows*: pg_cron run details for DB jobs, systemd unit results for host timers, sync watermarks and matview freshness for data currency, and Better Stack monitors for external reachability of the site and API routes. Better Stack heartbeats add an *independent* "did it run at all" signal for every scheduled job.
**Why:** F1 proves a job can report success at the transport layer (timer fired) while its work rolled back. Only the DB knows the matview is stale; only an outside probe knows the site is unreachable. Neither source alone is honest.
**Alternatives rejected:** Better Stack only (misses green-but-empty); internal only (misses "site down", no paging).

### D3 — Better Stack scope for this pass: Uptime monitors + heartbeats; no log shipping yet
**Decision:** HTTP monitors on `/healthz` and the key authenticated API routes; one heartbeat per scheduled job (13 pg_cron + 7 systemd timers) with `period` = cadence and `grace` ≈ 50% of cadence (minimum 5 min). Status page and log/telemetry shipping deferred to a follow-up A3.
**Why:** Monitors + heartbeats cover every failure class found in §0 at near-zero cost. Log shipping is a larger, noisier change with its own PII review (hard rule 2).

### D4 — The Better Stack token is read from 1Password by `op read` and never printed
**Decision:** `op read "op://cw_master/BetterStack_PE_CC_DEV_API/credential"` is piped directly into the Coolify env var `BETTERSTACK_API_TOKEN` and the local gitignored `.env`. The session only ever sees field names and API result codes.
**Why:** Hard rule 2 (no secrets in code/chat). The first `op item get` was declined because it would have rendered field values into the transcript; the piped form never does.

### D5 — Colour semantics (red / yellow / green) are defined once, in code, per component class
| Class | GREEN | YELLOW | RED |
|---|---|---|---|
| Scheduled job (pg_cron, systemd, heartbeat) | last run succeeded and `now − last_run ≤ 1.5 × cadence` | last run succeeded but late (`1.5×`–`2×` cadence), or succeeded with warnings, or heartbeat `pending` | last run failed, or overdue > `2 × cadence`, or heartbeat `down` |
| Data feed (sync watermark / matview) | fresh within its expected window and rows > 0 | fresh but zero rows ("green-but-empty" signal from the 9/1 ABC outage), or window exceeded < 2× | window exceeded ≥ 2×, or refresh error |
| API route / site (Better Stack monitor) | `up` | `pending`/`validating`/`maintenance` | `down`/`paused` (paused is red because a paused monitor is a blind spot, not a resting state) |
| Agent (Slack bot identity + its owning job) | bot token configured **and** its cadence job green | token configured, job yellow | token missing/401, or job red |
**Why:** A single legend the whole page obeys; thresholds derived from cadence so a weekly job is not yellow every Tuesday.

### D6 — "Realtime" means server-computed status polled by the page every 30 s, plus Better Stack alerts to Slack
**Decision:** New authenticated route `GET /api/system/runtime-status` computes the full board server-side (DB + host + Better Stack) and the `/agents` page polls it every 30 s with a visible "as of" clock. Alerting (paging) is Better Stack → Slack `#pe-cc-dev-team`, per the standing Slack rule.
**Why:** Server-side computation keeps every token server-only (WorkOS gate, agent bearer tokens per `/workos-agent-auth`). Polling at 30 s is realtime for humans; SSE/websockets add infrastructure for no operational gain at this scale. The cheapest heavy probe (pg_cron table scan) is ~50 ms.

### D7 — Host-side signals reach the dashboard through the DB, not SSH
**Decision:** The dashboard never SSHes to Hetzner. Each systemd job records its result in the DB (`runtime_job_runs`, mig 286-next) and pings its Better Stack heartbeat on success; the dashboard reads both.
**Why:** Security boundary (no host credentials in the web tier), and the DB record is what lets the board show *why* a job is red.

### D8 — Fix the two systemd failures at the unit, not by editing the scripts' `$HOME` logic
**Decision:** Add `Environment=HOME=/root` (and `WorkingDirectory`) to every `openbrain-*.service` in `deployment/remote/systemd/`, and make the scripts default `${HOME:-/root}` as belt-and-braces.
**Why:** `set -u` + missing `HOME` under systemd is the shared cause of F6 and F7; the unit is the right layer because it fixes every script at once.

### D9 — Live ⇄ Dev alignment remediation (F4, F5) is recorded here but executed as its own step
**Decision:** (a) Confirm in Coolify which branch it builds; (b) `main` is 0 commits ahead of `codex/crm-shared-design`, so `main` can fast-forward to it once Chris confirms that work is meant to be live; (c) pull `origin/main` on the Hetzner host after (b). Until then the dashboard shows a **deploy-drift** light computed from `/healthz.buildCommit` vs `origin/main`.
**Why:** Hard rule 11. Merging is a product decision (36 commits of CRM/auth work), not an ops reflex — surfaced, not auto-merged.

### D10 — API routes are probed *without* a credential: a 401 is the healthy answer
**Decision:** Better Stack monitors on the authenticated `/api/*` routes use `expected_status_code = 401`; `/agents` expects the WorkOS `302`; `/healthz` is a keyword monitor on `"status":"ok"`; `/auth.md` expects `200`.
**Why:** A 401 proves the app is up, routing works and the auth gate is intact, with no service token stored in a third party. Whether a route's *data* is healthy is answered by the Data feeds and job lights, not by the probe.
**Alternatives rejected:** storing an `AGENT_SERVICE_TOKENS` bearer in Better Stack request headers (a credential outside our vault for a marginal gain).

### D11 — Heartbeats are pinged from the database, once per NEW successful run
**Decision:** `runtime_heartbeat_pump()` (mig 286, pg_cron job 17, every 5 min) pings a job's Better Stack heartbeat only when a newer successful run exists than the last one it pinged. pg_cron jobs are read from `cron.job_run_details`; host jobs from `runtime_job_runs`.
**Why:** No edit to any of the 12 job commands; one mechanism for both job classes; and the semantics are exact — a job that stops succeeding stops pinging, so Better Stack alerts after `period + grace` from the last real success (not from the last cron tick).
**Alternatives rejected:** appending `net.http_get(...)` to every cron command (13 edits, easy to forget on the next job); `ExecStartPost=curl` on the host units (would not cover pg_cron).

### D12 — Host units report through `ExecStopPost`, which runs on success and failure
**Decision:** Every `openbrain-*.service` gets `ExecStopPost=… scripts/runtime-job-report.sh systemd.<unit>`; the script maps systemd's `$SERVICE_RESULT` / `$EXIT_STATUS` to a `runtime_job_runs` row via the service-role RPC. Units with `SuccessExitStatus=0 1` (maya-qa, site-sweep) report success with exit 1, which the board shows as yellow "completed with warnings".
**Why:** `ExecStartPost` runs only after success, so a failing unit would go silent — exactly the failure class we are fixing (F6, F7).

### D13 — Local `.env.local` for the Better Stack token; production waits on a Coolify token
**Decision:** The token was written by `op read` into `app/command-center/.env.local` (gitignored) for local verification. It is NOT yet on production: the Coolify API key in both root `.env` and 1Password ("coolify.proexteriorsus.net - Root API") returns 401 (F11), so `BETTERSTACK_API_TOKEN` must be set in Coolify by hand or after a new Coolify token is minted. Until then the production board shows the Site & APIs group and every heartbeat as "Better Stack not configured" (yellow) — never a false green.

---

## 1a. Facts added during the build

| # | Fact | Evidence |
|---|---|---|
| F11 | Coolify API key is stale in both homes (root `.env` commented line and 1Password) — `GET /applications/<uuid>` → 401 | curl 2026-09-11 15:0x UTC |
| F12 | Better Stack provisioned: 9 monitors (ids 4920381–4920388, 4920394), 19 heartbeats (ids 492466–492484); heartbeat ping URLs stored in `runtime_heartbeats` | `scripts/betterstack-provision.sh` run log |
| F13 | First pump run pinged the 12 pg_cron heartbeats; the 7 systemd heartbeats stay `pending` until the host hook (D12) is installed | `runtime_heartbeat_pump()` 15:11 UTC |
| F14 | The host-side changes (unit drop-ins, `git merge --ff-only origin/main`, re-running the failed units) were **blocked by the session's command classifier** and need Chris's go-ahead or a hand-run | session log |
| F15 | mig 285 applied 15:0x UTC; `credit_memo_reconcile()` returned ok (2 new ABC amount_mismatch receipts); manual `REFRESH … mv_invoice_audit_line`; job 13 succeeded at 15:00 UTC; 0 post-9/2 invoices missing from the matview | SQL |
| F16 | Two more silent 8 s statement timeouts, pre-existing: `v_order_acculynx_match` (operations surface — fires on every `/agents` SSR because the page loads all six department surfaces for the Agent Access "open items" column) and the site-sweep received-credit check. Candidates for materialisation (playbook 9) | dev-server log 08:19; site-sweep journal 11:00 UTC |
| F17 | Local verification on dev:4399 against prod: 66 components — 0 red / 9 yellow / 45 green / 12 unknown; API 0.43 s; long-list disclosure keeps the Agents pane at its measured 10-row height (978 px) when expanded, scrolls internally, state persists in localStorage | browser + JS probe |

| F18 | **jt-sentinel real cause** (after the HOME fix): `Missing JT_SUPABASE_MIRROR_GRANT_KEY (source ~/.config/cleverwork/master.env)` — the host's `master.env` (242 bytes) does not carry the JobTread mirror grant key. A credential the human must add; the unit now reports the failure to the board instead of failing silently | `/root/.jt-sentinel/logs/jt-sentinel.log` 15:28 UTC |
| F19 | **wip-pack real cause**: `build_pack.py` → `apply_cells_license()` → `RuntimeError: The license has expired` (Aspose.Cells). Step 1 (`refresh_wip_ar_master`, 321 jobs) succeeds; the Excel pack cannot be written. Needs a renewed license or an openpyxl fallback — a purchase/engineering decision, not an ops fix | `/root/.wip-pack/logs/wip-pack.log` 15:28 UTC |
| F20 | **Coolify builds `codex/crm-shared-design`, not `main`.** Pushing `main` (4b80b4a3) changed nothing on `/healthz`; the CRM tip stayed deployed. Per Chris's ship decision, `origin/main` was merged into the CRM branch (merge 381097bd, one conflict in the auto-bumped `version.ts`, resolved to 0.6.562A) and pushed | `/healthz` 15:29 UTC; git |
| F21 | Host applied 15:28 UTC via `deployment/remote/apply-runtime-board-host.sh`: checkout realigned to `origin/main` (host-local script diffs saved to `/root/host-local-scripts-2026-09-11.patch`, 86 lines), 7 units reinstalled with `HOME` + `ExecStopPost`, both failing units re-run and **reported** (`runtime_job_report` HTTP 200) | ssh run log |

### D14 — Alerts route to Slack `#pe-cc-dev-team` only
**Decision:** Better Stack monitors/heartbeats keep email/SMS/call/push off; paging goes through the Better Stack → Slack integration to `#pe-cc-dev-team` (enable once in the Better Stack UI — not exposed by the API). Chris 2026-09-11.
**Why:** Standing rule: all app/code alerting lives in that channel.

### D15 — Ship path: `main` first, then `main` → `codex/crm-shared-design`, push both
**Decision:** Chris 2026-09-11. Keeps one lineage whichever branch Coolify builds; F20 then proved Coolify builds the CRM branch. Follow-up: either point Coolify back at `main` after fast-forwarding `main` to the CRM branch, or record the CRM branch as the canonical live branch in the daily log (CLAUDE.md rule 11 requires the live branch to be named).

## 1b. 2026-09-15 — workflow review since 8/26 (facts)

Chris: "our invoice audit workflow has been failing since 8/26 — verify no gaps in ABC invoices, that all invoices have been reviewed, and that every work surface is 100%." Every row below was verified against the prod DB, the agent host journal/log, and the live `/api/*` routes with a service token.

| # | Fact | Evidence |
|---|---|---|
| F32 | **The 8/26 failure was two upstream outages, both already repaired**: ABC `invoice.history` returned `totalItems: 0` for both bill-tos 8/26–9/1 (nightly job green-but-empty for 7 nights; recovered 9/2, rolling 10-day window backfilled 8/25–9/1 on 9/2), then job 13 failed 9/2–9/11 (F1–F3, mig 285) | `abc_invoices.created_at`; `cron.job_run_details` |
| F33 | **ABC invoice gap check: none.** API dry-run (`mirror-backfill.mjs --only=invoices --history-start=2026-08-01 --dry-run`) returns 47 invoices for 8/1–9/15; `abc_invoices` holds 47; `abc_invoice_history` rows without a detail row = 0; nightly ingest ran 30/30 nights 8/16–9/15; PDFs land D+2 by the ABC endpoint's own lag | dry-run summary; host `abc-sync.log` |
| F34 | **Audit coverage complete**: every non-CM ABC line dated 8/20–9/14 has a decision (95 `auto_match` passed by Alex, 4 discrepancy by Chris → CM requested); latest-per-line pending on non-CM invoices since 7/1 = 0; live `auditPendingCount` = 0. Credit-memo docs carry no audit rows by design | SQL over `invoice_line_audit`; `/api/accounting/kpi-pills` |
| F35 | **Surfaces and jobs**: `/healthz` = `b4ed4f8` = `origin/main`; kpi-pills, pending-verification, credit-memos/pending, work-queue (225 live), friday-wip (5–12 s), invoice detail for 8/25, 9/1 and 9/14 invoices all 200; board 66 green / 8 yellow / 2 red / 4 unknown (reds: jt-sentinel Q5 + the agent inheriting it); 14/14 pg_cron green, 6/7 systemd green | `GET /api/system/runtime-status` 07:56 UTC |
| F36 | **The remaining gaps are lapsed human routines, not code**: ABC AR open/closed report import last run 8/10 (manual CSV per docs/48; 142 invoices since carry `ar_status` null → paid invoices still count as open); Pay-It verification 57 `paid_pending_verification` (53 overdue); weekly QB batch unstamped since 8/25 and not built 9/1 or 9/8 — 9/15 prep built (37 invoices, $54,760.66, nothing stamped); 2 received SRS CMs pending amount-mismatch review; 5 SRS discrepancy lines with no agreement citation; `morning_abc_sync` Slack pass paused (docs/57) | `abc_invoices.ar_synced_at`; `invoice_payment_processed`; `invoice_register_export`; `credit_memo_receipts`; site sweep |
| F37 | **Sweep and report fixes shipped**: the received-credit check no longer filters `v_invoice_audit_invoice` by a 500-item IN list (F16 timeout gone; first clean run found 2 received CMs still counted as owed); the expired-agreement warning honors `renewal_mode`; design-system chapters are exempt from fabricated-data/orphan-page (7 errors / 17 warnings otherwise on the next host pull); `runtime-job-report.sh` sends `p_started_at` | commit on `main` 2026-09-15 |
| F38 | **Chris's challenge ("every recent invoice passed with zero credit memos") was right — two silent leaks.** (1) The mix shifted after 8/26 from Wichita (4 agreements, ~60% of lines priced) to Richardson/Atlanta commercial purchases (Atlanta has NO agreement on file; Richardson's two lists do not carry TPO/EPDM items), so most lines are genuinely No-Price — but (2) Alex's triage ran ~20 s after the ingest while `mv_invoice_pricing_office` (the office gate of the pricing arm) had refreshed at 07:30:00, BEFORE tonight's invoices existed. Every new invoice therefore read No-Price and was stamped passed/valid by Alex; 162 lines on 37 invoices since June carry that stamp while the audit view now prices them, 11 over agreement ($308.75). Evidence: 9/15 stamp 07:30:44 vs last matview refresh 07:30:00, invoice ingested 07:30:26 | SQL over `invoice_line_audit` × `mv_invoice_audit_line`; `cron.job_run_details` |
| F39 | **mig 289 (applied 14:5x UTC):** `alex_no_price_triage()` refreshes the two office matviews first (own 240 s `lock_timeout` so it waits behind job 13 rather than dying on PostgREST's ~8 s), never stamps an ABC line whose invoice has no `mv_invoice_pricing_office` row, and derives its counts from one scan (a second scan blew the 180 s limit on the first apply). Live-path run from the host: 46.7 s, refresh 117 ms, stamped 0, skipped-no-pricing-office 0. **Reopened 5 lines ($131.75)** on invoices with no human cancellation behind them: 2011016277-001 (17AVVG55FK $18.00, GAFNR441BK $22.50), 2011284893-001 (GPSF88BK $35.75), 2013736069-001 (14IP81716 $3.00, 17LO750GSZ $52.50 — the re-bill of 2013215342-001, whose $55.50 request now pairs with the full-reversal memo). **Six June lines ($177.00) on invoices whose requests a human cancelled were held for Chris and reopened on his instruction the same afternoon (mig 290; the cancelled requests stay cancelled):** 2011009179-001 17LO750GSB $20; 2011010454-001 17LO750GSZ $30 + GAFNR441TB $9; 2011012396-001 17LO750GSK $30; 2011014809-001 17LO750GSZ $40; 2011017518-001 17AVVG55FB $48 | mig 289; `/api/invoice-audit/invoice` shows the 5 pending |
| F40 | **Credit-memo disconnect:** `credit_memo_reconcile()` (mig 282) only scanned memos dated ≥ 2026-08-01, so 7 ABC credit memos dated 6/12–7/13 that NAME invoices with requests sent 8/9 were never matched — the requests sat "outstanding" on Chase It while the vendor's credit sat in the mirror: 2009258379-001 ← 2010869134-001 $-114.71; 2010333391-001 ← 2011151575-001 $-473.53; 2010333683-001 ← 2011482344-001 $-125.86; 2010453206-001 ← 2011853743-001 $-438.60; 2010409458-001 ← 2011853946-001 $-442.68; 2010409341-001 ← 2011854043-001 $-486.94; 2010366270-001 ← 2012013508-001 $-1,097.26. mig 289 lifts the floor for any memo naming an open request (ABC and vendor arms); first run created the 7 `amount_mismatch` receipts → Sent CM review queue 2 → 9. The credits exceed the requests, so a human decides whether each request is satisfied by the earlier credit | `credit_memo_reconcile()` → `{"abc-supply:amount_mismatch":7}`; kpi-pills |
| F41 | Consequences: the 9/15 weekly QB prep was rebuilt without 2013736069-001 (ABC now 32 invoices $39,840.34; total 36 / $45,790.53); one 9/14 invoice (2014501859-001, PO KS-218, $1,294.69) comes from ABC branch 326, which has no `vendor_branches` row and therefore no PE office — its 5 lines cannot be priced until the branch is mapped (2 of its items carry Wichita/Richardson agreement prices); Atlanta (Jonesboro) has 8 invoices / 40 lines since August and zero agreements on file — a coverage decision, not a code defect | SQL |
| F42 | **ABC branch 326 (Topeka) is not "unmapped" — it is mapped under the wrong key.** `vendor_branches` carries the Topeka row from the 2026-05-27 location import as `branch_number = 'topeka-KS-66618-1445'`, already assigned to Kansas City by isochrone containment (`pricing_status = covered`). The pricing join (`v_invoice_pricing_office`: `vb.branch_number = i.branch_number_extracted`, no normalisation, mig 239 convention) needs the bare `326`, finds nothing, and every line on 2014501859-001 reads No-Price; the map looks the branch up by the same bare number, finds no row either, and shows "Kansas City · suggested / Not yet assigned". Its Save button would stamp the slug row and still not fix the join. Only 326 is affected today (the only invoice branch with no bare-keyed row); 685 of 761 ABC rows still carry slug keys and 25 numeric rows have a same-city slug twin from mig 239's inserts. Fix = re-key the Topeka row to `326` (one UPDATE, then a matview refresh); the KC list prices two of its five lines over agreement ($20.95) | SQL; docs/109 F41 corrected |

## 2. Open questions (answer → becomes a decision above)

- ~~Q1 Which branch does Coolify build?~~ → F20: the CRM branch.
- ~~Q2 Is the CRM branch intended to be production?~~ → D15 (converge both ways; pick the canonical name next session).
- ~~Q3 Alert routing~~ → D14.
- Q4 **Coolify API token** — the instance has no API tokens at all (F26); mint one in the Coolify UI and paste it into 1Password `cw_master → coolify.proexteriorsus.net - Root API`. Once valid: set `BETTERSTACK_API_TOKEN` (+ optional `GITHUB_TOKEN`) on the command-center app and redeploy.
- Q5 **JobTread sentinel credential** — add `JT_SUPABASE_MIRROR_GRANT_KEY` to `/root/.config/cleverwork/master.env` on the agent host (F18).
- Q6 ~~Aspose.Cells licence~~ **Resolved 2026-09-12 — Aspose retired.** Chris: not extending the licence. `build_pack.py` now builds the pack with openpyxl (13 sheets, 10,610 formula cells, `#REF!` 0, funnel totals identical under pycel), the PDF brief became an HTML brief, `apply_cells_license()` is gone; agent host needs `pip install -r scripts/analytics/requirements.txt` (done by `apply-runtime-board-host.sh`).
- Q7 **Better Stack → Slack integration** — enable in the Better Stack UI for `#pe-cc-dev-team` (D14); Slack integrations are OAuth-only, there is no API create path.
- Q8 **Trigger the deploy.** Pushes to `main` (15:2x UTC) and to the CRM branch (15:31 and 15:38 UTC) did NOT start a Coolify build — `/healthz` still reported `e4344d8` at 15:50 UTC (F22). Either the GitHub → Coolify webhook is not wired for this branch or deploys have always been manual. With a valid token: `scripts/coolify-redeploy.sh`; otherwise click Deploy in the Coolify UI. Then verify `GET /api/system/runtime-status` with the conductor service token (per `/workos-agent-auth`) and open `/agents`.

| F22 | ~~No auto-deploy~~ **Corrected by F23**: Coolify DID build and start `main` (`c2c93b16`) on the push; the public hostname just never reached it | `/healthz` polled 15:31–15:50 UTC; `docker ps` 17:00 UTC |
| F23 | **The "wrong branch on prod" is a Traefik override, not a Coolify setting.** `/data/coolify/proxy/dynamic/crm-cc-staff.yml` (priority 1000, written by the CRM release scripts) routes all of `cc.proexteriorsus.net` to `cc-production-e4344d8`; `crm-cc-sales-mirror.yml` (priority 1100) routes `/sales*` and `/api/sales*` to `cc-sales-53e93af47f2e`. Coolify's own label router is shadowed. Full analysis and the fix in [docs/110](110-cc-crm-boundary-and-live-branch.md). D15's "name the canonical live branch" resolves to: **`main`, served by the Coolify app, with `/sales*` mounted from the CRM** | host inspection 17:00 UTC |
| F25 | **Host switched to `main` 17:07 UTC** (docs/110 §4): three CC-only fixes cherry-picked (6c01d48d, 8f4383bc, e18dbdea; 345 tests, build green), Coolify rebuilt at `e18dbdea` in ~120 s, `crm-cc-staff.yml` retired to `/data/coolify/proxy/retired/…20260911T170743Z`; public `/healthz` = `e18dbdea`, `/sales-mirror-assets/…logo.svg` = 200 from the companion, `/agents` behind the WorkOS gate, `/api/system/runtime-status` = 401 unauthenticated. `codex/crm-shared-design` renamed to `archive/crm-shared-design-2026-09`. Q8 closed; Q4 (Coolify API token) no longer blocks the deploy — it still gates `BETTERSTACK_API_TOKEN` on prod | host + curl 17:07 UTC |
| F26 | **Coolify API 401 root cause: the instance has ZERO API tokens** (`personal_access_tokens` count 0; `is_api_enabled=t`, no IP allowlist). The value in 1Password (item updated 16:57 UTC) was never a live token on this instance. Fix = mint one in the UI (Keys & Tokens → API tokens, root team, `*`/root ability) and paste it into the 1Password item; the agent's attempt to mint via `php artisan tinker` was refused by the permission classifier | Coolify DB 23:0x UTC |
| F27 | **Aspose is not a purchase problem.** The `.lic` on the agent host carries `LicenseExpiry 2026-08-29` but `SubscriptionExpiry 2027-07-29`; installed `aspose-cells-python 26.7.0`. The subscription is paid through July 2027 — download the refreshed licence file from the Aspose purchase portal and replace `/root/.config/cleverwork/licenses/Aspose.CellsProductFamily.lic` (or pin the package to a release dated before 2026-08-29). Q6 reframed | agent host 23:1x UTC |
| F28 | **`v_order_acculynx_match` materialised** (mig 288, applied): `mv_order_acculynx_match` 3,178 rows / 269 matched, own pg_cron job 18 (`7,22,37,52 * * * *`, not appended to job 13's single transaction), order-audit.ts reads the matview; CC `b38a71a4` deployed. The Better Stack heartbeat for job 18 is in the provisioning list but not yet created — `op read` hit an authorization timeout with nobody at the keyboard; rerun `OPEN_BRAIN_ENV_ROOT=~/Documents/a-roofers-open-brain bash scripts/betterstack-provision.sh` | prod DB + healthz 23:2x UTC |
| F29 | **Auto-mode permission classifier refuses host state changes over SSH** (mkdir under /opt, `docker exec … tinker`, running the CRM release executor) while permitting reads and `scp` into `/root`. Consequence: the 0.1.43 CRM release is prepared, bundled and copied to `/root/crm-ux-parity-0143/` on the Coolify host, but `stage`/`switch` need an operator (runbook: CRM_PWA `docs/delivery/UX-PARITY-RELEASE.md`). Same for stopping `cc-production-e4344d8` (docs/110 §4 step 5) | session 23:xx UTC |
| F30 | **acculynx-sync edge function still at v49** (job-walk fix e18dbdea not deployed): Deno tests 33/33 green; `supabase` CLI is unauthenticated on this Mac and the agent chose not to re-emit 138 KB of source through the MCP deploy call by hand. Deploy: `supabase login && supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu` from `main` | 23:xx UTC |
| F31 | Slack `api.test` answers `ok:false invalid_form_data` to a JSON POST but `ok:true` to a GET — the anonymous Slack probe is a GET; the authenticated one is `auth.test` with the bot token. `partners.abcsupply.com/` is 404 anonymously, the OAuth discovery document is the stable 200 | curl 2026-09-12 |
| F24 | Coolify root password reset via `php artisan root:reset-password` (root user `chussey@cleverwork.io`, no MFA); new value stored in 1Password cw_master → "coolify.proexteriorsus.net - Root Login". Self-serve reset was impossible because transactional email is not configured on the instance. The SSH path is `root@178.105.220.14` with `~/.ssh/a_roofers_open_brain_ed25519` (the `hetzner_office` key only opens the agent host) | 16:5x UTC |
|---|---|---|

## 3. Changelog

- 2026-09-11 — created; F1–F10, D1–D9.
- 2026-09-11 — D10–D13, F11–F15; migs 285–287 applied; Better Stack provisioned; board code written.
- 2026-09-11 (late) — F26–F30; mig 288 applied and deployed; CRM 0.1.43 release prepared to the host, operator run pending.
| D16 | **Third-party health = the Command Center's own direct pings, not Better Stack** (Chris 2026-09-12: "do not use Better Stack for third party — just our active connections; if we ping JT and get a 200 it's green"). New group *Connected systems · direct pings* (`INTEGRATIONS` in runtime-registry.ts, engine `integration-probes.server.ts`, 60 s cache, 6 s timeout, `redirect: manual`). Where this app holds the credential (Supabase anon key, WorkOS, Better Stack, GitHub, Linear, AgentMail, a Slack bot token) the ping authenticates and 200 = green, 401/403 = red "credential rejected". Where the credential deliberately lives elsewhere (JobTread grant key and QBO tokens on the agent host, AccuLynx keys in edge-function secrets, ABC client credentials) the ping is anonymous and green = the code that endpoint gives every anonymous caller, measured 2026-09-12: JT Pave POST 200, Intuit JWKS 200, ABC OAuth discovery 200, Slack api.test 200, AccuLynx 401, Coolify /api/health 200. A credential this app *should* hold but lacks caps the row at yellow. Better Stack keeps only its two original roles — outside-in site monitors and job heartbeats — and when its token is missing the *Site & APIs* group now falls back to the app pinging its own public routes (expected 200 / 302 / 401 per route) instead of sitting on "not configured" | classifyProbe() + 7 unit tests |
- 2026-09-12 — D16 direct pings (Connected systems group, site self-ping fallback), F31.
- 2026-09-12 — Q6 resolved: Aspose retired, pack builder on openpyxl (commit 4d63f08).
- 2026-09-15 — §1b F32–F37: workflow review since 8/26; sweep + report fixes.
- 2026-09-15 (later) — F38–F41: triage office-matview race + reconcile date floor (mig 289), 5 lines reopened, 7 ABC receipts surfaced.
- 2026-09-15 (later) — mig 290 (six June lines reopened, Chris); F42 branch 326 key mismatch.
