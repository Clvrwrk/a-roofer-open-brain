# 85 — Friday WIP/AR live board, Thursday pack, Maya email (2026-08-06)

The AR_WIP_Pack workbook's `11_Friday_Meeting` sheet becomes a **living surface**:
a Supabase master table rebuilt nightly from the AccuLynx/ABC/QBO mirrors, an
editable Command Center tab, a Thursday-morning Excel pack, and a one-button
Maya email. Plus the CPA's accrual (earned-revenue) inputs with date cutoffs.

```
AccuLynx (pg_cron hourly)──┐
ABC Supply (03:30 ET)──────┼──► mirror tables ──► refresh_wip_ar_master()      ┌─► /accounting/friday-wip (live board, inline edits)
QBO (Thu 20:00 CT)─────────┘        (pg_cron nightly 04:45 CT)                 ├─► Thursday 06:00 CT: build_pack.py ─► wip-packs bucket ─► Download button
                                        │                                      └─► "Email via Maya" ─► AgentMail ─► Lucinda/Chandler/Tabitha/Chris (internal only)
                              wip_ar_master (mig 215)
                              computed cols ← nightly · editable cols ← humans, preserved
```

## What shipped (mig 215 + this branch)

| Piece | Where |
| --- | --- |
| Master table `wip_ar_master` (one row per ledger job, sheet-11 columns + accrual + editable) | `schemas/cleverwork-roofer/215-friday-wip-ar-master.sql` |
| Edit audit log `wip_ar_master_updates` | same |
| QBO job-cost views `v_qbo_job_cost_lines` / `v_qbo_job_costs` | same |
| `refresh_wip_ar_master(p_asof)` — nightly rebuild, human edits preserved | same; pg_cron `wip-ar-master-nightly` 10:45 UTC |
| `roll_wip_ar_week()` — Thursday HIT/MISS scoring + date roll | same; pg_cron `wip-ar-week-roll-thursday` Thu 10:30 UTC |
| `wip_accrual_snapshot(p_cutoff)` — CPA cutoff inputs | same |
| Board page (grouped by location, yellow columns save inline) | `app/command-center/src/pages/accounting/friday-wip.astro` + `src/lib/friday-wip.ts` |
| APIs: board JSON · row update · accrual CSV · latest pack · Maya send | `src/pages/api/accounting/friday-wip*` |
| Thursday pack build + upload to `wip-packs` storage bucket | `scripts/wip-pack-thursday.sh` + `deployment/remote/systemd/openbrain-wip-pack-thursday.{service,timer}` |

**Validation (first refresh, 2026-08-06):** 115 ledger jobs; Billed AR Σ Q =
**$777,021.55 — exactly the workbook's number**; georgia $810,521.36 to the
penny; other locations differ only by the week of live movement since the
2026-07-29 pack. 100/115 jobs already carry QBO costs-incurred ($1.15M).

## Data doctrine (unchanged, now enforced in SQL)

- N = `acculynx_job_financials.balance_due` (job balance) · Q = Σ non-void
  `acculynx_invoices.balance_due` (**the** receivable) · unbilled = N−Q
  (backlog, never AR) · P = Σ `total_price` · R = P−Q.
- Locked buckets (docs/75 / PEC-100) reproduced in `refresh_wip_ar_master`;
  ledger population = any open balance **including credit balances**
  (0_EXCEPTIONS check 18), closed-clean excluded.
- Rows that drop off the ledger are flagged `in_ar_population=false`, never
  deleted (hard rule 1).
- Human edits (`expected_invoice_cash_date`, `expected_paid_full_date`,
  `collected_since`, `notes`) live only in `wip_ar_master`, are audit-logged,
  and survive every refresh. Thursday roll copies expected-paid → prior and
  scores HIT (collected=Y) / MISS (date passed, not collected).

## Weekly cadence

