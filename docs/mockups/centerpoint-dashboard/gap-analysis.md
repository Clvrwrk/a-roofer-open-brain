# Gap analysis: CenterPoint dashboard mockup against the data we have

Every figure in the mockup was read from the live PE Supabase on 2026-11-17 through the read layer: `mv_work_job_money`, `v_work_job_visits`, `v_work_labor_day` and `v_work_invoice_qbo_recon` (migrations 343–347, docs/78). The CenterPoint test company and draft invoices are excluded. Customer and staff names are replaced with numbered aliases in this file and the page.

## What the data supplies today

| Panel | Source | Status |
| --- | --- | --- |
| Billed and collected by month | `work_invoices.invoice_date`, `work_payments.received_date` | Ready. Totals tie: billed $943,674 − open $247,203 = collected $696,471 |
| Receivables by age, largest balances | `mv_work_job_money.outstanding`, `oldest_open_invoice_date` | Ready, aged from invoice date (see gap 1) |
| Closed, never billed (149) | `mv_work_job_money` status `closed`, `billed = 0` | Ready. Needs a rule for which of these are warranty or no-charge (gap 4) |
| CenterPoint against QuickBooks | `v_work_invoice_qbo_recon` | Ready |
| Billing by work type, state, customer | `mv_work_job_money` | Ready |
| Gross margin 57.4% | `invoice_profit / billed` | Partial: only 467 jobs carry invoice cost |
| Ticket flow, ready to invoice, not scheduled | `work_jobs.status`, `status_changed_at` | Ready |
| Visits by week and day | `v_work_job_visits.visit_start_date` | Ready |
| Step times (ticket → visit → invoice → paid) | `created_at_src`, `visit_start_date`, invoice and payment dates | Ready |
| Crew time | `v_work_labor_day` (clock hours and job hours side by side, never added) | Ready |
| Sales book, win rate, quote age, by owner | `work_jobs` book `sales`, `price`, `opportunity_type`, `profile_source_id` | Ready |

## Gaps

1. **No due dates.** `due_date` is null on every CenterPoint invoice, so "past due" cannot be shown; ageing runs from invoice date. Fix: agree payment terms per customer, or default terms in the read layer.
2. **No invoice numbers.** `number` is null on 484 of 486 invoices. The QuickBooks match uses the job number instead, which works.
3. **Payment method** is "Other" on 362 of 363 payments, so no split by check, card or ACH.
4. **149 closed jobs with $0 billed** ($215,403 priced). Some are surely warranty, callbacks or inspections. CenterPoint has no flag for that, so the dashboard cannot yet tell revenue leaks from no-charge work.
5. **Roles.** Only 4 of 25 staff profiles carry a position. The crew and salesperson tables show a dash for the rest.
6. **Visit end time and crew size.** CenterPoint has a visit start time only and one lead technician per job, so utilisation comes from clock-ins, not the schedule.
7. **Sales to service link.** The 9 sold deals ($995,199) carry no link to a service ticket or invoice in the work tables, so "sold, not yet started" cannot be shown.
8. **No next-step dates on quotes.** The sales book has no follow-up date, so "follow up" can only sort by age.
9. **Property spine.** 570 of 680 service properties are not linked to a property, so there is no map or repeat-visit view per building.
10. **Data freshness.** CenterPoint is pulled once a day (19:45 CT) and the money view refreshes hourly. The dashboard should show the pull time, as the mockup does.
11. **Offices.** CenterPoint work has no PE office. F-08 needs every aggregate scoped to one office; the mockup treats all CenterPoint work as the one "Commercial service" office decided for PM on 2026-11-13. Confirm that holds for the Command Center.

## Decisions for Chris

1. Where the page lives: Command Center (as drawn) or the CRM.
2. Whether every KPI action should open an existing list (Friday WIP/AR, Sales Pipeline, PM board) or a new CenterPoint list.
3. Who sees the Executive view, since it shows customer concentration and margin.
4. Payment terms to use for ageing until CenterPoint sends due dates (gap 1).
5. Whether to add a ds chart pattern (G-04) now, so this and later dashboards share one.
