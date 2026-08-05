# AccuLynx → JobTread: Interim CompanyCam Project Link Contract

Scope: Pro Exteriors, JobTread organization `22PazeRM5FCH`. This contract is for a temporary job-level custom field until a human manually connects JobTread's native CompanyCam integration. It does not authorize JobTread API execution. The target organization has one seat; the loader must never create users, memberships, roles, or assignments.

## Source Tables

- `public.acculynx_jobs` — verified live. This is the authoritative source for the AccuLynx job GUID (`id`), account namespace (`account_key`), job name/number, normalized address components, coordinates, and source payload (`raw`). It has no CompanyCam-specific column.
- `public.estimate_runs` — verified live. It contains an AccuLynx job-key column and a candidate CompanyCam-link column named **companycam_ref**, but all 5 live rows have a blank/null candidate link. It is not currently a usable link source.
- `public.estimate_measurements` — verified live because it has `companycam_reviewed`, but this is only a workflow boolean. All 5 live rows are `false`; it contains neither an AccuLynx job key nor a CompanyCam project URL.
- **MISSING IN MIRROR:** CompanyCam projects and project URLs. No table name in any live schema contains `companycam`, and no populated CompanyCam reference was found. AccuLynx cannot backfill a third-party CompanyCam project identifier from any endpoint documented in [`API.md`](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md). `GET /jobs` and `GET /jobs/{jobId}` can only refresh the AccuLynx-side job identity, address, and coordinates used for matching. `POST /jobs/{jobId}/photos-videos` is an upload route, not a CompanyCam-link read source, and must not be used by this loader.
- The missing side must therefore be read from CompanyCam with the credential named `COMPANYCAM_API_KEY`. Never log, persist in this contract, or send that credential to JobTread. The exact CompanyCam list-projects endpoint and response field names are **unknown from the supplied references** and must be confirmed against CompanyCam's current API documentation before implementation.

## Target Pave Ops

Every name below appears verbatim in `schema-surface.json`.

- `organization` — read Pro Exteriors (`22PazeRM5FCH`) and enumerate its `customFields`; no mutation.
- `job` — read an already-mirrored JobTread job by its stored crosswalk ID and verify its current custom-field value; no job discovery by personal data.
- `createCustomField` — one-time creation of a job-targeted field named `CompanyCam Project Link`, preferably URL type and otherwise text type. Inputs documented by the Pave schema surface include `name`, `organizationId`, `targetType`, and `type`. Exact accepted enum tokens for URL/text and the job target are **unknown** and require validation in the JobTread Explorer before execution.
- `updateJob` — set `customFieldValues` on an existing JobTread job. Use the created custom-field ID as the map key and the canonical CompanyCam project URL as its string value.

Do not call `createJob`, `createContact`, `createRole`, or `updateMembership` in this domain. In particular, never create or assign a user for an AccuLynx sales representative or assignee.

## Field Mapping

| Source column/value | Pave input field | Type notes and transforms |
| --- | --- | --- |
| Constant `22PazeRM5FCH` | `organization.$.id` / `createCustomField.$.organizationId` | JobTread opaque ID; exact constant, no name-based organization selection. |
| Constant `CompanyCam Project Link` | `createCustomField.$.name` | Text. First query existing organization custom fields by exact normalized name; create only when absent. |
| Constant job target | `createCustomField.$.targetType` | Enum token is unknown. Confirm the token corresponding to a Job in the live Explorer; do not guess. |
| Preferred URL, fallback text | `createCustomField.$.type` | Enum token is unknown. Prefer JobTread's URL-capable field if available; otherwise use text and store the full HTTPS URL. |
| `public.acculynx_jobs.account_key` + `public.acculynx_jobs.id` | loader crosswalk lookup → `updateJob.$.id` | Composite source identity. `id` is text containing the AccuLynx GUID; namespace it with `account_key`. Resolve only through the pre-existing AccuLynx-job-to-JobTread-job crosswalk. Never infer a JobTread ID from a name or address. |
| CompanyCam project canonical URL, resolved externally | `updateJob.$.customFieldValues["<custom_field_id>"]` | HTTPS string. Use the exact field ID returned/read for `CompanyCam Project Link`. Strip surrounding whitespace; reject non-HTTPS values; do not append tracking parameters. |
| `public.estimate_runs.companycam_ref` | same `customFieldValues` value, only if later populated and validated | Nullable text. Currently 0 populated rows. Accept only a canonical HTTPS CompanyCam project URL or a documented CompanyCam project ID that can be resolved through the CompanyCam API. Never treat arbitrary text as a URL. |
| `public.acculynx_jobs.location_street1`, `location_city`, `coalesce(location_state_abbrev, location_state)`, `location_zip` | CompanyCam project-match input only | Normalize case, Unicode, punctuation, street suffixes, unit designators, whitespace, state, and ZIP. Address matching proposes a candidate; it does not write JobTread unless uniquely corroborated. |
| `public.acculynx_jobs.latitude`, `longitude` | CompanyCam project-match corroboration only | Numeric coordinates. Use a documented distance tolerance after confirming CompanyCam coordinate precision. Coordinates do not map into the custom field. |
| `public.acculynx_jobs.job_name`, `job_number` | CompanyCam project-match corroboration only | Nullable text. Normalize before comparison. A name alone is insufficient because the one live `raw` CompanyCam text hit was merely in `jobName`. |
| CompanyCam project ID | loader crosswalk metadata; later candidate for native `updateJob.$.companycamId` | The supplied Pave schema shows `companycamId` on `updateJob`, but this interim contract deliberately does **not** set it. Preserve the ID for the later human-managed native integration cutover. |

