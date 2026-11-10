---
name: srs-intake
description: >
  Run the manual SRS invoice batch end to end: ingest the Billtrust portal CSV, check
  every line against its invoice PDF, link the PDFs, run the invoice audit, prepare
  credit memo candidates, and build the SRS QuickBooks draft. Credentials come from
  1Password through the `op` CLI. Triggers on "/srs-intake", "SRS intake", "SRS
  invoice ingest", "ingest the SRS invoices", "new SRS CSV", "SRSICORP csv", "audit the
  SRS invoices", "SRS credit memo prep", "SRS to QBO draft", "SRS QB file". Use this
  instead of re-deriving the process from docs/89, docs/80 and docs/81.
---

# /srs-intake — manual SRS invoice batch

SRS has no API feed yet. Invoices arrive as one Billtrust portal CSV plus one PDF per
invoice, dropped in the accounting Dropbox folder. This skill is the whole routine for
that batch. Background and current gaps: `docs/89-srs-vendor-state-of-the-world.md`.

## Inputs

- The CSV: `SRSICORP_S036198_<timestamp>_0.csv`.
- The PDFs: `invoice_<INVOICE_NUMBER>.pdf`, normally in the same folder as the CSV.

The usual folder is `PE_Open_Brain/PE-Accounting-data/SRS Invoices/Invoices/` in the
AIA4 Dropbox. If the user names files, use those. If they only say "run the intake",
take the newest `SRSICORP_*.csv` in that folder and say which one you picked.

## Run it

```bash
bash scripts/srs-intake.sh --file="<path to the CSV>" --preflight-only
```

Read the preflight. If it passes:

```bash
bash scripts/srs-intake.sh --file="<path to the CSV>"
```

| Flag | Use |
|---|---|
| `--pdf-dir="<folder>"` | PDFs are somewhere other than the CSV's folder |
| `--preflight-only` | Checks only. Writes nothing |
| `--report-only` | Resume after an interrupted run: skips ingest and PDF upload |
| `--skip-pdfs` | No PDFs for this batch |
| `--skip-qb` | Do not rebuild the QuickBooks draft files |

The run takes three to five minutes. Most of that is the audit view refresh.

## Credentials

`scripts/srs-intake.sh` wraps the run in `op run --env-file=config/srs-intake.env.tpl`.
The Supabase service key is resolved from 1Password into the child process only. It is
never written to disk and never printed.

- Item: `Supabase Service Role - PE_CC_DEV`, vault `Shared with Grok Bot`, field `credential`.
- Do not use the items named `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` in that vault.
  They belong to a different Supabase project. The script compares the key's project to
  the URL and stops if they differ.
- Do not read, print or copy the key, and do not fall back to the repo `.env`. If `op`
  cannot resolve the item, stop and tell the user.
- To check which project a key belongs to, decode the JWT payload and print only the
  `ref` claim. Never print the value.

## What the script does

1. **Preflight.** Confirms the key reaches the brain. Every document must reconcile:
   lines equal SUB-TOTAL, and SUB-TOTAL plus delivery, freight, restock and tax equals
   TOTAL DUE. Every branch code must resolve to a branch. Every document is compared to
   its PDF line by line. Any failure is a blocker and nothing is written.
2. **Ingest.** `integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=srs`, the one
   writer. Re-runs are safe: line ids are deterministic, so audit decisions survive. It
   runs the No-Price triage itself.
3. **PDFs.** `scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs` uploads every PDF in
   the folder and links it. Also safe to re-run.
4. **Audit.** Queues a refresh of `mv_invoice_audit_line` and waits for pg_cron job 15 to
   service it, then calls `credit_memo_claims_sync_all()` and `credit_memo_reconcile()`.
5. **Report.** Writes `exports/srs-intake-<date>/REVIEW.md` and `report.json`.
6. **QuickBooks draft.** `scripts/build-inv-processed-weekly.mjs`, prep only, into
   `exports/inv-processed-<date>/`. One file per vendor.

`exports/` is git-ignored and a worktree can be removed. After the run, copy both export
folders to the main checkout's `exports/`.

## When the script stops

| It says | Do this |
|---|---|
| `branch code X is unknown` | Compare the street address printed on the invoice with `vendor_branches` for SRS. Only on an exact street match, insert a `vendor_branch_alias` row (`status='resolved'`, `source='vendor_document'`, note the invoice and the match), then ask the user to confirm it. No match: stop and ask. Never guess. An unknown office means No-Price. |
| `lines … != SUB-TOTAL` or a PDF line mismatch | Do not ingest. Show the user the exact rows. The CSV and PDF disagree or the export is damaged. |
| `…: TIMED OUT over the API` | Migration 342 is not applied. Run `select public.<function>();` through the Supabase connector's SQL tool, then re-run with `--report-only`. |
| `mv_invoice_audit_line was not refreshed within 6 minutes` | Check pg_cron job 15 (`service-matview-refresh-requests`). Re-run with `--report-only` once it has run. |
| `The key does not reach the prod brain` | The 1Password reference is wrong or `op` is signed out. Fix that. Do not try another key. |

## After the script: the review

The script finds candidates. It records no decision. Read `REVIEW.md`, then check these
before reporting.

**Credit memo candidates**
- *Over agreement (agreement-backed)*: the only kind the packet generator accepts.
- *Price moved, no agreement*: SRS billed the same item, unit and branch for less in the
  prior 45 days. Not a claim until a person says so. Check whether SRS substituted a
  product for one on the agreement; say so if it did.
- *Unit of measure looks wrong*: the same unit price appears under two units. Usually a
  bundle keyed as a piece. Ask what was received.
- Never turn a credit memo document into a claim. Credits reconcile against their
  original invoice.
- Compare prices in the price unit only (`price_per_uom`), never across units. Silo
  rules hold: vendor, office, time, unit. See `docs/105` and `docs/46`.

**Credits received**
- A credit whose pre-tax amount equals the request's expected credit satisfies it. The
  reconcile compares tax-inclusive to pre-tax, so it holds these for review.
- A credit that names no invoice is parked on the nearest open request. Say it does not
  belong there.

**QuickBooks draft**
- Never pass `--stamp`. Stamping happens only after accounting confirms the load.
- Rows carried over from earlier batches stay in the file until stamped. When the CSV
  has a statement block, the report says which carried-over rows SRS no longer shows as
  open. Tell the user to check QuickBooks for those first.
- Invoices with an undecided over-agreement line are held out. Credits are excluded.
- QuickBooks Online itself is read-only (hard rule 13). The draft is a CSV for
  accounting to load.

## Never do from this skill

- Record an audit decision, dispute a line, or approve a line for a person.
- Create, approve or send a credit memo request, or mark a receipt reviewed.
- Send anything to SRS, or to anyone, by email or Slack.
- Stamp the register export.
- Write to QuickBooks.

## Report to the user

Lead with what is done and what is not. Then, in this order: counts and totals;
anything the preflight warned about (unknown branch, a PO that is not a job number,
a missing PDF); the audit counts; each candidate as a yes or no question with its
amount; each received credit with a suggested disposition; the QuickBooks draft with
new and carried-over rows. Link the files. Finish by updating `docs/89` if SRS state
changed, and log the batch in today's `context/memory/` file.
