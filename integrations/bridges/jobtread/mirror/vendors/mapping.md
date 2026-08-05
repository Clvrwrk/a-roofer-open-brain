# AccuLynx Vendors → JobTread Vendor Accounts

Scope: JobTread organization `22PazeRM5FCH` (“Pro Exteriors”). This is a read-only research contract. No JobTread API call or database mutation was performed. The organization has one seat: sales representatives, assignees, vendor contacts, and subcontractors must remain custom-field values and must never become JobTread users, memberships, roles, or invitations.

## Source Tables

- `public.acculynx_accounts` — verified live; rows = 9. Supplies the source `account_key`/company scope. It is not a vendor master.
- `public.acculynx_api_catalog` — verified live; rows = 28. It inventories currently configured endpoints. Its only contact-domain rows are the collection/detail/email/phone paths (plus unsupported/write-only contact paths); it has no vendor, subcontractor, supplier, contact-type, or contact-search entry.
- `public.acculynx_contacts` — verified live; rows = 6768. Supplies contact GUID, names, company name, addresses, source account, archive state, and raw contact summary. The raw JSON has no contact-type marker, so these rows cannot presently be classified as vendors.
- `public.acculynx_contact_emails` — verified live; rows = 1. Optional email enrichment, currently almost empty.
- `public.acculynx_contact_phones` — verified live; rows = 3. Optional phone enrichment, currently almost empty.
- `public.acculynx_raw` — verified live; rows = 44582. Raw API landing evidence. It contains rows = 0 whose resource type or endpoint indicates contact types, vendors, subcontractors, or suppliers.
- **MISSING IN MIRROR:** there is no live `public.acculynx_*` table whose name contains vendor, subcontractor, or supplier (rows = 0), and the contact rows have no usable type membership. Therefore the vendor domain cannot be selected safely from the current mirror.

Backfill the missing domain through the AccuLynx Contacts surface:

1. `GET /contacts/contact-types`, paged with `pageSize` and `pageStartIndex`, to obtain company-specific type IDs and names.
2. `POST /contacts/search`, with `contactTypes`, required date range and sort, plus paging, to obtain contacts belonging to reviewed vendor/subcontractor types. This is a read-shaped search despite using POST.
3. `GET /contacts/{contactId}` when the search response is incomplete.
4. `GET /contacts/{contactId}/email-addresses` and `GET /contacts/{contactId}/phone-numbers` only when the search/detail response does not include full values.

The required [`API.md`](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md) says contact ingestion uses list/detail/search followed by email/phone/custom-field enrichment. Its generated local endpoint reference identifies the exact contact-type and search paths above. The existing AccuLynx ingest mapping says subcontractor status is derived from contact type.

Target mirror sketch (design only; these are logical datasets, not live table citations and were not created):

| Logical dataset | Grain/key | Minimum fields |
|---|---|---|
| Contact-type dictionary | one type per source account; `(account_key, type_id)` | source account key, type ID, exact type name, raw JSON, last-seen timestamp, archive timestamp |
| Contact/type membership | one membership; `(account_key, contact_id, type_id)` | source account key, contact GUID, type ID/name, reviewed vendor flag, reviewed subcontractor flag, raw JSON, last-seen/archive timestamps |

Type-name classification must be human-reviewed per AccuLynx account. A company name alone is not evidence that a contact is a vendor.

## Target Pave Ops

- `createAccount`
- `updateAccount`

Both names occur verbatim in the authoritative `schema-surface.json`: `createAccount` in `create_ops` and `updateAccount` in `update_ops`. No other mutation is required or authorized. In particular, this contract does not authorize contact, user, role, membership, invitation, location, custom-field-definition, or delete operations.

The schema surface proves operation existence, not the complete nested input schema. The local README says the official docs include account CRUD for customer/vendor accounts and custom-field values, but warns that nested field catalogs may be truncated. Fields not confirmed locally are explicitly marked unknown below.

## Field Mapping

“Backfill membership” below means a field returned by the proposed source backfill, not a currently live table or column.

