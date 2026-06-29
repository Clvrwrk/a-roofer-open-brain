# 63 — Daily Invoice Processing + CSV-on-demand (implementation plan)

**Status:** DRAFT — for review with Chris (do not implement until approved)
**Date:** 2026-06-29
**Branch:** `contrib/cleverwork/daily-invoice-processing` (worktree, from `origin/main` @ `09d8fa9`)
**Source of requirements:** Chris ↔ Lucinda working call, 2026-06-29 (full transcript reviewed).
**Builds on (already landed on `main`):** Service/Warranty Audit Phase 1+2 (mig 162, docs/61) and PE job/PO naming alignment (mig 163, `pe-job-naming.ts`).

---

## 1. Why this change

Lucinda's accounting reality, in her words:

> "The invoice doesn't get paid for 60 days, but I need to have that invoice in QuickBooks [and] AccuLynx … within a week of being purchased."

Today the system **gates processing on the 60-day payment-due window** — an invoice isn't surfaced for disposition (and therefore can't be exported) until it is ≥60 days past its invoice date. That keeps Lucinda behind on her bookkeeping, which has to happen within ~1–2 weeks of purchase regardless of when the bill is due.

The agreed model (Chris, confirmed twice in the call):

> "Every invoice every day is processed … and put into the invoices to be paid [queue]. You at any time can come click the process button and that'll be every invoice that has not been processed to be added to QuickBooks."

So: **processing is decoupled from the due date.** Alex processes every open invoice every day; the 60-day math survives only as a *display* filter for "what's due now." Lucinda pulls a QuickBooks CSV on demand, any day, covering every not-yet-exported invoice — **including the ones she's chosen not to pay yet** (she still needs them in her register as an incurred expense).

This plan covers **three changes**. A fourth from the same call — Job-box (`orderName`) → Customer-PO normalization — was implemented separately and is already on `main` (mig 163, `pe-job-naming.ts`); it is a **dependency** here, not in scope.

---

## 2. Scope

| # | Change | In scope |
|---|--------|----------|
| 1 | **Daily-all processing + on-demand CSV** — drop the 60-day *processing* gate; CSV includes do-not-pay lines with `Approved to Pay` + `Disposition` | ✅ |
| 2 | **Commercial → S/W auto-pay** — keep transferred Commercial invoices in the payable/CSV path, auto-approved, disposition `Transferred to Service` (still reviewable in the S/W queue) | ✅ |
| 3 | **Credit-memo release-from-hold** — when a matching CM arrives, flip the held (do-not-pay) original back to payable | ✅ |
| 4 | Job-box → PO normalization | ⛔ Done — mig 163 / `pe-job-naming.ts` on `main` (dependency) |

**Out of scope / unchanged:** the variance decision tree (negotiated → flag-any-variance; no-benchmark → cascade to API + most-recent-purchase; per-invoice ≥$25 gross-overcharge floor; service-fee auto-approve). Those thresholds live in the SQL views + Alex's SOP (docs/57) and are not being touched here.

---

## 3. Current behavior (verified against `main` @ 09d8fa9)

- **60-day gate** — `invoice-audit.ts:223` `isInvoiceActionable = !paid && !isCreditMemo && !!invoiceDate && invoiceDate <= cutoff` (`cutoff = today − 60d`, `scopeCutoffDate()`); applied at line 487 `inv.actionable = !inv.transferred && isInvoiceActionable(inv, cutoff)`. `actionable` gates the audit KPIs and the disposition workflow surface. Alex's SOP run (`morning_abc_sync`, docs/57 §0/§1) is scoped to the same "OPEN, unpaid, ≥60 days, not credit memos" set.
- **Date-range UI** — `invoice-audit.astro` defaults the window to *oldest open invoice_date → today*; a "Show all" checkbox lifts the actionable filter (`invoice-audit-tree.ts`: `scopeOk = showAll ? true : actionable`); a "To-audit only" toggle is on by default. The 60-day "due" math is **not** shown as an explicit due-date column today — it is baked into `actionable`.
- **To-be-paid membership** — `invoice-audit.ts:195` `isInvoiceToBePaid = !paid && !isCreditMemo && !processedAt && pendingLines === 0 && auditedLines > 0`. No 60-day term — but an invoice only reaches it once it's been surfaced (= actionable) and dispositioned.
- **Service/Warranty transfer** — transferred (Commercial ship-to) invoices are **dropped from the invoice tree entirely**: `invoice-audit.ts:493` `const live = invoices.filter(inv => !inv.transferred)` (and the summary path, line 775, via `inAuditScope`). They therefore **never reach the QuickBooks CSV**. They are browsable on their own via `?audit=service_warranty`.
- **QuickBooks CSV** — `invoice-payment.ts`: a **locked 9-column** contract validated against accounting's live import (`INVOICE_NUMBER, INVOICE_DATE, TOTAL_DUE, PO_NUMBER, DISCOUNT_MESSAGE, DUE_DATE, TERMS, DISCOUNT_AMOUNT, Approved to Pay`), **one row per invoice**, `approvedToPay` hard-coded `"Yes"`. Only invoices passing `isInvoiceToBePaid` are emitted (built in `process-batch.ts`). A separate 18-column **decision-detail** CSV (`?kind=detail`) already exists for the audit trail.
- **Credit memos** — engine computes a CM vs original-invoice variance; tolerance 0 → auto-pass. There is no logic that releases a *previously held* original invoice when its CM later arrives.

