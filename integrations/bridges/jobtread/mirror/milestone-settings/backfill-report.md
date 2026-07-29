## Endpoints Called

All external calls were read-only `GET` requests to AccuLynx API v2. Calls were serialized with at least 0.5 seconds between requests.

| Path | Calls | Status codes |
|---|---:|---|
| `/company-settings/job-file-settings/workflow-milestones` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/1/statuses` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/2/statuses` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/3/statuses` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/4/statuses` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/5/statuses` | 1 | `200` × 1 |
| `/company-settings/job-file-settings/workflow-milestones/6/statuses` | 1 | `200` × 1 |

Total: 7 calls; 7 HTTP 200 responses; 0 HTTP 429 responses.

No JobTread API call was made. The `Cancelled` fallback row described below was derived from the existing live `public.acculynx_jobs` mirror, whose source endpoint provenance is `/jobs`; this repair did not make an additional external `/jobs` request.

## Rows Loaded

| Table | Before | After | Net |
|---|---:|---:|---:|
| `acculynx_backfill.milestone_settings` | 0 | 7 | +7 |

Six rows came directly from the workflow-milestones settings response:

| AccuLynx ID | Name | Sort order | Returned statuses |
|---:|---|---:|---:|
| 1 | `Lead` | 1 | 0 |
| 2 | `Prospect` | 2 | 0 |
| 3 | `Approved` | 3 | 0 |
| 4 | `Completed` | 4 | 0 |
| 5 | `Invoiced` | 5 | 0 |
| 6 | `Closed` | 6 | 0 |

One additional vocabulary row, `Cancelled`, came from the live AccuLynx jobs mirror after the settings endpoint omitted a value used by 5,100 live jobs. Its `raw` payload explicitly records `observation_source = public.acculynx_jobs` and `settings_endpoint_returned = false`; its endpoint provenance is `/jobs (observed via public.acculynx_jobs mirror)`. No statuses were invented.

The target table was repaired to include the brief's contract columns `name`, `statuses`, and `endpoint`. Existing rows were backfilled from `milestone_name`, `raw.statuses`, and `source_endpoint`, respectively.

Post-load live SQL confirmed:

- 7 rows in `acculynx_backfill.milestone_settings`
- 0 null `name` values
- 0 null `statuses` values
- 0 null `fetched_at` values
- 0 null `endpoint` values
- no distinct live `public.acculynx_jobs.current_milestone` absent from `milestone_settings.name`

## Anomalies

- All six per-milestone `/statuses` endpoints returned HTTP 200 with empty JSON arrays. No status rows or status values were fabricated.
- The workflow-milestones response omitted `Cancelled`, although `Cancelled` is a case-sensitive current milestone on 5,100 live rows in `public.acculynx_jobs`. It was loaded only as a clearly marked live-job-observed fallback, not misrepresented as a settings-endpoint result.
- The milestone response contained no explicit sort-order field. `sort_order` preserves API array order for the six returned settings; the observed fallback follows them at 7.
- The pre-existing table used `milestone_name` and `source_endpoint` instead of the required `name` and `endpoint`, and lacked the required top-level `statuses jsonb` column. Those columns were added within `acculynx_backfill.milestone_settings` and populated idempotently.
- No 404s, 429s, retries, or non-200 external responses occurred.

## Verdict

Backfill repaired and validated. `acculynx_backfill.milestone_settings` now has the required contract columns and contains all seven case-sensitive milestone values currently used by live AccuLynx jobs. Six are direct company-settings results; `Cancelled` is transparently sourced from the live `/jobs` mirror because the settings endpoint omitted it. The validator query against `milestone_settings.name` now returns `ok = true` with no missing detail.
