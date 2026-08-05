# AccuLynx Jobs → JobTread Core Mapping Contract

Scope: mirror the live AccuLynx job/contact domain into JobTread organization **Pro Exteriors** (`22PazeRM5FCH`) as the three-level `customer Account → Location → Job` chain. This is a mapping contract, not an execution log. No JobTread API request was made. A future loader must read its grant from `JOBTREAD_GRANT_KEY`; no credential value belongs in logs, crosswalks, or payload fixtures.

The organization has one seat. The loader must never create or invite a JobTread user or membership. AccuLynx sales representatives, assignees, owners, and similar people must be stored as custom-field text values if/when those source values are available.

## Source Tables

All five names below were verified as live `public` tables through `information_schema.tables` and counted directly.

- `public.acculynx_jobs` — 35 columns; rows = 6,571, active rows = 6,571.
- `public.acculynx_contacts` — 27 columns; rows = 6,768, active rows = 30. Although most rows have `archived_at`, all 6,576 job-contact rows still resolve to an existing contact row. Treat this archive state as a mirror-quality flag, not proof that 6,738 customers should be omitted.
- `public.acculynx_job_contacts` — 13 columns; rows = 6,576, active rows = 6,573. This is the job-to-contact association and identifies the primary contact.
- `public.acculynx_contact_emails` — 12 columns; rows = 1, active rows = 1.
- `public.acculynx_contact_phones` — 12 columns; rows = 3, active rows = 3.

**MISSING IN MIRROR: resolved contact email and phone values at useful coverage.** The `acculynx_contacts.raw` payloads contain 3,803 email child references and 5,993 phone child references, but those embedded objects expose only `id` and `_link`; the normalized child tables contain only one email and three phones. Before production loading, backfill with `GET /contacts?includes=emailAddress,phoneNumber` or `GET /contacts/{contactId}?includes=emailAddress,phoneNumber`, falling back to `GET /contacts/{contactId}/email-addresses` and `GET /contacts/{contactId}/phone-numbers` (and the child-by-ID variants when a list response is only a reference). These are the contact list/detail and contact email/phone enrichment reads directed by “Contacts” and “Common Endpoint Choices” in [AccuLynx API.md](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md), whose local reference inventory supplies the exact paths. Respect the published API-key limit of 10 requests/second, the IP concurrency limit of 30 requests/second, `429` jittered backoff, and date-window pagination guidance.

No source table outside this list is required by this contract.

## Target Pave Ops

Only these mutation names are in the authoritative `schema-surface.json` snapshot:

- `createAccount` — create a customer Account. Relevant documented inputs: `organizationId`, `name`, `type`, `customFieldValues`.
- `updateAccount` — update an existing Account by `id`; relevant inputs: `name`, `primaryLocationId`, `customFieldValues`.
- `createLocation` — create the Account child Location. Relevant inputs: `accountId`, `name`, `address`, `parseAddress`, `customFieldValues`.
- `updateLocation` — update a Location by `id`; relevant inputs: `name`, `address`, `customFieldValues`.
- `createJob` — create the Job under a Location. Relevant inputs: `locationId`, `name`, `number`, `description`, `closedOn`, `customFieldValues`.
- `updateJob` — update a Job by `id`; relevant inputs: `name`, `number`, `description`, `closedOn`, `customFieldValues`.

The required dependency is explicitly documented by the local JobTread schema snapshot: a customer is required for a Location, and a Location is required for a Job. Do not use any user-, membership-, assignment-, or role-creation operation. Do not use delete operations during mirroring.

Custom fields named below are logical names. Resolve and cache their actual JobTread IDs before loading, then send `customFieldValues` keyed by those IDs. Whether every proposed target type supports every field type remains unknown until the organization’s custom-field definitions are read; do not silently substitute a different native field.

## Field Mapping

### Account identity and contact data

