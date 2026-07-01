---
phase: 03-commercial-cron-hardening
plan: 06
completed: 2026-07-01
status: partial
verdict: D-08 gate opened + all 8 accounts enabled (canary-then-batch, zero bleed); large-account JOBS backfill blocked by a newly-surfaced jobs-sweep stall
requirements: [REQ-07]
---

# Plan 03-06 Summary — 6-account expansion (D-08 gate + D-09 canary-then-batch)

## Task 1 — D-08 gate: CLOSED → OPEN ✅

Ran the read-only gate. Initially **CLOSED** for two independent reasons, both fixed
this session (commit `e145cf7`, see 03-06 fix commit):
1. **Reconciliation instrument (jobs).** delta compared brain vs `last_api_count`, but
   the date-windowed jobs `count` is the modified-window, not the grand total (KC read
   1975%). Fix: mig 181 (`last_api_total` + `coalesce` view) + a full-history count
   probe in `jobs.ts`.
2. **Contacts/estimates pagination.** `pageStartIndex` is a PAGE NUMBER; the loop
   advanced by `items.length`, jumping past the end (wichita contacts stuck 64/1314).
   Fix: advance one page + stop on the short page.

After fixes, every KC+Wichita reconciled resource ≤2% (KC 0.0% across; wichita
0.2%/0.2%/0.0%). Gate **OPEN**. 74/74 deno tests pass.

## Task 2 — canary-then-batch enable (D-09) ⚠️ partial

- **All 6 secrets set** for colorado, florida, georgia, texas, insurance_program,
  multi_family_commercial (canary `insurance_program` first, then the batch of 5).
- **Zero cross-account bleed** — `select distinct account_key from acculynx_jobs`
  returns exactly the 8 enabled accounts; each stamped correctly.
- **Contacts + estimates backfill fully** in one run per account (colorado 1909/1909,
  georgia 479/479, multi_family 369/369, all 0.0%). Budget holds (no timeouts).
- **BLOCKER — jobs sweep stalls at ~25/run.** The date-windowed `resources/jobs.ts`
  sweep fetches only the first page then terminates, every run, for every API-swept
  account (georgia 25/470, texas 25/2300, multi_family 25/352, colorado 48/1843).
  KC (166/166) + Wichita (1284/1286) look complete only because their jobs were
  loaded by the **legacy backfill script**, not this sweep — which masked the bug
  until now. So large-account jobs reconciliation stays high and the D-09 "trends
  within tolerance" criterion is NOT yet met for jobs on the new large accounts.

## Deviations / findings

1. **`source .env` is broken** — line ~214 has a value zsh executes, aborting the
   source before the AccuLynx keys, so it silently set an EMPTY canary secret (digest
   = SHA-256 of ""). Corrected by setting via `supabase secrets set --env-file` with a
   grepped temp file; verified digests non-empty. Recorded in the runbook.
2. Edge secrets take ~30–60s to propagate; a too-soon run skips the account (~1s exec).
3. Small-account jobs show a benign few-% delta from a systematic ~2-record `count`
   quirk (leads counted-but-not-paged) — negligible on any non-tiny account.
4. The jobs-sweep stall is systematic (exactly 25 everywhere), not data-specific →
   a jobs.ts pagination bug, distinct from the two fixed this session. Needs edge-fn
   console logs on the page-2 (recordStartIndex=25) response; compare to the working
   legacy `pageStartIndex` jobs path.

## SC coverage

- **SC1 (all accounts, hourly, within rate limits):** infrastructure MET — 8 accounts
  enabled, serial loop, no bleed, budget holds. Data-completeness PARTIAL — jobs
  backfill for large new accounts blocked by the sweep stall.
- **Carry-forward:** expansion done under human-approved, canary-then-batch discipline.

## Remaining to fully close 03-06

1. **Fix the jobs-sweep single-page stall** (the real blocker) — instrument page-2 in
   `jobs.ts`, redeploy, read `get_logs edge-function`, fix, then let the cron drain the
   large accounts. Then re-check the gate for all 8.
2. Let contacts/estimates/jobs drain to tolerance across subsequent hourly runs.

## key-files
- modified: `docs/knowledge-base/acculynx/ingestion/runbook.md` (D-09 expansion record + jobs-sweep known issue + secret-setting gotcha)
- (code fixes committed under 03-06 fix: mig 181, jobs.ts probe, contacts/estimates page-number, index.ts, watermark.ts)