Resolution rule:

1. Require an existing `(account_key, acculynx_job_guid) → jt_job_id` crosswalk.
2. Prefer a previously confirmed `(account_key, acculynx_job_guid) → companycam_project_id` crosswalk.
3. Otherwise list CompanyCam projects using `COMPANYCAM_API_KEY` and score candidates using normalized full address, then coordinates, then job number/name.
4. Auto-accept only one uniquely best candidate with exact normalized address plus one independent corroborator (coordinates within the confirmed tolerance, or an exact job-number token). Exact address alone is unsafe because the live mirror has 232 duplicate normalized-address groups.
5. Send zero-match, multiple-match, missing-address, and weak-match cases to a human review queue. Do not clear an existing JobTread link because a later lookup fails.

## Gaps & Risks

- The live AccuLynx mirror does not contain the domain payload. `acculynx_jobs.raw` has one case-insensitive `companycam` text hit, but it occurs under top-level key `jobName`; it is not integration metadata.
- `estimate_runs.companycam_ref` looks relevant by name but is empty in all 5 rows. `estimate_measurements.companycam_reviewed` is false in all 5 rows and is not a URL field.
- CompanyCam API endpoint paths, pagination, response fields, canonical project URL construction, rate limits, and coordinate precision are unknown from the supplied files. Confirm them before implementation; never invent them.
- JobTread `createCustomField` accepts `type` and `targetType`, but the authoritative schema-surface snapshot does not enumerate their values. Validate the exact URL/text and Job enum tokens in the Explorer.
- JobTread's exact per-grant rate limit is unpublished in the local README. Serialize writes initially, honor throttling responses, and use exponential backoff with jitter only for safely repeatable reads/updates.
- AccuLynx documents limits of 10 requests/second per API key and 30 requests/second per IP. This loader should not normally call AccuLynx; if job refresh is separately authorized, remain below the key limit and back off on `429`.
- 73 of 6,571 AccuLynx jobs lack a street address; 232 normalized-address groups are duplicated. Address-only auto-linking risks attaching one customer's photos to another job.
- CompanyCam project links may expose jobsite imagery to anyone with access to the JobTread job. Access behavior and link longevity are unknown; the human must confirm the intended CompanyCam sharing URL, not an authenticated or expiring internal URL.
- The AccuLynx mirror contains multiple `account_key` namespaces. A bare AccuLynx GUID is not the contract key even though all 6,571 current `(account_key, id)` pairs are distinct.
- Native integration cutover may make the custom field redundant. Keep it during reconciliation, compare native project IDs to the crosswalk, and remove/retire it only under a separately approved plan.

## Loader Plan

1. **Preflight reads:** Confirm organization ID `22PazeRM5FCH`; read organization custom fields; read the existing AccuLynx↔JobTread job crosswalk. Abort if the organization differs or a crosswalk points to more than one JobTread job.
2. **Field definition:** Reuse exactly one existing job custom field whose normalized name is `CompanyCam Project Link`. If none exists, execute one `createCustomField` after the human-approved enum values have been verified. If multiple fields match, stop for human repair.
3. **Source candidates:** Page `public.acculynx_jobs` by stable composite key `(account_key, id)`. Join `public.estimate_runs` only as an optional hint; its current `companycam_ref` population is zero.
4. **CompanyCam resolution:** Page CompanyCam projects using `COMPANYCAM_API_KEY`; normalize their documented address/name/coordinate fields; apply the conservative resolution rule above. Never call the JobTread API during research or candidate generation.
5. **Crosswalk:** Maintain these logical keys in the loader's approved persistence layer:
   - primary source key: `(source_system='acculynx', account_key, acculynx_job_guid)`
   - target key: `(jt_organization_id='22PazeRM5FCH', jt_job_id)`
   - media key: `companycam_project_id`
   - audit fields: canonical URL, match method, confidence inputs, reviewed-by/at when manual, source fingerprints, and last successful verification timestamp.
   This research task does not create that persistence layer.
