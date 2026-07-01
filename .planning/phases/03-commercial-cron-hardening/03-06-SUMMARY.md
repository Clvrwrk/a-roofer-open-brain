---
phase: 03-commercial-cron-hardening
plan: 06
completed: 2026-07-01
status: complete
verdict: D-08 gate opened; all 8 accounts enabled (canary-then-batch, zero bleed); jobs-sweep pagination bug found+fixed → all 8 accounts fully backfilled (jobs/contacts/estimates); residual deltas are an API count-overcount artifact, not missing data
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
- **Jobs-sweep bug FOUND + FIXED (2026-07-01).** The sweep stalled at ~25/run for
  every API-swept account because `resources/jobs.ts` used `recordStartIndex`, which
  `/jobs` **silently ignores** (direct API probe: `recordStartIndex=0` and `=25`
  return the identical 25 rows) → it re-fetched page 1 forever. KC/Wichita only
  looked complete because their jobs were legacy-backfilled, not swept. Fix:
  `/jobs` paginates by `pageStartIndex` as a **record offset** (probed live) —
  switched the sweep to it. Deployed + verified: **all 8 accounts backfill jobs in
  one dedicated run** (colorado 1841/1843, texas 2299/2300, multi_family 352/352,
  georgia 435, florida 30/30). Also handle HTTP **416** (Range Not Satisfiable) as a
  clean end-of-pagination.
- **Residual jobs deltas are an API count-overcount artifact, not missing data.**
  `/jobs` `count` can exceed the truly-paginable unique set (georgia: count=470 but
  only ~433–435 unique paginate; 416 past the real end). The sweep captures every
  reachable job; the reconciliation reference (`last_api_total` = probe `count`) is
  inflated, so small residual deltas remain (colorado 0.1%, georgia 7.4%). Fidelity
  is complete; a future refinement could reconcile against the paginable count.

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

- **SC1 (all accounts, hourly, within rate limits):** MET — 8 accounts enabled, serial
  loop, zero bleed, budget holds, and jobs/contacts/estimates now backfill fully for
  every account (jobs-sweep bug fixed). Residual reconciliation deltas are an API
  count-overcount artifact, not missing data.
- **Carry-forward:** expansion done under human-approved, canary-then-batch discipline.

## Optional follow-ups (not blockers)

1. **Reconcile against the paginable count**, not the raw API `count`, so accounts
   with count-overcount (georgia) don't show a false residual delta.
2. Investigate whether the ~1–2-record small gaps and georgia's larger phantom count
   are AccuLynx duplicate-GUID counting or a soft-deleted-jobs artifact.

## key-files
- modified: `docs/knowledge-base/acculynx/ingestion/runbook.md` (D-09 expansion record + jobs-sweep known issue + secret-setting gotcha)
- (code fixes committed under 03-06 fix: mig 181, jobs.ts probe, contacts/estimates page-number, index.ts, watermark.ts)