One canonical AccuLynx customer identity becomes one JobTread customer Account. This contract does not create a separate JobTread Contact because the required domain chain is Account → Location → Job and the documented `createContact` surface has only `accountId`, `name`, `title`, and `customFieldValues`; it offers no verified native email/phone inputs.

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `acculynx_contacts.id` | `createAccount.$.customFieldValues["AccuLynx Contact ID"]` | Text GUID; immutable source identity and recovery key. Also key the external crosswalk with it. |
| `acculynx_contacts.first_name`, `last_name` | `createAccount.$.name` | Trim and join nonblank parts with one space. If both are blank, use trimmed `company_name`; if all are blank, use `Unknown Customer — AccuLynx <id>`. |
| `acculynx_contacts.company_name` | `customFieldValues["AccuLynx Contact Company"]` | Text; preserve separately when a personal name is used as Account `name`. |
| `acculynx_contacts.salutation` | `customFieldValues["AccuLynx Salutation"]` | Optional text. |
| `acculynx_contacts.cross_reference` | `customFieldValues["AccuLynx Cross Reference"]` | Optional text. Not a primary key: 6,646 rows are blank and 37 contacts occur in 12 duplicate-value groups. |
| `acculynx_contacts.mailing_street1` … `mailing_country` | `customFieldValues["AccuLynx Mailing Address"]` | Join nonblank components into a formatted string. This is mailing data, not the job-site Location. |
| `acculynx_contacts.billing_street1` … `billing_country` | `customFieldValues["AccuLynx Billing Address"]` | Join nonblank components into a formatted string. Do not replace the job-site address. |
| `acculynx_contacts.geoid` | `customFieldValues["AccuLynx Contact GeoID"]` | Optional opaque text. |
| `acculynx_contacts.account_key` | `customFieldValues["AccuLynx Source Account"]` | Text branch/account partition. Preserve for provenance; do not turn it into a JobTread user. |
| `acculynx_contacts.market` | `customFieldValues["AccuLynx Contact Market"]` | Optional text; omit null. |
| `acculynx_contacts.archived_at`, `archive_reason` | `customFieldValues["AccuLynx Contact Mirror State"]` | Optional audit text. Never use mirror archive state alone to archive or delete a JobTread Account. |
| `acculynx_contacts.trust_tier` | no JobTread field by default | Mirror governance metadata, not customer CRM data. Retain in loader audit state only. |
| `acculynx_contacts.raw` | no wholesale copy | JSONB; do not copy raw customer payloads. Extract only explicitly mapped values. Embedded email/phone objects lack their values in the current mirror. |
| `acculynx_contacts.synced_at`, `last_seen_by_api` | no JobTread field | Loader freshness/watermark inputs only. |
| `acculynx_contact_emails.email_address` | `createAccount.$.customFieldValues["Primary Email"]` | Text; trim and lowercase for matching, preserve a trimmed display value. Select `is_primary DESC`, then deterministic `id`; omit blank. Coverage is currently unusable (rows = 1). |
| `acculynx_contact_emails.email_type` | `customFieldValues["Primary Email Type"]` | Optional text paired with selected email. |
| `acculynx_contact_emails.id`, `contact_id`, `is_primary` | crosswalk/selection only | `contact_id` joins to `acculynx_contacts.id`; child `id` breaks selection ties. |
| `acculynx_contact_emails.raw`, `synced_at`, `account_key`, `market`, `last_seen_by_api`, `archived_at`, `archive_reason` | no JobTread field | Enrichment/audit metadata only. Ignore archived children. |
| `acculynx_contact_phones.phone_number` | `createAccount.$.customFieldValues["Primary Phone"]` | Text, never numeric. Normalize to digits plus optional leading `+` for matching; preserve a human-readable value. Select `is_primary DESC`, then deterministic `id`; omit blank. Coverage is currently unusable (rows = 3). |
| `acculynx_contact_phones.phone_type` | `customFieldValues["Primary Phone Type"]` | Optional text paired with selected phone. |
| `acculynx_contact_phones.id`, `contact_id`, `is_primary` | crosswalk/selection only | `contact_id` joins to `acculynx_contacts.id`; child `id` breaks selection ties. |
| `acculynx_contact_phones.raw`, `synced_at`, `account_key`, `market`, `last_seen_by_api`, `archived_at`, `archive_reason` | no JobTread field | Enrichment/audit metadata only. Ignore archived children. |

`acculynx_job_contacts.job_id` joins to the job; `contact_id` joins to the Account source; `is_primary = true` selects the job’s customer Account. Use `relation_to_primary` only as `customFieldValues["AccuLynx Other Contact Relations"]` on the Job when multiple contacts exist. The association `id`, `raw`, synchronization columns, archive columns, and `trust_tier` remain loader/audit metadata.

