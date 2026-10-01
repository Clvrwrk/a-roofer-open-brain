# A3: Labor invoices by job (CRM Job profile, Money tab)

Proposed by: Chris (Phase 4 of the CRM profile pages, CRM `docs/delivery/PROFILE-PAGES.md`)
Date: 2026-10-01
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-01-crm-labor-invoices-by-job.md

---

## 1. The problem (measured)

- **Task being performed today:** finding what a job paid its installers and subcontractors. The Job profile shows material invoices (ABC, SRS, QXO) but "Labor invoices: Not connected". People open QuickBooks by hand, or read sub-crew PDFs by eye (`labor_observations`, `extraction_method='visual_pdf_read'`: 30 observations, 7 jobs).
- **Size of what is hidden (measured, QBO mirror, 2026-10-01):** labor accounts on job-tagged lines total **$9.46M of $25.03M job cost (~38%)** across **963 of 1,092 jobs** and 205 payees — COGS:Subcontractors $9.15M (2,933 lines), Contract labor $0.14M, Cost of labor $0.17M. $3.53M of it was paid by check or card with no bill.
- **Frequency / time per occurrence:** **not measured.** *Estimate for the math:* 30 lookups a week across PMs and accounting × 5 minutes.
- **Error rate / cost:** not measured; the known failure is a labor overrun noticed only when the job closes.
- **Total monthly human cost (estimate):** 30 × 5 / 60 × 4.3 = 10.75 h × $65 = **$699/month**.

## 2. Root cause (5 Whys)

1. Why manual? — Labor is not separated from other job cost anywhere a PM looks; the Friday WIP board's "Expense Realized" sums every account.
2. Why not automated? — Vendors carry no type in QBO (`VendorTypeRef` absent on all 1,497 vendors), Class is unused (0 lines), and the 1099 flag is not a labor flag (Sales Commissions, $4.04M, also go to 1099 vendors).
3. Why are existing tools inadequate? — QBO reports labor by account, not per job on the CRM; AccuLynx worksheet labor columns are empty (docs/85, docs/102).
4. Why not a priority until now? — The Job profile is the first per-job money surface.
5. Why now? — The Money tab shows materials but not labor, so the job looks cheaper than it is.

## 3. Proposed solution

- **Receiving agent:** none; a read-only Command Center view plus a CRM Money-tab panel.
- **What it does:** a CC view `v_job_labor_invoices` over `v_qbo_job_cost_lines` marks a line as labor by **GL account** (Subcontractors, Contract labor, Cost of labor), with an optional Accounting-maintained override table for the 47 payees that post to both labor and non-labor accounts. The CRM Money tab lists the job's labor bills and payments (payee display name, date, doc number or QBO transaction id, amount) and shows labor **as a breakdown of job cost, never added to it**. A companion view counts job-tagged lines that are unclassified or point to a missing vendor (silent-NULL rule).
- **Prerequisite (a defect, fix regardless of this A3):** the QBO mirror holds active vendors only (`select * from Vendor` without `Active in (true,false)` in `mirror-backfill.mjs`), so **$4.41M of Subcontractor lines (1,338) point to a vendor missing from the mirror**. Read-only fix: pull inactive vendors too.
- **Integration required:** none new; the QBO mirror is read-only (hard rule 13) and nothing writes QBO.
- **Trust tier:** `evidence` for the GL-account rule (derived, reproducible); `instruction` for override rows Accounting confirms.

## 4. The new state (projected)

- **Time per occurrence:** ~0.5 minute (open the job's Money tab).
- **Error rate:** labor visible per job as soon as QBO is mirrored (nightly).
- **Agent cost:** ~$0 (SQL view).
- **Human review:** Accounting reviews the override list and the unclassified count monthly (~15 minutes).

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | $699 *(estimate)* |
| Y, new monthly cost | 30 × 0.5 / 60 × 4.3 × $65 + 0.25 h × $65 ≈ **$86** |
| Z, one-time build | ~24 engineering hours × $65 ≈ **$1,560** (view + override table + unclassified view, mirror fix, CRM reader + panel, tests) |
| Z/12 | $130 |
| **ROI = X / (Y + Z/12)** | **699 / 216 ≈ 3.2** |
| Payback | (699 − 86) / 1,560 → ~2.5 months |

**Exempt from 10x gate?** Arguably **yes — high-error-cost**: labor is ~38% of job cost, and a job that looks materials-only on the profile misleads anyone judging margin before close. The math above does not count that error value because it is unmeasured.

## 6. Risks

- **Double counting:** labor is a subset of job cost, and ABC/SRS/QXO also appear in QBO cost (~$7.66M) beside the vendor invoices already shown. Labor is shown as a breakdown only.
- **PII:** many subs are individuals (1099). Expose only payee display name, amount, date and doc number; never TIN, address or `raw`.
- **Silent NULLs:** ship the unclassified/missing-vendor count view in the same migration.
- **Rollback:** revoke the CRM reader's grant on the view; the panel reads "Not connected" again. Additive only.
- **Consent / standards:** none new; Accounting owns the override list.

## 7. Alternatives considered

- **Leave it human:** possible, but PMs then read job cost without its largest single component.
- **Defer until:** measured lookup time from PMs and Accounting (one week of tallies) would replace the estimate in X.

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]; pilot client: pro-exteriors
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: [YYYY-MM-DD], condition: measured lookup time

**Recommendation: Approve under the high-error-cost exemption, and fix the inactive-vendor mirror gap now either way** (it under-reports labor vendors today wherever the mirror is used).

Approver: Chris
Approved / decided on:

---

## 9. Post-build tracking

*Fill in after a 2-week pilot if approved.*

Sources: `CLAUDE.md` hard rule 13; `docs/74`, `docs/85`, `docs/102`; `schemas/cleverwork-roofer/92`, `188`, `215`, `257`; `integrations/bridges/quickbooks/mirror-backfill.mjs`; memory `silent-null-fk-derivation`; live aggregates over `qbo_bills`, `qbo_purchases`, `qbo_vendors`, `v_qbo_job_cost_lines` (2026-10-01, no PII).
