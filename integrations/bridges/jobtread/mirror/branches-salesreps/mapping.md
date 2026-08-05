# AccuLynx Branch and Sales-Representative Mapping to JobTread

Scope: Pro Exteriors, JobTread organization `22PazeRM5FCH`. This contract intentionally models AccuLynx branches and people as Job-targeted custom-field values. It must never create a JobTread user, membership, role, or assignment. Credentials are referenced only by environment-variable name (`SUPABASE_ACCESS_TOKEN`, and at loader runtime `JOBTREAD_GRANT_KEY`).

## Source Tables

- `public.acculynx_accounts` — verified live; 9 rows. This is the branch/account registry. `account_key` is the stable source key and `label` is the human-facing option label. All 9 rows currently have `is_active = true`; eight are production and one is sandbox.
- `public.acculynx_users` — verified live; 406 rows and 406 distinct `id` values. This is the people/options roster. It contains 183 Active and 223 Inactive rows. `id` is the stable AccuLynx user GUID; `display_name` is not unique (only 122 distinct values across all 406 rows).
- `public.acculynx_jobs` — verified live; 6,571 rows. Branch assignment is carried by the scalar `account_key` column. **No column in this table carries a sales-rep or other representative assignment**, and its `raw` JSON has no representative key.
- `public.acculynx_raw` — verified live; 44,582 rows. The `resource_type = 'representatives'` subset has 6,682 successful response rows containing 8,723 representative items. The job GUID must be parsed from `api_endpoint` because `resource_id` is null for these rows. Each item has `id`, `type`, and `user.id`; the observed types are `CompanyRepresentative`, `SalesOwner`, `Additional`, and `AROwner`. All 8,723 `user.id` occurrences match `public.acculynx_users.id`.
- **MISSING IN MIRROR: normalized job-representative assignment table.** The assignment domain is present only as response envelopes in `public.acculynx_raw`, not as a first-class `acculynx_*` table and not in `public.acculynx_jobs`. Backfill/normalization should read AccuLynx `GET /jobs/{jobId}/representatives`; where the API exposes the narrower routes, retain `GET /jobs/{jobId}/representatives/company` and `GET /jobs/{jobId}/representatives/sales-owner` as separate semantics. The local ingest references describe job reads and user coverage in [`API.md`](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md) and distinguish company representative from sales owner in [`mapping.md`](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/mapping.md).

The nine verified branch dropdown options, keyed by `account_key`, are: `Colorado` (`colorado`), `Florida` (`florida`), `Georgia` (`georgia`), `Insurance Program` (`insurance_program`), `Kansas City` (`kansas_city`), `Multi-Family / Commercial` (`multi_family_commercial`), `Sandbox` (`sandbox`), `Texas` (`texas`), and `Wichita` (`wichita`).

## Target Pave Ops

Only these operations are in the authoritative `schema-surface.json` and are required by this contract:

- `createCustomField`
- `updateCustomField`
- `createJob`
- `updateJob`

No user-, membership-, role-, ACE-, task-assignment-, or selection-assignment operation is allowed.

### Custom-field definitions

Create three Job-targeted, single-value dropdowns. Three fields preserve the source semantics; collapsing `CompanyRepresentative` and `SalesOwner` into one “sales rep” value would be an invented precedence rule.

| Name | Entity target | Type/cardinality | Options |
|---|---|---|---|
| `AccuLynx Branch` | Job | Dropdown; `minValuesRequired = 0`, `maxValuesAllowed = 1` | The 9 verified account labels above. Persist a loader-side option crosswalk from `account_key` to the exact JobTread option value/identifier returned by `createCustomField`. |
| `AccuLynx Company Representative` | Job | Dropdown; `minValuesRequired = 0`, `maxValuesAllowed = 1` | One option per relevant `public.acculynx_users.id` referenced by a `CompanyRepresentative` item. Label as normalized `display_name`; because names collide, append a deterministic short suffix derived from the GUID when necessary. Never use email or phone in a label. |
| `AccuLynx Sales Owner` | Job | Dropdown; `minValuesRequired = 0`, `maxValuesAllowed = 1` | One option per relevant `public.acculynx_users.id` referenced by a `SalesOwner` item, using the same collision rule. |