### Location

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| resolved Account crosswalk | `createLocation.$.accountId` | Required JobTread ID from dependency level 1. |
| `acculynx_jobs.id` | `createLocation.$.customFieldValues["AccuLynx Job ID"]` | Text GUID. One source job gets one source-job Location crosswalk even when multiple jobs share an address. |
| `acculynx_jobs.job_name` | `createLocation.$.name` | Use `<job_name> — Job Site`; if blank (none currently), use the formatted address, then `AccuLynx Job Site <id>`. |
| `location_street1`, `location_city`, `location_state_abbrev`, `location_state`, `location_zip`, `location_country` | `createLocation.$.address` | Trim components; prefer `location_state_abbrev`, fall back to `location_state`. Format as one address string. Append country only when present and not clearly US/USA. Keep postal code as text. |
| derived address completeness | `createLocation.$.parseAddress` | Proposed boolean: `true` only for a complete formatted address. Exact parsing behavior is unknown and must be confirmed against the current JobTread schema/docs before execution; if unconfirmed, omit rather than guess. |
| `acculynx_jobs.latitude`, `longitude` | `customFieldValues["AccuLynx Latitude"]`, `["AccuLynx Longitude"]` | Numeric source; serialize as invariant decimal text unless matching numeric custom-field types are verified. Never infer missing coordinates. |
| `acculynx_jobs.geoid` | `customFieldValues["AccuLynx Job GeoID"]` | Optional opaque text. |
| `acculynx_jobs.property_id` | no JobTread field by default | Internal Supabase UUID, missing on 6,569 of 6,571 jobs. Keep only in loader audit/crosswalk metadata. |

Eighty-four jobs have at least one missing street/city/state/ZIP component. Create their Locations with the best nonblank address string and an `AccuLynx Address Incomplete = true` custom field only if JobTread accepts that address; otherwise quarantine those jobs for review. Never geocode or invent an address. Address equality is not identity: 941 jobs fall into 292 duplicate normalized-address groups.

### Job: all 35 source columns classified

| `acculynx_jobs` source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `id` | `createJob.$.customFieldValues["AccuLynx Job ID"]` | Text GUID; immutable source identity and crosswalk key. |
| `job_name` | `createJob.$.name` | Native text; trim. All live rows are populated. |
| `job_number` | `createJob.$.number` | Native text; omit blank. Never use as identity: 5,386 are blank and 22 jobs belong to nine duplicate-number groups. |
| `priority` | `customFieldValues["AccuLynx Priority"]` | Text/choice after exact option validation; observed `Normal`, `Urgent`, `High`. Do not map to an assignee. |
| `current_milestone` | `customFieldValues["AccuLynx Milestone"]` | Text/choice after option validation; preserve exact case-sensitive source value. |
| `milestone_date` | `customFieldValues["AccuLynx Milestone Date"]`; conditionally `closedOn` | ISO-8601 value. Set native `closedOn` to the date only when milestone is exactly `Closed`. Handling of `Completed` and `Cancelled` is an unknown business rule; preserve them as custom fields and do not close by inference. |
| `created_date` | `customFieldValues["AccuLynx Created At"]` | ISO-8601 text/date-time according to verified custom-field type. JobTread creation time cannot be backdated through a documented input. |
| `modified_date` | `customFieldValues["AccuLynx Modified At"]` | ISO-8601; also a loader change watermark. |
| `lead_dead_reason` | `customFieldValues["AccuLynx Lead Dead Reason"]` | Optional text. |
| `job_category_id` | `customFieldValues["AccuLynx Job Category ID"]` | Optional integer serialized as text unless numeric field verified. |
| `job_category_name` | `customFieldValues["AccuLynx Job Category"]` | Optional text/choice; 2,203 jobs are missing it. |
| `trade_types` | `customFieldValues["AccuLynx Trade Types"]` | PostgreSQL text array; trim, deduplicate, sort, and join with `; `. Do not invent a native JobTread trade field. |
| `location_street1` | Location `address` | Native Location component; not duplicated on Job. |
| `location_city` | Location `address` | Native Location component. |
| `location_state` | Location `address` fallback | Use only when `location_state_abbrev` is blank. |
| `location_state_abbrev` | Location `address` preferred state | Preserve as text. |
| `location_zip` | Location `address` | Text, preserving leading zeros. |
| `location_country` | Location `address` | Append for non-US addresses; omit redundant US marker. |
| `latitude` | Location custom field | See Location mapping. |
| `longitude` | Location custom field | See Location mapping. |
| `geoid` | Location custom field | See Location mapping. |
| `lead_source_id` | `customFieldValues["AccuLynx Lead Source ID"]` | Optional text. |
| `lead_source_name` | `customFieldValues["AccuLynx Lead Source"]` | Optional text/choice; 79 distinct nonnull values, so do not assume a fixed option set. |
| `initial_appointment_start` | `customFieldValues["AccuLynx Initial Appointment Start"]` | ISO-8601 if present; all 6,571 live rows are currently null, so omit. |
| `initial_appointment_end` | `customFieldValues["AccuLynx Initial Appointment End"]` | ISO-8601 if present; omit null. |
| `initial_appointment_notes` | `customFieldValues["AccuLynx Initial Appointment Notes"]` | Optional text. Do not append to native `description` without a policy decision because notes may contain sensitive customer information. |
| `raw` | no wholesale copy | JSONB; never send as a custom-field blob. The observed `raw.workType.name` may map to `customFieldValues["AccuLynx Work Type"]` after extraction; 2,200 jobs have one of seven values. No sales-rep/assignee key was observed in the live raw-key inventory. |
| `synced_at` | no JobTread field | Loader audit/watermark only. |
| `property_id` | no JobTread field by default | Internal UUID; see Location mapping. |
| `account_key` | `customFieldValues["AccuLynx Source Account"]` | Required provenance text; observed eight source partitions. It is not a JobTread user or membership. |
| `market` | `customFieldValues["AccuLynx Market"]` | Optional text; all 6,571 live values are null, so omit. |
| `last_seen_by_api` | no JobTread field | Loader staleness/audit watermark only. |
| `archived_at` | `customFieldValues["AccuLynx Archived At"]` only if nonnull | All jobs currently null. Do not delete a JobTread record from this signal. |
| `archive_reason` | `customFieldValues["AccuLynx Archive Reason"]` only if nonnull | Audit text; do not infer a native status. |
| `trust_tier` | no JobTread field by default | Mirror governance metadata; keep in loader audit state. |

