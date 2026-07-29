# AccuLynx Milestones to JobTread Job Stages

Scope: read-only mapping contract for Pro Exteriors (`organizationId = 22PazeRM5FCH`). This document does not authorize JobTread API execution. The loader must use the existing single JobTread seat and must never create users, memberships, roles, assignments, or assignees. Authentication values must be supplied only through environment variables (`SUPABASE_ACCESS_TOKEN` for source reads and `JOBTREAD_GRANT_KEY` for a future loader); credential values must never be logged or persisted in mapping data.

The local JobTread schema snapshot exposes no dedicated job-stage or pipeline mutation and no stage-like input on `createJob` or `updateJob`. Therefore the implementable representation is an organization-level Job custom field for current milestone, updated through `updateJob`, plus `createComment` records for history. The exact JobTread custom-field `targetType`, field `type`, option encoding, and comment `targetType` enum literals remain unknown because they are not present in the supplied schema surface; they must be confirmed in the JobTread Explorer before any write-capable loader is enabled.

## Source Tables

- `public.acculynx_jobs` — verified live. Current-state authority for this domain. `rows = 6571`; all 6,571 rows have non-null `current_milestone` and `milestone_date`.
- `public.acculynx_job_milestone_history` — verified live. Historical milestone observations. `rows = 16390`, covering 6,463 distinct job GUIDs.

The requested domain is present in the mirror, so no `MISSING IN MIRROR:` backfill is required. If either table becomes absent or incomplete, the AccuLynx source paths documented in `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md` are `GET /jobs` plus `GET /jobs/{jobId}` for current job state and `GET /company-settings/...` milestone settings for the customer-specific, case-sensitive milestone vocabulary. That reference also identifies `job.milestone.current_changed` as the webhook topic used by the existing mapping for incremental milestone changes; webhook availability may be account-tier gated. The supplied API guide does not document a dedicated historical-milestones GET endpoint, so a complete historical backfill from AccuLynx is unknown.

Live current vocabulary and proposed Job custom-field options, preserving source spelling exactly:

| AccuLynx current milestone | Current rows | Job custom-field value | Order |
|---|---:|---|---:|
| `Lead` | 270 | `Lead` | 10 |
| `Prospect` | 216 | `Prospect` | 20 |
| `Approved` | 99 | `Approved` | 30 |
| `Completed` | 65 | `Completed` | 40 |
| `Invoiced` | 170 | `Invoiced` | 50 |
| `Closed` | 651 | `Closed` | 60 |
| `Cancelled` | 5,100 | `Cancelled` | 70 |

The order is a loader/UI convention, not a claim that all jobs move linearly. Live history contains reversals, skips, and repeated `Cancelled` events.

## Target Pave Ops

Only these exact operation names from `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/schema-surface.json` are in scope:

- `createCustomField` — one-time creation of the Job-targeted `AccuLynx Current Milestone` field and, if Explorer confirms a supported date field, `AccuLynx Milestone Date`. Reuse matching existing definitions; do not create duplicates.
- `updateJob` — set current milestone/date custom-field values on an already-crosswalked JobTread job. Its captured inputs include `id`, `customFieldValues`, and `closedOn`, but no stage or pipeline input.
- `createComment` — append one internally scoped job timeline entry per unique historical milestone. Its captured inputs include `message`, `name`, `targetId`, and `targetType`; it has no event-time/created-time input.

`createJob` exists in the schema surface but is deliberately outside this domain contract: job creation and its required account/location dependency belong to the upstream job mirror. No user-, membership-, role-, task-assignment-, or assignee-related operation is permitted.

## Field Mapping

Proposed custom-field names are stable logical names. Before mutation, the loader must query JobTread metadata, resolve each name to its actual custom-field ID, and use that ID as the key in `customFieldValues`.

