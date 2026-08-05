# AccuLynx Vendor Discovery Backfill Report — Retry

Run date: 2026-07-27  
Supabase project: `rnhmvcpsvtqjlffpsayu`  
Target table: `acculynx_backfill.vendors`

## Endpoints Called

### AccuLynx

| Method | Endpoint | Calls | Status codes | Result |
| --- | --- | ---: | --- | --- |
| `GET` | `/contacts/contact-types?pageSize=100&pageStartIndex=0` | 9 | `200` × 9 | Enumerated contact types independently with each branch key. |
| `POST` | `/contacts/search?pageSize=25&pageStartIndex={page}` | 307 | `200` × 285; `400` × 22 | The first 22 calls used the documented date-time format and were rejected. The corrected date-only requests fully paged all nine branch locations. |

The successful searches returned 6,742 contact/type memberships:

| Account key | Contact types searched | Successful search calls | Membership rows inspected |
| --- | --- | ---: | ---: |
| `colorado` | Customer; General Contact; Company Contacts | 77 | 1,894 |
| `florida` | Customer; General Contact | 3 | 31 |
| `georgia` | Customer; General Contact | 20 | 472 |
| `insurance_program` | Customer; General Contact | 3 | 29 |
| `kansas_city` | Customer; General Contact; Company Contacts | 9 | 173 |
| `multi_family_commercial` | Customer; General Contact | 17 | 391 |
| `sandbox` | Customer; General Contact | 6 | 105 |
| `texas` | Customer; General Contact; Company Contacts | 94 | 2,302 |
| `wichita` | Customer; General Contact; Company Contacts | 56 | 1,345 |

Each account used its mapped `PE_CC_*_ACCULYNX_API_KEY` bearer token. Requests were serialized at no more than approximately 1.9 requests/second per key. No JobTread endpoint was called. No AccuLynx endpoint other than the read-shaped `/contacts/search` received a `POST`; no external `PUT`, `PATCH`, or `DELETE` was called.

### Supabase / QBO fallback

Supabase Management API SQL inspected:

- `information_schema.columns` for `public.v_qbo_register_lines`
- `public.v_qbo_register_lines` (29,883 live register lines)
- `public.qbo_vendors`, used only to prove that a register payee reference is a QBO Vendor entity
- `acculynx_backfill.vendors` schema, constraints, counts, and provenance

The QBO source rows were restricted to `Purchase` and `BillPayment` activity and loaded with `source_endpoint='supabase:v_qbo_register_lines'`.

## Rows Loaded (live before/after counts)

| Table | Before | After | Net rows loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.vendors` | 0 | 1,313 | 1,313 |

Source breakdown after the load:

| Strategy | Rows |
| --- | ---: |
| AccuLynx typed contact discovery | 0 |
| QBO register payees proven to be QBO Vendor entities | 1,313 |

The QBO candidates came from 21,035 qualifying register lines. The load used deterministic IDs derived from QBO realm and payee reference and `ON CONFLICT (account_key, acculynx_id, contact_type_id) DO UPDATE`, so reruns update the same rows instead of duplicating them.

Every loaded row has:

- `account_key='qbo'`
- `contact_type_id='qbo_vendor'` and `contact_type_name='QBO Vendor'`
- a nonblank vendor/company name
- aggregate `raw` provenance containing the QBO realm/payee reference, transaction count and range, transaction/source types, and active status
- `fetched_at`
- `source_endpoint='supabase:v_qbo_register_lines'`

Live verification found:

- 0 rows missing `raw`, `fetched_at`, or `source_endpoint`
- 0 QBO rows with a blank vendor/company name
- 53 rows whose names independently contain a construction/material-supplier signal such as roofing, supply, lumber, building, material, or a major building-supply brand

No schema alteration was necessary.

## Anomalies

- The current AccuLynx documentation describes `startDate` and `endDate` as ISO 8601 date-time fields. The live endpoint rejected that format with `400 Start Date is not in valid format (YYYY-MM-DD)`. Retrying the same whitelisted endpoint with date-only values succeeded.
- AccuLynx exposed only `Customer`, `General Contact`, and, for four locations, `Company Contacts`. A company contact is not inherently a vendor. No searched payload exposed an explicit vendor, supplier, subcontractor, installer, crew, or trade-partner flag. AccuLynx therefore produced zero honestly classifiable vendor rows.
- The 6,742 AccuLynx result count is contact/type membership rows, not a claimed unique-person count; a contact can belong to more than one searched type.
- No `429` response occurred.
- Supabase production backup `1222069117` was verified as a completed physical backup from 2026-07-27 before the write. The repository preflight passed its target, SQL, secret-scan, and backup-proof checks; its Supabase CLI availability check could not complete because the sandbox blocked the CLI's telemetry-file write outside the authorized workspace. SQL was therefore executed through the user-specified Supabase Management API.
- QBO exclusion rules were deliberately conservative:
  - excluded all transfers, deposits, journal entries, and customer `Payment` activity;
  - excluded credit-card `BillPayment` rows while retaining merchant `Purchase` rows paid by credit card;
  - excluded payees that did not join to the same-realm `public.qbo_vendors` entity;
  - excluded blank identities;
  - excluded obvious payroll, tax authority/tax-payment, owner/member/shareholder draw, transfer, and credit-card issuer/payment names.
- Across all 29,883 register lines, the disposition counts were: 21,035 included vendor lines; 164 credit-card-payment lines; 3,056 non-vendor transaction lines; 5,576 lines whose payee was not a QBO Vendor entity; and 52 obvious non-vendor lines.
- No credentials or raw credential values were copied to this report.

## Verdict

**Strategy B (QBO) produced the canonical vendor list: 1,313 real vendor entities.**

QBO is canonical for this backfill because each included register payee was independently proven to be a same-realm QBO Vendor entity and had actual Purchase or BillPayment activity. This is stronger evidence than company-name guessing and avoids treating customers, transfers, card payments, payroll, and other obvious non-vendors as suppliers.

Strategy A remains useful negative evidence: all nine branch keys were searched successfully and comprehensively, but AccuLynx supplied no vendor-specific contact type or explicit vendor/trade flag. Its zero-row result was therefore preserved rather than inventing classifications.
