---
name: vendor-invoice-credit-memo-audit
description: >
  Audits vendor invoice line items against approved negotiated price agreements,
  calculates expected credit memo amounts, drafts one-invoice-at-a-time internal
  credit memo request emails, and routes them to Lucinda for Slack review.
when_to_use: >
  Trigger when a vendor invoice CSV/PDF is ingested, when invoice_documents
  extraction completes, or when accounting requests a vendor invoice audit.
  This skill never sends vendor-facing communication.
inputs:
  - name: invoice_document
    type: record
    required: true
    description: Invoice document metadata, extraction status, source file, and invoice header fields.
  - name: invoice_lines
    type: record[]
    required: true
    description: Extracted invoice line items with SKU, description, quantity, UOM, unit price, and extended price.
  - name: negotiated_price_agreements
    type: record[]
    required: true
    description: Active, human-approved agreement items for the vendor, branch/price zone, and invoice date.
outputs:
  - name: credit_memo_request_packet
    type: draft
    description: One-invoice discrepancy packet with line-level math and required follow-up task.
  - name: credit_memo_request_email_draft
    type: draft
    description: Internal draft email text for Lucinda to review and send externally if approved.
  - name: invoice_audit_atom
    type: atom
    description: Evidence atom with audit status, discrepancy totals, source references, and follow-up state.
trust_tier_of_output: evidence
bound_agents:
  - ob-accounting
  - ob-ops
  - auditor
  - conductor
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: proposals/2026-05-30-vendor-invoice-credit-memo-audit.md
---

# Vendor Invoice Credit Memo Audit

This skill detects invoice overcharges against approved negotiated price
agreements and drafts internal credit memo request packets. It does not send
emails outside Pro Exteriors.

## Process

1. Confirm invoice header:
   - one vendor,
   - one invoice number,
   - invoice date,
   - vendor branch or price zone,
   - source document reference.
2. Resolve each line item to an approved product mapping.
   - If the match is unapproved, call `product-catalog-manager` and stop external-send readiness.
3. Retrieve the active negotiated price agreement for the vendor, price zone, and invoice date.
4. Verify UOM.
   - If invoice UOM and agreement UOM differ, use an approved conversion factor.
   - If conversion is missing or ambiguous, mark the line `needs_review`.
5. Recalculate every line:
   ```text
   expected_credit = (invoice_unit_price - negotiated_unit_price) * approved_quantity
   ```
6. Include only overcharge lines in the credit memo packet.
7. Draft exactly one credit memo request email per invoice.
8. Route the packet and draft to Auditor.
9. After Auditor pass, route internally to Lucinda in the dedicated accounting Slack channel.
10. Create a follow-up task due no more than 7 days after human send.

## Credit Memo Request Packet

```text
CREDIT MEMO REQUEST REVIEW
Vendor: [vendor]
Invoice: [invoice_number]
Invoice Date: [invoice_date]
PE Branch / Price Zone: [price_zone]
Agreement: [agreement_number] ([effective_date] - [expiry_date])
Source: [invoice source] | [agreement source]

Expected Credit Memo Total: $[total]

Discrepancy Lines
1. [SKU] [description]
   Qty/UOM: [qty] [invoice_uom]
   Invoice price: $[invoice_unit_price]
   Negotiated price: $[negotiated_unit_price]
   Expected credit: $[line_credit]
   Match status: [approved | needs review]

Approval Status: Pending Lucinda review
Follow-up Due: [date]
```

## Email Draft

```text
Subject: Credit Memo Request - Invoice [invoice_number]

Hello [vendor contact],

Please review invoice [invoice_number] dated [invoice_date]. We found the
following line-item pricing discrepancies against our negotiated agreement
[agreement_number]:

[line table: item, invoice price, negotiated price, quantity, expected credit]

Expected credit memo total: $[total].

Thank you,
[Lucinda / approved sender]
```

## Rules

- One invoice per credit memo request.
- Do not send external email; route the draft internally.
- Store workflow state in Supabase only for the first build. Do not mirror credit memo status into GHL or AccuLynx.
- Do not use unapproved product matches for external-send-ready packets.
- Do not use Home Depot or Lowe's as negotiated-price authority.
- Keep all packets, including rejected packets, for audit. Archive instead of delete.
- Any math discrepancy greater than $0.01 fails Auditor review.