The resolved Location crosswalk supplies required `createJob.$.locationId`. Native `description` has no clean source column in the mirror; leave it unset rather than manufacture narrative text.

## Gaps & Risks

- **Contact detail backfill is a launch gate.** The normalized child tables do not contain enough email/phone data for a useful CRM migration. Do not claim email/phone completeness from child IDs embedded in `raw`.
- **Archive semantics are inconsistent.** Only 30 contact rows are unarchived, yet active job-contact associations resolve to the archived contact rows. Filtering contacts on `archived_at IS NULL` would leave 6,542 jobs without an active contact. Resolve why the contact mirror archived these records before treating that flag as source truth.
- **Some jobs have no safe customer.** Sixty-three jobs have no active job-contact association. They require a deterministic per-job placeholder Account, flagged `AccuLynx Customer Missing = true`, or manual resolution. Never attach them to an arbitrary customer.
- **Multi-contact fidelity loss.** Sixty-two jobs have multiple active contacts. The primary link chooses the Account; secondary people and `relation_to_primary` cannot be represented natively in the required three-level chain. Preserve a compact relation summary in a Job custom field or defer a separately approved Contact phase.
- **Deduplication is uncertain without resolved communication values.** There are 159 duplicate normalized name+mailing-address groups covering 357 contacts, while `cross_reference` is mostly absent and sometimes duplicated. False merges are more damaging than duplicate Accounts, so current GUIDs remain distinct unless a high-confidence rule matches them.
- **Job status is not a verified native mapping.** The live milestones are `Cancelled` (5,100), `Closed` (651), `Lead` (270), `Prospect` (216), `Invoiced` (170), `Approved` (99), and `Completed` (65). Only exact `Closed` has a conservative `closedOn` rule; all other workflow/status behavior is unknown.
- **Custom-field provisioning and types are unknown.** The operation surface proves `customFieldValues` is accepted, but the target organization’s existing field IDs, target types, option sets, maximum lengths, and date/numeric coercion were not queried because JobTread access was prohibited. Preflight them before mutation. Do not create fields implicitly.
- **Address parsing is lossy.** JobTread’s documented Location input is one `address` string; AccuLynx stores separate components and coordinates. Eighty-four jobs have incomplete US address components, and address duplicates are legitimate. Preserve coordinates/GeoID as custom fields where supported.
- **No new users.** No live job raw key exposed sales rep/assignee data. If a later detail backfill exposes it, store the display name and stable source ID as Job custom fields only. Never invoke user/membership/role creation or assignment behavior.
- **Rate limits are partially unknown.** JobTread documentation says limits are per grant but does not publish exact numbers. Use bounded serial/conservative concurrency, exponential backoff with jitter for `429`/transient failures, and resume from the crosswalk. AccuLynx backfill limits are 10 requests/second per key and 30 requests/second per IP.
- **Single-seat operational risk.** Use `notify: false` wherever the mutation input supports it, avoid assignment fields, and test with a tiny quarantined batch. Exact notification behavior for each mutation is unknown.
- **No destructive synchronization.** Source disappearance/archive never triggers `deleteAccount`, `deleteLocation`, or `deleteJob`. Record the discrepancy for review.

