# JobTread Bulk Identity Reconciliation Report

All JobTread calls in this repair were read-only Pave account/location
queries. The initial Supabase mutations were limited to inserts in
`jt_mirror.crosswalk` and updates to the 52 rows that were `failed` when the
repair began. A follow-up authorization then allowed payload-only number
updates to 18 staged rows in the nine remaining global collision groups. The
one executed row in those groups was not changed. No credential values were
logged or written to this report.

The live failure split was 16 class-A locations, 2 class-B locations, 32
job-number collisions, and 2 location-reference blocks. The task prompt says
33 number collisions, but both the source Failures table and live SQL contain
32; all 52 live failed rows are accounted for below.

## Class A

Each account reference was resolved through `jt_mirror.crosswalk`. Its live
JobTread location connection was then queried through Pave, and the payload
address was matched against the returned `address` / `formattedAddress` after
case, punctuation, direction, and street-suffix normalization.

| AccuLynx job ID | JobTread account | Matched JobTread location |
| --- | --- | --- |
| `45f39728-e2b3-48ae-85c9-02e81b60a376` | `22Pbg9GHLERt` | `22PbgPBimvDb` |
| `516eb535-979a-43aa-a888-eeab15e9c3c2` | `22PbgAJY4LfE` | `22PbgP4fztbR` |
| `54eccb71-6f72-440a-a982-1f41c3496a86` | `22PbgFivX3qz` | `22PbgNFzgh6i` |
| `7d201cd3-0760-46ab-a583-55ad706c3ac6` | `22Pbg8F6w3k9` | `22PbgRKmgFjk` |
| `84e01e39-053e-49d9-871e-a1c0879a9185` | `22Pbg7rgFyiN` | `22PbgSiB2rF5` |
| `964a22a9-2e99-4863-a9c5-4e9b0f783f83` | `22PbgM9R2d6Y` | `22PbgRMnc9uS` |
| `9ba93b20-030f-42e1-a321-b95d23e72056` | `22Pbg5RLWRyj` | `22PbgTQAQseZ` |
| `a69f44e8-8c62-446f-bf80-e499b4f8a55b` | `22PbgApDHPPi` | `22PbgScKVdeM` |
| `bd442944-0bcb-45bc-aa8a-30cab4f82bd1` | `22Pbg23cNhrE` | `22PbgRKMu2Lu` |
| `c06c1694-da62-4fa8-8330-2284e6e00482` | `22Pbg9LYjDbN` | `22PbgPdNB3FA` |
| `cd96ca97-cf7b-48aa-a773-3916b431bee6` | `22PbgEYTNGyg` | `22PbgR647MKy` |
| `cf210985-d77c-4dd2-8553-c3e29aa584ee` | `22Pbg9NM36GZ` | `22PbgR4UBHpM` |
| `e1ebb899-e79c-489c-84e0-5f29d0b3ce63` | `22PbfyE8uWyZ` | `22PbgPsPxx9H` |
| `e4dcd807-365f-4ac8-97d2-e218fb7f450d` | `22PbfyYdBPv6` | `22PbgU4K8tKr` |
| `f5de6067-223f-4aaa-8a21-7c6fe706b0c1` | `22PbgEWQtQ37` | `22PbgSC7fVJv` |
| `f6184a8c-ac20-44dc-b858-6da4462943c9` | `22Pbg9NM36GZ` | `22PbgR4UBHpM` |

All 16 rows are now `skipped`, have the exact error
`address-exists; crosswalked to existing location <id>`, and have `jt_id`
equal to their location crosswalk. One exact mapping
(`84e01e39-...` → `22PbgSiB2rF5`) already existed with disposition
`failed-readback-match`; it was preserved. The other 15 missing aliases were
inserted.

## Class B

Both unknown-bookkeeping writes were found by read-only Pave lookup. They were
therefore treated as existing locations rather than replayed.

| AccuLynx job ID | JobTread account | Verdict | Matched JobTread location |
| --- | --- | --- | --- |
| `12981d85-2ca6-4d72-8c71-b315a961b6c1` | `22PbgFp8TFbQ` | found | `22PbgNVe3SHZ` |
| `28d1c2fd-fc57-40d1-8aa4-c25225b06e9a` | `22PbgFXDYrLA` | found | `22PbgPMcchd5` |

Both exact crosswalks already existed with disposition
`failed-readback-match`; they were preserved. Both pending rows are now
`skipped` with matching `jt_id` and the required `address-exists` error. No
class-B row was reset to `staged`.

