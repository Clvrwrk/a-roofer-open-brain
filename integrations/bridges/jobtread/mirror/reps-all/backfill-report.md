# AccuLynx Job Representatives Full Backfill

Run date: 2026-07-27  
Scope: all 6,574 non-archived rows in `public.acculynx_jobs`  
Mutation boundary: `INSERT ... ON CONFLICT DO UPDATE` only in `acculynx_backfill.job_representatives`

## Raw Extraction

The latest successful `public.acculynx_raw` `/jobs/{jobId}/representatives`
envelope covered 6,515 of 6,574 non-archived jobs. The extraction loaded
6,730 requested assignment rows: 6,518 `CompanyRepresentative` rows across
6,515 jobs and 212 `SalesOwner` rows across 212 jobs. User IDs were joined
exactly to `public.acculynx_users.id` for display name and status. Historical
envelopes were not unioned.

The SQL used was:

```sql
WITH latest AS (
  SELECT DISTINCT ON (job_id)
         job_id, fetched_at, payload
  FROM (
    SELECT
      (regexp_match(
        api_endpoint,
        '^/jobs/([0-9a-fA-F-]{36})/representatives$'
      ))[1] AS job_id,
      fetched_at,
      payload,
      id
    FROM public.acculynx_raw
    WHERE resource_type = 'representatives'
      AND http_status BETWEEN 200 AND 299
      AND api_endpoint ~
        '^/jobs/[0-9a-fA-F-]{36}/representatives$'
  ) r
  ORDER BY job_id, fetched_at DESC, id DESC
),
source_rows AS (
  SELECT
    j.account_key,
    item->>'id' AS acculynx_id,
    j.id AS job_id,
    item->'user'->>'id' AS user_id,
    NULLIF(item->>'parentRepresentativeId', '')
      AS parent_representative_id,
    item->>'type' AS representative_type,
    u.display_name AS user_display_name,
    u.status AS user_status,
    item AS raw,
    l.fetched_at,
    'supabase:acculynx_raw:representatives'::text
      AS source_endpoint
  FROM latest l
  JOIN public.acculynx_jobs j
    ON j.id = l.job_id
   AND j.archived_at IS NULL
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(l.payload->'items', '[]'::jsonb)
  ) item
  LEFT JOIN public.acculynx_users u
    ON u.id = item->'user'->>'id'
  WHERE item->>'type' IN (
    'CompanyRepresentative',
    'SalesOwner'
  )
    AND NULLIF(item->>'id', '') IS NOT NULL
    AND NULLIF(item->'user'->>'id', '') IS NOT NULL
)
INSERT INTO acculynx_backfill.job_representatives (
  account_key,
  acculynx_id,
  job_id,
  user_id,
  parent_representative_id,
  representative_type,
  user_display_name,
  user_status,
  raw,
  fetched_at,
  source_endpoint
)
SELECT
  account_key,
  acculynx_id,
  job_id,
  user_id,
  parent_representative_id,
  representative_type,
  user_display_name,
  user_status,
  raw,
  fetched_at,
  source_endpoint
FROM source_rows
ON CONFLICT (account_key, job_id, acculynx_id)
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  parent_representative_id =
    EXCLUDED.parent_representative_id,
  representative_type = EXCLUDED.representative_type,
  user_display_name = EXCLUDED.user_display_name,
  user_status = EXCLUDED.user_status,
  raw = EXCLUDED.raw,
  fetched_at = EXCLUDED.fetched_at,
  source_endpoint = EXCLUDED.source_endpoint;
```

## API Gap-Fill

After raw extraction, 59 jobs still had no requested representative row. All
59 belonged to `wichita`. The sweep routed each request through
`PE_CC_WICHITA_ACCULYNX_API_KEY` and called only:

`GET https://api.acculynx.com/api/v2/jobs/{jobId}/representatives`

Requests were capped at 4 requests/second for the branch key. All 59 calls
returned `200`; all 59 jobs supplied one real `CompanyRepresentative` row.
The fallback company and sales-owner endpoints were therefore not called.
There were no 404s, 429s, retries, or network failures. The 59 prepared rows
were written in one idempotent upsert statement by a loader configured for
250-row batches.

| Branch | Jobs | Raw-covered | API calls | API-covered | Final covered |
| --- | ---: | ---: | ---: | ---: | ---: |
| `colorado` | 1,864 | 1,864 | 0 | 0 | 1,864 |
| `florida` | 30 | 30 | 0 | 0 | 30 |
| `georgia` | 435 | 435 | 0 | 0 | 435 |
| `insurance_program` | 29 | 29 | 0 | 0 | 29 |
| `kansas_city` | 169 | 169 | 0 | 0 | 169 |
| `multi_family_commercial` | 383 | 383 | 0 | 0 | 383 |
| `sandbox` | 0 | 0 | 0 | 0 | 0 |
| `texas` | 2,309 | 2,309 | 0 | 0 | 2,309 |
| `wichita` | 1,355 | 1,296 | 59 | 59 | 1,355 |
| **Total** | **6,574** | **6,515** | **59** | **59** | **6,574** |

## Rows Loaded

| Measure | Before | After | Net change |
| --- | ---: | ---: | ---: |
| All rows in `job_representatives` | 45 | 6,811 | +6,766 |
| Distinct covered jobs | 25 | 6,574 | +6,549 |

Final requested-type inventory is 6,791 rows: 6,579
`CompanyRepresentative` rows and 212 `SalesOwner` rows. Every one of the
6,574 non-archived jobs has at least one requested representative assignment.
Final reconciliation found zero orphan rows and zero rows missing
`fetched_at` or `source_endpoint`.

## Anomalies

- Five jobs have two real `CompanyRepresentative` rows in their selected
  source response: one Colorado job, one Texas job, and three Wichita jobs.
  Both source assignments were preserved; no precedence was invented.
- Only 212 jobs have an observed `SalesOwner`. The remaining jobs were not
  given an invented sales owner. Their successful source responses prove only
  the assignments actually returned.
- The pre-existing pilot left 20 `Additional` rows in the table. They were
  outside this backfill's requested types and were not deleted because the
  authorized boundary allowed inserts/upserts only.
- Two pre-existing pilot `CompanyRepresentative` rows have blank display
  names even though their user IDs match `public.acculynx_users`. This run did
  not overwrite them because they were outside the 59-job gap. All 6,730
  raw-extracted rows have populated display names.
- `public.acculynx_jobs` currently has zero archived rows, so the non-archived
  scope equals the full 6,574-row jobs table at run time.
- No branch-key visibility failures occurred; per-branch 404 count is zero.

## Verdict

**PASS.** Representative coverage is 6,574 of 6,574 non-archived jobs
(100%). The run used the raw mirror first, made only 59 read-only AccuLynx GET
calls for the remaining jobs, never called JobTread, and confined database
writes to idempotent upserts in
`acculynx_backfill.job_representatives`. No assignment was fabricated.
