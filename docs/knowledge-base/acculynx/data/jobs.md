---
type: Table
title: acculynx_jobs & crm_pipeline
description: The flat AccuLynx job mirror and the normalized pipeline table agents query.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/editor
tags: [acculynx, jobs, crm_pipeline, leads]
timestamp: 2026-06-30T00:00:00Z
---

# acculynx_jobs (flat mirror)

One row per AccuLynx job/lead. `id` (text, AccuLynx GUID) is the **immutable join key,
assigned at lead creation, never changes** — use it as the permanent link.

Key columns: `job_name`, `job_number`, `current_milestone`, `milestone_date`,
`job_category_name` (Residential/Commercial), `trade_types`, `lead_source_name`,
`location_street1/city/state/zip`, `latitude/longitude`, `created_date`, `modified_date`,
`raw` (full API JSON), `synced_at`.

> **PE job number lives in `job_name`** (`"KS-157: Kathy Mcmillen"` = `{job#}: {client}`),
> **NOT** the mostly-empty `job_number` column. Extract `split_part(job_name,':',1)`.
> Only ~179 / 1,284 jobs carry a PE number (the match ceiling).

# crm_pipeline (normalized consumer)

The table dashboards actually read. Normalizes milestone (`unassigned_lead` /
`assigned_lead` / `approved` / …), `market`, `job_category`, and lead source.
`data_source='api_sync'`, keyed on `acculynx_job_id`. Carries derived fields:
`days_in_lead`, `total_process_days`, `last_touched_days`, parsed
`client_job_number` / `client_name`.

# Job-number lifecycle (Chris's TEMP design)

A lead has no sequence number until **Approved**. Permanent key = AcuLynx `id`;
pre-approval display label = `{Region}-TEMP-{short id}`; on Approved, swap to the real
`{Region}-{Sequence}`. Links ride on `id` so nothing breaks.

# Coverage

~1,284 rows, ~99% Kansas — only one [account](../accounts.md) is synced. The
[sync pipeline](../ingestion/sync-pipeline.md) populates both tables.

# Citations

[1] [acculynx-api skill — brain data map](../../../../skills/cleverwork-roofer/acculynx-api/SKILL.md)
[2] [Brain Tables](tables.md)