## Loader Plan

1. **Preflight without mutation.** Confirm the grant resolves to organization `22PazeRM5FCH`; read existing custom-field definitions and cache their IDs/types/options by target type; verify the Account/Location/Job query shapes needed for recovery. Abort on any organization mismatch. Do not create users, memberships, roles, or custom fields.
2. **Build a deterministic source snapshot.** Read the five verified tables at a fixed watermark. Join active `acculynx_job_contacts` to jobs and contacts, but do not exclude a resolved contact solely because the contact row is mirror-archived. Select the single `is_primary = true` link; there are no jobs with multiple primary links. Quarantine malformed/ambiguous rows rather than guessing.
3. **Canonicalize Accounts conservatively.** Identity hierarchy after the contact backfill is: exact AccuLynx contact GUID first; then a previously human-approved alias; then unique normalized email; then unique normalized phone; then unique `cross_reference`; then exact normalized `(name, complete mailing address)`. Any collision or missing evidence remains a distinct GUID-backed Account. Reuse the Account for the 31 contacts linked to multiple jobs. For the 63 unlinked jobs, create at most one placeholder Account per job GUID, never one global “Unknown” Account.
4. **Dependency level 1 — Account.** Look up crosswalk key `(org_id, entity_kind='account', account_key, acculynx_contact_guid)`; if absent, recover by the exact `AccuLynx Contact ID` custom-field value, not by name. Use `createAccount` with `organizationId = 22PazeRM5FCH`, `type = customer`, then persist returned `createdAccount.id`. If found, compare normalized managed fields and send only changed fields through `updateAccount`.
5. **Dependency level 2 — Location.** Key one Location per source job as `(org_id, entity_kind='location', account_key, acculynx_job_guid)`. This intentionally does not collapse repeated addresses: a source Job must not move between customer Accounts because another job shares the property. Recover by `AccuLynx Job ID` on a Location when crosswalk state is lost. Create/update only after resolving `accountId`.
6. **Dependency level 3 — Job.** Key `(org_id, entity_kind='job', account_key, acculynx_job_guid)`. Recover by the exact Job custom field, never `job_number`, job name, or address. Create/update only after resolving `locationId`.
7. **Crosswalk durability.** Store at minimum `org_id`, `entity_kind`, `account_key`, `acculynx_guid`, `jt_id`, source fingerprint, last source `modified_date`/`synced_at`, last successful load time, and loader version. Enforce uniqueness on both `(org_id, entity_kind, account_key, acculynx_guid)` and the nonnull `(org_id, entity_kind, jt_id)`. The crosswalk’s physical storage location/schema is outside this contract and must be approved separately.
8. **Idempotent write rule.** Compute a canonical hash from only loader-managed target fields. No-op when the hash matches the last successful hash. On retry after an uncertain response, recover by the immutable AccuLynx-ID custom field before any create. Never overwrite user-managed JobTread fields that are not in this contract.
9. **Batching and backoff.** Start with a 10-job canary spanning normal, incomplete-address, multi-contact, missing-contact, and closed cases. After reconciliation, use batches of 25 source jobs and at most one mutation request in flight until observed limits are known. Checkpoint after every successful entity, honor server retry guidance, and use exponential backoff with jitter. A batch is a resume unit, not a transaction across systems.
10. **Reconciliation.** For every batch require exactly one Job crosswalk and one Location crosswalk per accepted AccuLynx job, plus one resolved Account crosswalk. Report quarantines, duplicate recovery matches, missing custom fields, rejected addresses, and hash drift. Never compensate a partial failure with deletes.

## Evidence

All SQL below was sent to Supabase project `rnhmvcpsvtqjlffpsayu` through the management query endpoint using `SUPABASE_ACCESS_TOKEN`. Every statement is `SELECT`/`information_schema` only.

### Live table verification

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'acculynx_jobs',
    'acculynx_contacts',
    'acculynx_job_contacts',
    'acculynx_contact_emails',
    'acculynx_contact_phones'
  )
