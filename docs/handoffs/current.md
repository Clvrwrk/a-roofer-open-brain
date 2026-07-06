# Project Handoff — a-roofers-open-brain (Command Center)
**Project:** Roofer Open Brain — Command Center (Invoice Audit pipeline + agent fleet restoration)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify auto-builds `origin/main`; verify via `/healthz` → `buildCommit`)
**Date:** 2026-07-06 08:36
**Agent:** Lead Orchestrator
**Reason:** End of session (user-requested /project-handoff)

> Prior handoff (2026-06-28 invoice-audit + 06-29 OKF mid-flight note) archived at
> `docs/handoffs/archive/2026-07-06-0836-prior-current.md`.

---

## Accomplished This Session

### Incident diagnosis (invoice pipeline outage, Jun 29 – Jul 6 — full record: `docs/67-invoice-pipeline-outage-and-restoration-2026-07-06.md`)

- Diagnosed four independent failures presenting as one "disjointed screen": (1) nightly ABC sync scheduled in a Cowork sandbox that kills processes >45s; (2) agent-fleet scheduler designed (docs/56) but never installed — no systemd units, all Hermes cron jobs `enabled: false` since ~Jun 30 07:10; (3) `agent-tick.sh` never reached hermes (Kasm image entrypoint swallows command args); (4) three different "ready to pay" predicates + missing cache invalidation in the app.

### App fixes (merged to `main`, deployed, verified live)

- `app/command-center/src/lib/invoice-audit.ts`: totals gain `payable` (what process-batch will export) + `held` (fully reviewed, credit-memo do-not-pay); ScopeTotalsInvoice picks `approvedToPay`.
- `app/command-center/src/pages/accounting/invoice-audit.astro`: Process button counts/disables on `payable`; KPI sub-line shows held count.
- `app/command-center/src/scripts/invoice-audit-tree.ts`: client predicate now mirrors the server (`transferred` short-circuit + `approvedToPay`); "Held — credit memo" pill; roll-ups count payable; credit-flag disposition sets hold state client-side.
- `app/command-center/src/pages/api/invoice-audit/process-batch.ts`: 409 explains held invoices (`heldCount` in payload).
- `app/command-center/src/pages/api/invoice-audit/{mark,reset}.ts`: invalidate the 5-min summary cache on every decision.
- `app/command-center/src/pages/api/invoice-audit/run-disposition.ts` (NEW): Alex's docs/57 §1 daily pass wired to the tested engine (`invoice-audit-disposition.ts` `disposeInvoice` — previously had ZERO production callers). Human-gated (`approval.decide`), `dryRun`/`office`/`maxInvoices` staged-rollout params, writes `source='backfill'` + `approved_by='Alex'` (CHECK constraint allows only auto_match|manual|backfill), paginated per docs/42 playbooks 3/9/11, mark-endpoint parity (credit-memo tracking, action log, cache invalidation).
- `app/command-center/src/lib/invoice-audit.unit.test.ts`: regression test — transferred+credit-flag invoice counts `held`, never `payable`. 250 tests green.

### Ops / host (Hetzner agent host `5.78.146.161`, SSH key `~/.ssh/a_roofers_open_brain_ed25519`, user root)

