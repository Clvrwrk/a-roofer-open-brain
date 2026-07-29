# AccuLynx Production Artifacts → JobTread Mapping Contract

Scope: read-only research for the AccuLynx mirror in Supabase project `rnhmvcpsvtqjlffpsayu`, targeting JobTread organization **Pro Exteriors** (`22PazeRM5FCH`). This contract does not authorize execution. No JobTread API call was made.

The source is much thinner than a production-management migration normally requires. It contains coarse milestone history and ingestion diagnostics, but no mirrored checklist instances, production tasks, task dependencies, daily logs, crews, material schedules, or budget-to-task rules.

## Source Tables

- `public.acculynx_job_milestone_history` — verified live; 16,390 rows. This is the only historical source that can support a production-state log. Its 16,390 rows have 16,390 distinct `(account_key, job_id, milestone_name, milestone_date)` natural keys.
- `public.acculynx_jobs` — verified live; 6,571 rows. Supplies the current milestone and the AccuLynx job identity needed to resolve an existing JobTread job. It does not contain production task detail.
- `public.acculynx_get_checklist` — verified live; 86 rows. Despite its name, this is an API endpoint inventory (`operation_id`, `path`, tier/probe metadata), not job checklist data. It must never be loaded as JobTread tasks.
- `public.acculynx_job_walk_errors` — verified live; 73 rows, all unresolved. These are mirror-ingestion failures, not field production events. They are a completeness gate only and must never become customer-facing JobTread tasks or daily logs.
- `public.acculynx_raw` — verified live; 44,582 rows. Its live resource types are invoices, job contacts, job financials, job insurance, milestone history, representatives, jobs, invoice lines, users, and job detail. No raw production-task, checklist-instance, daily-log, crew, material-schedule, or budget-task resource type is present.
- **MISSING IN MIRROR: production checklist instances and checklist-item completion.** `public.acculynx_get_checklist` proves only which GET routes were cataloged. The supplied AccuLynx API guide does not identify a public checklist-instance endpoint, so the backfill endpoint is **unknown**. Do not infer checklist items from the catalog table. See `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md` (“Endpoint Coverage” and “Common Endpoint Choices”).
- **MISSING IN MIRROR: detailed job history/activity.** Backfill candidate: `GET /jobs/{jobId}/history`. The live GET catalog contains `getJobHistory`, and the API guide says history/detail endpoints are the read path when dedicated message/log routes are unavailable. See `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md` (“Roofing Bridge Gotchas”).
- **MISSING IN MIRROR: calendar/production appointments.** Backfill candidates: `GET /calendars/{calendarId}/appointments` and `GET /calendars/{calendarId}/appointments/{appointmentId}`. Both exist in the verified live GET catalog but are unswept. The API guide confirms Calendar endpoint coverage. See `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md` (“Endpoint Coverage”).
- **MISSING IN MIRROR: configured milestone/status definitions.** Backfill candidates: `GET /company-settings/job-file-settings/workflow-milestones` and `GET /company-settings/job-file-settings/workflow-milestones/{milestone}/statuses`. These are needed before assigning semantics or colors to customer-defined milestone names. The API guide explicitly warns that milestone names are customer-configurable and case-sensitive. See `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md` (“Roofing Bridge Gotchas”).

## Target Pave Ops

The following exact root operation names exist in `schema-surface.json`:

- `createDailyLog`
- `createTask`
- `createTaskType`
- `createTasksFromBudget`

Permitted use under this contract:

- `createDailyLog` is the best-fidelity target for an immutable milestone transition, after its JobTread job crosswalk is resolved.
- `createTask` is only a conditional mapping for a human-approved, milestone-derived state marker. The source does not support reconstructing real production tasks.
- `createTaskType` is only a conditional organization-level setup operation after milestone semantics and colors are approved. AccuLynx milestone labels are not automatically equivalent to task types.
- `createTasksFromBudget` is **not supported by the current source**. Its only documented input is `jobId`, but no mirrored budget/task-generation rules prove when it should be called or what it would create. Keep it disabled until JobTread budget configuration is independently audited and a human approves the behavior.

## Field Mapping