| Source column/value | Pave input field | Type notes and transforms |
|---|---|---|
| constant `22PazeRM5FCH` | `createAccount.$.organizationId` | JobTread ID string; fixed organization. |
| `public.acculynx_contacts.company_name`; fallback to `first_name + last_name` | `createAccount.$.name`; `updateAccount.$.name` | Text. Trim and collapse whitespace; reject blank. Prefer company identity. Never merge distinct GUIDs solely by normalized name. |
| reviewed backfill membership where vendor or subcontractor flag is true | `createAccount.$.type` | Constant `vendor`. Exact enum spelling should be re-confirmed through read-only JobTread Explorer discovery before execution. A subcontractor is an Account, not a user. |
| durable crosswalk result | `updateAccount.$.id` | JobTread Account ID. Resolve only by source system + `account_key` + AccuLynx contact GUID; never guess from name. |
| `public.acculynx_contacts.id` | `updateAccount.$.customFieldValues[configured AccuLynx GUID field]` | Preserve as text. The target custom-field ID and value shape are unknown and must be discovered/preconfigured. If unavailable, retain the GUID only in the external crosswalk. |
| `public.acculynx_contacts.account_key` | `updateAccount.$.customFieldValues[configured source-account field]` | Text; required in identity to avoid cross-account collisions. Never export `env_secret_name`. |
| backfill membership exact type name(s) | `updateAccount.$.customFieldValues[configured contact-type field]` | Preserve exact labels, deterministically joined or represented using the discovered target field type. Do not convert them into roles/users. |
| `public.acculynx_contacts.first_name`, `last_name` | `updateAccount.$.customFieldValues[configured primary-contact-name field]` | Join nonblank values with one space. Data value only; never create a JobTread Contact/user. |
| `public.acculynx_contact_emails.email_address`, prefer `is_primary = true` | `updateAccount.$.customFieldValues[configured vendor-email field]` | Choose deterministically; validate; lowercase domain while preserving local part. Structured Account email input is unknown. |
| `public.acculynx_contact_phones.phone_number`, prefer `is_primary = true` | `updateAccount.$.customFieldValues[configured vendor-phone field]` | Choose deterministically. Normalize to E.164 only with known country; otherwise preserve trimmed source. Structured Account phone input is unknown. |
| `public.acculynx_contacts.mailing_*`; whole-address fallback to `billing_*` | `updateAccount.$.customFieldValues[configured vendor-address field]` | Render a canonical string. Do not mix mailing and billing components. Structured Account/location mapping is unknown and out of scope. |
| `public.acculynx_contacts.archived_at` plus backfill membership archive state | `updateAccount.$.customFieldValues[configured source-active field]` | Active only when both contact and qualifying membership are current. Exact target type is unknown. Never delete automatically. |
| any later sales rep, assignee, or representative value | `updateAccount.$.customFieldValues[configured representative field]` | Text/select value only. Never create or assign a user, membership, role, invitation, or Contact. |

Credentials must not appear in payload logs or this contract. Configuration documentation may refer only to environment-variable names such as `SUPABASE_ACCESS_TOKEN`, `JOBTREAD_GRANT_KEY`, and the applicable AccuLynx API-key variable.

## Gaps & Risks

- Vendor classification is unavailable now. Loading all 530 contacts with a company name would produce false positives; no vendor load may run until contact types/memberships are backfilled and reviewed.
- Contact types are customer-configured. Labels such as “Sub,” “Crew,” or “Supplier” are not self-proving and may vary across the 9 source accounts.
- One contact can have multiple types, while JobTread collapses the party to one vendor Account type. Preserve every source membership outside JobTread.
- Duplicate businesses across AccuLynx accounts are unresolved. GUID + account key is canonical source identity; name/email/phone are only match evidence and ambiguous matches need review.
- Email/phone fidelity is presently negligible (1 and 3 rows respectively). Do not promise complete vendor communications without endpoint hydration.
- The full Pave Account input and custom-field value shapes are unknown from the supplied operation list. Read-only Explorer/schema discovery must confirm `organizationId`, `name`, `type`, `id`, custom-field IDs, and value types before execution.
- Archive/disable semantics are unknown. A reversible source-active custom value is safer than deletion, but target visibility behavior needs confirmation.
- No-new-users is absolute. Representatives, owners, assignees, vendor people, and crew labels remain custom-field values.
- AccuLynx documents 10 requests/second per API key and 30 requests/second per IP. Date-window searches and per-contact hydration require checkpoints, bounded concurrency, and jittered retry for `429`.
- JobTread limiting is per grant, but the supplied README publishes no numeric ceiling. Begin serially and honor throttle responses.
- Pave puts its grant key in the request body, creating a logging risk. Redact the root authorization object and log only the env-var name.

## Loader Plan

1. For each active source `account_key`, page `GET /contacts/contact-types`; persist the dictionary and require human approval of vendor/subcontractor classifications.
2. For approved type IDs, page `POST /contacts/search` over bounded creation-date windows. Hydrate detail/email/phone only where required. Upsert the logical backfill datasets on their composite keys; mark absence/archive only after a complete successful sweep.
3. Perform read-only JobTread discovery for organization `22PazeRM5FCH`: existing vendor Accounts, exact Account mutation inputs, and configured Account custom-field IDs/types. Do not mutate at this stage.
4. Use the durable identity:

   `('acculynx', account_key, contact_guid) <-> ('jobtread', '22PazeRM5FCH', account_id)`

   Store source and target IDs, source type IDs, last normalized source hash, sync timestamp, and disposition. Crosswalk storage is an implementation decision; no live crosswalk table was verified by this research.
