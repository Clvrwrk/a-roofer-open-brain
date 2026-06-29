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

**Out of scope / unchanged:** the variance decision tree (negotiated → flag-any-variance; no-benchmark → cascade to API + most-recent-purchase; per-invoice ≥$25 gross-overcharge floor; service-fee auto-approve) — thresholds live in the SQL views + Alex's SOP (docs/57). Also out of scope: **Slack two-way agent routing** (a separate `.hermes/` workstream).

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
- **Due-date policy is overridable, human-gated (Q4 resolved):** default due math = invoice date + **60 days**. A per-**office/terms** override may set a different due window, but it only takes effect once a human **explicitly adopts and approves** that policy (HITL) — never auto-applied. Implementation: a small `due_policy` lookup (office/terms → due_days, default 60) with an `approved_by` gate; until approved, 60 days applies. This sub-feature can land as a fast follow after the core decoupling (it does not block daily processing).

**1c. First-run backfill + ongoing cadence (Q5 resolved).**
- **First run = full catch-up:** Alex processes **every currently-unprocessed open invoice** (the whole backlog, all ages) in one pass, posting the normal **per-invoice Slack messages** to `#accounting-invoice-processing` and generating a **Monday-style full summary report** (the weekly payment package). Goal, in Lucinda's words: *"not be behind at all as of today."*
- **Thereafter = daily-incremental:** each morning Alex only processes the invoices newly **received/pulled via the overnight ABC API sync** — so "tomorrow" is just tonight's new invoices, not a re-sweep of the backlog.
- This is both a one-time operational run (execute Alex over the backlog) and the steady-state cadence; the engine change (1a) makes the backlog visible, the run clears it.

**1b. Two CSVs — a register export (all) and a payment export (approved-only)** *(Q2 resolved → Option C)*.

Lucinda needs two distinct things: every invoice **in her QuickBooks/AccuLynx register** within ~2 weeks (regardless of pay decision), and separately a **"pay these now"** list when she cuts checks. So we split the deliverables:

- **Register CSV (new) — every fully-processed invoice, loaded once.**
  - Export set = new **`isInvoiceExportable`** = `!isCreditMemo && pendingLines === 0 && auditedLines > 0 && !registerExportedAt` — i.e. *fully dispositioned*, whether or not on payment hold, not yet register-exported. Stamp **`register_exported_at`** on export so each invoice loads to QuickBooks exactly once (no double-entry).
  - Carries a per-invoice dynamic **`Approved to Pay`** (`No` when held for non-payment, else `Yes`) **and** a new **`Disposition`** column (`Passed`, `Credit memo — hold`, `Credit memo — pay`, `Flag — do not pay`, `Transferred to Service`).
  - **Safe to extend** (Q1): Lucinda **manually maps columns** on import, so the added `Disposition` column and `No` rows don't break her QuickBooks load.

- **Payment CSV (≈ today's locked contract) — approved-to-pay only.**
  - Stays the per-vendor `isInvoiceToBePaid` set with `Approved to Pay = Yes`, generated when she's ready to pay. Keeps the validated 9-column contract intact — **the new columns and the `No` rows live only on the Register CSV.**
  - A **held invoice that is later released** (Change 3) re-enters this payment set with `Approved to Pay = Yes` — but is **not** re-register-exported (its `register_exported_at` is already stamped), so it loads to QuickBooks once and pays once.

- **Hold is a whole-invoice state** (Q3): any held line ⇒ the whole invoice is `Approved to Pay = No`. No partial-pay.
- An invoice only becomes register-exportable once **every auditable line is dispositioned** (`pendingLines === 0`) — unchanged rule, just no longer gated by age.

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
  - **`register_exported_at`** stamp (per invoice) so the Register CSV loads each invoice to QuickBooks exactly once, independent of the existing payment-export (`processedAt`) state. This is the core new state for the two-CSV model.
  - Invoice-level **payment hold + release** state (Change 3), and any column needed to persist the `transfer-svc` auto-approval (Change 2) if not derivable.
  - Optional **`due_policy`** lookup (office/terms → due_days, default 60, `approved_by` gate) for Q4 — can be a later migration (fast follow).
  - `Approved to Pay` / `Disposition` values are **computed at export time** from existing audit state — no schema needed for the columns themselves. **Verify against the live DB before writing the migration** (standing rule). No destructive changes; archive/deprecate only.
- **No change** to the variance views (`v_invoice_audit_line`, `v_invoice_audit_line_cascade`) — thresholds untouched.

---

## 6. Decisions (resolved 2026-06-29) + one open clarification

- **Q1 — QuickBooks CSV contract — RESOLVED.** Lucinda manually maps columns on import, so we can append a `Disposition` column and emit `Approved to Pay = No` rows without breaking her import.
- **Q3 — Hold granularity — RESOLVED.** Do-not-pay is a **whole-invoice** state.
- **Q4 — Due-date math — RESOLVED.** Default 60 days; overridable by an explicitly human-approved **office/terms** policy (HITL), never auto-applied.
- **Q5 — Backfill — RESOLVED.** First run clears the **entire** unprocessed backlog (per-invoice Slack + a full Monday-style summary); thereafter daily-incremental on tonight's API pull only.
- **Q6 — Slack two-way agent routing — OUT OF SCOPE.** Separate workstream (`.hermes/…slack-two-way-agent-routing`); not touched here.

- **Q2 — RESOLVED → Option C (two CSVs).** A **Register CSV** (every fully-processed invoice, loaded once, `register_exported_at`-stamped, carries `Disposition` + dynamic `Approved to Pay`) **and** a **Payment CSV** (approved-to-pay only, ≈ today's locked 9-col contract, generated when she pays). Released held invoices re-enter the Payment set but are not re-register-exported — load once, pay once. See §4 Change 1b.

**All decisions resolved — plan is ready for implementation sign-off.**

---

## 7. Sequencing

1. **Change 1a** (decouple processing scope) — engine + UI + SOP. Verify the workflow now surfaces all open invoices; KPIs/"due now" view correct.
2. **Change 1b** (two CSVs: new Register CSV with `register_exported_at` + `Disposition` + dynamic `Approved to Pay`; Payment CSV unchanged contract) + mig 164.
4. **Change 2** (S/W auto-pay) — engine + docs/61 + docs/57 §0a.
5. **Change 3** (CM release-from-hold) — mig 164 + engine.
6. **First-run backfill (Change 1c):** execute Alex over the full unprocessed backlog (per-invoice Slack + Monday-style summary); confirm steady-state is daily-incremental thereafter.
7. **Due-policy override (Change 1a, Q4)** — fast follow; HITL-gated `due_policy` lookup.
8. **Verify** (§8), converge branch → `main` (human push = deploy), update memory + docs.

## 8. Verification plan

- Unit tests: extend `invoice-audit.unit.test.ts` for `processable` vs `dueNow`, `isInvoiceExportable` (incl. held), transferred auto-pay, CM release.
- Live DB checks (read-only, prod): an open <60-day invoice now appears as processable; a transferred Commercial invoice appears in the to-be-paid CSV with `Transferred to Service`; a held invoice exports with `Approved to Pay = No`; a matching CM releases its held original.
- `tsc` clean, astro build green, full unit suite green before converging.
- Confirm the QuickBooks CSV opens/imports cleanly for accounting before declaring done.

---

*Plan only — no engine code changed in this branch yet. Implementation begins after review sign-off on §6.*
