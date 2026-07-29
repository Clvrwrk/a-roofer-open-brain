# AccuLynx Pilot Job-Enrichment Backfill

Run date: 2026-07-27  
Scope: the 25 jobs in `jt_mirror.pilot_jobs` and their 28 distinct `public.acculynx_job_contacts` contacts

## Endpoints Called

All AccuLynx calls were read-only `GET` requests. Calls were globally serialized with at least 0.5 seconds between requests. Each request used the account-specific API-key environment variable selected from the pilot job's live `public.acculynx_jobs.account_key`; no credential value was written to this report or logs.

| Path | Calls | Status codes |
| --- | ---: | --- |
| `/jobs/{jobId}/representatives` | 28 | `200`: 27; `404`: 1 |
| `/jobs/{jobId}/representatives/company` | 0 | Not needed because the corrected primary requests returned representative payloads |
| `/jobs/{jobId}/representatives/sales-owner` | 0 | Not needed because the corrected primary requests returned representative payloads |
| `/contacts/{contactId}?includes=emailAddress,phoneNumber` | 28 | `200`: 28 |
| `/contacts/{contactId}/email-addresses` | 6 | `200`: 6 |
| `/contacts/{contactId}/phone-numbers` | 2 | `200`: 2 |
| `/jobs/{jobId}/financials` | 25 | `200`: 25 |
| `/financials/{financialsId}/worksheet` | 25 | `200`: 23; `204`: 2 |

Total AccuLynx calls in the corrective run, including three representative diagnostics, were **114**. The single `404` was the initial confirmation using the default key. The next two diagnostics used the correct Wichita account key and returned `200`; the complete 25-job sweep then used the correct key for each job's account partition.

## Rows Loaded

Counts are before/after values read from live SQL in Supabase project `rnhmvcpsvtqjlffpsayu`.

| Table | Before | After | Net loaded |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.job_representatives` | 0 | 45 | 45 |
| `acculynx_backfill.contact_emails` | 0 | 22 | 22 |
| `acculynx_backfill.contact_phones` | 0 | 27 | 27 |
| `acculynx_backfill.worksheet_lines` | 0 | 96 | 96 |

The loader issued one idempotent `INSERT ... ON CONFLICT DO UPDATE` statement per target table, using the live composite primary key for that table. No table was altered and no table outside `acculynx_backfill` was mutated.

Live coverage after the upserts:

| Enrichment | Pilot coverage |
| --- | ---: |
| Jobs with representatives | 25 of 25 |
| Contacts with email rows | 22 of 28 |
| Contacts with phone rows | 26 of 28 |
| Jobs with worksheet lines | 23 of 25 |

Final SQL reconciliation found zero rows outside the authorized pilot job/contact scope and zero rows missing `fetched_at` or endpoint provenance.

## Anomalies

- Root cause of the failed attempt: the pilot cohort spans the `wichita`, `insurance_program`, `kansas_city`, `texas`, `colorado`, and `multi_family_commercial` AccuLynx accounts. A single default API key cannot read jobs belonging to the other account partitions and yields `404`. The corrective run routed requests through the matching per-account key environment variable.
- The initial default-key diagnostic returned one `404`; repeating the same request with the job's Wichita key returned `200`.
- Two worksheet requests returned `204 No Content`. No worksheet rows were invented for those jobs.
- Six email-list and two phone-list fallbacks returned `200` but supplied no additional loadable values beyond the included contact detail responses.
- No `429` response occurred, so jittered retry was not invoked.
- The existing target schemas use normalized columns such as `acculynx_id`, `representative_type`, `user_display_name`, `email_address`, `phone_number`, and `source_endpoint`. They already supported the payloads, so no schema change was made.

## Verdict

**PASS.** The corrective backfill loaded real AccuLynx payloads for the exact 25-job pilot cohort: representative coverage is 25 jobs, worksheet-line coverage is 23 jobs, email coverage increased from zero to 22 contacts, and phone coverage increased from zero to 26 contacts. All external calls were GET-only, all database mutations were confined to the four authorized `acculynx_backfill` tables, and final live SQL found no scope or provenance violations.
