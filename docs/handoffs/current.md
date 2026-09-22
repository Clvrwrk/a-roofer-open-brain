# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-09-22 06:33 (PT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5.1)
**Reason:** User-requested (/project-handoff after the invoice-audit review that ran 2026-09-15 → 2026-09-22)

---

## Accomplished This Session

This session was one continuous workstream, in the order it happened. Every item below was verified against the prod database, the agent host, or the live `/api/*` routes before it was called done; the evidence rows are in `docs/109-runtime-uptime-dashboard-decision-log.md` §1b (F32–F46).

### 1 · Invoice-audit workflow review since 8/26 (2026-09-15, Chris: "verify no gaps, all reviewed, all surfaces 100%")

- `docs/109` F32–F37: the 8/26 failure was two upstream outages, both already repaired — ABC `invoice.history` returned zero rows 8/26–9/1 (backfilled 9/2), then pg_cron job 13 failed 9/2–9/11 (mig 285 fixed it). ABC gap check: API dry-run 8/1–9/15 = 47 invoices = 47 in the brain, 0 history rows without detail. Audit coverage: every non-CM ABC line 8/20–9/14 decided. Surfaces: all accounting/audit API routes 200; board 66 green / 8 yellow / 2 red.
- `scripts/site-quality-sweep.mjs`: the received-credit check no longer filters the per-row audit view by a 500-item IN list (it hit the 8 s statement timeout nightly); expired-agreement warning honours `renewal_mode`; design-system chapters exempt from fabricated-data / orphan-page.
- `scripts/runtime-job-report.sh`: sends `p_started_at` from systemd `ExecMainStartTimestamp`.
- Lapsed HUMAN routines surfaced: ABC AR report import (last 8/10), Pay-It verification (57 pending), weekly QB batch (never stamped after 8/25), 2 SRS CM receipts, 5 uncited SRS discrepancy lines, `morning_abc_sync` paused.

### 2 · "Every invoice passed with zero credit memos" — two silent leaks (mig 289, 2026-09-15)

- `schemas/cleverwork-roofer/289-triage-office-race-and-reconcile-scope.sql`: (1) `alex_no_price_triage()` ran ~20 s after the nightly ingest while `mv_invoice_pricing_office` had refreshed at 07:30:00 — every new invoice read No-Price and was stamped passed (162 lines / 37 invoices since June, 11 over agreement). The function now refreshes the two office matviews first (own 240 s `lock_timeout`), never stamps an ABC line whose invoice has no pricing-office row, and derives its counts from ONE scan (a second scan blew the 180 s limit). (2) `credit_memo_reconcile()` only scanned memos dated ≥ 8/1 — seven June/July ABC memos naming invoices with open requests were never matched; the date floor now applies only to memos naming no open request. First run: 7 ABC receipts to the review queue.
- Reopened 5 over-agreement lines ($131.75); verified through the host's real triage path (46.7 s, stamped 0).

### 3 · Six June lines, then their closeout (migs 290, 293, 293b — 2026-09-15/16)

- `290-reopen-june-triage-race-lines.sql`: on Chris's instruction the six June lines held back in 289 were reopened for another audit pass.
- `293-june-recycled-invoices-closeout.sql`: Chris then ruled the seven June invoices complete and processed. New `invoice_audit_closeout` register (RLS, service-role), 8 pending lines decided valid under Chris's name with the reason, `invoice_payment_processed` 'paid' rows (source `closeout`) for the six without a ledger row, pipeline `invoice_processed`, and `invoice_audit_reset()` refuses a closed-out invoice (`invoice_closed_out`, probed live). 293b cancelled the $20 draft CM on 2011009179-001 and closed its disputed line.
- `app/command-center/src/lib/invoice-audit.ts`: `closedOut` / `closeoutReason` on every invoice loader; `deriveDisposition` → "Processed — closed" above every state except credit memo; `src/scripts/invoice-audit-tree.ts`: grey "Processed — closed" pill, Go back hidden. Unit tests added (354 green). Deployed and verified on the live invoice route.