Conceptual `createCustomField` inputs are `organizationId = "22PazeRM5FCH"`, the name above, Job as `targetType`, dropdown as `type`, the generated `options`, no default, `minValuesRequired = 0`, and `maxValuesAllowed = 1`. The scrape proves those input-field names exist, but it does **not** preserve the exact enum tokens or the nested shape of `options`; the exact `targetType`, `type`, and option-object syntax are unknown and must be confirmed in the live JobTread Explorer before implementation. Do not guess them.

On `createJob`, include all available values in the operation's `customFieldValues` input, keyed by the returned custom-field IDs. The documented Pave convention is `{ "<customFieldId>": "<value>" }`. Branch comes from `acculynx_jobs.account_key`. Representative values come from the normalized interpretation of the matching raw `/representatives` response. If a source value is absent or ambiguous, omit that custom-field key rather than sending an empty string or choosing a person.

## Field Mapping

| Source column/path | Pave input field | Type notes and transforms |
|---|---|---|
| `acculynx_accounts.account_key` | Loader crosswalk key for `createCustomField.options` | Required text; stable branch identity. Do not expose `env_secret_name`. |
| `acculynx_accounts.label` | `createCustomField.options` label/value for `AccuLynx Branch` | Required text; trim outer whitespace. Preserve punctuation and case. |
| `acculynx_accounts.is_active` | Option lifecycle policy for `createCustomField` / `updateCustomField` | Boolean. Keep inactive historical options addressable; do not delete an option that an existing job may reference. All 9 are currently active. |
| `acculynx_accounts.environment` | Loader inclusion policy | Text. `sandbox` is a real verified option but no current normalized job row has `account_key = 'sandbox'`; production loads may retain the option while excluding sandbox jobs. |
| `acculynx_jobs.account_key` | `createJob.customFieldValues["<branch_cf_id>"]` | Required text on all current rows. Resolve through `account_key -> JT option` crosswalk. This is the only branch-bearing normalized job column. |
| `acculynx_jobs.id` | Loader job crosswalk key | Text containing the AccuLynx job GUID. Crosswalk key is `(source_system='acculynx', entity='job', source_guid=id)` to JobTread job ID. |
| `acculynx_jobs.job_name` | `createJob.name` | Nullable text. Trim; if blank, a fallback naming rule is required but is unknown in this domain contract. |
| `acculynx_jobs.job_number` | `createJob.number` | Nullable text. Preserve as text, including leading zeros. Confirm uniqueness before relying on it for lookup; GUID remains authoritative. |
| `acculynx_jobs.modified_date` | Loader change watermark | Nullable `timestamptz`; compare in UTC. It does not prove the separate representatives response changed. |
| `acculynx_raw.api_endpoint` where `resource_type='representatives'` | Join to job before `createJob` / `updateJob` | Text. Parse only the strict pattern `/jobs/<GUID>/representatives`; validate the GUID and join to `acculynx_jobs.id`. Do not treat arbitrary endpoint text as an ID. |
| `acculynx_raw.payload.items[].type` | Select destination custom field | Observed text enum. `CompanyRepresentative` maps only to the company-representative field; `SalesOwner` maps only to sales-owner. `Additional` and `AROwner` are not mapped by this contract. |
| `acculynx_raw.payload.items[].user.id` | Resolve dropdown value | AccuLynx user GUID as text; join exactly to `acculynx_users.id`. |
| `acculynx_users.id` | Loader option crosswalk key | Required, unique text GUID. Never map it to a JobTread user or membership ID. |
| `acculynx_users.display_name` | Representative option label/value | Nullable in schema but populated on all 406 live rows. Normalize repeated internal whitespace and trim. Because labels repeat, disambiguate collisions with a deterministic GUID-derived suffix. |
| `acculynx_users.status` | Option lifecycle policy | `Active` or `Inactive` in live data. Include referenced inactive users so historical jobs retain fidelity; visually suffix inactive labels if JobTread options cannot carry separate metadata. |
| Resolved branch/company-rep/sales-owner values | `createJob.customFieldValues` or `updateJob.customFieldValues` | Object keyed by actual JobTread custom-field IDs. Values must use the exact option representation accepted by the live schema; that representation is unknown from the scrape and must be validated before writes. |