| Source table | Source column | Pave operation and input field | Type notes and transform |
|---|---|---|---|
| `public.acculynx_jobs` | `id` (`text`, non-null) | `updateJob.$.id` | Do not send the AccuLynx GUID directly. Resolve it through the job crosswalk `(source_system='acculynx', acculynx_job_guid) -> jt_job_id`. |
| `public.acculynx_jobs` | `current_milestone` (`text`, non-null) | `updateJob.$.customFieldValues["<JT id for AccuLynx Current Milestone>"]` | Preserve exact case. Allow only the seven verified values above. Quarantine, rather than coerce, any future unknown value until its option and order are approved. |
| `public.acculynx_jobs` | `milestone_date` (`timestamptz`, non-null) | `updateJob.$.customFieldValues["<JT id for AccuLynx Milestone Date>"]` | Convert to the exact JobTread date/datetime representation confirmed by Explorer. Preserve the source UTC instant in loader state. If Job custom fields do not support a compatible date value, omit this field and retain the date in comments; support is currently unknown. |
| `public.acculynx_jobs` | `milestone_date` when `current_milestone = 'Closed'` | `updateJob.$.closedOn` | Optional policy mapping only after confirming `closedOn` type/semantics in Explorer. Use the source calendar date in the agreed business timezone. Never set `closedOn` for `Cancelled` without an explicit business rule. |
| `public.acculynx_jobs` | `job_name`, `job_number` | none in this domain | May be used only for operator diagnostics. Do not overwrite JobTread names/numbers from the stage loader. |
| `public.acculynx_jobs` | `modified_date`, `synced_at`, `last_seen_by_api` | none | Watermarks/checkpoint inputs only; they are mirror-observation times, not milestone event times. |
| `public.acculynx_jobs` | `account_key`, `market`, `archived_at`, `archive_reason`, `trust_tier`, `raw` | none | Source governance/ingest fields. Do not serialize them into JobTread stage values or comments. |
| `public.acculynx_job_milestone_history` | `job_id` (`text`, non-null) | `createComment.$.targetId` | Resolve with the same job crosswalk. If no JobTread job ID exists, defer the event; never create a user or assign it to a person. |
| `public.acculynx_job_milestone_history` | `job_id` | `createComment.$.targetType` | Set to the Explorer-confirmed Job target enum literal. The literal is unknown from the supplied files and must not be guessed. |
| `public.acculynx_job_milestone_history` | `milestone_name` (`text`, non-null) | `createComment.$.message` | Render exact source value. Ordered per job by `(milestone_date, id)`. First event: `AccuLynx milestone entered: {name} at {ISO timestamp}.` Later event: `AccuLynx milestone changed: {previous} -> {name} at {ISO timestamp}.` |
| `public.acculynx_job_milestone_history` | `milestone_date` (`timestamptz`, non-null) | `createComment.$.message` | Render canonical UTC ISO 8601. `createComment` has no captured backdate input, so the source event time must be in the message and the JobTread comment creation time will be loader time. |
| `public.acculynx_job_milestone_history` | `job_id`, `milestone_name`, `milestone_date` | `createComment.$.message` idempotency marker | Append a non-secret stable marker such as `[acculynx-milestone:{sha256(job_id + U+001F + milestone_name + U+001F + milestone_date_utc)}]`. Do not expose `account_key` or credentials. |
| `public.acculynx_job_milestone_history` | constant | `createComment.$.name` | `AccuLynx milestone history`. |
| `public.acculynx_job_milestone_history` | `synced_at`, `last_seen_by_api`, `archived_at`, `archive_reason`, `trust_tier`, `account_key`, `market`, `id` | none | `id` is only a deterministic tie-breaker; the others are source governance/ingest fields. The live `market` value is null on every history row. |

Do not populate `createComment.$.assignees`, any task assignment, or any membership/user field. Sales representatives and assignees are outside this domain and, if later required, must be represented as custom-field text/select values only.

## Gaps & Risks