### `public.acculynx_job_milestone_history` → `createDailyLog`

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `job_id` plus `account_key` | `jobId` | Text source identity; resolve through the durable `(account_key, acculynx_job_id) → jt_job_id` crosswalk. Never assume AccuLynx IDs are JobTread IDs. |
| `milestone_date` | `date` | Source `timestamptz`; convert to the Pro Exteriors business-local calendar date. Time-zone conversion policy is currently unknown and must be approved before loading. |
| `milestone_name`, `milestone_date`, `account_key`, `job_id`, `trust_tier` | `notes` | Render a factual state record, for example: `AccuLynx milestone: Completed. Effective: <ISO timestamp>. [ALX-MILESTONE:<account_key>:<job_id>:<timestamp>:<name>]`. The marker is the idempotency fingerprint; escape/normalize user-visible text. |
| none | `notify` | Literal `false`; historical migration must not notify the single JobTread seat. |
| none | `assignees` | Omit/empty. **Never create users and never turn AccuLynx representatives into memberships or assignees.** |
| none | `customFieldValues` | Omit unless the target custom-field IDs and accepted value shape are separately verified. The milestone table contains no sales-rep field. |
| none | `files` | Omit; no source file linkage exists in this domain. |

### `public.acculynx_job_milestone_history` → conditional `createTask`

This is deliberately loss-limited: it can create a milestone state marker, not recreate an AccuLynx production plan.

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `milestone_name` | `name` | Text; prefix clearly, e.g. `AccuLynx state — Completed`, so it cannot be mistaken for a field work instruction. |
| `account_key`, `job_id`, `milestone_name`, `milestone_date`, `trust_tier` | `description` | Factual provenance plus stable marker `[ALX-STATE:<account_key>:<job_id>:<timestamp>:<name>]`. Do not include raw error text or credentials. |
| resolved crosswalk | `targetId` | Existing JobTread job ID. Skip if unresolved. |
| logical Job target | `targetType` | Required semantic target appears to be a Job, but the exact accepted enum/string is **unknown** from the supplied schema snapshot. Validate in a non-production schema/explorer before execution. |
| `milestone_date` | `startDate` | Convert `timestamptz` to approved business-local date. A milestone date is not a scheduled start; label this as inferred if used. |
| `milestone_date` | `endDate` | Only for a zero-duration historical state marker. Do not interpret it as actual completion duration. |
| `milestone_name` | `progress` | Optional transform only after an approved milestone policy; for example, terminal states may map to complete. Exact type/range and the meaning of each label are **unknown**. Omit until validated. |
| approved milestone-type crosswalk | `taskTypeId` | Resolve `(organizationId, normalized milestone name) → jt_task_type_id`; otherwise omit. |
| none | `notify` | Literal `false`. |
| none | `assignedMembershipIds`, `assignees` | Omit/empty. The target has one seat and no new users may ever be created. Representatives/sales owners belong in verified custom-field values, not assignments; this source table does not carry them. |
| none | `isGroup`, `isToDo`, dependencies, subtasks, recurrence, baseline dates/times, clock times, files, parent/position fields | Omit. The source has no evidence for these fields. |

### Approved milestone definitions → conditional `createTaskType`

No live mirrored table currently contains the configured milestone definitions or colors. This operation therefore has no executable source mapping yet.

| Source value | Pave input field | Type notes and transform |
| --- | --- | --- |
| JobTread organization constant | `organizationId` | Literal `22PazeRM5FCH`. |
| future verified AccuLynx milestone definition `name` | `name` | Preserve case for evidence; use an approved normalized display name for deduplication. Do not derive types merely from observed history labels. |
| future approved mapping | `color` | **Unknown.** No color or semantic category exists in the current mirror. Human-approved JobTread-compatible value required. |

### Existing JobTread budget → gated `createTasksFromBudget`

| Source value | Pave input field | Type notes and transform |
| --- | --- | --- |
| resolved `(account_key, job_id)` crosswalk | `jobId` | The operation accepts a JobTread job ID. Current AccuLynx production tables provide no evidence that budget-generated tasks are configured, desired, or idempotent. **Do not invoke under this contract.** |

### Diagnostic tables

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `public.acculynx_get_checklist.*` | none | API-catalog metadata only; no JobTread production artifact. |
| `public.acculynx_job_walk_errors.*` | none | Completeness/control-plane evidence only. Use to block or retry source extraction outside JobTread; never create a task/log from it. |
| `public.acculynx_raw.*` | none directly | Retained evidence. Only a separately specified resource parser may map payload fields. No production-task resource type was observed live. |

## Gaps & Risks

