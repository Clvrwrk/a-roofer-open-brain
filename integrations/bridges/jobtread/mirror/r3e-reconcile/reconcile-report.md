# R3e Identity Reconciliation Report

## Existing Entities Found

All JobTread calls were read-only `POST https://api.jobtread.com/pave` queries. The grant key was loaded at runtime and is not reproduced here.

Cost-types query used (grant value omitted):

```json
{
  "query": {
    "$": {"grantKey": "<omitted>"},
    "organization": {
      "$": {"id": "22PazeRM5FCH"},
      "id": {},
      "costTypes": {
        "$": {"size": 100},
        "nodes": {"id": {}, "name": {}}
      }
    }
  }
}
```

Exact live matches:

| Name | Existing JobTread ID |
| --- | --- |
| Labor | `22PazefY4qMs` |
| Subcontractor | `22PazefY6grL` |

Customer-account query used (grant value omitted):

```json
{
  "query": {
    "$": {"grantKey": "<omitted>"},
    "organization": {
      "$": {"id": "22PazeRM5FCH"},
      "accounts": {
        "$": {
          "size": 10,
          "where": {
            "and": [
              ["name", "=", "Melissa Kepler"],
              ["type", "=", "customer"]
            ]
          }
        },
        "nodes": {"id": {}, "name": {}, "type": {}}
      }
    }
  }
}
```

The single exact live match was customer account `22PbdSgGRDRk`.

Canary verification also succeeded. `jt_mirror.write_action_log` row `248`, for executed customer-account row `1420`, records `createdAccount.id = 22PbdSgGRDRk` for `acculynx_contact:441bb297-e143-f111-8af3-ea808804e890`. The duplicate Melissa attempt is action-log row `249`, pending-write row `1421`, for `acculynx_contact:48bad272-e143-f111-8af3-ea808804e890`.

## Crosswalk Inserts

The required collision aliases were inserted:

| Crosswalk ID | Source system | Source identity | JT type | Existing JT ID |
| ---: | --- | --- | --- | --- |
| 244 | `qbo` | `qbo_accounts:cost-type-labor` | `costType` | `22PazefY4qMs` |
| 245 | `qbo` | `qbo_accounts:cost-type-subcontractor` | `costType` | `22PazefY6grL` |
| 246 | `acculynx` | `acculynx_contact:48bad272-e143-f111-8af3-ea808804e890` | `account` | `22PbdSgGRDRk` |

These aliases use the nullable `jt_organization_id` representation. This preserves the existing canonical mappings and satisfies `crosswalk_target_identity_unique` without any schema change, update, or deletion.

The live ref-resolution proof initially exposed missing aliases for already-executed band-10 custom fields and band-20 units. Their canonical mappings existed, but the downstream payloads use `jt_stage_custom_field:<name>` and `acculynx_unit:<uom>` identities. Crosswalk IDs `251`–`266` were inserted for those reference identities, using the JobTread IDs already recorded on the executed pending rows and their successful action-log entries. No JobTread writes were made.

## Rows Updated

| Pending-write ID | Domain | Final status | JT ID | Result |
| ---: | --- | --- | --- | --- |
| 1421 | `customer_accounts` | `skipped` | `22PbdSgGRDRk` | `already-exists (run-1 canary); crosswalked to 22PbdSgGRDRk` |
| 1757 | `cost_types` | `skipped` | `22PazefY4qMs` | `already-exists in JT; crosswalked to existing id 22PazefY4qMs` |
| 1759 | `cost_types` | `skipped` | `22PazefY6grL` | `already-exists in JT; crosswalked to existing id 22PazefY6grL` |
| 1450 | `locations` | `staged` | `NULL` | `error=NULL`, `attempt=0`; not executed |

## Ref Resolution Proof

The following live SQL was written and run:

```sql
WITH refs AS (
  SELECT
    p.id,
    jsonb_path_query(p.payload, '$.**."$ref"') #>> '{}' AS ref,
    (p.payload->>'__execution_order')::int AS ord
  FROM jt_mirror.pending_write p
  WHERE p.status = 'staged'
),
unresolved AS (
  SELECT r.*
  FROM refs r
  WHERE NOT EXISTS (
    SELECT 1
    FROM jt_mirror.crosswalk x
    WHERE x.source_id = split_part(r.ref, ':', 2)
       OR (x.source_table || ':' || x.source_id) = r.ref
       OR x.source_id = r.ref
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jt_mirror.pending_write q
    WHERE q.status = 'staged'
      AND q.source_ref = r.ref
      AND (q.payload->>'__execution_order')::int < r.ord
  )
)
SELECT
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE status = 'failed') AS failed_count,
  (SELECT count(*) FROM refs) AS staged_ref_occurrences,
  (SELECT count(*) FROM unresolved) AS unresolved_ref_count,
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE domain = 'locations' AND status = 'staged') AS locations,
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE domain = 'jobs' AND status = 'staged') AS jobs,
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE domain = 'job_custom_values' AND status = 'staged') AS job_custom_values,
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE domain = 'documents' AND status = 'staged') AS documents,
  (SELECT count(*) FROM jt_mirror.pending_write
   WHERE domain = 'daily_logs' AND status = 'staged') AS daily_logs;
```

Live result:

| failed_count | staged_ref_occurrences | unresolved_ref_count | locations | jobs | job_custom_values | documents | daily_logs |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 753 | 0 | 11 | 25 | 25 | 26 | 25 |

The repository R3e checker also returned:

```text
PASS — collisions crosswalked, all staged refs resolvable, remainder intact
```

## Verdict

**PASS — reconciliation complete.**

All three collided entities are mapped to the pre-existing JobTread entities, all failed rows are cleared, the dependent location is staged and unexecuted, all 753 `$ref` occurrences in remaining staged rows resolve, and the required staged remainder is intact.
