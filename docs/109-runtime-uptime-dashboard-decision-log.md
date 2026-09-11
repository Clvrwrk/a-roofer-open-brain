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

## 2. Open questions (answer → becomes a decision above)

- ~~Q1 Which branch does Coolify build?~~ → F20: the CRM branch.
- ~~Q2 Is the CRM branch intended to be production?~~ → D15 (converge both ways; pick the canonical name next session).
- ~~Q3 Alert routing~~ → D14.
- Q4 **Coolify API token** — Chris is minting a new one into 1Password `cw_master → coolify.proexteriorsus.net - Root API`; the read at 15:30 UTC still returned 401. Once valid: set `BETTERSTACK_API_TOKEN` (+ optional `GITHUB_TOKEN`) on the command-center app and redeploy.
- Q5 **JobTread sentinel credential** — add `JT_SUPABASE_MIRROR_GRANT_KEY` to `/root/.config/cleverwork/master.env` on the agent host (F18).
- Q6 **Aspose.Cells license** for `build_pack.py` — renew, or approve an openpyxl fallback (F19).
- Q7 **Better Stack → Slack integration** — enable in the Better Stack UI for `#pe-cc-dev-team` (D14).

## 3. Changelog

- 2026-09-11 — created; F1–F10, D1–D9.
- 2026-09-11 — D10–D13, F11–F15; migs 285–287 applied; Better Stack provisioned; board code written.
