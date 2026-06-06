# Pro Exteriors Invoice Intelligence Agent Personas

> Status: imported reference guide.
> Imported: 2026-06-06.
> Source file: `/Users/chussey/Documents/Claude/Projects/ProExteriors - Pricing/Agent_Personas.html`.
> Preserved HTML copy: `docs/reference/pro-exteriors-invoice-intelligence-agent-personas.html`.

This document is the bridge between the older Pro Exteriors pricing/invoice persona guide and the current Open Brain workforce model.

The HTML guide defines a five-agent invoice intelligence platform for Pro Exteriors. It should be treated as source context for the vendor pricing, invoice audit, credit memo, and financial recovery workflow. It does not replace the current 13-agent Open Brain roster in `AGENTS.md`; instead, its personas map into the current vertical/horizontal agents.

## Canonical Mapping

| Persona guide agent | Original role | Current Open Brain owner |
| --- | --- | --- |
| Maya Chen | Document intake, PDF classification, invoice extraction, UOM normalization, SKU normalization | `@ob-accounting` for invoice extraction and AP records; Capture for intake atomization |
| Alex Rivers | Pricing variance analysis, price agreement lookup, fuzzy SKU matching, recurring overcharge pattern detection | `@ob-accounting` for invoice audit; `@ob-ops` for product/catalog/branch matching; Auditor for math and evidence checks |
| Casey Morgan | Vendor challenge email and hold-request drafting | Conductor routes drafts; `@ob-accounting` owns credit memo packet; human reviewer sends externally |
| Jordan Price | Job P&L, financial analysis, commission invoice engine, AccuLynx financial writes | `@ob-accounting`; controlled writes only after human approval |
| Sam Torres | Accuracy monitoring, spot-check sampling, vendor grading, weekly compliance digest | Auditor for work-product QA; Quality Control for standard updates and vendor grading rules; Conductor for digests |

## Core Workflow From The Guide

1. GHL receives an inbound invoice/order/price-list email with PDF attachment.
2. Maya classifies the document and extracts structured invoice metadata and line items.
3. Extracted records are written to Supabase invoice tables.
4. Alex audits each invoice line against the active price agreement, branch, SKU, UOM, and historical pricing patterns.
5. Casey drafts a vendor-facing challenge or hold email when a discrepancy exists.
6. Jordan updates job-level financial impact, recovered credit tracking, and commission/payment context.
7. Sam runs spot checks, accuracy sampling, compliance monitoring, and vendor grading.
8. Human reviewers approve any external communication or operational write.

## Important Business Rules

- Agents never send vendor-facing emails directly.
- Credit memo requests are one invoice per email.
- Human reviewers remain final decision-makers before any email is dispatched.
- Draft orders receive urgent handling because pricing issues should be caught before processing.
- Invoice extraction should flag ambiguity instead of guessing.
- Price analysis must be traceable to a specific agreement, SKU match path, UOM conversion, branch, date, and invoice line.
- Color-variant SKU suffixes called out in the guide include `WW`, `BK`, `BR`, `SG`, `HE`, `WP`, and `TB`.
- Shingle UOM conversion rule from the guide: `3 BD = 1 SQ`; other UOMs pass through unless a reviewed conversion exists.
- Vendor challenge language should preserve the vendor relationship while making the correction request unambiguous.

## Supabase Surface Implied By The Guide

The guide expects or implies these tables or equivalents:

- `email_ingestion_log`
- `invoices`
- `invoice_items`
- `price_agreement_items`
- `commission_rates`
- `commission_invoice`
- vendor grading / accuracy sampling tables
- vendor credit memo tracking tables

The current ABC mirror work adds adjacent or replacement surfaces such as:

- `abc_product_catalog`
- `abc_vendor_branches`
- `abc_regions`
- `abc_price_agreements`
- `abc_invoice_documents`
- `abc_invoice_lines`
- `abc_orders`
- price agreement gap and human-review queue tables

When implementing, prefer the current table names and views in the Open Brain schema, but keep this guide's workflow and review gates intact.

## Onboarding Interpretation

If these personas are converted into actual desktop/container agents:

- Each persona gets a role-specific workspace, mailbox, bookmarks, SOPs, and read/write permissions.
- Workspace access is scoped to its mapped Open Brain role.
- Google Workspace accounts must be managed accounts with appropriate licenses and human-controlled recovery/2FA.
- Newsletter or portal signup authority should be allowlisted and routed through human approval when it creates a new account, paid relationship, outbound communication, or compliance risk.
- Persona names are useful for human UX, but production permissions should be assigned to current Open Brain roles and service identities.

## Current Placement

Use this reference alongside:

- `AGENTS.md`
- `agents/vertical/accounting/ROLE.md`
- `agents/vertical/ops/ROLE.md`
- `agents/horizontal/auditor/ROLE.md`
- `agents/horizontal/conductor/ROLE.md`
- `agents/horizontal/quality-control/ROLE.md`
- `docs/11-pro-exteriors-agent-workforce-plan.md`
- `docs/14-vendor-pricing-catalog-and-line-approval.md`
- `docs/27-hetzner-coolify-agent-host.md`
