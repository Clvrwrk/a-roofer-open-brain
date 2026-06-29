# 61 — Service/Warranty Audit transfer (Commercial ship-to)

**Status:** Phase 1 SHIPPED + RUN 2026-06-29. Migration 162 applied to prod; 16 invoices transferred.
**Trigger:** Chris — Commercial-ship-to invoices are service/warranty work, not standard pricing audits, and must be routed to a parallel **Service/Warranty Audit** that mirrors the Invoice Audit.

## What it does

An open ABC invoice whose **ship-to is "Commercial"** is routed **out** of the pricing Invoice
Audit into the Service/Warranty Audit: marked *transferred* (no longer actionable in invoice
audit), recorded in the action ledger, and announced in Slack `#service-warranty-audit`.

## Key finding — no OCR needed (API is the source)

The "Commercial" marker the PDF Ship-To box prints from is already in the **structured ABC API
data**: `abc_invoices.raw->'shipTo'->>'name'`. Detection reads that field — more reliable than
OCR'ing the PDF. Per Chris, OCR of the PDF ship-to becomes a **second confirmation** ("double
positive") once an invoice-OCR pipeline exists; the queue models it via `confirmation_source`
(`api` → `api+ocr`) and `ocr_confirmed`, and a validation layer flags any API/OCR disagreement.
Today: `confirmation_source='api'`, `ocr_confirmed=null`.

## Detection rule

```
open (abc_invoices.ar_status <> 'paid')  AND  raw->'shipTo'->>'name' ILIKE 'commercial'
```
Reusable as `v_service_warranty_candidates` (excludes already-queued). 16 open on 2026-06-29
(all ship-to `2036874-17`), e.g. examples `2010446923-001` (06/03) and `2009332466-001` (05/06).

## Data model (migration 162, additive/idempotent)

- **`service_warranty_audit_queue`** — append-only ledger: `invoice_number` (unique), ship-to,
  `detection_signal`, `confirmation_source`, `ocr_confirmed`, `validation_status`, `status`
  (`transferred` → `in_review` → `resolved`), `transferred_by` (`alex-rivers`). Status advances; rows never deleted (hard rule 1).
- **`v_service_warranty_candidates`** — the detection view above.
- **`dashboard_action_log`** — one `transfer_service_warranty` row per invoice (actor `alex-rivers`,
  `decision` NULL like the other handoff actions, `slack_channel_id=C0BE05YUQTW`).

## Invoice-audit engine exclusion (`lib/invoice-audit.ts`)

The engine fetches the queue and, for any queued invoice, sets `transferred=true` and forces
`actionable=false` (excluded from the audit/review set). A new `totals.transferred` headline counts them.

**Update — docs/63 Change 2 (2026-06-29):** transferred invoices are **no longer dropped from
payment**. Per Lucinda, Commercial invoices still have to be paid — she just doesn't review them.
The transfer now means **auto-approve for payment**: `pendingLines=0`, `toBePaid=true`
(`isInvoiceToBePaid` short-circuits on `transferred`), so they flow into the to-be-paid/CSV set
with a `Transferred to Service` disposition, while staying hidden from the audit review default
(`pendingLines=0`) and still appearing in the S/W review surface (`?audit=service_warranty`).
`inAuditScope` invoice-mode now returns `true` for all (transferred included). Unit-tested; `tsc` clean.

## Slack

Per-invoice notice to **`#service-warranty-audit` (`C0BE05YUQTW`)**, posted as **Alex Rivers**
(her SOP). Backfill = one parent summary + 16 threaded lines. Human-in-the-loop = **Chris**.

## Phase 2 (next build — NOT done)

Stand up the Service/Warranty Audit **surface** that mirrors the Invoice Audit (screens, SOPs,
same price-vs-agreement variance logic) by adding an `audit_type` (`invoice` | `service_warranty`)
discriminator to the **shared** audit views/tables rather than duplicating them; Chris as approver.
Wire detection into Alex's `morning_abc_sync` as a first-step triage so new Commercial invoices
transfer automatically. Build the invoice-OCR pipeline to make the double-positive real.

## Phase 2 progress (2026-06-29)

- **Engine parameterized** (`lib/invoice-audit.ts`): `AuditMode = invoice | service_warranty`
  + `inAuditScope()`. The summary path (`summarizeInvoiceRows` / `loadFreshInvoiceAuditSummary`)
  now fetches the queue and scopes by mode — this also **fixed a Phase 1 gap** where the live
  page (summary path) had not been excluding the transferred set. New cached
  `loadServiceWarrantyAuditSummary()`. tsc clean, 14/14 unit tests.
- **Surface:** the S/W Audit reuses the exact Invoice Audit page via
  `/accounting/invoice-audit?audit=service_warranty` (shared screens + same variance) + a nav
  entry. Verified vs live DB: all 16 queued invoices are present in `v_invoice_audit_invoice`.
- **SOP:** triage step documented in docs/57 §0a. **Human-in-the-loop = Chris.**
- **Deferred (later phase):** invoice-OCR pipeline for the double-positive confirmation; the
  autonomous `morning_abc_sync` triage run (gated on the headless runtime, #9).
