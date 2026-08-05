# AccuLynx Estimate Sections and Items Backfill Report

Run date: 2026-07-27  
Supabase project: `rnhmvcpsvtqjlffpsayu`  
Scope: all 210 estimate IDs in `public.acculynx_estimates`

## Endpoints Called

All AccuLynx calls were read-only `GET` requests. Calls were serialized with at
least 0.5 seconds between requests within each run.

| Endpoint path | Calls | Status codes |
| --- | ---: | --- |
| `/estimates/{estimateId}/sections?includes=items` — required full sweep | 210 | `404`: 210 |
| `/estimates/{estimateId}/sections?includes=items` — six account-partition probes plus one initial probe | 7 | `404`: 7 |
| `/estimates/{estimateId}?includes=sections` — documented diagnostic fallback | 1 | `404`: 1 |
| `/jobs/{jobId}/estimates?pageSize=100&pageStartIndex=0` — documented job-scoped diagnostic | 1 | `404`: 1 |
| `/estimates?pageSize=100&pageStartIndex=0` — pagination-limit diagnostic | 1 | `400`: 1 |
| `/estimates?pageSize=25&pageStartIndex=0` — valid credential-visibility diagnostic | 1 | `200`: 1, payload `items`: 0 |
| `/estimates/{estimateId}/sections/{sectionId}/items` | 0 | Not called because no section ID was returned |

Total AccuLynx calls in this corrective run: **221** (`404`: 219, `400`: 1,
`200`: 1). Required cohort coverage: **210 of 210 estimate IDs attempted**.

The required sweep's `404` results by source account partition were:

| Account partition | Estimate IDs attempted | `404 NotFound` |
| --- | ---: | ---: |
| `colorado` | 7 | 7 |
| `insurance_program` | 1 | 1 |
| `kansas_city` | 32 | 32 |
| `multi_family_commercial` | 6 | 6 |
| `texas` | 55 | 55 |
| `wichita` | 109 | 109 |

## Rows Loaded

Live SQL counts before and after the corrective run:

| Table | Before | After | Net loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.estimate_sections` | 0 | 0 | 0 |
| `acculynx_backfill.estimate_items` | 0 | 0 | 0 |

No rows were fabricated or inserted because AccuLynx returned no section or
item payloads. No schema alteration was performed.

Live integrity checks after the run:

- Items without a matching section: **0**. The correct live relation is
  `estimate_items.section_id = estimate_sections.acculynx_id`, additionally
  scoped by `account_key`.
- Items carrying `price` or `total_price`: **0 of 0**.

## Anomalies

- Every required estimate-section request returned `404 NotFound`.
- A valid top-level request,
  `/estimates?pageSize=25&pageStartIndex=0`, returned `200` with zero items.
  This credential therefore currently sees no estimates at all.
- The estimate-detail diagnostic and the job-scoped estimate diagnostic both
  returned `404 NotFound` for a mirrored estimate/job pair.
- One sample from each of the six mirrored account partitions returned the same
  `404 NotFound`, and the complete sweep confirmed that result for all 210 IDs.
- There were no `429` responses and no retries.
- There were no successful empty section payloads. The only successful empty
  payload was the top-level estimate listing.
- No item fallback calls were possible because no section IDs were returned.
- The `pageSize=100` top-level diagnostic returned `400 BadRequest`;
  `pageSize=25` was accepted.
- Live schema surprise: both backfill tables use `acculynx_id`, with primary
  keys `(account_key, acculynx_id)`. They do not have an `id` column. The
  external validator query that referenced `estimate_sections.id` is invalid
  for the live table; its equivalent integrity check succeeds when it joins
  `estimate_items.section_id` to `estimate_sections.acculynx_id` and includes
  `account_key`.

## Verdict

**Blocked by AccuLynx credential visibility.** The corrective run completed the
required 210-estimate sweep within the rate limit, tested all six source account
partitions, and verified through the top-level listing that the current
`ACCULYNX_API_KEY` can access zero estimates. Consequently, the honest backfill
result remains zero sections and zero items.

The loader cannot satisfy the population or price-coverage checks until an
AccuLynx credential with access to the parent jobs/estimates is supplied. The
validator's referential-integrity SQL must separately be corrected to use
`estimate_sections.acculynx_id` (plus `account_key`) rather than the nonexistent
`estimate_sections.id`.