### 4 · Branch 326 (Topeka) and the slug-keyed ABC branches (migs 291, 292 — 2026-09-15)

- `291-rekey-abc-branch-326-topeka.sql`: the Topeka row was keyed `topeka-KS-66618-1445` by the May import; since mig 243 an ABC invoice resolves its branch AT INGEST through `vendor_branch_alias`, and the slug row had no alias → invoice 2014501859-001 ingested with a NULL FK and priced as No-Price while the map showed "Not yet assigned". Re-keyed to `326`, FK backfilled, aliases `326`/`0326` added, 3 lines reopened ($31.65). docs/109 F42.
- `292-alias-slug-keyed-abc-branches.sql`: 670 alias rows for 589 of 684 slug-keyed rows (ZIP+4 / ZIP5+city / unique-city tiers); 25 twins of numeric resolvers left; 70 unaliased (Canadian branches, multi-branch US cities). 292b carried the isochrone office onto four numeric stubs that owned the alias without an office (Granbury, Enid, Marietta, Sherman). Every branch bought from in 36 months resolves at ingest. docs/109 F43.

### 5 · AccuLynx job link (mig 294 — 2026-09-16/22)

- Not broken: links whenever the job box or PO carries the PE job number. Rate fell 82% → 38% because 42 of 48 unlinked invoices since June carry an account bucket ("Commercial", "DFW Account", "Storm/wichita") and free-text POs; commercial CP-25-xxxx projects are not in AccuLynx at all.
- `294-acculynx-link-ins-prefix-and-client-name.sql`: INS- prefix added (12 insurance jobs; 2–3 letter token regexes) and a unique-client-name fallback (`link_method = 'client_name'`, names ≥ 5 chars). 892 of 1,133 linked; view runs in 128 ms. docs/109 F45.

### 6 · SRS 9/22 ingest and the weekly export leak (mig 295 — 2026-09-22)

- Detail CSV `SRSICORP_S036198_20260922090412_0.csv`: 70 documents 7/7–9/17; brain held 54 → 16 September documents added (14 invoices, 2 CMs, 151 lines, Wichita). `scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs` linked all 71 SRS PDFs from the Dropbox folder. Both new memos reconciled (`amount_mismatch`, review queue → 13). The statement CSV (`…090358`) covers only the 7/1 and 8/1 statements and the statement reader is QXO-only — SRS open/paid status still unknown.
- `295-weekly-export-pending-matches-app.sql`: `v_inv_processed_weekly` counted every undecided auditable line as pending; the app's rule (Chris 2026-08-05) is that only a VISIBLE discrepancy line needs a decision. 85 "Approved" invoices ($459K; every SRS invoice with a within-agreement line since July) never reached a Tuesday QB file. 295 applies the app's rule; 295b adds the NOT-paid rule and a payment-ledger guard (46 AR-paid ABC bills and 15 ledgered bills would otherwise re-load). Tuesday prep rebuilt: `exports/inv-processed-2026-09-22/` ABC 49 $101,141 · QXO 2 $5,697 · SRS 38 $165,500 — nothing stamped. docs/109 F46.

### 7 · Run-now pass, QB bank batch, routine currency (2026-09-22 13:0x–13:3x UTC)

- Standard daily chain re-run on demand for all vendors: triage (ran at ingest + nightly), `credit_memo_claims_sync_all()` + `credit_memo_reconcile()` (13:07 and 13:21), matview refresh (13:08, 13:21); job 13 succeeded 13:15.
- `exports/qb-bank-2026-07-31_to_2026-08-12/`: per-vendor QB bank files for the window Chris reported missing from QBO, rebuilt from `qb_bank_export_log` (the producer never re-emits a stamped row) plus the two never-handed rows: ABC 62 rows / $32,072.22 spent, SRS 6 / $22,476.94, QXO 1 / $5,601.71. Nothing stamped. Delivered to Chris.
- Currency at 13:20 UTC: ABC nightly chain green 07:30–07:32 (newest invoice 9/21); SRS current through 9/17; QXO last ingest 8/05 (human CSV cadence); pending lines ABC 28 (reopened lines awaiting Chris), SRS 0, QXO 0; CM receipts pending review 13; board 66G/8Y/2R.