- `scripts/abc-nightly-sync.sh`: host-portable (`REPO_ROOT` derived from script path; was hardcoded to the Mac) + appended nightly invoice ingest (`mirror-backfill --only=invoices`, rolling 10-day idempotent window per docs/63).
- `scripts/agent-tick.sh`: `--entrypoint hermes --network host` + 1h hang-stop (bare `docker run IMAGE hermes cron tick` boots the Kasm desktop and hangs forever).
- `deployment/remote/systemd/openbrain-abc-sync.{service,timer}` (NEW): nightly 03:30 America/New_York.
- Host provisioning: real git clone at `/opt/openbrain/a-roofers-open-brain` (replaced a broken rsync'd worktree snapshot, preserved as `*.broken-worktree-20260706`); scoped `.env` composed on-host from Alex's Kasm profile env (never displayed locally); timers `openbrain-abc-sync.timer` + `openbrain-dev-tick@alex.rivers.timer` enabled and proven; stray debug container removed; Alex's `nepq-agent-communication` skill collision resolved (duplicate disabled); `alex-morning-abc-sync` re-enabled (backup: `jobs.json.bak-20260706`).

### Backlog cleared + Slack proven

- Invoice catch-up: 20 invoices / 136 lines ingested (current through Jul 2 — ABC has nothing newer, holiday weekend).
- Disposition pass (dry-run → 5-invoice gate → full): **62 invoices, 191 line decisions** — 148 accept-neg, 23 accept-nochallenge (coverage gaps → Jordan), 7 accept-30d, 3 accept-svc, 5 credit-flag (credit-memo requests drafted), **16 gate-negotiated lines left pending for human ruling** (40 invoices held out of the payment export by design).
- Alex posted the run summary to `#accounting-invoice-processing` (`C0BDRFACQ4S`, ts `1783351625.222829`) via his own bot token from the host.

## Git State
- **Branch:** `main` (== `origin/main`, deployed)
- **Last commit:** `9e84409` — "docs(memory): invoice pipeline outage + restoration record (docs/67); daily logs 07-04..06; memory refresh"
- **Uncommitted changes:** only this handoff file + its archive copy (committed immediately after writing)

## Task Cut Off
None — session ended at a clean boundary. All five planned tasks completed.

## Next Task — Start Here

**Task:** Decide + implement daily automation of the disposition pass (docs/67 §6 item 1)
**What to check / do:**
1. Read `docs/67-invoice-pipeline-outage-and-restoration-2026-07-06.md` §6 — the open-items list.
2. Ask Chris to pick the automation path: (a) provision Alex a fresh Command Center bearer (`AGENT_SERVICE_TOKEN_SHA256_ALEX-RIVERS`, generate new — never reuse existing secrets) + decide whether named agents may hold a disposition-run permission (they deliberately lack `approval.decide`); (b) in-app scheduled cadence under a system actor; or (c) keep it a daily human click / curl.
3. Meanwhile verify this morning's automation ran: on the host, `systemctl list-timers | grep openbrain` and `tail -30 ~/.abc-sync/logs/abc-sync.log`; Alex's tick journal `journalctl -u "openbrain-dev-tick@alex.rivers.service" -n 20`.

**If the nightly sync failed:** check `/opt/openbrain/a-roofers-open-brain/.env` still has 10 keys, then run `bash /opt/openbrain/a-roofers-open-brain/scripts/abc-nightly-sync.sh` manually and read the log.

**Prompt to use:** "Read docs/handoffs/current.md and docs/67 §6. Verify last night's ABC sync + Alex tick ran on the agent host, then walk me through the disposition-pass automation decision (67 §6 item 1) and implement my choice."

## Decisions Made This Session

- **Daily-all processing per docs/63 stands** (Chris confirmed): Alex processes every open invoice daily; the 60-day window is only the "Due now" lens + payment timing. The "weekly compile" framing = the weekly payment package, not the processing cadence.
- **Scheduler lives on the Hetzner agent host via systemd** (Chris chose; docs/56 design finally installed). The Cowork scheduled task is dead — must be cancelled by a human.
- **Slack scope = outbound posts only** for now; two-way chat stays parked behind docs/60 confinement layers.
- **The disposition pass stays human-gated**: named agents deliberately lack `approval.decide`; the deterministic engine + negotiated human gate protect the money boundary. Do not re-litigate by silently granting agents decide rights.
- **`source='backfill'` is the SOP-pass value** — `invoice_line_audit.source` CHECK allows only `auto_match|manual|backfill`; `approved_by='Alex'` drives agent attribution. (Optional future: additive migration adding `sop-run`.)
- **Process button counts `payable`, not `toBePaid`** — held (credit-memo do-not-pay) invoices are surfaced as their own count, never silently inflating the export queue.

## Blockers Requiring Human Action

1. **Cancel the Cowork nightly-sync scheduled task** — it fails every night by construction (45s cap) and systemd now owns the job. Only Chris can reach the Cowork UI.
2. **Review the 16 negotiated-gated lines + 5 credit-flag holds** on `/accounting/invoice-audit` — the human half of the SOP; the gated invoices stay out of the payment export until ruled on.
3. **Pick the disposition-pass automation path** (see Next Task).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit` — should show a SHA ≥ `e74705d` (KPI fix + endpoint live).
2. `ssh -i ~/.ssh/a_roofers_open_brain_ed25519 root@5.78.146.161 'systemctl list-timers | grep openbrain'` — should list `openbrain-abc-sync.timer` (next 07:30 UTC) and `openbrain-dev-tick@alex.rivers.timer` (next ≤1 min).
3. `ssh -i ~/.ssh/a_roofers_open_brain_ed25519 root@5.78.146.161 'journalctl -u "openbrain-dev-tick@alex.rivers.service" -n 3 --no-pager'` — recent ticks should show "Deactivated successfully" (≈2s cycles).
4. Invoice Audit page: "Invoices To Be Paid" KPI count must equal what Process exports; held count appears in the sub-line when nonzero.

## Full Context

### What was built across ALL sessions (complete feature list)
- Everything in the 2026-06-28 handoff (see `docs/handoffs/archive/2026-07-06-0836-prior-current.md`): invoice-audit dashboard + disposition workflow, two-phase payment flow (process/confirm-paid/return), Register vs Payment CSV split (docs/63), Service/Warranty transfer (docs/61, mig 162), price-agreement builder suite, vendor territory map home, executive pipeline dashboard, AccuLynx multi-account sync + webhooks (migs 165–187), WorkOS auth + agent bearer path, Slack per-agent bots, OKF/roofing-ops runtime workstream (06-29 note).
- THIS session: invoice-pipeline restoration (docs/67) — systemd scheduler actually installed on the agent host, agent-tick entrypoint fix, nightly sync moved + extended with invoice ingest, payable/held KPI truth, run-disposition endpoint, backlog cleared (62 invoices / 191 decisions), Alex Slack posting proven.

### Architecture decisions
- **The "24/7 agent" is a scheduler + deterministic engine + human gates, not a free-running LLM.** Alex's historical decisions were bulk `backfill` passes + dashboard actions; the Hermes cron job is a thin scaffold (web+file toolsets, empty sandbox, no repo mount) that cannot execute the SOP — do not expect it to. The engine of record is `invoice-audit-disposition.ts`.
- App runs service-role-only against Supabase — authorization is 100% `access-control.ts`; there is no RLS backstop for the app path.
- Dev reads prod: local dev server + prod DB is a sanctioned mode; `COMMAND_CENTER_AUTH_MODE=local` yields the full-permission local operator (this is how the backlog pass was triggered).
- Doc numbers ≥47 collide across two tracks (Roofing-Ops vs Stormwatch) — always reference docs by full filename.

### Key invariants (never violate)
- **Additive migrations only; never destructive SQL** (CLAUDE.md hard rule 1).
- **Pricing comparisons only via `price_per_uom` / `v_item_uom_map`** (docs/46).
- **PostgREST reads paginate; `.in()` chunks ≤40–50; bulk upserts partition by column-presence** (docs/42 playbooks 3/9/11).
- **`gate-negotiated` lines are never auto-dispositioned** — leaving them pending IS the hold (docs/57, LOCKED 2026-06-30).
- **Never hand-edit `version.ts`** — the pre-commit hook bumps it.
- **Deploy = explain-then-ship**: state change/impact/rollback, push `origin main`, watch `/healthz` `buildCommit`.
- **`docker run` against the Kasm Hermes image needs `--entrypoint hermes`** — the default entrypoint boots a desktop and hangs oneshots.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Command Center | Coolify on `5.78.124.10`, builds `origin/main`, https://cc.proexteriorsus.net, health `/healthz` |
| Agent host | `5.78.146.161` (root, key `~/.ssh/a_roofers_open_brain_ed25519`); repo `/opt/openbrain/a-roofers-open-brain`; timers `openbrain-abc-sync`, `openbrain-dev-tick@alex.rivers` |
| Supabase | `rnhmvcpsvtqjlffpsayu` (shared dev+live); schemas through 187 |
| Slack | Alex bot `A0BD4C9SUPP`, posts to `#accounting-invoice-processing` `C0BDRFACQ4S`; registry in `.claude/skills/slack-agents/` |
| ABC sync logs | host: `~/.abc-sync/logs/abc-sync.log`; catch-up run summaries in `integrations/bridges/abc-supply/.mirror-runs/` |