## Gaps & Risks

- `acculynx_jobs` itself has no sales-rep assignment column. A loader using only the normalized table would lose every representative assignment.
- The terms are not interchangeable. The AccuLynx ingest reference calls company representative an account manager/PM and sales owner a sales role. There are 166 distinct company-representative users but only 45 distinct sales-owner users in raw responses.
- Coverage is incomplete relative to normalized jobs: 6,512 of 6,571 jobs have a successful raw representatives response. Only 212 normalized jobs have an observed `SalesOwner`; 6,359 do not. Missing is not “unassigned” unless a successful, current response explicitly proves it.
- Raw history contains 6,682 representative response envelopes for 6,571 normalized jobs, so some jobs have multiple snapshots. The loader must select the latest successful response by `fetched_at`, not union historical items.
- Every response has at least one item, and `CompanyRepresentative` is nearly universal, but duplicate source snapshots can produce more items than jobs. Cardinality must be evaluated after latest-snapshot selection. If more than one value of the same single-value type remains, record an ambiguity and leave the target value unset.
- `public.acculynx_users` lacks `account_key`. Repeated human-readable names are common: 406 GUIDs collapse to 122 distinct display names. Never join or deduplicate people by name.
- Whether a JobTread dropdown value is a literal string, an option ID, or a structured value is unknown from the local scrape. The exact enum literals for Job target and dropdown type are also unknown.
- The authoritative surface confirms operation names, not permission grants. A dry-run query through the live Explorer must verify that the grant associated with `JOBTREAD_GRANT_KEY` can read/create the required fields and jobs.
- The supplied JobTread README says rate limiting is per grant but gives no numeric threshold. Use bounded batches, serialized mutation requests initially, exponential backoff with jitter on `429`, and checkpoint every successful item. AccuLynx documents 10 requests/second per API key and 30 requests/second per IP; any future API backfill must stay below both and retry only idempotent reads.
- Updating custom-field option arrays may replace rather than merge existing options; behavior is unknown. Always read current definitions, merge by crosswalk, and test on a disposable field before `updateCustomField`.
- Custom-field option-count limits are unknown. A field with up to 406 user-derived options may exceed a JobTread limit or be poor UX; validate the live limit before creation.
- The single-seat invariant is absolute: no source person may become a JobTread user, member, task assignee, ACE assignee, or other seat-bearing principal.

## Loader Plan

1. Read JobTread organization `22PazeRM5FCH` and its custom fields. Match definitions by a loader-owned immutable crosswalk, not name alone. If absent, call `createCustomField`; if present, call `updateCustomField` only after merging options non-destructively.
2. Build durable crosswalk records outside JobTread:
   - branch: `acculynx_accounts.account_key <-> jt_custom_field_id + jt_option_value_or_id`
   - person: `acculynx_users.id <-> field_kind + jt_custom_field_id + jt_option_value_or_id`
   - job: `acculynx_jobs.id <-> jt_job_id`
   The crosswalk store/schema is outside this contract; do not overload display names or job numbers as identity.