## Git State
- **Branch:** `main` (worktree branch `claude/invoice-audit-workflow-review-bc272b` pushed to `origin/main` throughout; main checkout and agent host fast-forwarded after every push)
- **Last commit:** `156db5f1` — "docs(memory): 9/22 run-now pass, routine currency, QB bank batch 7/31–8/12 rebuilt from the export log [skip version]" (this handoff commits on top)
- **Deployed:** `/healthz buildCommit` = `156db5f` at 06:33 PT
- **Uncommitted changes:** none (this handoff + its archive are committed by the wrap-up commit)

## Task Cut Off
None — session ended at a clean boundary. Every migration (289–295b) applied to prod and committed; every app change built, tested (354/354) and deployed; every export written and handed over.

## Next Task — Start Here

**Task:** Materialise the Invoice Audit summary read (`v_invoice_audit_invoice`) — it hit the 8 s `statement_timeout` twice on the dev server during this session and is the same query the live tree runs (playbook 9).

**What to check / do:**
1. `EXPLAIN (ANALYZE) SELECT count(*) FROM v_invoice_audit_invoice` on prod — it ran ~2.2 s at 13:00 UTC with 1,133 invoices; confirm current timing and the plan (per-row LATERAL over `mv_invoice_pricing_office`).
2. Create `mv_invoice_audit_invoice` (same columns), unique index on `invoice_number`, append its refresh to pg_cron job 13's command (inside the same transaction as `mv_invoice_audit_line`) and to `service_pending_matview_refreshes()`'s chain, exactly as mig 272–273 did for the line view.
3. Point every reader at the matview: `app/command-center/src/lib/invoice-audit.ts` (summary + detail loaders), `scripts/site-quality-sweep.mjs` check 2/3, `alex_no_price_triage()`, `v_inv_processed_weekly`. Keep the view as the definition of record.
4. Build + tests, deploy, verify `/api/accounting/kpi-pills` and an invoice-detail call on prod, then the sweep on the host.

**If job 13 starts failing after the change:** the four REFRESHes and the reconcile are one transaction — a failure rolls back all of them and the audit freezes (docs/109 F1). Check `cron.job_run_details` for job 13 first, run the refresh by hand, then fix.

**Prompt to use:** "Read docs/handoffs/current.md. Then materialise v_invoice_audit_invoice as mv_invoice_audit_invoice (job 13 + on-demand refresh chain), repoint the readers listed in the handoff, build, test, deploy and verify on prod."

## Decisions Made This Session

- **An agent stamp made on stale inputs is not a decision — reopen it; a human cancellation is a decision — surface it, never revive it.** (migs 289/290; the closeout register makes the human ruling durable.)
- **A No-Price reading without the office gate is not a reading.** The triage refreshes the office matviews first and fails closed when the pricing-office row is absent (mig 289). Any future agent pass that writes decisions must do the same (memory: matview-freshness-before-agent-stamps).
- **A credit memo that names an invoice with an open request is never too old to match.** Date floors apply only to unnamed memos (mig 289).
- **"Pending" has one definition — the app's:** an auditable line with no passed/disputed decision AND a visible discrepancy (UOM mismatch, No-Price, or billed above agreement). A line priced within agreement is valid as billed and never needs a decision. The weekly export set uses it (mig 295).
- **The register export never re-loads a paid or ledgered bill** — the vendor AR report's `paid`, or any active `invoice_payment_processed` row, keeps it out (mig 295b).
- **Branch identity is the alias table, not the branch number string.** Since mig 243 the ingest resolves through `vendor_branch_alias`; a branch row without an alias is invisible to pricing whatever its office says (migs 291/292).
- **The AccuLynx link recovers nothing from account-bucket job boxes.** Counter discipline (job number in the job box) is the fix; commercial CP-25 projects need their own link outside AccuLynx (A3 candidate).
- **The QB bank producer never re-emits a stamped row.** Re-deliveries are rebuilt from `qb_bank_export_log`; "stamped" means handed over, not loaded.
- **Closed-out invoices show "Processed — closed"** in the register label, the tree pill and the detail route; Go back is hidden and the reset RPC refuses them.