- **Severe fidelity loss:** observed milestones (`Lead`, `Cancelled`, `Prospect`, `Approved`, `Completed`, `Invoiced`, `Closed`) describe commercial/job lifecycle state, not tear-off/install steps, crew assignments, dependencies, durations, checklist completion, material delivery, or daily field notes.
- A milestone transition can be represented honestly as a daily log. Turning it into a task is an inference and should be opt-in; it must be labeled as a state marker, not a reconstructed production task.
- The mirror contains 49 unresolved `milestone_history` walk errors. Until resolved or explicitly waived, the history is known incomplete.
- All 16,390 milestone rows have `market IS NULL`; use `account_key`, not `market`, for source partitioning and crosswalk identity.
- AccuLynx milestone names are customer-configurable and case-sensitive. Observed names must not be assigned workflow semantics without pulling definitions/statuses and obtaining approval.
- The supplied JobTread schema snapshot exposes operation signatures but not complete nested input types or enums. Accepted shapes for `assignees`, `customFieldValues`, `files`, `progress`, `targetType`, and `color` remain unknown. Omit them or validate them before any production write.
- `createDailyLog` and `createTask` are create operations, not proven native upserts. A retry without preflight deduplication could create duplicates.
- `createTasksFromBudget` may fan out multiple tasks and its idempotency behavior is unknown. It is disabled.
- JobTread’s exact per-grant rate limit is unpublished in the supplied README. Use adaptive throttling, honor rate-limit responses, and retry only safely deduplicated work with exponential backoff and jitter.
- Historical imports must use `notify: false`. No new JobTread users may be created. AccuLynx representatives/sales owners/assignees, if later sourced, must be stored only as approved custom-field values.
- Daily-log date conversion can shift a date if UTC is truncated. The organization time zone is unknown and must be confirmed.
- `trust_tier` is source provenance metadata, not a JobTread permission or completion status.

## Loader Plan

1. **Keep execution disabled initially.** Validate JobTread input enums/shapes and the organization time zone without mutating production. This research did not call JobTread.
2. **Resolve jobs first.** Build a durable crosswalk keyed by `(source_system='acculynx', account_key, acculynx_job_id)` with `jt_organization_id='22PazeRM5FCH'` and `jt_job_id`. Treat missing or ambiguous mappings as hard skips.
3. **Resolve optional task types second.** After milestone definitions and human-approved semantics/colors are available, deduplicate by `(jt_organization_id, normalized_source_milestone_name)` and store `jt_task_type_id`. Do not create a type merely because a label appears in history.
4. **Canonicalize each milestone event.** Use `(account_key, job_id, milestone_name, milestone_date)` as the source natural key; it is unique in the live data. Compute a deterministic hash from the canonical tuple and intended target kind.
5. **Preflight before every create.** Consult a durable loader crosswalk and, where JobTread reads allow it, search for the stable marker embedded in `notes`/`description`. Crosswalk keys should be:
   - daily log: `(account_key, acculynx_job_id, milestone_name, milestone_date, 'daily_log') → jt_daily_log_id`
   - state task: `(account_key, acculynx_job_id, milestone_name, milestone_date, 'state_task') → jt_task_id`
   - task type: `(organization_id, normalized milestone name) → jt_task_type_id`
6. **Write daily logs before optional state tasks.** `createDailyLog` is the primary representation. Run `createTask` only for a separately approved subset/policy. Never load `acculynx_get_checklist` or `acculynx_job_walk_errors` as artifacts.
7. **Keep `createTasksFromBudget` off.** Enable only after a JobTread budget/task-generation audit demonstrates expected output and retry behavior, followed by explicit human approval.
8. **Start with batches of 25 mutations, sequential per job.** Cap concurrency conservatively, checkpoint after every batch, and reduce rate on throttling. Increase only from observed safe behavior because the exact JobTread limit is unknown.
9. **Retry safely.** On timeout/unknown response, re-query by crosswalk/marker before retrying. Use exponential backoff with jitter for transient or rate-limit failures. Quarantine validation and authorization failures.
10. **Reconcile counts.** Report eligible, skipped-unmapped-job, skipped-duplicate, created, and failed counts by `account_key`. Never mark the migration complete while unresolved milestone-history source errors remain unreviewed.

## Evidence

All SQL below was executed live through the Supabase management query endpoint with `SUPABASE_ACCESS_TOKEN`; only `SELECT` statements were used. No credential value is reproduced here.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND (table_name LIKE 'acculynx_%' OR table_schema = 'qbo_registers')
ORDER BY table_schema, table_name;
```

Relevant verified results: `public.acculynx_get_checklist`, `public.acculynx_job_milestone_history`, `public.acculynx_job_walk_errors`, `public.acculynx_jobs`, and `public.acculynx_raw`.

```sql
SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'acculynx_get_checklist',
    'acculynx_job_walk_errors',
    'acculynx_job_milestone_history',
    'acculynx_jobs',
    'acculynx_raw'
  )