3. Generate branch options from all 9 verified account rows. Generate representative options from GUIDs actually referenced by the latest successful representative responses, retaining inactive referenced users for history. Preserve company representative and sales owner as separate option namespaces.
4. Normalize representatives read-only: parse job GUID from the strict endpoint pattern, select the latest successful response per job by `fetched_at`, explode `payload.items`, and exact-join `items[].user.id` to `acculynx_users.id`. Quarantine missing users, malformed endpoints, or multiple values for a single-value field.
5. Process jobs in deterministic `acculynx_jobs.id` order. Proposed mutation batch size is 25 jobs, with one mutation request in flight until observed rate-limit behavior is known. Checkpoint each returned JobTread ID immediately.
6. For a job without a crosswalk, call `createJob` with its ordinary job fields and resolved custom-field values in the same operation. Request `id` in the response, as the JobTread README requires.
7. For a job with a crosswalk, compare a canonical source hash of branch plus latest representative snapshot against the last applied hash. Call `updateJob` only when the hash changes. Omit unknown/unproven fields so retries do not erase target data.
8. Idempotency comes from the source-GUID crosswalk plus read-before-create. If a timeout occurs after mutation submission but before response capture, query JobTread using the established crosswalk/search strategy before retrying; never blindly repeat `createJob`.
9. Dependency order is custom-field definitions/options, option crosswalks, latest representative normalization, then job create/update. No user creation step exists.

## Evidence

All database statements below were run against Supabase project `rnhmvcpsvtqjlffpsayu` through the management query endpoint using `SUPABASE_ACCESS_TOKEN`. Every statement is read-only.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('public','qbo_registers')
  AND table_name IN ('acculynx_accounts','acculynx_users','acculynx_jobs')
ORDER BY table_schema, table_name;
```

Returned all three as `public` tables: `acculynx_accounts`, `acculynx_jobs`, and `acculynx_users`.

```sql
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema IN ('public','qbo_registers')
  AND table_name IN ('acculynx_accounts','acculynx_users','acculynx_jobs')
ORDER BY table_schema, table_name, ordinal_position;
```

Verified 13 account columns, 35 job columns, and 13 user columns. In particular, jobs have `account_key` but no representative/user/assignee column.

```sql
SELECT 'acculynx_accounts' AS table_name, COUNT(*) AS rows
FROM public.acculynx_accounts
UNION ALL
SELECT 'acculynx_users', COUNT(*) FROM public.acculynx_users
UNION ALL
SELECT 'acculynx_jobs', COUNT(*) FROM public.acculynx_jobs
ORDER BY table_name;
```

- `acculynx_accounts`: rows = 9
- `acculynx_jobs`: rows = 6571
- `acculynx_users`: rows = 406

```sql
SELECT account_key, label, program, market, state, environment,
       is_active, acculynx_company_id
FROM public.acculynx_accounts
ORDER BY account_key;
```

Returned the 9 branch options listed under Source Tables; rows = 9.

```sql
SELECT key, COUNT(*) AS rows_with_key, jsonb_typeof(raw->key) AS json_type
FROM public.acculynx_jobs
CROSS JOIN LATERAL jsonb_object_keys(raw) AS key
GROUP BY key, jsonb_typeof(raw->key)
ORDER BY key;
```

Returned 17 top-level keys and no representative/assignee key; source jobs covered = 6571.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'acculynx_%'
ORDER BY table_name;
```

Returned 30 live `acculynx_*` tables; no normalized representative table was present.

```sql
SELECT 'acculynx_raw' AS table_name, COUNT(*) AS rows
FROM public.acculynx_raw
UNION ALL
SELECT 'acculynx_job_contacts', COUNT(*) FROM public.acculynx_job_contacts
UNION ALL
SELECT 'acculynx_api_catalog', COUNT(*) FROM public.acculynx_api_catalog
UNION ALL
SELECT 'acculynx_api_probe', COUNT(*) FROM public.acculynx_api_probe
ORDER BY table_name;
```

- `acculynx_api_catalog`: rows = 28
- `acculynx_api_probe`: rows = 542
- `acculynx_job_contacts`: rows = 6576
- `acculynx_raw`: rows = 44582

```sql
SELECT resource_type, COUNT(*) AS rows
FROM public.acculynx_raw
GROUP BY resource_type
ORDER BY resource_type;
```

