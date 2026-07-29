# AccuLynx Estimate Sections and Items Backfill Report

Run date: 2026-07-27  
Supabase project: `rnhmvcpsvtqjlffpsayu`  
Scope: all 210 estimates in `public.acculynx_estimates`

## Endpoints Called

All AccuLynx access was read-only `GET` access to
`https://api.acculynx.com/api/v2`. Each request used the API key mapped from
the estimate row's `account_key`. Requests were kept at or below two requests
per second per key.

| Phase | Endpoint path | Calls | Status codes |
| --- | --- | ---: | --- |
| Canary: two Colorado estimates and one Kansas City estimate | `/estimates/{estimateId}/sections?includes=items` | 3 | `200`: 3 |
| Full sweep: all 210 estimates | `/estimates/{estimateId}/sections?includes=items` | 210 | `200`: 210 |
| Item fallback | `/estimates/{estimateId}/sections/{sectionId}/items` | 0 | Not needed; every section response included an `items` array |

Total AccuLynx requests: **213**, all `200`. The three canary estimates were
requested again during the complete 210-estimate sweep.

Full-sweep results by routed account key:

| Account key | Estimates attempted | `200` | Sections returned | Items returned |
| --- | ---: | ---: | ---: | ---: |
| `colorado` | 7 | 7 | 9 | 121 |
| `insurance_program` | 1 | 1 | 1 | 2 |
| `kansas_city` | 32 | 32 | 37 | 598 |
| `multi_family_commercial` | 6 | 6 | 10 | 118 |
| `texas` | 55 | 55 | 70 | 1,166 |
| `wichita` | 109 | 109 | 178 | 2,735 |
| **Total** | **210** | **210** | **305** | **4,740** |

No JobTread endpoint was called.

## Rows Loaded (live before/after counts)

The load used `ON CONFLICT (account_key, acculynx_id) DO UPDATE`, so rerunning
the same cohort is idempotent.

| Table | Before | After | Net loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.estimate_sections` | 0 | 305 | 305 |
| `acculynx_backfill.estimate_items` | 0 | 4,740 | 4,740 |

Post-load live checks:

- Estimates represented in `estimate_sections`: **210 of 210**.
- Estimates represented in `estimate_items`: **210 of 210**.
- Items without a matching section on `(account_key, section_id)`: **0**.
- Rows missing `fetched_at` or `source_endpoint`: **0** in both tables.
- Section rows whose provenance did not match
  `/estimates/{estimateId}/sections?includes=items`: **0**.
- Items with `price`: **4,740 of 4,740**.
- Items with `total_price`: **4,740 of 4,740**.

## Anomalies

- None of the branch-routed requests returned `404`, `429`, or another error.
- The mirrored cohort contains estimates for six of the nine configured account
  keys. There were no estimates to request for `florida`, `georgia`, or
  `sandbox`.
- The section and item tables use composite primary keys
  `(account_key, acculynx_id)`. Item referential verification therefore joins
  `estimate_items.section_id` to `estimate_sections.acculynx_id` and also
  matches `account_key`.
- One returned section contained no items; this is consistent with the API
  payload and was retained as a section row without fabricating an item.

## Verdict

**Complete.** Branch-key routing resolved the prior credential-visibility
failure. All 210 estimates were fetched successfully, and the live target
tables now contain 305 sections and 4,740 items with complete provenance.
Referential integrity and item price coverage checks passed.
