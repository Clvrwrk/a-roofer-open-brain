# CashFlow / WIP — Executive Command Center (locked decisions)

**Date:** 2026-07-26  
**Linear initiative:** [PE CashFlow / WIP — Executive Command Center](https://linear.app/cleverwork/initiative/pe-cashflow-wip-executive-command-center-9863b9a51d2f)  
**Product project:** CashFlow / WIP Executive Surface  
**Spreadsheet deliverable (separate):** [PEC-99](https://linear.app/cleverwork/issue/PEC-99/chandler-wip-v1-pack-acculynx-stages-qb-cash-read-only) — `outputs/chandler-wip-v1/`  
**QB read-only:** [PEC-98](https://linear.app/cleverwork/issue/PEC-98/qbo-production-read-only-guardrails-for-pe-cc-dashboard-native-oauth) / `docs/74-…`

## Separation

| Deliverable | Where | Status |
| --- | --- | --- |
| Chandler WIP **spreadsheet** v1 | PEC-99 + `scripts/build-chandler-wip-v1.py` | Draft shipped |
| Interactive **CashFlow/WIP** on CC | This initiative / Executive nav | Spec locked; build next |
| Weekly **QB historical mirror** | Supabase, Thu refresh → Fri AR | In initiative |

## Operating stages (dashboard — exclusive)

AccuLynx milestones may lag; **dashboard stages move independently** (decision #7). Ops stage changes are **human-gated** (#2).

| Dashboard bucket | Meaning |
| --- | --- |
| **Lead** | Top of funnel (AccuLynx Lead) |
| **Estimating** | AccuLynx Prospect stays estimating — **renamed** our prior “Prospect = signed” bucket (#1) |
| **Contracted – awaiting deposit** | Signed / accepted; deposit not collected (name TBD in UI copy) |
| **Approved – deposit invoiced** | Proposal accepted, final contract signed, deposit invoice generated; track anticipated collection + **days at 100% AR outstanding** after deposit invoice (#3) |
| **Approved – deposit collected → WIP** | Deposit cash posted; expenses realizing (ABC + misc by Job #) |
| **Approved – work complete → final sign-off** | Production done; final sign-off; moves toward supplements & final collections; 2nd cashflow gate (est. ACV/client payment date) |
| **Invoiced** | All revenue collected; final expense trail + margin review (payroll/commissions) |
| **Closed** | All revenue + expenses + final payroll (Ops checklist in AccuLynx) (#10). Toggle: Active WIP only; Closed only if **$0 AR**, else **Closed w/AR** (#15) |

Exclusive buckets: yes, a job can sit in dashboard WIP-supplement while AccuLynx still shows Invoiced (#4).

## Cashflow gates & memory

- Anticipated deposit / ACV dates: **Operations** (#5).  
- Because AccuLynx does not retain dwell history, maintain a **brain memory log** of stage enter/exit + cashflow target dates for standard dwell-time analytics (#5).  
- Record **deposit-posted timestamp** when deposit hits to measure invoice→deposit delay (#3).  
- Missed cashflow dates: nested company ↔ location table — Sales Manager, Salesperson, Location, Job #, Client, Target Date, Days since target, Estimated Revenue (#14 UI).  
- 72/48/24 reminders → **backlog** (#6).  
- Lead win-ratio pack for Sales Management meeting → **backlog** (#8); when built, split insurance / retail / commercial / multi-family / service (#9).

## Expenses (ABC-first)

- All ABC spend tied to **Job #**; plan misc expenses → Job # / Job ID (#16).  
- Credit memos = **separate line**, not silent net (#17).

## QuickBooks mirror (Thursday)

- Full historicals from **company inception** (#13).  
- Entities: CompanyInfo, CoA, TB/P&L/BS/CF, AR/AP aging, customers, vendors, invoices, payments, bills, bill payments, journals, classes, **plus full register history** for all banks, CCs, LOCs (deposits, CMs, purchases/expenses) (#11).  
- Production **read-only forever** (#12 / PEC-98).  
- Cadence: pull Thursday → Friday AR meeting.

## UI

- Route under Executive: `/executive/cashflow-wip` (name TBD).  
- Formatting/design follow [`/executive/pipeline`](https://cc.proexteriorsus.net/executive/pipeline) (#14).  
- Top-level **company buckets** always visible; nested **by location**.

## AccuLynx field gaps (still required)

See prior gap list; critical adds: Sales Manager, deposit invoice/posted dates, anticipated deposit & ACV collection dates, final sign-off, Ops close checklist, contract-signed signal if distinct from AccuLynx Prospect.