For `resource_type = 'representatives'`: rows = 6682.

```sql
SELECT key, COUNT(*) AS items_with_key, jsonb_typeof(item->key) AS json_type
FROM public.acculynx_raw
CROSS JOIN LATERAL jsonb_array_elements(payload->'items') AS item
CROSS JOIN LATERAL jsonb_object_keys(item) AS key
WHERE resource_type='representatives'
GROUP BY key, jsonb_typeof(item->key)
ORDER BY key;
```

Verified item keys `_link`, `id`, `type`, and `user`; representative items = 8723.

```sql
SELECT COALESCE(item->>'type', item->>'representativeType',
                item->>'role', item->>'name') AS representative_class,
       COUNT(*) AS rows
FROM public.acculynx_raw
CROSS JOIN LATERAL jsonb_array_elements(payload->'items') AS item
WHERE resource_type='representatives'
GROUP BY 1
ORDER BY rows DESC, representative_class NULLS LAST;
```

- `CompanyRepresentative`: rows = 6685
- `Additional`: rows = 1583
- `AROwner`: rows = 242
- `SalesOwner`: rows = 213

```sql
WITH reps AS (
  SELECT split_part(r.api_endpoint,'/',3) AS job_id,
         item->>'type' AS rep_type,
         item->'user'->>'id' AS user_id
  FROM public.acculynx_raw r
  CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') item
  WHERE r.resource_type='representatives'
)
SELECT rep_type,
       COUNT(*) AS representative_items,
       COUNT(*) FILTER (WHERE user_id IS NULL OR btrim(user_id)='') AS missing_user_id,
       COUNT(*) FILTER (WHERE u.id IS NOT NULL) AS matched_user_rows,
       COUNT(DISTINCT user_id) AS distinct_user_ids
FROM reps
LEFT JOIN public.acculynx_users u ON u.id=reps.user_id
GROUP BY rep_type
ORDER BY rep_type;
```

All representative items matched a user and none had a missing user ID. Distinct user IDs: `Additional` = 91, `AROwner` = 45, `CompanyRepresentative` = 166, `SalesOwner` = 45.

```sql
WITH reps AS (
  SELECT split_part(r.api_endpoint,'/',3) AS job_id,
         item->>'type' AS rep_type,
         item->'user'->>'id' AS user_id
  FROM public.acculynx_raw r
  CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') item
  WHERE r.resource_type='representatives'
),
distinct_reps AS (
  SELECT DISTINCT job_id, rep_type, user_id FROM reps
)
SELECT COUNT(*) AS jobs,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM distinct_reps r
         WHERE r.job_id=j.id AND r.rep_type='SalesOwner'
       )) AS jobs_with_sales_owner,
       COUNT(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM distinct_reps r
         WHERE r.job_id=j.id AND r.rep_type='SalesOwner'
       )) AS jobs_without_sales_owner
FROM public.acculynx_jobs j;
```

- jobs: rows = 6571
- jobs with an observed `SalesOwner` = 212
- jobs without an observed `SalesOwner` = 6359

```sql
SELECT status, COUNT(*) AS rows, COUNT(DISTINCT display_name) AS distinct_display_names
FROM public.acculynx_users
GROUP BY status
ORDER BY status;
```

- `Active`: rows = 183; distinct display names = 37
- `Inactive`: rows = 223; distinct display names = 89

The authoritative JobTread operation-name evidence is the local `schema-surface.json`; input-field evidence comes from the local docs scrape, which lists:

```text
createCustomField({ defaultValue, maxValuesAllowed, minValuesRequired, name,
  options, organizationId, positionAfterCustomFieldId, showOnSpecifications,
  targetType, type })
createJob({ ..., customFieldValues, ..., name, number, ... })
updateCustomField({ defaultValue, id, maxValuesAllowed, minValuesRequired, name,
  options, positionAfterCustomFieldId, showOnSpecifications })
updateJob({ ..., customFieldValues, ..., id, name, number, ... })
```