- **No native Pave stage mutation found.** The supplied authoritative operation surface has no stage-named create/update operation and no stage input on `updateJob`. A custom field preserves the value but may not drive a native JobTread pipeline UI, automation, reporting, or stage-transition behavior.
- **Nested enum/type details are unknown.** The schema surface lists operation names and captured input names, not the accepted `targetType`, custom-field `type`, option-object shape, date format, visibility defaults, or response fields. A preflight in the JobTread Explorer is mandatory; this research worker made no JobTread API call.
- **History is incomplete or not current-state authoritative.** There are 108 jobs without history. Among jobs with history, 253 current milestone names and 267 current milestone dates differ from the latest history row. Current stage must come from `acculynx_jobs`; history must not overwrite it.
- **Comments cannot be backdated.** `createComment` has no captured event timestamp input. Timeline sort order in JobTread will reflect load time, while the true event time survives only in message text.
- **History lacks actor/context.** The live table has no previous-milestone, changed-by, reason, or payload column. Previous value can only be inferred with `lag`; same-stage events and reversals are real possibilities and must not be discarded.
- **Case-sensitive, customer-configurable vocabulary.** The seven values are a live snapshot, not a universal AccuLynx taxonomy. A new value must fail closed into a review queue rather than silently map to a nearby stage.
- **Closed versus cancelled semantics.** `closedOn` may carry accounting/reporting meaning beyond stage display. Only `Closed` is a candidate, and even that requires business confirmation. `Cancelled` must remain a custom-field value unless an explicit archival/closure policy is approved.
- **Visibility may leak internal history.** Comment visibility flag semantics are absent from the supplied snapshot. Do not rely on defaults; validate an internal-only combination before backfill.
- **No deletion propagation.** This contract is append/update only. Source `archived_at` is currently null everywhere, and there is no approved policy for deleting JobTread comments or clearing stage values.
- **Rate limits are unpublished.** The JobTread README says limiting is per grant but supplies no numeric ceiling. Use conservative serial mutations, exponential backoff with jitter on `429`, honor retry headers if present, and checkpoint every batch. AccuLynx API limits matter only for a future source backfill: the local API guide states 10 requests/second per key and 30 concurrent requests/second per IP.
- **Single-seat invariant.** Never translate AccuLynx representatives, changed-by identities, or assignees into JobTread users. No new users may be created.

## Loader Plan

1. **Read and validate source.** Select active `public.acculynx_jobs` rows and their history. Treat `acculynx_jobs.current_milestone`/`milestone_date` as current truth. Validate milestones against the seven-value snapshot and quarantine unknowns.
2. **Resolve upstream jobs.** Require a durable crosswalk keyed by `(source_system, organization_id, acculynx_job_guid)` with value `jt_job_id`. Canonical direction is `acculynx_jobs.id <-> JobTread job.id`; history resolves through `acculynx_job_milestone_history.job_id`. Do not fall back to job name, address, or row position.
3. **Preflight JobTread metadata.** With an authorized future loader, read existing Job custom fields and confirm the exact enum/type shapes. Reuse a unique `AccuLynx Current Milestone` definition. Use `createCustomField` only if it is absent and a human-approved preflight confirms the inputs. Optionally resolve/create `AccuLynx Milestone Date` only if JobTread supports a compatible type.
4. **Upsert current state.** Compare normalized desired values with the current JobTread custom-field values and call `updateJob` only on difference. Store a source digest `sha256(job_guid, current_milestone, milestone_date)` with the crosswalk/checkpoint so reruns are no-ops. Never create or assign a user.
5. **Append history in dependency order.** After the job crosswalk exists, order each job’s events by `(milestone_date ASC, id ASC)`. Compute the natural event key `(job_id, milestone_name, milestone_date)` and its stable hash. Before `createComment`, consult the comment crosswalk `(event_hash -> jt_comment_id)` and/or an existing-comment marker query. Record the returned comment ID only after success.
6. **Reconcile, do not infer.** After history load, reapply the current-state update from `acculynx_jobs`; never derive current stage from the last history row. Report missing-job crosswalks, unknown milestones, and current/history mismatches separately.
7. **Batching and retry.** Read source rows in deterministic pages of 25. Send one Pave mutation per request at concurrency 1 for the initial run; checkpoint after every 25 successful/no-op records. On `429` or transient `5xx`, retry idempotently with exponential backoff and jitter. Pause and lower throughput rather than widening concurrency. Because published numeric JobTread limits are unknown, any higher concurrency requires measured approval.
8. **Failure safety.** Resume from the last durable source/event key. Never use delete operations for reconciliation. A comment whose response was lost is resolved by searching for its stable marker before retry; an `updateJob` retry is safe only after re-reading/confirming the desired field values.

Dependency order:

`upstream Account/Location/Job mirror` -> `job crosswalk` -> `Job custom-field definition(s)` -> `updateJob current state` -> `createComment history` -> `reapply/reconcile current state`

Required crosswalk keys:

