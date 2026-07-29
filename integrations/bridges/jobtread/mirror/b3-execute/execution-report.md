# JobTread Bulk Execution Report

## Canary

- Op: `createAccount`
- Source: `acculynx_contact:1c865a56-5543-f111-8af3-ea808804e890`
- Created JobTread ID: `22PbdLTF23KV`
- Expected name: `Andy Klassen`
- Pave read-back: HTTP 200; `id=22PbdLTF23KV` and `name=Andy Klassen` matched.
- Result: passed. The resumed run did not replay this canary.

## Execution Summary

Live SQL counts at final verification:

| Domain | Executed | Failed | Skipped | Staged |
| --- | ---: | ---: | ---: | ---: |
| catalog_items | 123 | 0 | 0 | 0 |
| cost_codes | 13 | 0 | 0 | 0 |
| cost_types | 2 | 0 | 2 | 0 |
| custom_fields | 6 | 0 | 0 | 0 |
| customer_accounts | 6,584 | 0 | 1 | 0 |
| daily_logs | 6,466 | 0 | 0 | 0 |
| documents | 212 | 0 | 0 | 0 |
| job_custom_values | 6,574 | 0 | 0 | 0 |
| jobs | 6,574 | 0 | 0 | 0 |
| locations | 6,556 | 0 | 18 | 0 |
| units | 10 | 0 | 0 | 0 |
| vendor_accounts | 1,313 | 0 | 0 | 0 |
| **Total** | **34,433** | **0** | **21** | **0** |

Live action-log counts for this driver are 19,057 executed responses and 345 failed responses. A failed response may belong to a collision row that was guardedly restaged and later executed.
Live SQL contains 814 executed jobs whose JobTread-native number uses the approved deterministic source-GUID suffix. The unsuffixed AccuLynx number remains in the corresponding custom-field value.

## Failures

Every live `status='failed'` row (0 total):

| Pending row | Op | Source ref | Error |
| ---: | --- | --- | --- |
| — | — | — | None |

## Read-Back Sample

Five random executed jobs were queried directly through Pave:

| Source ref | JobTread ID | Expected name | Pave result |
| --- | --- | --- | --- |
| `acculynx_jobs:49217b2c-eeee-46ee-9ff8-74610b958c66` | `22PbhQBLvgat` | N/A: Bobby  Job | HTTP 200; ID and name matched; `closedOn=null`. |
| `acculynx_jobs:742f92a9-d04e-40f6-afe6-bb3ff016b972` | `22PbhLyMN4e7` | N/A: Pinehurst Apartments… | HTTP 200; ID and name matched; `closedOn=null`. |
| `acculynx_jobs:20ba641a-bc34-45f4-bc74-bb7626f0ce7a` | `22PbhLuTY243` | CO-343: Samuel Crippen | HTTP 200; ID and name matched; `closedOn=null`. |
| `acculynx_jobs:542e7ece-b057-4259-9b92-0a7643dfd034` | `22PbhSpGH6V7` | N/A: danny  maddox | HTTP 200; ID and name matched; `closedOn=null`. |
| `acculynx_jobs:fe9066ef-c08f-4a3b-bab6-8e3b138a2f21` | `22PbgYmQ3yTP` | N/A: Daniel Rutigliano | HTTP 200; ID and name matched; `closedOn=null`. |

## Verdict

**PASS — all staged writes reached a successful terminal state.**

No users, memberships, invites, deletes, or unstaged business writes were attempted. The canary and all five sampled jobs matched their Pave echo-back.