ORDER BY table_name;
```

Result: five exact matches — `acculynx_contact_emails`, `acculynx_contact_phones`, `acculynx_contacts`, `acculynx_job_contacts`, `acculynx_jobs`; rows = 5.

### Column verification

```sql
SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'acculynx_jobs',
    'acculynx_contacts',
    'acculynx_job_contacts',
    'acculynx_contact_emails',
    'acculynx_contact_phones'
  )
ORDER BY table_name, ordinal_position;
```

Result: `acculynx_jobs` columns = 35; `acculynx_contacts` columns = 27; `acculynx_job_contacts` columns = 13; `acculynx_contact_emails` columns = 12; `acculynx_contact_phones` columns = 12; rows = 99.

### Source row counts

```sql
SELECT 'acculynx_jobs' AS table_name, COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE archived_at IS NULL) AS active_rows
FROM public.acculynx_jobs
UNION ALL
SELECT 'acculynx_contacts', COUNT(*),
       COUNT(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_contacts
UNION ALL
SELECT 'acculynx_job_contacts', COUNT(*),
       COUNT(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_job_contacts
UNION ALL
SELECT 'acculynx_contact_emails', COUNT(*),
       COUNT(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_contact_emails
UNION ALL
SELECT 'acculynx_contact_phones', COUNT(*),
       COUNT(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_contact_phones
ORDER BY table_name;
```

Results:

- `acculynx_jobs`: rows = 6,571; active rows = 6,571.
- `acculynx_contacts`: rows = 6,768; active rows = 30.
- `acculynx_job_contacts`: rows = 6,576; active rows = 6,573.
- `acculynx_contact_emails`: rows = 1; active rows = 1.
- `acculynx_contact_phones`: rows = 3; active rows = 3.

### Relationship integrity and customer availability

```sql
SELECT
  (SELECT COUNT(DISTINCT id) FROM public.acculynx_jobs) AS distinct_job_ids,
  (SELECT COUNT(DISTINCT id) FROM public.acculynx_contacts) AS distinct_contact_ids,
  (SELECT COUNT(DISTINCT id) FROM public.acculynx_job_contacts) AS distinct_job_contact_ids,
  (SELECT COUNT(*) FROM public.acculynx_job_contacts jc
   LEFT JOIN public.acculynx_jobs j ON j.id = jc.job_id
   WHERE j.id IS NULL) AS links_missing_job,
  (SELECT COUNT(*) FROM public.acculynx_job_contacts jc
   LEFT JOIN public.acculynx_contacts c ON c.id = jc.contact_id
   WHERE c.id IS NULL) AS links_missing_contact,
  (SELECT COUNT(*) FROM public.acculynx_jobs j
   WHERE NOT EXISTS (
     SELECT 1 FROM public.acculynx_job_contacts jc
     WHERE jc.job_id = j.id AND jc.archived_at IS NULL
   )) AS jobs_without_active_link,
  (SELECT COUNT(*) FROM public.acculynx_jobs j
   WHERE NOT EXISTS (
     SELECT 1
     FROM public.acculynx_job_contacts jc
     JOIN public.acculynx_contacts c ON c.id = jc.contact_id
     WHERE jc.job_id = j.id
       AND jc.archived_at IS NULL
       AND c.archived_at IS NULL
   )) AS jobs_without_active_contact,
  (SELECT COUNT(*) FROM public.acculynx_jobs j
   WHERE NOT EXISTS (
     SELECT 1 FROM public.acculynx_job_contacts jc
     WHERE jc.job_id = j.id
       AND jc.archived_at IS NULL
       AND jc.is_primary IS TRUE
   )) AS jobs_without_primary_link,
  (SELECT COUNT(*) FROM (
     SELECT job_id, contact_id, COUNT(*)
     FROM public.acculynx_job_contacts
     GROUP BY job_id, contact_id
     HAVING COUNT(*) > 1
   ) d) AS duplicate_job_contact_pairs;
```

Result: distinct jobs = 6,571; distinct contacts = 6,768; distinct link IDs = 6,576; missing-job links = 0; missing-contact links = 0; jobs without active link = 63; jobs without an unarchived linked contact = 6,542; jobs without active primary link = 63; duplicate job/contact pair groups = 4; rows = 1.

```sql
WITH per_job AS (
  SELECT j.id,
         COUNT(jc.id) FILTER (WHERE jc.archived_at IS NULL) AS active_links,
         COUNT(jc.id) FILTER (
           WHERE jc.archived_at IS NULL AND jc.is_primary IS TRUE
         ) AS primary_links
  FROM public.acculynx_jobs j
  LEFT JOIN public.acculynx_job_contacts jc ON jc.job_id = j.id
  GROUP BY j.id
), per_contact AS (
  SELECT c.id,
         COUNT(DISTINCT jc.job_id) FILTER (
           WHERE jc.archived_at IS NULL
         ) AS linked_jobs
  FROM public.acculynx_contacts c
  LEFT JOIN public.acculynx_job_contacts jc ON jc.contact_id = c.id
  GROUP BY c.id
)
SELECT
  COUNT(*) FILTER (WHERE active_links = 0) AS jobs_0_contacts,
  COUNT(*) FILTER (WHERE active_links = 1) AS jobs_1_contact,
  COUNT(*) FILTER (WHERE active_links > 1) AS jobs_multi_contact,
  MAX(active_links) AS max_contacts_per_job,
  COUNT(*) FILTER (WHERE primary_links > 1) AS jobs_multi_primary,
  (SELECT COUNT(*) FROM per_contact WHERE linked_jobs > 1)
    AS contacts_linked_multi_jobs,
  (SELECT MAX(linked_jobs) FROM per_contact) AS max_jobs_per_contact
FROM per_job;
```

Result: jobs with zero contacts = 63; one contact = 6,446; multiple contacts = 62; maximum contacts/job = 4; multiple primary contacts = 0; contacts linked to multiple jobs = 31; maximum jobs/contact = 14; rows = 1.

### Job completeness

```sql
SELECT
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(job_name),'') IS NULL) AS missing_job_name,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(job_number),'') IS NULL) AS missing_job_number,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(location_street1),'') IS NULL) AS missing_street1,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(location_city),'') IS NULL) AS missing_city,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(location_state_abbrev, location_state)),'') IS NULL
  ) AS missing_state,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(location_zip),'') IS NULL) AS missing_zip,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(location_street1),'') IS NULL
       OR NULLIF(BTRIM(location_city),'') IS NULL
       OR NULLIF(BTRIM(COALESCE(location_state_abbrev, location_state)),'') IS NULL
       OR NULLIF(BTRIM(location_zip),'') IS NULL
  ) AS incomplete_us_address,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS missing_coordinates,
  COUNT(*) FILTER (WHERE current_milestone IS NULL) AS missing_milestone,
  COUNT(*) FILTER (WHERE priority IS NULL) AS missing_priority,
  COUNT(*) FILTER (WHERE job_category_name IS NULL) AS missing_category,
  COUNT(*) FILTER (
    WHERE trade_types IS NULL OR cardinality(trade_types) = 0
  ) AS missing_trade_types,
  COUNT(*) FILTER (WHERE lead_source_name IS NULL) AS missing_lead_source,
  COUNT(*) FILTER (
    WHERE initial_appointment_start IS NULL
  ) AS missing_initial_appointment,
  COUNT(*) FILTER (WHERE property_id IS NULL) AS missing_property_id,
  COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS archived_rows