6. **Idempotent update:** Read the JobTread job by crosswalk ID. If its `customFieldValues[custom_field_id]` already equals the canonical URL, record a no-op. If blank or different and the match is confirmed, call `updateJob` with only `id` and the one `customFieldValues` entry. Do not send unrelated job fields. Never create missing jobs or users.
7. **Batching:** Start with 10 confirmed jobs per batch and one Pave mutation at a time. Because the exact JobTread limit is unknown, increase only after observing successful latency/throttling behavior; cap at 25 jobs per checkpoint. CompanyCam reads must use its documented page maximum once confirmed.
8. **Failure handling:** Retry transient read failures and idempotent `updateJob` requests with bounded exponential backoff and jitter. Do not retry validation/auth failures. Quarantine ambiguous matches. Preserve existing nonblank links on lookup failure.
9. **Reconciliation:** After each batch, reread each updated job and compare the custom-field value to the canonical URL. Report counts for matched, updated, no-op, ambiguous, missing JobTread crosswalk, missing CompanyCam project, failed, and verified.
10. **Native cutover:** When the human connects the native CompanyCam integration, compare stored `companycam_project_id` values to the native association. Do not set `updateJob.companycamId` or delete the interim custom field under this contract.

## Evidence

All SQL below was executed against Supabase project `rnhmvcpsvtqjlffpsayu` through the read-only query path supplied for this task. Only `SELECT` statements were used.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND (
    lower(table_name) LIKE '%companycam%'
    OR lower(table_schema) LIKE '%companycam%'
  )
ORDER BY table_schema, table_name;
```

Result: `rows = 0`.

```sql
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE lower(column_name) LIKE '%companycam%'
   OR lower(column_name) LIKE '%company_cam%'
ORDER BY table_schema, table_name, ordinal_position;
```

Result: `rows = 2`: `public.estimate_measurements.companycam_reviewed` (`boolean`) and `public.estimate_runs.companycam_ref` (`text`).

```sql
SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'acculynx_jobs'
ORDER BY table_schema, ordinal_position;
```

Result: `rows = 35`; no CompanyCam-specific column.

```sql
SELECT
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE raw::text ILIKE '%companycam%') AS raw_companycam_rows,
  COUNT(*) FILTER (
    WHERE NULLIF(trim(location_street1), '') IS NULL
  ) AS missing_street_rows,
  COUNT(*) FILTER (
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  ) AS rows_with_coordinates,
  COUNT(DISTINCT (account_key, id)) AS distinct_source_keys
FROM public.acculynx_jobs;
```

Result: `rows = 6571`; `raw_companycam_rows = 1`; `missing_street_rows = 73`; `rows_with_coordinates = 6499`; `distinct_source_keys = 6571`.

```sql
SELECT e.key AS top_level_key, jsonb_typeof(e.value) AS value_type
FROM public.acculynx_jobs j
CROSS JOIN LATERAL jsonb_each(j.raw) e
WHERE j.raw::text ILIKE '%companycam%'
  AND e.value::text ILIKE '%companycam%'
ORDER BY e.key;
```

Result: `rows = 1`; the only key is `jobName` with string type.

```sql
SELECT COUNT(*) AS duplicate_normalized_address_groups
FROM (
  SELECT
    account_key,
    lower(
      regexp_replace(
        trim(
          location_street1 || ' ' ||
          coalesce(location_city, '') || ' ' ||
          coalesce(location_state_abbrev, location_state, '') || ' ' ||
          coalesce(location_zip, '')
        ),
        '\s+', ' ', 'g'
      )
    ) AS normalized_address
  FROM public.acculynx_jobs
  WHERE NULLIF(trim(location_street1), '') IS NOT NULL
  GROUP BY account_key, normalized_address
  HAVING COUNT(*) > 1
) d;
```

Result: `rows = 1`; `duplicate_normalized_address_groups = 232`.

```sql
SELECT
  COUNT(*) AS rows,
  COUNT(*) FILTER (
    WHERE NULLIF(trim(companycam_ref), '') IS NOT NULL
  ) AS rows_with_companycam_ref,
  COUNT(DISTINCT companycam_ref) FILTER (
    WHERE NULLIF(trim(companycam_ref), '') IS NOT NULL
  ) AS distinct_companycam_refs
FROM public.estimate_runs;
```

Result: `rows = 5`; `rows_with_companycam_ref = 0`; `distinct_companycam_refs = 0`.

```sql
SELECT
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE companycam_reviewed IS TRUE)
    AS companycam_reviewed_true,
  COUNT(*) FILTER (WHERE companycam_reviewed IS FALSE)
    AS companycam_reviewed_false,
  COUNT(*) FILTER (WHERE companycam_reviewed IS NULL)
    AS companycam_reviewed_null
FROM public.estimate_measurements;
```

Result: `rows = 5`; `companycam_reviewed_true = 0`; `companycam_reviewed_false = 5`; `companycam_reviewed_null = 0`.

Reference validation:

- `schema-surface.json` contains `organization`, `job`, `createCustomField`, and `updateJob` exactly as written above.
- Its extracted signature for `createCustomField` includes `name`, `organizationId`, `targetType`, and `type`.
- Its extracted signature for `updateJob` includes `id`, `customFieldValues`, and `companycamId`.
- The local Pave README states that objects whose IDs are needed must request `id`, connections are paginated, and the exact per-grant rate limit is unpublished.