## Class C

### Number remappings

Every failed number-collision row was reset to `staged`, with `error=NULL` and
`attempt=0`. All four-character candidates were unique against every
previously staged or executed job number, so no suffix required eight
characters.

| AccuLynx source | Old number | New number |
| --- | --- | --- |
| `9c042db1-533e-4b37-84aa-0b83542586fc` | `1` | `1~9c04` |
| `ee259e35-d492-442e-8616-ed7beab787fa` | `CO-60` | `CO-60~ee25` |
| `8b82c8b6-0389-4114-b819-14f262e5302d` | `CO-112` | `CO-112~8b82` |
| `0eb0a459-dd29-4214-9592-02a9ebd860a9` | `CO-87` | `CO-87~0eb0` |
| `18e3882d-7c2e-4c04-8920-cc56bd8b6b68` | `CO-107` | `CO-107~18e3` |
| `6e9e4a97-a597-493d-b526-132cb286cbfe` | `CO-114` | `CO-114~6e9e` |
| `a92f7075-15b6-4adc-944c-38aef1080750` | `CO-86` | `CO-86~a92f` |
| `c1984b75-bff4-48f0-82e0-1c039fe122a5` | `CO-85` | `CO-85~c198` |
| `ac260933-834c-4acd-939e-2617470d5c62` | `CO-64` | `CO-64~ac26` |
| `c06d2b11-feb1-459b-a953-bfef28b7461d` | `CO-75` | `CO-75~c06d` |
| `1072c23d-ad8f-447e-b01c-0b1830669ab4` | `MC-52` | `MC-52~1072` |
| `8b726404-ec60-409a-9156-e8db9ea504eb` | `CO-52` | `CO-52~8b72` |
| `75a1c248-6e6e-4c8d-bca6-e121a7f0bc1f` | `MC-68` | `MC-68~75a1` |
| `1ac1b4a7-8a54-4807-9b7d-4dd01c86f0ec` | `MC-53` | `MC-53~1ac1` |
| `063580ac-f82d-4368-aaec-93e675dec309` | `KS-23` | `KS-23~0635` |
| `510992f4-51b5-43ad-b4e1-d3128e5d87ae` | `KS-135` | `KS-135~5109` |
| `cca2e3cf-a65e-4c33-8e18-505d6d11ac60` | `35` | `35~cca2` |
| `128671ec-06af-4bde-a284-069014f75a57` | `KS-43` | `KS-43~1286` |
| `6c385030-0159-420f-b11d-c429662e887b` | `CO-111` | `CO-111~6c38` |
| `c64203f4-25e2-422b-a5a2-d4ecfd290dce` | `MC-64` | `MC-64~c642` |
| `c20b4475-b958-47ce-b923-5eb9468cc11f` | `KS-127` | `KS-127~c20b` |
| `a9cd5dcc-8471-4189-ac2a-1372c55e6a20` | `1` | `1~a9cd` |
| `8b2577d3-a9f2-449d-a51c-552b917bcb10` | `CO-109` | `CO-109~8b25` |
| `864900b3-3195-4394-964a-492fdb5969ab` | `CO-108` | `CO-108~8649` |
| `2ae57274-9dd2-4188-9693-387e2ddd71e0` | `TX-451` | `TX-451~2ae5` |
| `ad3f926f-eed5-409e-aa05-85507b4e56e0` | `KS-41` | `KS-41~ad3f` |
| `785c362f-fbd6-4801-ab8a-a16ae468d9b1` | `CO-157` | `CO-157~785c` |
| `8328e1ae-dadb-4c40-92cb-b5ee77a18e28` | `CO-155` | `CO-155~8328` |
| `ec64dab1-1b0a-47b7-a2cb-65d5f0f5c273` | `1` | `1~ec64` |
| `4b5b5e76-da27-48be-bd7e-12b187e1b79b` | `KS-13` | `KS-13~4b5b` |
| `049dace9-2412-44c1-80c2-4b5d9c6448ac` | `MC-67` | `MC-67~049d` |
| `be4166c6-b3de-4037-8216-fdd80bd037a3` | `TX-450` | `TX-450~be41` |

### Location-reference resets

| AccuLynx source | Final status | Error | Attempt |
| --- | --- | --- | ---: |
| `84e01e39-053e-49d9-871e-a1c0879a9185` | `staged` | `NULL` | 0 |
| `45f39728-e2b3-48ae-85c9-02e81b60a376` | `staged` | `NULL` | 0 |