FROM public.acculynx_jobs;
```

Result: rows = 6,571; missing name = 0; missing number = 5,386; incomplete address = 84; missing coordinates = 72; missing milestone = 0; missing priority = 0; missing category = 2,203; missing trade types = 4,871; missing lead source = 1,512; missing initial appointment = 6,571; missing property ID = 6,569; archived jobs = 0.

### Contact enrichment and dedupe evidence

```sql
SELECT
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE archived_at IS NULL) AS active_rows,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(first_name),'') IS NULL
      AND NULLIF(BTRIM(last_name),'') IS NULL
      AND NULLIF(BTRIM(company_name),'') IS NULL
  ) AS missing_display_name,
  COUNT(*) FILTER (
    WHERE jsonb_typeof(raw->'emailAddresses') = 'array'
      AND jsonb_array_length(raw->'emailAddresses') > 0
  ) AS raw_with_emails,
  COUNT(*) FILTER (
    WHERE jsonb_typeof(raw->'phoneNumbers') = 'array'
      AND jsonb_array_length(raw->'phoneNumbers') > 0
  ) AS raw_with_phones,
  SUM(CASE
    WHEN jsonb_typeof(raw->'emailAddresses') = 'array'
    THEN jsonb_array_length(raw->'emailAddresses') ELSE 0
  END) AS raw_email_elements,
  SUM(CASE
    WHEN jsonb_typeof(raw->'phoneNumbers') = 'array'
    THEN jsonb_array_length(raw->'phoneNumbers') ELSE 0
  END) AS raw_phone_elements