| Crosswalk | Key | Value |
|---|---|---|
| Job | `('acculynx', '22PazeRM5FCH', acculynx_job_guid)` | `jt_job_id` |
| Milestone event | `sha256(acculynx_job_guid + U+001F + milestone_name + U+001F + milestone_date_utc)` | `jt_comment_id` |
| Custom-field definition | `('22PazeRM5FCH', target='Job', logical_name)` | `jt_custom_field_id` |

## Evidence

All source queries below were executed through the Supabase Management API against project `rnhmvcpsvtqjlffpsayu` using `SUPABASE_ACCESS_TOKEN`. They are `SELECT`-only. No JobTread API call was made.

### Table and column verification

```sql
SELECT table_schema, table_name, column_name, data_type, udt_name,
       is_nullable, ordinal_position
FROM information_schema.columns
WHERE table_schema IN ('public','qbo_registers')
  AND (
    table_name = 'acculynx_jobs'
    OR table_name = 'acculynx_job_milestone_history'
    OR table_name ILIKE '%milestone%'
  )
ORDER BY table_schema, table_name, ordinal_position;
```

Result: `rows = 46` column definitions: 35 for `public.acculynx_jobs` and 11 for `public.acculynx_job_milestone_history`. No other live table name matched `%milestone%`.

### Live row-count and key-quality checks

```sql
WITH metrics AS (
  SELECT 'acculynx_jobs_total' AS metric, count(*)::bigint AS rows
  FROM public.acculynx_jobs
  UNION ALL SELECT 'acculynx_jobs_active', count(*)
  FROM public.acculynx_jobs WHERE archived_at IS NULL
  UNION ALL SELECT 'acculynx_jobs_current_milestone_not_null', count(*)
  FROM public.acculynx_jobs WHERE current_milestone IS NOT NULL
  UNION ALL SELECT 'acculynx_jobs_milestone_date_not_null', count(*)
  FROM public.acculynx_jobs WHERE milestone_date IS NOT NULL
  UNION ALL SELECT 'acculynx_jobs_distinct_ids', count(DISTINCT id)
  FROM public.acculynx_jobs
  UNION ALL SELECT 'acculynx_job_milestone_history_total', count(*)
  FROM public.acculynx_job_milestone_history
  UNION ALL SELECT 'acculynx_job_milestone_history_active', count(*)
  FROM public.acculynx_job_milestone_history WHERE archived_at IS NULL
  UNION ALL SELECT 'acculynx_job_milestone_history_distinct_jobs',
                   count(DISTINCT job_id)
  FROM public.acculynx_job_milestone_history
  UNION ALL SELECT 'history_orphan_job_ids', count(*)
  FROM public.acculynx_job_milestone_history h
  LEFT JOIN public.acculynx_jobs j ON j.id = h.job_id
  WHERE j.id IS NULL
  UNION ALL SELECT 'history_duplicate_natural_keys', count(*)
  FROM (
    SELECT job_id, milestone_name, milestone_date, count(*)
    FROM public.acculynx_job_milestone_history
    GROUP BY 1,2,3
    HAVING count(*) > 1
  ) d
)
SELECT metric, rows FROM metrics ORDER BY metric;
```

Results:

- `acculynx_jobs_total`: `rows = 6571`
- `acculynx_jobs_active`: `rows = 6571`
- `acculynx_jobs_current_milestone_not_null`: `rows = 6571`
- `acculynx_jobs_milestone_date_not_null`: `rows = 6571`
- `acculynx_jobs_distinct_ids`: `rows = 6571`
- `acculynx_job_milestone_history_total`: `rows = 16390`
- `acculynx_job_milestone_history_active`: `rows = 16390`
- `acculynx_job_milestone_history_distinct_jobs`: `rows = 6463`
- `history_orphan_job_ids`: `rows = 0`
- `history_duplicate_natural_keys`: `rows = 0`

### Milestone vocabulary

```sql
SELECT 'current' AS source, current_milestone AS milestone_name,
       count(*)::bigint AS rows
FROM public.acculynx_jobs
GROUP BY current_milestone
UNION ALL
SELECT 'history' AS source, milestone_name, count(*)::bigint AS rows
FROM public.acculynx_job_milestone_history
GROUP BY milestone_name
ORDER BY source, rows DESC, milestone_name;
```

Current results:

- `Cancelled`: `rows = 5100`
- `Closed`: `rows = 651`
- `Lead`: `rows = 270`
- `Prospect`: `rows = 216`
- `Invoiced`: `rows = 170`
- `Approved`: `rows = 99`
- `Completed`: `rows = 65`

