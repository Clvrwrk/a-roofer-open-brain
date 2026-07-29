# CompanyCam Projects Backfill Report

Run date: 2026-07-27  
Supabase project: `rnhmvcpsvtqjlffpsayu`  
Authorized target: `acculynx_backfill.companycam_projects`

## Endpoints Called

| Endpoint | Calls | Status codes | Notes |
| --- | ---: | --- | --- |
| `GET https://api.companycam.com/v2/projects?page={page}&per_page=100` | 253 | `200`: 253 | One response-shape check, one initial complete sweep, and one complete retry sweep after detecting a duplicate source ID. Each sweep used 125 populated pages plus one empty terminating page. |

All CompanyCam calls were serialized with a delay of at least 0.5 seconds. No AccuLynx endpoint and no JobTread endpoint was called. No `POST`, `PUT`, `PATCH`, or `DELETE` request was sent to CompanyCam.

## Rows Loaded

| Table | Before | After | Net rows loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.companycam_projects` | 0 | 6,229 | 6,229 |

The previously missing named destination table was created inside `acculynx_backfill` as the narrowly required repair requested after the failed attempt. Rows were loaded in batches of 100 with `ON CONFLICT (id) DO UPDATE`. Every persisted row has `fetched_at` and endpoint provenance `GET /v2/projects`.

Live SQL validation:

| Outcome | Rows |
| --- | ---: |
| Total unique CompanyCam projects | 6,229 |
| Matched to an AccuLynx job | 5,360 |
| Unmatched | 869 |
| Exact street + ZIP | 4,782 |
| Street + ZIP, uniquely disambiguated | 367 |
| Unique name-similarity fallback | 59 |
| Coordinate fallback within 150 m | 152 |
| CompanyCam project rows linked to pilot jobs | 40 |
| Distinct pilot jobs with at least one CompanyCam project | 24 of 25 |

Confidence persisted with the matches:

| Confidence | Rows |
| --- | ---: |
| High | 5,149 |
| Medium | 59 |
| Low | 152 |
| Null / unmatched | 869 |

## Anomalies

- **Duplicate source ID:** CompanyCam returned 6,230 records but only 6,229 unique project IDs. The first load pass reached 5,800 persisted rows before a later 100-row batch was rejected atomically because the same constrained ID appeared twice in that statement. The retry de-duplicated the complete payload by project ID before UPSERT and loaded all 6,229 unique projects.
- **Effective page size:** CompanyCam returned 50 projects per populated page despite `per_page=100`. Pagination continued until an empty array.
- **Empty payloads:** two expected empty arrays terminated the two complete pagination sweeps.
- **429 responses:** none.
- **Other CompanyCam API errors:** none.
- **Schema repair:** `acculynx_backfill.companycam_projects` was still absent at preflight. It was created only in the authorized `acculynx_backfill` schema, then populated.
- **SQL preflight correction:** one metadata query failed at parse time because shell quoting removed SQL string literals. It executed no database mutation; the corrected query succeeded.
- **Transient local-file deviation:** the response-shape check briefly wrote a temporary JSON file under `/tmp` and removed it immediately. No credential value was written or logged. All later processing was in memory, and the only surviving file written is this report.

## Verdict

**Complete.**

The live destination contains all 6,229 unique CompanyCam projects currently returned by the API. Matching metadata was persisted for 5,360 projects, including coverage for 24 of the 25 pilot AccuLynx jobs. The remaining 869 projects are intentionally unmatched rather than assigned without sufficient evidence. Live validation satisfies both requested gates: the table is populated and at least 10 pilot jobs are matched.