### Follow-up global de-collision

The initial repair exposed nine additional duplicate-number groups covering
18 staged rows and one executed row. Follow-up authorization allowed the
staged rows to be repaired. Each staged payload number received the same
deterministic four-character source-ID suffix; no candidate was already in
use, so none required an eight-character suffix.

| AccuLynx source | Old number | New number |
| --- | --- | --- |
| `2d1069ce-b262-4362-829d-44a8c3d7e3a1` | `1` | `1~2d10` |
| `f6d7e34e-2328-43a4-9cba-53e95606b80b` | `1` | `1~f6d7` |
| `17d947f7-85eb-4267-9b1f-85d2e89f3ee8` | `2` | `2~17d9` |
| `ccf3558c-fd94-4408-bd4d-46e4084c7157` | `2` | `2~ccf3` |
| `eb3af285-b3ae-42e2-9967-6630c0ec19e5` | `2` | `2~eb3a` |
| `ebd24ccc-b882-448e-b9bd-625e67a20392` | `3` | `3~ebd2` |
| `f4b5888a-03b4-4d27-b670-89e073534f08` | `3` | `3~f4b5` |
| `11c550a2-94f8-4d99-8a70-21c116bf6d86` | `4` | `4~11c5` |
| `d004ffb9-84f9-4a3d-8397-b8dfafd9d81a` | `4` | `4~d004` |
| `ffb99106-b81f-4b35-9dcf-2ce148ae6603` | `5` | `5~ffb9` |
| `20c0fb79-b545-41e8-a38f-391279fa737a` | `6` | `6~20c0` |
| `1f83baf6-c790-44d2-be01-e16b7044fa50` | `6` | `6~1f83` |
| `d62512e6-b024-4bbb-885a-9415dcacd080` | `7` | `7~d625` |
| `3d67a9fd-fda2-4d20-9691-0eaec68bb727` | `7` | `7~3d67` |
| `27ea3a84-0add-4c1c-8309-c15c39391e4e` | `8` | `8~27ea` |
| `5fbe8407-251a-42ee-8b57-9dda97ec9de9` | `8` | `8~5fbe` |
| `2d9c96cb-dd48-4ba7-9ed7-020bae14f6f4` | `9` | `9~2d9c` |
| `c504ad99-ee94-4943-89a4-516eb4da9b3e` | `9` | `9~c504` |

All 18 rows remain `staged` with `error=NULL` and `attempt=0`. The already
executed row `acculynx_jobs:5bdadf61-9bd6-4c7f-a37e-c4fe242b0669`
remains unchanged at number `5`, status `executed`, and JobTread ID
`22PbgY5QNGh2`.

## Verification

Live SQL after the transaction returned:

| Check | Live result | Status |
| --- | ---: | --- |
| Rows with `status='failed'` | 0 | PASS |
| Class-A rows skipped with matching location crosswalk | 16 / 16 | PASS |
| Class-B rows skipped with matching location crosswalk | 2 / 2 | PASS |
| Location crosswalks across the 18 repaired source identities | 18 / 18 | PASS |
| Number-collision rows correctly restaged with deterministic suffix | 32 / 32 | PASS |
| Repaired numbers colliding with a staged/executed number | 0 | PASS |
| Follow-up staged rows remapped and clean | 18 / 18 | PASS |
| Reference-blocked jobs correctly restaged | 2 / 2 | PASS |
| Staged job location refs unresolved | 0 / 5,881 | PASS |
| Duplicate non-null number groups across 1,186 numbered staged + executed jobs | 0 | PASS |
| Executed control row preserved at number `5` | 1 / 1 | PASS |
| Dedicated `b3c_fix_check.py` live validator | PASS | PASS |

There are 5,388 staged/executed jobs without an explicit payload number.
Those absent (`NULL`) values are not job-number collisions and are excluded
from the uniqueness grouping.

## Verdict

**PASS — the identity repair and all required global verification gates are
complete.**

There are zero failed rows; every duplicate/unknown location is crosswalked
and skipped; all 32 failed job-number rows now have collision-free
deterministic numbers; both reference-blocked jobs are staged; every staged
job location reference resolves; and all non-null numbers are globally unique
across staged and executed jobs. The follow-up changed only the 18 authorized
staged payloads and performed no JobTread mutation.