---

## 4. Proposed changes

### Change 1 — Daily-all processing + on-demand CSV

**1a. Decouple processing from the 60-day gate.**
- Split the conflated `actionable` flag into two concepts:
  - **`processable`** (new processing scope) = `!paid && !isCreditMemo && !!invoiceDate` — *every* open invoice. This is what the disposition workflow + Alex's run operate on.
  - **`dueNow`** (display only) = `processable && invoiceDate <= scopeCutoffDate()` — the "what's due" lens. Keep `SCOPE_MIN_AGE_DAYS = 60` and `scopeCutoffDate()` purely for this.
- `invoice-audit.ts`: rename/repoint line 487 so the workflow surfaces `processable`; expose `dueNow` (and ideally a computed `dueDate = invoiceDate + 60d`) on the `Invoice` type for the UI.
- `invoice-audit.astro` / `invoice-audit-tree.ts`: the default view shows the **processing** set (all open); the 60-day math becomes a **"Due now"** filter/badge and a due-date the date-range can target. Keep the existing date-range + "Show all" controls; "To-audit only" now means "has an open disposition," not "≥60 days."
- **Alex SOP (docs/57 §0/§1):** change audit scope from "OPEN, unpaid, ≥60 days" to "OPEN, unpaid, **all ages**, not credit memos." The 60-day window is retained only as the "due-now" reporting lens in the daily/weekly summaries.

**1b. On-demand QuickBooks CSV including do-not-pay invoices.**
- Broaden the export set from `isInvoiceToBePaid` to a new **`isInvoiceExportable`** = `!paid && !isCreditMemo && !processedAt && pendingLines === 0 && auditedLines > 0` — i.e. *fully dispositioned*, whether or not it's on payment hold. (The Process button already exports "everything not yet exported"; this widens what qualifies.)
- Per-invoice **`Approved to Pay`** becomes dynamic: `No` when the invoice is held for non-payment (any line dispositioned `credit-flag` / explicit do-not-pay), `Yes` otherwise.
- Add a **`Disposition`** column to the QuickBooks CSV summarizing the invoice-level outcome (`Passed`, `Credit memo — hold`, `Credit memo — pay`, `Flag — do not pay`, `Transferred to Service`).
- An invoice still only becomes exportable once **every auditable line is dispositioned** (`pendingLines === 0`) — unchanged rule, just no longer gated by age.

> **Key design decision for review (§6, Q1):** adding a 10th column + dynamic `Approved to Pay` touches the *locked* QuickBooks import contract. Need to confirm accounting's QuickBooks import tolerates a trailing `Disposition` column and `Approved to Pay = No` rows, or whether the disposition belongs only in the detail CSV.

### Change 2 — Commercial → Service/Warranty auto-pay

Lucinda's correction to what shipped:

> "They still have to get paid. I just don't need to review them." → Chris: "I'll leave it in a service warranty queue, but I'll automatically approve them to be paid … instead of 'pass,' it'll say 'transferred to service.'"

