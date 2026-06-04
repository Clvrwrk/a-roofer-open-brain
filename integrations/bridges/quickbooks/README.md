# QuickBooks Bridge

QuickBooks is the accounting system of record for the majority of Cleverwork roofing clients.
This bridge closes the financial loop that AccuLynx opens: AccuLynx tracks approved contract values
and invoices issued; QuickBooks tracks the actual cash movement, job costing, and tax treatment.
The combination gives `@ob-accounting` a complete financial picture per job and per property.

Priority: 3 of 5 in the roofer shortlist.

---

## Edition Notes: Online vs. Desktop

This bridge covers **QuickBooks Online** (QBO), which is a Tier 1 integration (REST API with OAuth 2.0
and webhook support). **QuickBooks Desktop** is a Tier 3 integration (ODBC or QBFC/IIF connector
running on the client's local machine) and is implemented as a separate adapter.

This README covers QBO only. Desktop notes are in `quickbooks-desktop/` (future adapter).

---

## Authentication (QBO)

QuickBooks Online uses OAuth 2.0 with Intuit's identity platform.

- OAuth flow: Authorization Code with PKCE
- Token endpoint: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
- Scopes required: `com.intuit.quickbooks.accounting`
- Token refresh: access tokens expire in 60 minutes; refresh tokens expire in 100 days
- Secret storage: `.env` → `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`,
  `QUICKBOOKS_REFRESH_TOKEN`, `QUICKBOOKS_REALM_ID`
- API base: `https://quickbooks.api.intuit.com/v3/company/{realmId}/`
- Sandbox: `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/`

The `QUICKBOOKS_REALM_ID` (company ID) is specific to each QuickBooks company file and is
provided after OAuth authorization. It lives in `.env` and must be set per client brain.

---

## Ingested Objects

### Invoices

QuickBooks invoices map to job financial atoms. The bridge ingests:
- Invoice header: invoice number, date, due date, total, balance, customer
- Line items: description, quantity, rate, amount — relevant for job-costing and scope verification
- Payment status: whether an invoice has outstanding balance or is fully paid

Invoice atoms cross-reference AccuLynx invoice atoms by invoice number (stored in `metadata.invoice_number`)
to create a linked financial record that spans both systems.

### Payments

Customer payment records (from customer payments applied against invoices) become financial atoms.
Payment method, amount, date, and the invoice(s) it satisfies are carried in `metadata`.

Payments toward ACV checks (insurance proceeds) are tagged `metadata.payment_type = "acv_insurance"`.
Depreciation recovery payments are tagged `metadata.payment_type = "rcv_supplement"`.

### Classes (Job Costing)

If the client uses QuickBooks Classes for job costing (a common setup for roofing companies —
one class per job or per crew), class-coded transactions produce job-costing atoms linking
the QuickBooks class name to the brain's `job_id`.

### Items / Products

The QuickBooks item catalog (Products and Services) is not continuously synced — it is read once
at setup to build a reference map of roofing material line items (GAF shingles, ice-and-water shield,
synthetic underlayment, etc.) that cross-reference EagleView takeoff materials.

### Vendors (Subcontractor Payments)

Vendor payments to subcontractors become job-costing atoms with `metadata.payment_type = "sub_payment"`.
Combined with the `crew` table (subcontractor relationships captured from AccuLynx), these allow
`@ob-accounting` to produce per-sub cost tracking per job.

---

## Insurance Supplement Accounting

Insurance work involves a specific financial pattern that the bridge tracks explicitly:

1. **ACV payment received** → atom with `trust_tier = "instruction"`, `metadata.payment_type = "acv_insurance"`
2. **Depreciation recovery check received** → atom with `trust_tier = "instruction"`, `metadata.payment_type = "rcv_supplement"`
3. **Supplement payment received** → atom with `metadata.payment_type = "supplement"`, linked to `insurance_claim.id`

When the bridge detects a payment from a known insurance carrier (matched against the carrier list
in `public.insurance_claim.carrier`), it attempts to link the payment to the open claim. If matched,
it updates `public.insurance_claim.claim_status` toward `"paid"`.

---

## Webhook Support (QBO)

QuickBooks Online provides webhooks for entity changes. Subscribe to:
- `Invoice` (Create, Update, Delete, Void)
- `Payment` (Create, Update, Delete)
- `Bill` (Create, Update — for subcontractor invoices)
- `VendorCredit` (Create, Update — supplement adjustments)

QBO webhook payloads are minimal (entity type + ID + timestamp); the bridge fetches the full
entity via REST after receiving the webhook notification.

---

## Scheduled Pull

In addition to webhooks, the bridge runs a daily pull for:
- Invoices modified in the last 48 hours (catches offline edits)
- Payments received in the last 48 hours
- New vendor bills (subcontractor invoices)

QBO uses a CDC (Change Data Capture) endpoint: `GET /v3/company/{realmId}/cdc?entities=Invoice,Payment,Bill`
that returns all entities changed since a given timestamp. This is more efficient than per-entity polling.

---

## Known Constraints

- Token refresh requires a running token-refresh job (Supabase cron or Deno KV scheduled task).
  If the refresh token expires (100-day window), re-authorization is required.
- QuickBooks class names must match AccuLynx job titles or external refs for automatic job-cost
  linking. If they do not match, the adapter flags unlinked transactions for human review.
- The Intuit API has its own rate limits (separate from AccuLynx). The bridge uses exponential
  backoff on 429 and 503 responses.
