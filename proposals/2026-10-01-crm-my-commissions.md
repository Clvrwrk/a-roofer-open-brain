# A3: My Commissions on the CRM staff profile

Proposed by: Chris (Phase 4 of the CRM profile pages, CRM `docs/delivery/PROFILE-PAGES.md`)
Date: 2026-10-01
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-01-crm-my-commissions.md

---

## 1. The problem (measured)

- **Task being performed today:** a weekly commission package for ~36–39 sales consultants and incentive recipients, assembled **outside the CRM** and paid as QBO expenses (account "Sales Commissions"). The Friday WIP board's "Invoiced – ready for final commission" bucket is the hand-off (236 of 387 WIP jobs today). The staff profile's Commissions tab says "Not connected" (decision D3).
- **Measured volume (QBO mirror, 2026-10-01):** 409 Sales Commissions expense lines in the last 12 months to **36 payees** over 48 active weeks, **≈ $981K paid** (~$82K/month); 92.8% tagged to a Customer:Job. The "Draw on Sales Commissions" sub-account is unused (0 lines in 12 months).
- **Plan rules:** drafted, **not adopted** — Stage 10 SOP R129 (office-split plans such as 15-50-50, margin branches at 33% and 30%, salaried 5%/7% incentive, draws at 10% of collected, chargebacks, Admin Ops/COO approval, Accounting release, 60-day audit). **Ten open questions block any calculation** (RC-028 – RC-037: QBO-to-calculation mapping, the 30–33% band, rounding, mixed pools, disputes, residuals, calendars, role holders), and the source charts have arithmetic errors (RC-044).
- **Time per occurrence / error rate:** **not measured** — no documented hours for the weekly package. An error is a pay error for a 1099 contractor.
- **Total monthly human cost:** unknown; error cost per mistake is real money and trust.

## 2. Root cause (5 Whys)

1. Why manual? — The plan is not adopted in a machine-checkable form, and payouts are recorded only as QBO expenses.
2. Why not automated? — RC-028 – RC-037 are unanswered; formulas would be guesses.
3. Why are existing tools inadequate? — QBO records what was paid, not what was earned; the CRM's `/residential-commissions` forms (four review request types, migration `20261002020600`) deliberately do no calculation, approval or payment, and have 0 drafts.
4. Why not before? — Commission data is pay data; it waits for adopted rules.
5. Why now? — The staff profile reserves a Commissions tab.

## 3. Proposed solution (two steps; only step 1 is asked for now)

- **Step 1 — "Paid to you" (read-only, no calculation):** the Commissions tab lists the viewer's **own** commission payments mirrored from QBO (date, job, amount, QBO doc reference), with year-to-date total — what was actually paid, never an estimate. Requires a confirmed identity link from CRM member to QBO payee (a table Accounting fills; no name matching for pay). Visible only to the person, Accounting/AP and the COO; **never to another rep or their manager** (RC-038 own-pay privacy).
- **Step 2 — "Earned / pending" (calculation):** **not proposed now.** Revisit when R129 is adopted with RC-028 – RC-037 answered and signed off by the COO and Accounting; then it needs its own A3 and test pack against real paid history.
- **Integration required:** none new; QBO mirror is read-only (hard rule 13).
- **Trust tier:** `evidence` (mirrored payments); the payee link table is `instruction` once Accounting confirms each row.

## 4. The new state (projected, step 1)

- **Time per occurrence:** a rep checks their own payments without asking Accounting.
- **Agent cost:** ~$0.
- **Human review:** Accounting maintains the member → payee link (one-time ~36 rows, then new hires).

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | not measured (rep-to-Accounting "what was I paid" questions are the target) |
| Y, new monthly cost | ~$0 + Accounting link upkeep (~15 min/month ≈ $16) |
| Z, one-time build (step 1) | ~24 engineering hours × $65 ≈ **$1,560** (link table, own-pay reader with privacy tests, tab, QBO doc reference) |
| **ROI** | **not computable** without measured question volume |

**Exempt from 10x gate?** **Yes — high-error-cost (financial)** for step 2, which must not ship without adopted rules. Step 1 does not need the exemption only if Accounting confirms it removes recurring "what was I paid" work; otherwise it waits with step 2.

## 6. Risks

- **A figure read as a promise:** step 1 shows only paid amounts, labelled as QBO payments; no earned or projected number anywhere.
- **Wrong person's pay:** identity by Accounting-confirmed link only; privacy tests prove a rep cannot read another rep's rows, including through View as.
- **Double subtraction (for step 2):** `costs_incurred_to_date` already includes commission on 252 of 387 WIP jobs (179 of the 236 Invoiced); any future margin calculation must remove commission first (R129 warns of this).
- **Identity gap:** `crm.acculynx_rep_links` has 0 rows; profiles match reps by normalized name, which is not acceptable for pay.
- **Rollback:** revoke the reader; the tab reads "Not connected".

## 7. Alternatives considered

- **Leave it human:** the safe default until the plan is adopted.
- **Defer until:** R129 adopted and RC-028 – RC-037 answered (for step 2); measured rep payment questions (for step 1).

## 8. Decision

- [ ] **Approve step 1** — build by [YYYY-MM-DD]
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: when R129 is adopted, condition: RC-028 – RC-037 answered and signed off

**Recommendation: Defer both steps** until Accounting confirms the "what was I paid" load (step 1) and the COO adopts the plan (step 2). The tab keeps its honest "Not connected" panel; nothing is estimated from job values.

Approver: Chris, with the COO and Accounting for any step that shows pay
Approved / decided on:

---

## 9. Post-build tracking

*Fill in after a 2-week pilot if approved.*

Sources: CRM `apps/crm/src/pages/residential-commissions.astro`, `supabase/migrations/20261002020600_crm_residential_commission_reviews.sql`, `docs/architecture/RESIDENTIAL-COMMISSION-REVIEW.md`, `docs/interview/RESIDENTIAL-CONFLICT-RESOLUTION.md`, Stage 10 SOP R124–R149 (R129); this repo `schemas/cleverwork-roofer/281-ceo-fixed-cost-13wcf.sql`; live aggregates over `v_qbo_job_cost_lines`, `wip_ar_master`, `crm_pipeline` (2026-10-01, no per-person amounts, no PII).