History results:

- `Lead`: `rows = 6463`
- `Cancelled`: `rows = 5000`
- `Prospect`: `rows = 1650`
- `Approved`: `rows = 1043`
- `Completed`: `rows = 864`
- `Invoiced`: `rows = 795`
- `Closed`: `rows = 575`

### Current-state versus history consistency

```sql
WITH ranked AS (
  SELECT h.*,
         row_number() OVER (
           PARTITION BY job_id
           ORDER BY milestone_date DESC, id DESC
         ) AS rn
  FROM public.acculynx_job_milestone_history h
), metrics AS (
  SELECT 'jobs_without_history' AS metric, count(*)::bigint AS rows
  FROM public.acculynx_jobs j
  LEFT JOIN ranked h ON h.job_id = j.id AND h.rn = 1
  WHERE h.id IS NULL
  UNION ALL
  SELECT 'current_name_differs_from_latest_history', count(*)
  FROM public.acculynx_jobs j
  JOIN ranked h ON h.job_id = j.id AND h.rn = 1
  WHERE j.current_milestone IS DISTINCT FROM h.milestone_name
  UNION ALL
  SELECT 'current_date_differs_from_latest_history', count(*)
  FROM public.acculynx_jobs j
  JOIN ranked h ON h.job_id = j.id AND h.rn = 1
  WHERE j.milestone_date IS DISTINCT FROM h.milestone_date
  UNION ALL
  SELECT 'history_rows_with_archived_at', count(*)
  FROM public.acculynx_job_milestone_history
  WHERE archived_at IS NOT NULL
  UNION ALL
  SELECT 'history_rows_with_market_null', count(*)
  FROM public.acculynx_job_milestone_history
  WHERE market IS NULL
)
SELECT metric, rows FROM metrics ORDER BY metric;
```

Results:

- `jobs_without_history`: `rows = 108`
- `current_name_differs_from_latest_history`: `rows = 253`
- `current_date_differs_from_latest_history`: `rows = 267`
- `history_rows_with_archived_at`: `rows = 0`
- `history_rows_with_market_null`: `rows = 16390`

### Transition-shape check

```sql
WITH transitions AS (
  SELECT job_id,
         lag(milestone_name) OVER (
           PARTITION BY job_id ORDER BY milestone_date, id
         ) AS from_milestone,
         milestone_name AS to_milestone
  FROM public.acculynx_job_milestone_history
)
SELECT from_milestone, to_milestone, count(*)::bigint AS rows
FROM transitions
WHERE from_milestone IS NOT NULL
GROUP BY 1,2
ORDER BY rows DESC, 1,2;
```

Result: `rows = 27` distinct transition pairs. The dominant path is `Lead -> Cancelled` (`rows = 4465`), followed by `Lead -> Prospect` (`rows = 1514`), `Prospect -> Approved` (`rows = 923`), `Approved -> Completed` (`rows = 777`), `Completed -> Invoiced` (`rows = 768`), and `Invoiced -> Closed` (`rows = 549`). The result also includes reversals, skips, and repeated stages, which is why the loader must preserve ordered events rather than impose a strictly forward state machine.

### Pave surface evidence

The authoritative local surface file contains the exact operation names `createCustomField`, `updateJob`, and `createComment`. The companion captured docs list:

```text
createCustomField({ defaultValue, maxValuesAllowed, minValuesRequired, name,
                    options, organizationId, positionAfterCustomFieldId,
                    showOnSpecifications, targetType, type })

updateJob({ areas, closedOn, companycamId, coverPhoto, customFieldValues,
            description, endTaskId, folders, hoverJobId, id, lineItems, name,
            number, parameters, priceType, qbdId, qboClassId, qboId,
            defaultRetainagePercentage, retainageCostItemId,
            scheduleIsPublished, specificationsDescription,
            specificationsFooter, startTaskId, useSimpleSelections })

createComment({ assignees, files, isPinned, isReply, isVisibleToAll,
                isVisibleToCustomerRoles, isVisibleToInternalRoles,
                isVisibleToVendorRoles, message, name, parentCommentId,
                targetId, targetType })
```

None contains a stage/pipeline input, and `createComment` contains no source-event timestamp input.
