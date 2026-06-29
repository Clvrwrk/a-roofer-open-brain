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
`actionable=false`. Transferred invoices drop out of the audit tree and every audit/open/payment
KPI; a new `totals.transferred` headline counts them. Unit-tested; `tsc` clean.

## Slack

Per-invoice notice to **`#service-warranty-audit` (`C0BE05YUQTW`)**, posted as **Alex Rivers**
(her SOP). Backfill = one parent summary + 16 threaded lines. Human-in-the-loop = **Chris**.

## Phase 2 (next build — NOT done)

Stand up the Service/Warranty Audit **surface** that mirrors the Invoice Audit (screens, SOPs,
same price-vs-agreement variance logic) by adding an `audit_type` (`invoice` | `service_warranty`)
discriminator to the **shared** audit views/tables rather than duplicating them; Chris as approver.
Wire detection into Alex's `morning_abc_sync` as a first-step triage so new Commercial invoices
transfer automatically. Build the invoice-OCR pipeline to make the double-positive real.