5. Match in order: exact crosswalk; configured AccuLynx GUID custom value; then normalized name/email/phone as review candidates only. Never auto-merge an ambiguous or cross-account candidate.
6. If unmatched, call `createAccount` once with only confirmed inputs and immediately persist the returned Account ID. On timeout/unknown outcome, reconcile before retrying; never blindly repeat create.
7. Call `updateAccount` by known Account ID for configured custom values and subsequent source changes. Hash normalized loader-owned fields and skip unchanged rows. Never overwrite human-owned values with null/blank source data.
8. Dependency order: contact types → reviewed classification → typed contacts → communication enrichment → JobTread schema/custom-field discovery → target match → `createAccount` → crosswalk → `updateAccount`.
9. AccuLynx batch: up to 100/page where supported; begin at concurrency 5 or lower, below the documented key ceiling. JobTread batch: one mutation/request, serial concurrency, checkpoint every 25 successes; increase only after measured error-free runs.
10. Reconcile counts of qualifying composite source keys, conflicts, crosswalk rows, successful target IDs, unchanged skips, and proposed inactive updates. Never delete a JobTread Account automatically.

## Evidence

All SQL below was run against Supabase project `rnhmvcpsvtqjlffpsayu` through its database-query endpoint. Every statement was `SELECT` or read `information_schema`; no INSERT, UPDATE, DELETE, or DDL was run.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_name LIKE 'acculynx_%'
ORDER BY table_schema, table_name;
```

The result included each exact table listed under Source Tables. No vendor/subcontractor/supplier table appeared.

```sql
SELECT 'acculynx_accounts' relation, count(*)::bigint rows
FROM public.acculynx_accounts
UNION ALL SELECT 'acculynx_api_catalog', count(*) FROM public.acculynx_api_catalog
UNION ALL SELECT 'acculynx_contacts', count(*) FROM public.acculynx_contacts
UNION ALL SELECT 'acculynx_contact_emails', count(*) FROM public.acculynx_contact_emails
UNION ALL SELECT 'acculynx_contact_phones', count(*) FROM public.acculynx_contact_phones
UNION ALL SELECT 'acculynx_raw', count(*) FROM public.acculynx_raw
ORDER BY relation;
```

- `public.acculynx_accounts`: rows = 9
- `public.acculynx_api_catalog`: rows = 28
- `public.acculynx_contacts`: rows = 6768
- `public.acculynx_contact_emails`: rows = 1
- `public.acculynx_contact_phones`: rows = 3
- `public.acculynx_raw`: rows = 44582

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'acculynx_accounts', 'acculynx_api_catalog', 'acculynx_contacts',
    'acculynx_contact_emails', 'acculynx_contact_phones', 'acculynx_raw'
  )
ORDER BY table_name, ordinal_position;
```

This verified every live source column referenced in Field Mapping. The output includes text `id`, `account_key`, name/address fields, JSONB `raw`, timestamps `last_seen_by_api`/`archived_at`, email/phone values, and primary flags.

```sql
SELECT count(*)::bigint AS rows
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'acculynx_%'
  AND lower(table_name) ~ '(vendor|subcontract|supplier)';
```

rows = 0

```sql
SELECT
  count(*)::bigint AS rows,
  count(DISTINCT (account_key, id))::bigint AS composite_keys,
  count(DISTINCT id)::bigint AS distinct_ids,
  count(*) FILTER (
    WHERE nullif(btrim(company_name), '') IS NOT NULL
  )::bigint AS rows_with_company_name,
  count(*) FILTER (
    WHERE raw ?| ARRAY[
      'contactType', 'contactTypes', 'contactTypeIds', 'isSubcontractor'
    ]
  )::bigint AS rows_with_type_marker
FROM public.acculynx_contacts;
```

- rows = 6768
- composite_keys = 6768
- distinct_ids = 6768
- rows_with_company_name = 530
- rows_with_type_marker = 0

```sql
SELECT count(*)::bigint AS rows
FROM public.acculynx_api_catalog
WHERE lower(concat_ws(
  ' ', endpoint_pattern, category, subcategory, target_table, notes
)) ~ '(vendor|subcontract|supplier)';
```

rows = 0

```sql
SELECT category, subcategory, method, endpoint_pattern, target_table, notes
FROM public.acculynx_api_catalog
WHERE lower(concat_ws(
  ' ', endpoint_pattern, category, subcategory, target_table, notes
)) ~ '(contact|vendor|subcontract|supplier)'
ORDER BY endpoint_pattern;
```

rows = 8. Relevant available GET rows are `/contacts`, `/contacts/{contact_id}`, `/contacts/{contact_id}/email-addresses`, `/contacts/{contact_id}/phone-numbers`, and `/jobs/{job_id}/contacts`; the catalog has no contact-type or contact-search row.

```sql
SELECT count(*)::bigint AS rows
FROM public.acculynx_raw
WHERE lower(concat_ws(' ', resource_type, api_endpoint))
  ~ '(contact.type|contact-type|contact_type|vendor|subcontract|supplier)';
```

rows = 0

The authoritative Pave surface was checked locally with:

```sh
jq '.create_ops, .update_ops' schema-surface.json
```

`createAccount` appeared in `create_ops`; `updateAccount` appeared in `update_ops`.
