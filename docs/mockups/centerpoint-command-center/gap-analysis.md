# Gap analysis: CenterPoint on three Command Center screens

Each thing the mockups show is marked against what the data can supply today (2026-11-13).

- **Supported** — `mv_work_job_money` or a view from migration 345 already supplies it.
- **Needs new data** — the source has it, but it is not projected or stored yet.
- **Cannot fill** — the source does not have it. The mockup shows a dash, never a made-up value.

Every figure in the mockups was read from the live database on 2026-11-13. None is invented. Customer names are replaced by numbered aliases in the mockup files; the built screens would show the real `company_name`.

## Friday WIP/AR (`friday-wip.html`, `friday-wip-columns-open.html`)

| Shown in the mockup | Status | Source or what is missing |
| --- | --- | --- |
| `commercial_service` group: 109 jobs, billed and total $257,539 | Supported | `mv_work_job_money` where `outstanding > 0` |
| Job # | Supported | `number` |
| Job # link opens the job in CenterPoint | Needs new data | The CenterPoint job URL pattern is not recorded anywhere |
| Client | Supported | `company_name` |
| Status | Supported | `display_status` (all 109 are Invoiced) |
| Rep | Needs new data | The job's `profileId` is stored; the profile name is in `cp_resources` (profiles) but not projected. 507 of 1,008 jobs have no profile at all |
| Days in Status | Needs new data | The mockup shows days since the oldest unpaid invoice, which is supported. The true status date (`latestStageTransitionedAt`) is in `cp_resources` but not projected |
| Action (COLLECT) | Supported | Every row has an unpaid, non-draft invoice |
| Contract Value | Supported, with a caveat | `price`. On service tickets the price can be lower than what was invoiced |
| Invoiced Total, Monies Collected, Balance Due | Supported | `billed`, `collected`, `outstanding` |
| Expense Realized | Supported, different meaning | `invoice_cost` is the cost on the CenterPoint invoice. For AccuLynx jobs this column is QuickBooks bills. The column tooltip says so |
| Est Exp Outstanding | Cannot fill | A service ticket has no budget |
| Office margin control (AVG GM%) | Cannot fill | Same reason; the control does not appear on this group |
| Expected invoice/cash date, To Collect, Expected paid-in-full, Notes | Needs new data | These save to `wip_ar_master`, whose key is the AccuLynx job id, and the save route rejects any other id. They need a place to be stored for a CenterPoint job |
| KPI: Billed AR, Total job balance, Critical AR Tier 1 include CenterPoint | Supported | Sum of `outstanding`. **Rule to confirm:** every unpaid CenterPoint invoice counts as Tier 1 (delivered, invoiced, unpaid) |
| KPI: CenterPoint ≠ QuickBooks (4 open jobs, 46 job numbers) | Supported | `v_work_invoice_qbo_recon` |
| Cash map: Undated grows to $1,848,779, dated share falls to 56% | Supported | Follows from the rows having no expected date yet |
| Office filter value `commercial_service` | Supported | One fixed value |
| Rep filter | Cannot fill for this group yet | See Rep above |
| Download pack and Accrual snapshot CSV include CenterPoint | Needs new data | Both are built from `wip_ar_master` only. Not shown in the mockup |
| Tier 2 (never invoiced), Unbilled contract | Not changed | 15 completed tickets have no invoice, but their price is $0, so there is no amount to show |

## 13-Week Cash Flow (`cash-flow.html`)

| Shown in the mockup | Status | Source or what is missing |
| --- | --- | --- |
| Undated pool grows by the CenterPoint receivables | Supported | $257,539 added to the pool at the same weekly rate the sheet already uses |
| New line: "of which commercial service (CenterPoint)" | Supported | Same arithmetic, shown apart |
| Total receipts, net cash flow, beginning and ending cash, weeks of cash on hand | Supported | Recalculated from the line above |
| KPIs: Ending cash week 13, 13-week low, AR dated by value (62%) | Supported | Recalculated |
| Undated AR list includes CenterPoint jobs (182 jobs, $1,634,257) | Supported | `mv_work_job_money` |
| Dated AR (WIP board) includes CenterPoint once the meeting dates it | Needs new data | Depends on storing expected dates for CenterPoint jobs (see Friday board) |
| Workbook download includes the new line | Needs new data | The workbook builder reads `wip_ar_master` only |

## Sales Pipeline (`pipeline.html`)

| Shown in the mockup | Status | Source or what is missing |
| --- | --- | --- |
| `commercial_service` location row | Supported | Counts and sums by `book` and `display_status` |
| Stage mapping | **Rule to confirm** | New Lead → Leads. Quoted and Pending → Prospects. Sold and open tickets (Ticket Created, Scheduled, In Progress, Completed) → Approved. Invoiced → Invoiced. Closed Out → Closed. Dead counts only in the close-rate denominator |
| Close rate 66% | Supported | (Approved + Invoiced + Closed) ÷ all, the screen's own definition |
| Margin 57% · 470/612 | Supported | (billed − invoice cost) ÷ billed, on invoiced and closed jobs that carry a cost |
| AR $257,539 | Supported | `outstanding` |
| KPI: Pipeline value $4,522,531 | Supported | Price of Quoted and Pending leads. It is far larger than every other figure on the screen and deserves a look before it ships |
| KPI: New leads 82 (20 commercial) | Supported | Leads created this month |
| KPI: AR outstanding, Total outstanding AR | Supported | `outstanding` |
| Monies collected this week | Supported | `work_payments` in the last 7 days |
| Stage chart: Invoiced bar gains the open CenterPoint invoices | Supported | Same figures |
| KPI: Sold value, Jobs sold, Close rate split, Average ticket, Signed (7d), Margin split | Needs new data | These need the date a lead was sold (`leadSoldAt`), which is in `cp_resources` but not projected. Left unchanged in the mockup |
| Trailing 7 days stage moves | Needs new data | Need stage-change history. Only the latest change date exists in the source |
| Rep leaderboard | Cannot fill yet | See Rep above |
| Location filter value `commercial_service` | Supported | One fixed value |
| Type filter (Residential / Commercial / Property Management) | Needs a decision | Every CenterPoint job would count as Commercial |
| Job list inside the expanded row | Needs new data | The drill-down reads AccuLynx tables only. Not drawn in the mockup |

## What the build would need before it starts

1. **Somewhere to save the meeting's entries for a CenterPoint job** (expected dates, amount to collect, notes). This is the largest gap: without it the group is read-only.
2. **Three more fields projected from `cp_resources`:** the rep's name, the status-change date, and the sold date.
3. **The CenterPoint job URL pattern**, so the job number can link out.
4. **Three rules confirmed by Chris:** the stage mapping, whether unpaid CenterPoint invoices are Tier 1, and whether every CenterPoint job is "Commercial" in the Type filter.
5. **The pack, the accrual CSV and the cash-flow workbook** read `wip_ar_master` only and would need the second source.

## Figures behind the mockups

| Figure | Value |
| --- | --- |
| Open CenterPoint jobs | 109 |
| Open balance on those jobs | $257,538.65 |
| Net receivable across all jobs | $256,786.48 (two jobs are overpaid by $752.17 in total) |
| Aging of open balance | 0–30 days $168,360 · 31–60 $62,927 · 61–90 $2,958 · over 90 $23,294 |
| By state | TX $179,487 · GA $75,254 · OK $2,798 |
| Leads | 28 new · 146 quoted · 6 pending · 9 sold · 166 dead |
| Service tickets | 14 created · 5 scheduled · 4 in progress · 15 completed · 115 invoiced · 497 closed out |