- **Stop dropping transferred invoices from the payable path.** Remove/relax `invoice-audit.ts:493` (and align the summary path) so transferred invoices remain in the invoice/CSV tree.
- **Auto-approve their lines** on transfer: every auditable line → `passed` with decision `transfer-svc` (new label "Transferred to Service"), so the invoice satisfies `isInvoiceExportable` and `Approved to Pay = Yes`.
- They appear in the QuickBooks CSV with **`Disposition = Transferred to Service`** (not removed, not `Passed`).
- They **continue to surface in the S/W review queue** (`?audit=service_warranty`, `inAuditScope(transferred)`) for the service department — that view is now **review-only**, decoupled from payment.
- **Docs:** amend docs/61 + docs/57 §0a (`ship_to_triage`) — transfer now means "tag for S/W review **and** auto-approve for payment," not "remove from Invoice Audit."

### Change 3 — Credit-memo release-from-hold

> Lucinda: "It flagged the previous invoice to not be paid. Is it going to now mark it as able to be paid?" → Chris: "Yes, if you had it on hold waiting on a credit memo."

- When a CM is ingested and matches its original invoice within tolerance (the existing tolerance-0 auto-pass path), and the original is currently **held** (do-not-pay pending CM), **flip the original back to payable**: clear the payment hold, set `Approved to Pay = Yes`, disposition `Credit memo — resolved`.
- If the CM does **not** match (price ≠ original, the `$0-original` and "re-charged wrong + correct on same invoice" cases Lucinda described) → leave held + flag for human (Casey/Lucinda).
- Needs: a link from CM → original held invoice (via `originalInvoiceReference` in `abc_invoices.raw`, already present) and a state transition on the held invoice. Likely a small migration for the hold/release state + engine wiring.

---

## 5. Data / migration impact

- **Mig 164** (next free number; 162 = S/W queue, 163 = PE naming): additive, idempotent (hard rule 1).
  - Columns/flag for invoice-level **payment hold + release** state (Change 3), and any column needed to persist the `transfer-svc` auto-approval (Change 2) if not derivable.
  - If `Approved to Pay` / `Disposition` are computed at export time from existing audit state, no schema change may be needed for Change 1b — **verify against the live DB before writing the migration** (standing rule). No destructive changes; archive/deprecate only.
- **No change** to the variance views (`v_invoice_audit_line`, `v_invoice_audit_line_cascade`) — thresholds untouched.

---

## 6. Open questions for Chris / Lucinda (resolve before implementing)

1. **QuickBooks CSV contract:** can accounting's import tolerate a new trailing `Disposition` column and `Approved to Pay = No` rows? Or should `Approved to Pay` flip to `No` but `Disposition` live only in the detail CSV? (Drives whether we touch the locked 9-col contract.)
2. **Do-not-pay in the register:** confirm the *register/expense* export (all fully-dispositioned invoices) vs *payment authorization* (approved-only) split is right — i.e. she loads every invoice into QuickBooks, but only pays `Approved to Pay = Yes` ones.
3. **Hold granularity:** is do-not-pay a whole-invoice state (any held line ⇒ invoice `Approved to Pay = No`), or can part of an invoice pay while a line is held? (Call implies whole-invoice; confirm.)
4. **"Due now" view:** keep 60 days as the due-date math for the display lens, or make it configurable per office/terms? (She mentioned terms vary.)
5. **Backfill:** on first run, processing "all open" will surface the backlog of <60-day invoices at once. Confirm she wants the full catch-up in one pass (she asked to "not be behind at all as of today").

---

## 7. Sequencing

1. **Confirm §6 decisions** with Chris (and Lucinda on Q1–Q3).
2. **Change 1a** (decouple processing scope) — engine + UI + SOP. Verify the daily run now surfaces all open invoices; KPIs/"due now" view correct.
3. **Change 1b** (export set + CSV columns) — after Q1 resolved.
4. **Change 2** (S/W auto-pay) — engine + docs/61 + docs/57 §0a.
5. **Change 3** (CM release-from-hold) — mig 164 + engine.
6. **Verify** (per §8), converge branch → `main` (human push = deploy), update memory + docs.

## 8. Verification plan

- Unit tests: extend `invoice-audit.unit.test.ts` for `processable` vs `dueNow`, `isInvoiceExportable` (incl. held), transferred auto-pay, CM release.
- Live DB checks (read-only, prod): an open <60-day invoice now appears as processable; a transferred Commercial invoice appears in the to-be-paid CSV with `Transferred to Service`; a held invoice exports with `Approved to Pay = No`; a matching CM releases its held original.
- `tsc` clean, astro build green, full unit suite green before converging.
- Confirm the QuickBooks CSV opens/imports cleanly for accounting before declaring done.

---

*Plan only — no engine code changed in this branch yet. Implementation begins after review sign-off on §6.*
