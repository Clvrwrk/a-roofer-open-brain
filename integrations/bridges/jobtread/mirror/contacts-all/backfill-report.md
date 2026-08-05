# AccuLynx All Job-Contact Email/Phone Backfill

Run window: 2026-07-28T05:38:18.910526+00:00 to 2026-07-28T05:48:46.786700+00:00  
Scope: 6,528 distinct contacts attached to jobs in `public.acculynx_job_contacts`

## Sweep Plan

| Account key | Job contacts | Already had email | Already had phone | Attempted |
| --- | ---: | ---: | ---: | ---: |
| `colorado` | 1,884 | 2 | 2 | 1,882 |
| `florida` | 30 | 0 | 0 | 30 |
| `georgia` | 437 | 0 | 0 | 437 |
| `insurance_program` | 29 | 1 | 1 | 28 |
| `kansas_city` | 169 | 1 | 1 | 168 |
| `multi_family_commercial` | 389 | 1 | 1 | 388 |
| `texas` | 2,310 | 2 | 2 | 2,308 |
| `wichita` | 1,280 | 15 | 19 | 1,265 |
| **Total** | **6,528** | **22** | **26** | **6,506** |

Each populated account partition ran concurrently with its own API key. Requests for a given key were spaced at least 0.26 seconds apart (under 4 requests/second). Only contacts missing email rows, phone rows, or both were attempted.

## Endpoints Called

All AccuLynx calls were read-only `GET` requests.

| Path | Calls | Status codes |
| --- | ---: | --- |
| `/contacts/{contactId}?includes=emailAddress,phoneNumber` | 6,510 | `200`: 6,510 |
| `/contacts/{contactId}/email-addresses` | 112 | `200`: 112 |
| `/contacts/{contactId}/phone-numbers` | 33 | `200`: 33 |

The totals include a corrective re-fetch of four source records whose returned
email-address values failed normalization validation. No additional phone call
was needed during that correction.

## Rows Loaded

| Table | Before | After | Net change |
| --- | ---: | ---: | ---: |
| `acculynx_backfill.contact_emails` | 22 | 3,636 | 3,614 |
| `acculynx_backfill.contact_phones` | 27 | 5,844 | 5,817 |

Rows were loaded in idempotent batches using `INSERT ... ON CONFLICT (account_key, acculynx_id) DO UPDATE`. Every loaded row includes `fetched_at` and the actual `source_endpoint` used.

The corrective pass UPSERT-normalized four vendor-returned, non-email values to
`NULL`; row counts therefore did not change. The original AccuLynx objects
remain preserved in each row's `raw` field.

## Coverage

| Measure | Result |
| --- | ---: |
| Contacts enriched with a valid email and/or phone / all job contacts | 5,732 / 6,528 |
| Contacts successfully attempted / contacts requiring work | 6,506 / 6,506 |
| Contacts with valid email values after sweep | 3,497 / 6,528 |
| Contacts with phone rows after sweep | 5,583 / 6,528 |
| Successfully fetched contacts with no valid email data | 3,031 |
| Successfully fetched contacts with no phone data | 945 |
| Successfully fetched contacts with neither valid email nor phone data | 796 |
| Contacts skipped because both enrichments already existed | 22 |

## Anomalies

- No request or response errors were recorded.
- The initial sweep admitted four AccuLynx email child records whose non-null
  `address` values contained no `@`, causing the bulk validator to fail with
  `detail=4`. Corrective GETs confirmed the source values: three contacts had
  no valid alternate email, while the fourth had a separate valid email child
  already loaded. The four unusable normalized values were set to `NULL` via
  scoped UPSERTs; their source payloads remain intact in `raw`.
- Final SQL reconciliation found zero rows outside the job-contact cohort, zero rows
  missing `fetched_at` or `source_endpoint`, zero blank non-null values, and zero
  mismatches between `acculynx_id` and the child ID retained in `raw`. It also
  found zero non-null email values lacking `@`.
- Contacts whose primary detail request did not complete successfully: 0.
- No values were invented for contacts with empty email or phone collections.

## Verdict

**PASS.** The full job-contact cohort was swept successfully, and
`b1_backfill_check.py contacts-all` now passes all four coverage assertions.
AccuLynx access was GET-only, database writes were confined to the two
authorized backfill tables, and empty or malformed contact methods were
reported rather than fabricated.
