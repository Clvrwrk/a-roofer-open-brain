# 86 — Vendor payment memos → paid-verified (2026-08-06)

**Status:** live (migration 218 applied; endpoint deployed; May/June/July memos processed)
**Linear:** PEC-180 (May) · PEC-181 (June) · PEC-182 (July/August)
**Related:** docs/81 (Invoice Audit v2 status model) · docs/76 (QBO mirror) · docs/79 (generic vendor tables)

## What this is

Vendors send a monthly **payment memo** (ABC's is a Billtrust "payment details"
PDF) listing every invoice paid in full in that cycle, plus applied credit
memos, discount, and card fee. The memo is the authoritative paid-in-full
evidence, so it drives the Invoice Audit pipeline's terminal status:
`invoice_payment_processed.status → paid_verified`.

```
memo PDF (scan) ──► extract rows ──► POST /api/accounting/payment-memos/process
                                        │  raw, vendor-agnostic (Chris 2026-08-06):
                                        ▼
                        vendor_payment_memos (+ _lines)      ← unique (vendor_slug, confirmation_number)
                                        │  lines keyed (vendor_slug, invoice_number)
                                        ▼
                        vendor_payment_memo_apply()           ← migration 218
                                        │
                                        ▼
                        invoice_payment_processed → paid_verified
```

The working table is populated **from the raw rows, never directly from a
parse** — the raw pair is the replayable record of exactly what the vendor
said, and `(vendor_slug, invoice_number)` is the join key everywhere
(vendor-silo doctrine, mig 208).

## Monthly procedure (Maya; human fallback identical)

1. Memo lands in Maya's inbox (or Dropbox `…/ABC Invoices/Payment Memos/`).
2. **Create the Linear issue** — `Payment Memo — <Vendor> — <payment date> ($total, conf <n>)`
   in PE-CC-DevTeam (the runtime's mailbox→Linear pairing does this automatically
   for emailed memos).
3. **Extract** the header (confirmation #, account, method, date, subtotal,
   discount, credit-memo amount, fee, total) and every table row
   (DOCUMENT / PO # / DOCUMENT DATE / PAYMENT AMOUNT; parentheses = negative).
   The PDFs are scans with no text layer — extraction is vision/LLM work.
4. **POST** the memo to `/api/accounting/payment-memos/process` (agent bearer
   token; gates: accounting + `approval.decide`). The endpoint **refuses** the
   memo unless the positive-line sum equals the printed subtotal and the
   negative-line sum equals the printed credit-memo amount — a one-digit
   transcription error cannot get through.
5. **Report** the returned outcome summary on the Linear issue and mark it Done.
   Outcomes needing human eyes: `not_in_mirror`, `skipped_returned`,
   `skipped_void`, `vendor_not_supported`.

Re-posting the same confirmation number is safe: lines upsert, and the apply
pass returns `already_verified` counts instead of double-writing.

## Line outcomes

| outcome | meaning |
|---|---|
| `verified` | pipeline row transitioned to `paid_verified` |
| `verified_inserted` | no prior pipeline row — memo is the first payment evidence; row inserted `paid_verified` with `batch_id` = memo id |
| `already_verified` | idempotent re-run |
| `credit_applied` | negative row = credit-memo document used in the payment (recorded raw; no working-table write yet) |
| `skipped_returned` / `skipped_void` | never auto-resurrected — human decision |
| `not_in_mirror` | document unknown to `abc_invoices` — investigate before trusting |
| `vendor_not_supported` | non-ABC vendor until generic `vendor_invoices` lands (docs/79) |

## First run (2026-08-06 backfill, Chris-directed)

| Memo | Paid | Lines | Verified | Credits | Notes |
|---|---|---|---|---|---|
| conf 356963664 | 2026-05-26 · $115,656.30 | 56 | 55 | 1 | all pre-pipeline (inserted) |
| conf 359999957 | 2026-06-29 · $24,222.86 | 29 | 17 | 12 | endpoint idempotency proven on re-post |
| conf 362913183 | 2026-07-31 · $245,187.67 | 79 | 61 | 18 | incl. 2009332466-001 flipped from a `returned_reason='testing'` artifact |

All 164 lines validated two ways before applying: every document exists in the
`abc_invoices` mirror, and line sums tie each memo's printed totals to the penny.
Paid-pending-verification queue: 75 → 20 (the remaining 20 are not on these memos).

## Cautions

- **Scan hygiene:** the July scan's last page was the Billtrust checkout
  screenshot including the card CVV in the clear. Crop/redact payment-method
  pages before filing; the DB never stores payment-method detail beyond the
  memo's label (e.g. "AMERICAN-EXPRESS - 3008").
- Credit-memo application (`credit_applied` rows → the "open · unapplied" CM
  ledger) is intentionally not automated yet; extend `vendor_payment_memo_apply`
  when that ledger's application flow is defined.
