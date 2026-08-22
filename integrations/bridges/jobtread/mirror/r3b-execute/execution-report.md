# JobTread Pilot Execution Report

Run date: 2026-07-27  
Target organization: `22PazeRM5FCH` (Pro Exteriors)

## Canary

The create canary was skipped under resume semantics because `customer_accounts`
already contained executed rows.

| Op | Source ref | JobTread id | Read-back proof |
| --- | --- | --- | --- |
| `createAccount` | `acculynx_contact:1c865a56-5543-f111-8af3-ea808804e890` | `22PbdLTF23KV` | Pave returned id `22PbdLTF23KV`, name `Andy Klassen`; expected name `Andy Klassen` |

## Execution Summary

These counts were queried from live `jt_mirror.pending_write` after execution.
This resumed run executed 51 staged writes: 26 documents and 25 daily logs.

| Domain | Executed | Failed | Skipped | Staged |
| --- | ---: | ---: | ---: | ---: |
| catalog_items | 123 | 0 | 0 | 0 |
| cost_codes | 13 | 0 | 0 | 0 |
| cost_types | 2 | 0 | 2 | 0 |
| custom_fields | 5 | 0 | 0 | 0 |
| customer_accounts | 24 | 0 | 1 | 0 |
| daily_logs | 25 | 0 | 0 | 0 |
| documents | 26 | 0 | 0 | 0 |
| job_custom_values | 25 | 0 | 0 | 0 |
| jobs | 25 | 0 | 0 | 0 |
| locations | 25 | 0 | 0 | 0 |
| units | 10 | 0 | 0 | 0 |
| vendor_accounts | 50 | 0 | 1263 | 0 |
| **Total** | **353** | **0** | **1266** | **0** |

The 1,263 skipped vendor rows retain the required `deferred-to-bulk` disposition.
All remaining target jobs reported `closedOn: null`, so no job needed the
reopen/restore dance during this resumed document/daily-log round.

## Failures

None. A final live SQL query for `status='failed'` returned zero rows.

The earlier resolver failures were bookkeeping-only preflight results; no Pave
create request had been made for them. They were re-staged only when their exact
recorded preflight error matched. Resolution used source ID plus required target
type (`job` or `unit`), which correctly distinguishes job crosswalks from
same-source-ID location crosswalks and handles the `pilot_jobs` job namespace.

## Read-Back Sample

Five created jobs were selected with PostgreSQL `ORDER BY random()` and queried
directly from Pave by JobTread id.

| Source ref | JobTread id | Expected name | Pave read-back | Result |
| --- | --- | --- | --- | --- |
| `pilot_jobs:f5f2a625-26c6-4ef4-9d4f-350c6c78856b` | `22PbdV2t8Vgk` | KS-166: Lonny Kent | KS-166: Lonny Kent | Match |
| `pilot_jobs:ebf4971f-de07-438e-8592-53374b0b8913` | `22PbdV3SKMjG` | KS-159: Marjorie Hufman | KS-159: Marjorie Hufman | Match |
| `pilot_jobs:b61d14db-2a6e-4fbe-98f7-30f0e5fb24df` | `22PbdV3xHUSb` | KS-162: David Martens | KS-162: David Martens | Match |
| `pilot_jobs:f19b46c4-dc8d-42cd-b907-e944e18c0ad1` | `22PbdV3Aphhh` | KS-158: William Fish | KS-158: William Fish | Match |
| `pilot_jobs:3f60d5d2-9b59-4609-bbbb-3d99122d88a0` | `22PbdV28Hbys` | KC-12: private client | KC-12: private client | Match |

All five Pave responses also returned `closedOn: null`.

## Verdict

**PASS — pilot execution complete.** There are zero staged rows and zero failed
rows in live SQL. All 51 remaining staged document/daily-log operations executed,
their crosswalk and action-log records were written, documents were mirrored into
`jt_mirror.documents`, and the five-job echo-back sample matched.