1. **Wed night/Thu early:** ABC 03:30 ET · AccuLynx hourly · QBO ran Thu 20:00 CT prior week (QBO also refreshes every Thursday evening).
2. **Thu 05:30 CT:** `roll_wip_ar_week()` (pg_cron) scores last week's HIT/MISS.
3. **Thu 06:00 CT:** agent host builds the full pack (`build_pack.py --audience ar-wip`) and uploads `AR_WIP_Pack_<date>.xlsx` to the `wip-packs` bucket → **Download Thursday pack** button serves it.
4. **Fri meeting:** work the board at `/accounting/friday-wip`; every date/note saves live to `wip_ar_master`.
5. **Any time:** **Email via Maya** sends the summary + 7-day pack link from `ob-accounting@agentmail.proexteriorsus.net` to `FRIDAY_WIP_RECIPIENTS` — internal addresses only, enforced by `outbound-guard.ts`; humans forward externally.

## CPA accrual (cash → accrual transition) — findings

The CPA needs, per job: **total estimated costs (adjusted for change orders)**,
**costs incurred to date**, and **date cutoffs** on billed AR and costs.

**1. Costs incurred to date — WE HAVE THIS (QBO).** QBO bill/purchase expense
lines carry `CustomerRef` sub-customer names that end in the PE job number
(`"Shores, Ridge & (342):MC-68"`). `v_qbo_job_cost_lines` parses the job key and
keeps `txn_date`, so costs are cutoff-capable. Sampled tagging discipline:
bills ~96% job-tagged, purchases ~50%. **Action for Lucinda:** every job cost
entered in QBO must carry the Customer:Job — the untagged purchase lines are
the only leak. ABC invoices arrive as QBO bills, so ABC material cost rides
this same path (the direct ABC↔AccuLynx match view only covers 179/1,073
invoices — PO discipline, PEC-105 — so QBO is the authoritative cost source).

**2. Total estimated costs — GAP.** AccuLynx mirrors carry
`worksheetSectionTotals` (worksheetTotal, changeOrderTotal, supplementTotal…)
which is **price-side**, not cost-side. Line-level estimated costs live behind
the worksheet **detail** endpoint, already linked in our own mirror rows:
`acculynx_job_financials.raw->'worksheet'->>'_link'` →
`GET /api/v2/financial/{id}/worksheet`. **Where the data lives:** AccuLynx
worksheet line items (material/labor cost columns), *if* estimators fill cost
fields. **To close:** extend the AccuLynx sync (edge function
`acculynx-sync` / read-sweep) to walk that endpoint into a new
`acculynx_worksheet_lines` table, then populate `wip_ar_master.est_total_costs`
(column and `est_costs_source` already exist). If the cost columns turn out
empty in AccuLynx, fallback is a budget column maintained per job (QBO
Estimates, or a board column) — decide after one sample pull.

**3. Date cutoffs — SHIPPED.** `wip_accrual_snapshot(p_cutoff)` returns per-job
`billed_to_cutoff` (Σ non-void invoices with `invoice_date ≤ cutoff`) and
`costs_incurred_to_cutoff` (Σ QBO cost lines with `txn_date ≤ cutoff`), plus
contract + changeOrderTotal. Surface: **Accrual snapshot CSV** button
(`/api/accounting/friday-wip/accrual.csv?cutoff=YYYY-MM-DD`). Caveat: billed AR
*balance* as of a historical date needs payment history we don't mirror from
AccuLynx (no payment table; docs — Collected≈P−Q). The CPA's earned-revenue
calc needs billed-to-date + costs-to-date, which we now have; historical AR
aging as-of stays a QBO report.

## Config / follow-ups

- **Env (Coolify):** `FRIDAY_WIP_RECIPIENTS` (comma list — Lucinda, Chandler,
  Tabitha, Chris; internal domains only), optional `FRIDAY_WIP_SENDER_INBOX`
  (default `ob-accounting@agentmail.proexteriorsus.net`), `AGENTMAIL_API_KEY`
  must be present. **Tabitha's address is unknown to the repo — needs Chris.**
- **Agent host:** install + enable `openbrain-wip-pack-thursday.timer`
  (copy both unit files, `systemctl daemon-reload && systemctl enable --now
  openbrain-wip-pack-thursday.timer`).
- **PEC-101** deposit fields still make the two Approved buckets provisional
  (same as the workbook).
- Worksheet-detail cost mirror (gap #2) — propose as the next PEC issue.
