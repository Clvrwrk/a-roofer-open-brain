# AccuLynx Vendor Discovery Backfill Report

Run date: 2026-07-27  
Supabase project: `rnhmvcpsvtqjlffpsayu`  
AccuLynx credential env var: `ACCULYNX_API_KEY`  
Permitted external method: AccuLynx `GET` only

## Endpoints Called

| Endpoint path | Calls | Status codes | Result |
| --- | ---: | --- | --- |
| `/contacts/contact-types?pageSize=100&pageStartIndex=0` | 1 | `200` × 1 | Returned two rows in one complete page: `Customer` and `General Contact`. |
| `/contacts?pageSize=100&pageStartIndex=0&includes=emailAddress,phoneNumber` | 1 | `400` × 1 | The API rejected the requested list parameters. No payload rows were used. |
| `/contacts?pageSize=100&pageStartIndex=0` | 1 | `400` × 1 | The API rejected the requested list parameters. No payload rows were used. |
| `/contacts` | 1 | `200` × 1 | Returned the first 10 of 105 contacts. Summary fields included names, company, email, phone, and mailing address, but no `contactType`, `contactTypes`, `contactTypeIds`, or `isSubcontractor` field. |

All four AccuLynx requests were serialized with at least 0.5 seconds between calls. No JobTread endpoint was called. No AccuLynx `POST`, `PUT`, `PATCH`, or `DELETE` request was made.

## Rows Loaded

Live SQL counts:

| Table | Before | After | Net rows loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.contact_types` | 0 | 2 | 2 |
| `acculynx_backfill.vendors` | 0 | 0 | 0 |

The two contact-type rows were inserted with an idempotent `ON CONFLICT (account_key, acculynx_id) DO UPDATE`. Both carry `fetched_at`, raw item JSON, and the exact source endpoint. The API credential resolves to the configured `sandbox` AccuLynx location, so `account_key='sandbox'` was used.

Before the production write, the Supabase preflight passed using completed physical backup `1222069117` from 2026-07-27 as backup proof. The write was limited to the two authorized `acculynx_backfill` tables.

The following nullable columns were added additively to `acculynx_backfill.vendors`:

- `name`, `email`, `phone`
- `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`

Live verification returned:

- `contact_types`: 2 rows, 0 missing provenance
- `vendors`: 0 rows, 0 missing provenance
- vendor rows with blank `name`: 0

## Anomalies

- No `429` responses occurred.
- Two `/contacts` probes returned `400`. Retrying the endpoint without query parameters returned `200`.
- The contact-type payload was not empty, but it contained only:
  - `Customer` (`52ba94c5-3ecf-4e7f-90cd-a91de12a72f5`)
  - `General Contact` (`64fac10a-95c0-46b0-b521-3422bbf77154`)
- Vendor-like classification reasoning: neither exact label denotes a vendor, supplier, subcontractor, installer, crew, trade partner, or material provider. `General Contact` is generic and is not evidence of a vendor relationship. Both dictionary rows were therefore stored with `reviewed_vendor=false` and `reviewed_subcontractor=false`.
- The successful `GET /contacts` summary page contained no type-membership field. Paging the remaining contacts could not establish that any contact belonged to a vendor-like type.
- The documented typed discovery route is the read-shaped but method-`POST` `/contacts/search`. The worker boundary prohibited all AccuLynx POST requests, so it was not called.
- The existing table used `acculynx_id` and `source_endpoint` rather than the brief's shorthand `id` and `endpoint`; the live contract was preserved.
- No credential values or raw contact PII were written to this report or logs.

## Verdict

**Contact-type backfill fixed; vendor discovery remains honestly empty.**

The live contact-type dictionary is now populated with the two real API rows, and the requested vendor identity/contact/address columns now exist. This resolves the prior `column "name" does not exist` verification error.

No vendor row was inserted because AccuLynx returned no vendor-like contact type and its GET contact listing supplied no type membership. Populating `vendors` from names or company names alone would violate the mapping contract and fabricate classification. A non-empty vendor backfill requires either a genuinely vendor-like type in this AccuLynx location or explicit authorization for the documented read-shaped `POST /contacts/search` operation.