## Blockers Requiring Human Action

1. **Lucinda — load this week's QB files** (`exports/inv-processed-2026-09-22/`, 89 invoices $272,338) and the 7/31–8/12 bank batch (`exports/qb-bank-2026-07-31_to_2026-08-12/`); check QB for the 14 July SRS bills before loading (our load-once guard only knows our own stamps); then `node scripts/build-inv-processed-weekly.mjs --stamp`.
2. **Lucinda — Pay-It verification** (57 `paid_pending_verification`, incl. 2011284893-001) and the **13 credit-memo receipts** on Sent CM review.
3. **Chris — 28 reopened ABC lines** awaiting a claim decision (migs 289/291 reopens plus the 8/25 set); **5 SRS discrepancy lines with no agreement citation** (the site sweep's "money without provenance").
4. **ABC AR report import** (manual CSV per docs/48) last run 8/10 — 142+ invoices carry no paid status; the NOT-paid export guard only protects invoices with AR data.
5. **SRS open/paid status**: send the 9/1 and 10/1 SRS statement exports (or the closed-items report); the statement reader needs a ~1 h SRS adapter (different column names than QXO).
6. **QXO**: last ingest 8/05 — if QXO has invoiced since July, export the detail CSV.
7. **Atlanta (Jonesboro) has no ABC agreement on file** — 8 invoices / 40 lines since August audit against nothing; a coverage decision.
8. **Counter discipline** (Roberto): job number in the ABC job box at Richardson, Atlanta and Wichita counters; 42 of 48 unlinked invoices since June carry an account bucket.
9. **Carried forward, unchanged:** Q4 Coolify API token → `BETTERSTACK_API_TOKEN` + `GITHUB_TOKEN` on prod; Q5 `JT_SUPABASE_MIRROR_GRANT_KEY` on the agent host (jt-sentinel red); Q7 Better Stack → Slack; `acculynx-sync` edge function still v49 (`supabase login && supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu`); `morning_abc_sync` paused (docs/57); CPA rulings; PEC-257/258/244/240/242/111/221/214/216.

### Linear-ready ticket list (Linear MCP was unauthenticated all session — file these by hand or authorise the connector)

| # | Title | Type | Owner | Evidence |
|---|---|---|---|---|
| L1 | Materialise `v_invoice_audit_invoice` (8 s timeout risk) | eng | agent | this handoff, Next Task |
| L2 | SRS statement reader (AR open/paid) for `ingest-vendor-invoice-csv.mjs` | eng | agent | docs/109 F46 |
| L3 | Commercial-project link for CP-25 invoices (outside AccuLynx) — A3 | product | Chris | docs/109 F45 |
| L4 | Port INS- prefix to `v_vendor_invoice_acculynx_match` (mig 250) and `v_pe_job_label_parse` | eng | agent | docs/109 F45 |
| L5 | Retire the 25 slug-twin branch rows; alias the 70 unmatched or mark out of scope | data | agent | docs/109 F43 |
| L6 | Load 9/22 QB files + 7/31–8/12 bank batch; stamp | accounting | Lucinda | exports/ |
| L7 | Pay-It verification backlog (57) + 13 CM receipts | accounting | Lucinda | kpi-pills |
| L8 | 28 reopened ABC lines + 5 uncited SRS lines | accounting | Chris | site sweep |
| L9 | ABC AR report import (lapsed since 8/10) — schedule or automate | accounting | Lucinda/Chris | docs/48 |
| L10 | Atlanta ABC agreement coverage | purchasing | Chris | docs/109 F41 |
| L11 | Counter discipline: job number in the job box | ops | Roberto | docs/109 F45 |
| L12 | Coolify API token → Better Stack + GitHub tokens on prod (Q4) | ops | Chris | docs/109 |
| L13 | JobTread grant key on the agent host (Q5) | ops | Chris | docs/109 F18 |
| L14 | Deploy `acculynx-sync` edge function (v49 → main) | eng | agent (needs `supabase login`) | docs/109 F30 |

## Open branches not on main — PR #9 and PR #12 (green, waiting on a human)

The PEC-221 price-agreement coverage work sits in two PRs as of 2026-09-22. `claude/project-
handoff-5ua2fw` (**PR #9**) carries the surface and docs — `price-agreement-coverage.ts`, the
Agreement Builder, `docs/107`, `docs/108`. `contrib/cleverwork/coverage-migrations` (**PR #12**)
carries the five migrations below and nothing else. `origin/main` is merged INTO each PR branch
daily, which is what keeps both at 0 behind; neither has been merged into main, and both are
still open. They were split because sixteen migration-number collisions had each dragged the
unrelated surface work through a renumber; the schema now moves on its own.

**`296-300` are FILENAMES ON PR #12, not production labels.** The work is applied to prod
under older labels, and the two numbering systems have never matched. Do not search
`schema_migrations` for 296-300 — you will not find them, and you must not re-apply anything:

| Branch filename | Applied to prod as | At |
|---|---|---|
| `296-office-vendor-spend-exposure` | `245_office_vendor_spend_exposure` | 2026-08-20 10:57 UTC |
| `297-backfill-branch-address-from-raw` | `246_backfill_branch_address_from_raw` | 2026-08-20 10:59 UTC |
| `298-gap-exposure-with-ruling` | `248_gap_exposure_with_ruling` | 2026-08-20 11:06 UTC |
| `299-agreement-unreachable-detector` | `249_agreement_unreachable_detector` (+ `249b`) | 2026-08-20 11:10 UTC |
| `300-coverage-views-service-role-only` | `290_coverage_views_service_role_only` (`20260826193359`) | registered 2026-08-26 |

Supabase keys on TIMESTAMP, not on the filename, so the applied order never depended on these
numbers — which is why the set can renumber freely and prod is untouched.

All five are additive and idempotent per hard rule 1, but they are **not** all the same kind of
change, and deployment/rollback impact differs:

- **296, 298, 299** — `CREATE OR REPLACE VIEW` only. No rows read or written.
- **300** — **access control**: revokes `SELECT` on the four coverage views from
  `anon`/`authenticated` and grants it to `service_role`. No data, but it changes who can read.
- **297** — **a data backfill.** It `UPDATE`s `vendor_branches`, filling `city`, `state` and
  `address` from the invoice payload and flipping the affected rows' `geocode_status` to
  `pending`. Additive because it only fills NULLs and never deletes — but it *does* write rows.
  Do not plan a rollback for this set as though nothing was touched.

For the current applied watermark, query it — never read a number from this document:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```
 **Not merged, not deployed.** For review status read the
PR — reviewers re-run on every push and findings land within minutes of one, so any verdict
written here is describing a commit that is no longer the head. (A review caught this line
claiming all reviewers were green while two were mid-run.)

Migration numbers have moved **sixteen** times as parallel sessions claimed numbers on main —
three times in 24 h (main took 289-291, then 292, then 293), and main took 294-295 on 09-22.
The set now sits at 296-300. The prod labels in the table above are unaffected by every one of
those moves. If you take 296-300 on main, move the **whole** set again, not just the colliding
files — the spend view must keep preceding the two migrations that read it. Two
`COMMENT ON VIEW` bodies in prod also cite migration numbers, so re-issue those and read them
back; the file alone is not the whole change.

Sixteen collisions was a **mis-scoped branch**, not bad luck: five contiguous numbers held
open for five weeks against a main that ships several a day. The sixteenth is the one that got
acted on — the schema moved into PR #12 on its own, so the seventeenth costs one rename in a
five-file PR instead of a rebase of the surface work. Do this on day one next time: land the
schema in its own short-lived PR the day it is written and let the surface work follow. Full
history in `docs/107`.

**The defect it documents:** Denver × SRS has live, in-territory agreements the office ring
cannot reach, so the coverage surface reads `priced_items = 0` while a separate line-level
path prices some of the same lines. Two pricing paths disagreeing is the finding.

Four items need a human — full detail in `docs/107`. Three are RULINGS only a human can give;
the fourth (4) is deferred engineering awaiting approval to build. The distinction matters:
a ruling unblocks work, approval starts it.
1. **Confirm `AMSDE` == `SBP-SOUTHDENVER`**, or approve repointing the agreement join to
   `vendor_branch_id` with mig 244's equivalence proof. **128 items.** This is the one that
   unblocks the defect.
2. Four branches (21, 39, 465, 684) geocoded but `geocode_status = 'pending'`, against a
   `geom IS NOT NULL` ⇒ `'ok'` invariant holding for 1,752 rows. Mig 297 demoted two; 39 and
   465 were touched by another process where `pending` may be a deliberate re-geocode
   request, so they were left alone rather than guessed at.
3. `v_office_vendor_branch` / `v_office_vendor_inheritance` are `anon`-readable on the same
   default grants mig 300 closed for the four coverage views. They predate this branch and
   are read by other surfaces, so locking them down needs a caller audit first.
4. **The third coverage state** (approval, not a ruling). `agreement_not_reaching` is a PROXY
   (`priced_items = 0 AND live_agreements > 0`), not a reachability proof — territory-has-a-book
   plus ring-prices-nothing has two causes. Measured 2026-09-16: 1 pair flagged, both its
   agreements genuinely unreachable, the second case 0 rows. NOT tightened, because a narrower
   predicate alone drops that second case into `no-agreement` and tells an operator to chase
   paperwork that already exists. The fix is an appended `agreement_prices_nothing` column, a
   `coverageLabelKind()` branch, a pill and tests. Mig 299's header carries the reasoning.

**Closed 2026-09-16 — the named-records question (`docs/108`).** Chris ruled: **keep all data**,
keep all git history, no replacement token, no CI check. It is business-card-grade information
and load-bearing for the property layer cake, so it is not PII for this brain and hard rule 2 is
not engaged. `docs/108` is now the standing answer rather than a worklist. **If a reviewer flags
it again — and they will, three have already — point at that document and do not open a
redaction pass.**

**Closed 2026-09-15 — ABC branch 326 (Topeka KS).** This branch raised it as a fifth item;
Chris ruled on it the same day and main shipped `291-rekey-abc-branch-326-topeka.sql`. The
Topeka row is re-keyed `topeka-KS-66618-1445` → `326`, the invoice FK is backfilled, and
`no_branch_resolved` is back to 0 rows / unresolved spend back to $27,566.56. The general
exposure was then largely closed by a second parallel session at 15:44 UTC (prod migration
`292_alias_slug_keyed_abc_branches`), which seeded numeric aliases for the slug-keyed rows.
Measured straight after: of ABC's 684 slug-keyed branches, **589 now resolve from a bare
invoice number and 95 still do not**. Reduced, not eliminated — each of those 95 repeats
branch 326 the first time it invoices. Watch `v_unresolved_branch_spend`; the query for the
95 is in the `docs/107` 2026-09-15 addendum.

**Update 2026-09-16.** Unresolved branch spend is now **$26,971.40 / 23 invoices**, down from
$27,566.56 / 26. That movement is *good news*, not a regression: ABC branch 305 (Sherman TX)
gained a `pricing_territory_office_id` and reads `covered`, so its 3 invoices / $595.16 left
the bucket — the question `docs/107` posed in August, answered. Two pieces of work met to do
it: mig 297 recovered Sherman's address from the invoice payload (making the row geocodable
at all), and a parallel session's prod `292b` carried the isochrone office onto the numeric
stubs holding an alias. The 684 / 589 / 95 split above is unchanged and re-measured the same
day. Re-measure before quoting any of it.

**Do not quote a chase-total dollar figure from this work.** It tracks live purchasing on
pairs that cannot yet be audited, so it moves with ordinary invoice flow (a credit memo took
it down 2026-09-02; an invoice took it up 2026-09-05). Run the query instead:
`SELECT office_name, vendor_slug, invoice_count, spend, agreement_status FROM v_office_vendor_gap_exposure WHERE needs_ruling ORDER BY spend DESC;`

## Verification Commands
1. `git status --short` — empty
2. `git rev-parse --short HEAD origin/main` — identical
3. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` starts with the HEAD SHA
4. `curl -s -H "Authorization: Bearer $TOK" "https://cc.proexteriorsus.net/api/accounting/kpi-pills"` (ob-accounting token per `/workos-agent-auth`) — `auditPendingCount` 0, `cmReceiptsPendingReview` 13
5. `curl -s -H "Authorization: Bearer $TOK" "https://cc.proexteriorsus.net/api/invoice-audit/invoice?invoiceNumber=2011009179-001"` — `disposition` "Processed — closed", `closedOut` true
6. `curl -s -H "Authorization: Bearer $TOK" "https://cc.proexteriorsus.net/api/invoice-audit/invoice?invoiceNumber=2014501859-001"` — `office` "Kansas City, MO"
7. SQL: `select count(*) from v_inv_processed_weekly` — 89; `select public.invoice_audit_reset('2011010454-001','t','agent','probe')` — `invoice_closed_out`
8. `cd app/command-center && npm run build && npm test` — build Complete!; 29 files / 354 tests when this was written (run `npm ci` first if `@fontsource/inter` is missing). Don't match that count: tests are added continuously, so a hardcoded number turns a green run into a false alarm. Read the runner's own summary.
9. Agent host: `ssh -i ~/.ssh/hetzner_office root@178.156.203.23 'cd /opt/openbrain/a-roofers-open-brain && git log -1 --format=%h'` — HEAD SHA

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from prior handoffs (see `docs/handoffs/archive/`), plus:
- Invoice Audit v2 (docs/81), office-inherited pricing, vendor/office/time/UOM silos (migs 119–122, 201, 208, 217)
- Friday WIP/AR board (mig 215), credit-memo claim sets, Agreement Builder + `agreement_gap_queue` (migs 229/229b)
- Materialised audit line + on-demand refresh (migs 272–276); item-aware supersession (277); weekly QB export set (278); vendor arm parity (279); negative-total/CM routing + per-vendor export (280)
- Cash family: 13-week cash flow, cash runway, fixed costs (mig 281)
- Runtime uptime board `/agents` with direct third-party pings (docs/109, 2026-09-11/12); Thursday WIP/AR pack on openpyxl
- Living design system at `/design-system` (docs/112, 2026-09-14)
- **This session (2026-09-15 → 09-22):** triage office-matview race + reconcile scope (289); June line reopen (290); branch 326 re-key + aliases (291); slug-keyed branch aliases + stub office carry (292/292b); June invoice closeout register + reset guard + "Processed — closed" label (293/293b + app); AccuLynx link INS- prefix + client-name fallback (294); weekly export set on the app's pending rule + NOT-paid/ledger guards (295/295b); site-sweep timeout fix + evergreen + design-system exemptions; job-report `started_at`; SRS September ingest + 71 PDFs; QB bank batch 7/31–8/12 rebuilt from the export log

### Architecture decisions
- `v_invoice_audit_line` is the definition of record; every reader goes through `mv_invoice_audit_line` (refreshed by pg_cron job 13 every 15 min and on demand via `request_matview_refresh` → job 15). The invoice-level view `v_invoice_audit_invoice` is still live and is the next materialisation candidate.
- The pricing arm resolves an invoice's PE office through `mv_invoice_pricing_office`, which itself resolves `abc_invoices.vendor_branch_id` — set AT INGEST through `vendor_branch_alias` (mig 243). Branch identity = alias row, never the branch-number string.
- Alex's triage refreshes `mv_office_agreement_versions` + `mv_invoice_pricing_office` before evaluating and fails closed without a pricing-office row (mig 289). It carries its own `statement_timeout` (300 s) and `lock_timeout` (240 s) because PostgREST's role-level limits are ~8 s.
- `invoice_audit_closeout` is a human register: `invoice_audit_reset()` refuses closed-out invoices; reopen scripts must check it first.
- "Pending" is defined once (app + `v_inv_processed_weekly`): undecided AND visible discrepancy.
- Credit status is derived from the amount, never written onto the vendor mirror. A memo naming an open request is matched whatever its date.
- Service tokens (Path A, `/workos-agent-auth`) cannot export QB bank files (`approval.decide`); use the dev server (Local Operator) on 4399 for previews, or rebuild from `qb_bank_export_log`.

### Design system
- Site: https://cc.proexteriorsus.net/design-system (docs/112). Inter 400/600/700/800 self-hosted via `@fontsource/inter`; body 14px; navy `#11133f` authority, flag red `#c22326` the one CTA, gold `#eaa221` attention, hunter green `#3b6b4c` status, smart blue `#0066cc` links. Pills: `.iv .pill-grey` is the closed-out pill. Ten-row long-list panes.

### Key invariants (never violate)
- Four pricing gates: vendor · office · time (item-aware supersession) · UOM; the audit refuses rather than converts; lowest-price tie-break — simulate before adding a book.
- A negative total is a credit memo. One QB export file per vendor. `register_exported_at` is one-way. `qb_bank_export_log` is one-way.
- A human cancellation or closeout is a decision — surface, never revive.
- Nothing external without a human. QBO is read-only. No secrets in code or chat.
- Every agent pass that writes decisions refreshes or verifies the matviews it reads first.
- Every change to a token, component, mode, motion or decision updates the design-system chapter in the same PR.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod Supabase | `rnhmvcpsvtqjlffpsayu` (shared by dev and live). For the applied watermark, query it — `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;` — do not read a number from this table. Main ships several a day, so any number written here is stale within hours; it read "through 287" while prod was past 292. |
| Deploy | Coolify → `cc.proexteriorsus.net`, builds `app/command-center/Dockerfile` from `origin/main` on push; verify `/healthz buildCommit`; Coolify host `178.105.220.14` (`~/.ssh/a_roofers_open_brain_ed25519`); Coolify has NO API tokens (Q4) |
| Dev | port 4399 via `.claude/launch.json` `command-center`; worktrees need `npm ci` in `app/command-center` (the main checkout needed it too — `@fontsource/inter`) |
| Agent host | Hetzner `178.156.203.23` (`~/.ssh/hetzner_office`), checkout `/opt/openbrain/a-roofers-open-brain` kept at `origin/main`; units report to the board via `runtime_job_report` |
| Nightly ABC | `scripts/abc-nightly-sync.sh` 03:30 ET: catalog → invoice ingest (10-day window) → PDF backfill → Alex triage |
| pg_cron | job 13 (15 min): four matviews + CM claims sync + reconcile; job 15 (1 min): on-demand refresh requests; job 18: order↔AccuLynx matview |
| Vendor ingest | `integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=srs\|qxo --file=<detail.csv>` (runs triage after); PDFs: `scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs --vendor=srs --dir=<folder>`; SRS PDFs live in Dropbox `PE_Open_Brain/Lucinda - PE Accounting/SRS Invoices/Invoices` |
| Weekly QB batch | `node scripts/build-inv-processed-weekly.mjs` (Tuesdays, prep-only; `--stamp` after Lucinda loads) → `exports/inv-processed-<date>/` |
| QB bank file | `/api/accounting/qb-bank-csv?vendor=<slug>&mode=preview\|export&since=YYYY-MM-DD` — needs `approval.decide` (dev server / human); stamped rows live in `qb_bank_export_log` |
| Runtime board | `/agents` (docs/109); Better Stack watches the site only; third parties by direct ping |
| Agent auth to live site | Bearer service tokens on `/api/*`; skill `/workos-agent-auth` |
| Slack | per-agent bots per `/slack-agents`; all dev traffic → `#pe-cc-dev-team`; this session's Slack connector could not see the PE workspace |
| Linear | PE-CC-DevTeam — MCP unauthenticated all session; tickets listed above |