ORDER BY table_name, ordinal_position;
```

Result: the field shapes used in this contract were verified live.

```sql
SELECT 'acculynx_get_checklist' AS table_name, COUNT(*)::bigint AS rows
FROM public.acculynx_get_checklist
UNION ALL
SELECT 'acculynx_job_walk_errors', COUNT(*)::bigint
FROM public.acculynx_job_walk_errors
UNION ALL
SELECT 'acculynx_job_milestone_history', COUNT(*)::bigint
FROM public.acculynx_job_milestone_history
UNION ALL
SELECT 'acculynx_jobs', COUNT(*)::bigint
FROM public.acculynx_jobs
UNION ALL
SELECT 'acculynx_raw', COUNT(*)::bigint
FROM public.acculynx_raw
ORDER BY table_name;
```

- `acculynx_get_checklist`: rows = 86
- `acculynx_job_milestone_history`: rows = 16390
- `acculynx_job_walk_errors`: rows = 73
- `acculynx_jobs`: rows = 6571
- `acculynx_raw`: rows = 44582

```sql
SELECT operation_id, path, tier, swept
FROM public.acculynx_get_checklist
WHERE lower(operation_id) ~
      '(task|check|daily|log|schedule|appointment|production|crew|labor|material|milestone|history)'
   OR lower(path) ~
      '(task|check|daily|log|schedule|appointment|production|crew|labor|material|milestone|history)'
ORDER BY operation_id;
```

Result: 16 endpoint-catalog rows matched; relevant unswept routes included `getAppointments`, `getAppointmentById`, `getJobHistory`, `getMilestones`, `getMilestonesForJob`, and `getStatusesForMilestone`.

```sql
SELECT milestone_name, COUNT(*)::bigint AS rows
FROM public.acculynx_job_milestone_history
WHERE archived_at IS NULL
GROUP BY milestone_name
ORDER BY rows DESC, milestone_name;
```

- `Lead`: rows = 6463
- `Cancelled`: rows = 5000
- `Prospect`: rows = 1650
- `Approved`: rows = 1043
- `Completed`: rows = 864
- `Invoiced`: rows = 795
- `Closed`: rows = 575

```sql
SELECT
  COUNT(*)::bigint AS rows,
  COUNT(DISTINCT (account_key, job_id, milestone_name, milestone_date))::bigint
    AS distinct_natural_keys,
  COUNT(*) FILTER (WHERE archived_at IS NULL)::bigint AS active_rows,
  COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::bigint AS archived_rows,
  COUNT(*) FILTER (WHERE market IS NULL)::bigint AS market_null_rows
FROM public.acculynx_job_milestone_history;
```

- rows = 16390
- distinct natural keys = 16390
- active rows = 16390
- archived rows = 0
- market-null rows = 16390

```sql
SELECT
  COUNT(*)::bigint AS rows,
  COUNT(DISTINCT (account_key, id))::bigint AS distinct_job_keys,
  COUNT(*) FILTER (WHERE current_milestone IS NULL)::bigint AS milestone_null_rows,
  COUNT(*) FILTER (WHERE milestone_date IS NULL)::bigint AS milestone_date_null_rows,
  COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::bigint AS archived_rows
FROM public.acculynx_jobs;
```

- rows = 6571
- distinct job keys = 6571
- milestone-null rows = 0
- milestone-date-null rows = 0
- archived rows = 0

```sql
SELECT resource_type, COUNT(*)::bigint AS rows,
       COUNT(*) FILTER (WHERE resolved_at IS NULL)::bigint AS unresolved_rows
FROM public.acculynx_job_walk_errors
GROUP BY resource_type
ORDER BY rows DESC, resource_type;
```

- `milestone_history`: rows = 49; unresolved rows = 49
- `job_insurance`: rows = 21; unresolved rows = 21
- `job_contacts`: rows = 2; unresolved rows = 2
- `invoices`: rows = 1; unresolved rows = 1

```sql
SELECT resource_type, COUNT(*)::bigint AS rows
FROM public.acculynx_raw
GROUP BY resource_type
ORDER BY rows DESC, resource_type;
```

- `invoices`: rows = 6682
- `job_contacts`: rows = 6682
- `job_financials`: rows = 6682
- `job_insurance`: rows = 6682
- `milestone_history`: rows = 6682
- `representatives`: rows = 6682
- `jobs`: rows = 1734
- `invoice_lines`: rows = 1628
- `users`: rows = 994
- `job_detail`: rows = 134