FROM public.acculynx_contacts;
```

Result: rows = 6,768; active rows = 30; missing display name = 2; contacts with email child references = 3,652; contacts with phone child references = 5,723; raw email child elements = 3,803; raw phone child elements = 5,993.

```sql
WITH sig AS (
  SELECT id,
    lower(regexp_replace(
      concat_ws(' ', NULLIF(BTRIM(first_name),''), NULLIF(BTRIM(last_name),'')),
      '[^a-z0-9]+', '', 'g'
    )) AS name_key,
    lower(regexp_replace(
      concat_ws('|',
        NULLIF(BTRIM(mailing_street1),''),
        NULLIF(BTRIM(mailing_city),''),
        NULLIF(BTRIM(mailing_state),''),
        NULLIF(BTRIM(mailing_zip),'')
      ), '[^a-z0-9|]+', '', 'g'
    )) AS address_key,
    NULLIF(BTRIM(cross_reference),'') AS cross_reference
  FROM public.acculynx_contacts
), name_addr_dupes AS (
  SELECT name_key, address_key, COUNT(*) AS n
  FROM sig
  WHERE name_key <> '' AND address_key <> '|||'
  GROUP BY name_key, address_key
  HAVING COUNT(*) > 1
), xref_dupes AS (
  SELECT cross_reference, COUNT(*) AS n
  FROM sig
  WHERE cross_reference IS NOT NULL
  GROUP BY cross_reference
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM name_addr_dupes) AS duplicate_name_address_groups,
  (SELECT COALESCE(SUM(n),0) FROM name_addr_dupes)
    AS contacts_in_duplicate_name_address_groups,
  (SELECT COUNT(*) FROM xref_dupes) AS duplicate_cross_reference_groups,
  (SELECT COALESCE(SUM(n),0) FROM xref_dupes)
    AS contacts_in_duplicate_cross_reference_groups,
  (SELECT COUNT(*) FROM sig WHERE cross_reference IS NULL)
    AS missing_cross_reference;
```

Result: duplicate name/address groups = 159 covering 357 contacts; duplicate cross-reference groups = 12 covering 37 contacts; missing cross-reference = 6,646; rows = 1.

### Unsafe alternate keys

```sql
WITH job_numbers AS (
  SELECT BTRIM(job_number) AS k, COUNT(*) AS n
  FROM public.acculynx_jobs
  WHERE NULLIF(BTRIM(job_number),'') IS NOT NULL
  GROUP BY BTRIM(job_number)
  HAVING COUNT(*) > 1
), addresses AS (
  SELECT lower(regexp_replace(
    concat_ws('|',
      NULLIF(BTRIM(location_street1),''),
      NULLIF(BTRIM(location_city),''),
      NULLIF(BTRIM(COALESCE(location_state_abbrev, location_state)),''),
      NULLIF(BTRIM(location_zip),'')
    ), '[^a-z0-9|]+', '', 'g'
  )) AS k,
  COUNT(*) AS n
  FROM public.acculynx_jobs
  GROUP BY 1
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM job_numbers) AS duplicate_job_number_groups,
  (SELECT COALESCE(SUM(n),0) FROM job_numbers)
    AS jobs_in_duplicate_job_number_groups,
  (SELECT COUNT(*) FROM addresses WHERE k <> '|||')
    AS duplicate_address_groups,
  (SELECT COALESCE(SUM(n),0) FROM addresses WHERE k <> '|||')
    AS jobs_at_duplicate_addresses;
```

Result: duplicate job-number groups = 9 covering 22 jobs; duplicate normalized-address groups = 292 covering 941 jobs; rows = 1.

### Observed milestone and priority values

```sql
SELECT 'current_milestone' AS field, current_milestone AS value, COUNT(*) AS rows
FROM public.acculynx_jobs
GROUP BY current_milestone
UNION ALL
SELECT 'priority', priority, COUNT(*)
FROM public.acculynx_jobs
GROUP BY priority
ORDER BY field, rows DESC;
```

Result: `Cancelled` rows = 5,100; `Closed` rows = 651; `Lead` rows = 270; `Prospect` rows = 216; `Invoiced` rows = 170; `Approved` rows = 99; `Completed` rows = 65; `Normal` priority rows = 5,887; `Urgent` rows = 551; `High` rows = 133.
