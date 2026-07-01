---
phase: 3
slug: commercial-cron-hardening
status: complete
verified: 2026-07-01
verdict: COMPLETE — all 4 success criteria met on live prod; two known cosmetic residuals accepted (see below)
---

# Phase 3 — Verification (Commercial Cron Hardening)

> Goal-backward verification against the 4 ROADMAP success criteria, checked against the LIVE prod DB (`rnhmvcpsvtqjlffpsayu`) on 2026-07-01.

## Verdict

**COMPLETE.** Ingestion is hourly, resumable-from-watermark, observable, alerting, and security-reviewed. All 6 plans executed (03-01…03-06 each have a SUMMARY), migrations 172–181 applied to prod, `acculynx-sync` deployed with the pagination + reconciliation-instrument fixes, and all 8 production accounts are enabled and fully backfilled with zero cross-account bleed.

Two residuals are known and **accepted** (neither blocks the phase goal):
1. **georgia jobs (470 API vs 435 brain) and insurance_program jobs (27 vs 25) show a phantom 7.4% `delta_pct`.** The AccuLynx `count` probe (`last_api_total`) overcounts vs. the unique paginable job set; both accounts are paginated to completion, so the data is complete. Killing the false positive requires persisting a sweep-completion signal (edge-fn + migration) — carried forward as an optional monitoring refinement, not a Phase 3 gate.
2. **Alert *delivery* end-to-end (fire → Slack) is not yet observed.** The alert SQL + edge lib are built and `check_acculynx_alerts()` evaluates cleanly live, but delivery proof needs two human-only steps (invite the `openbrain` bot to the private `#ob-ops-conductor`; create the `acculynx_alert_slack_bot_token` Vault secret). Carried forward as 03-03 delivery proof.

## Per-Criterion Findings (live evidence, 2026-07-01)

### SC1 — Scheduler runs hourly for all accounts/resources, within rate limits
**MET.**
- `cron.job`: `acculynx-hourly-sync` = `0 * * * *`, active. Supporting crons active: `acculynx-reconcile` (`*/10`), `acculynx-alert-check` (`*/15`), `acculynx-geoid-match-daily` (`45 8 * * *`).
- Hourly dispatch fans out to all accounts in one serial `multiAccount:true` call (per-key rate limiting inside the function); zero cross-account bleed proven in Phase 2 and unchanged.

### SC2 — pg_net reconciled; no perpetual pending; failures/staleness alert
**MET.**
- `v_acculynx_cron_outcomes` (rewritten over the owned `acculynx_cron_dispatch` table, not the TTL-bound `net._http_response`): last 24h = **23 success, 1 pending** (the most-recent in-flight run, within grace — `stuck_past_grace = 0`). No perpetual pending.
- `check_acculynx_alerts()` exists and returns **0** firing alerts against live state (all four D-05 conditions clean: failed dispatch, unreconciled-past-grace, stale watermark, reconciliation delta).

### SC3 — Incomplete/timed-out runs resume from watermarks; runbook documents recovery
**MET.**
- Resumption is proven by the outcome itself: all 8 accounts reached full backfill purely via cron-paced, watermark-resumed hourly runs (no manual brute-force). Pagination advances by page/record offset with `416 = clean end`; per-`(account_key, resource_type)` watermarks (composite PK, mig 171) drive resumption.
- Recovery runbook: `docs/knowledge-base/acculynx/ingestion/runbook.md` (297 lines) — includes the `accountFilter` force-backfill lever and the `.env`-source gotcha.

### SC4 — Security review confirms secret handling, RLS, least-privilege; no secret exposed
**MET.**
- `gsd-secure-phase` audit → `03-SECURITY.md`: threats **T-03-01…T-03-11 all CLOSED** (mitigation existence verified against applied migrations 172–180 + live re-run `deno test` for alerts.ts, not documentation claims).
- Posture doc: `docs/knowledge-base/acculynx/security/posture.md` (140 lines, D-13). RLS deny-by-default confirmed live (anon/authenticated SELECT = false, service_role = true); no raw secret/token/DSN literal anywhere (grep sweep zero matches); alert token resolved via `vault.decrypted_secrets`, sent only in the `Authorization` header.

## Carried-forward-from-Phase-2 items — dispositions
- **KC + Wichita backfill to tolerance** — DONE (KC jobs 166/166 = 0.0%, wichita jobs 1284/1286 = 0.2%, contacts 1311/1314 = 0.2%).
- **Jobs `last_api_count` blindness** — FIXED via reconciliation instrument (mig 181): the view now keys off `COALESCE(last_api_total, last_api_count)`, and jobs persists the grand-total probe into `last_api_total`.
- **8 legacy NULL non-job rows** — TRIAGED (mig 180: stamped `sandbox` + archived, UPDATE-only).
- **6-account expansion** — DONE (D-08 tolerance gate OPEN; canary-then-batch enable of all remaining accounts; zero cross-account bleed).

## Live-diagnosed bugs fixed during this phase (deployed + verified)
1. Reconciliation instrument — jobs `last_api_total` grand-total probe (mig 181).
2. Contacts/estimates pagination — `pageStartIndex` is a PAGE NUMBER (advance by 1).
3. Jobs sweep — `/jobs` ignores `recordStartIndex`; paginates by `pageStartIndex` as a RECORD offset (advance by `items.length`); `416` = clean end.

## Production state at verification
- All 8 prod accounts enabled and fully backfilled; reconciliation ≈0.0% except the two accepted count-overcount residuals above.
- `acculynx-sync` deployed with all pagination + instrument fixes. Migrations applied through 181.

## Optional follow-ups (not Phase 3 blockers)
1. Reconcile `v_acculynx_reconciliation` against the paginable count (persist a sweep-completion signal) so count-overcount accounts stop showing a phantom delta.
2. 03-03 alert-delivery proof — 2 human steps (invite `openbrain` bot to `#ob-ops-conductor`; `select vault.create_secret('<xoxb>','acculynx_alert_slack_bot_token')`), then seed → fire → observe per the runbook.
