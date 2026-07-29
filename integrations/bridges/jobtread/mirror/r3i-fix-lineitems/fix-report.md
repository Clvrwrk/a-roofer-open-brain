# JobTread Document Line-Item Staging Repair

## Live Verification

The probe request was built with Python `json.dumps`. The grant key is redacted
below. Schema-required document fields and the live API's incrementally
reported semantic requirements were included.

```json
{
  "query": {
    "$": {
      "grantKey": "REDACTED"
    },
    "createDocument": {
      "$": {
        "type": "customerOrder",
        "name": "PROBE-DELETE-ME-TYPE",
        "jobId": "22PbdUyVNNYC",
        "fromName": "Pro Exteriors",
        "toName": "Probe",
        "taxRate": 0,
        "jobLocationName": "Probe",
        "dueDays": 0,
        "lineItems": [
          {
            "_type": "costItem",
            "name": "Probe Item",
            "unitId": "22PbdLixhBJr",
            "quantity": 1,
            "unitCost": 5,
            "unitPrice": 10,
            "costCodeId": "22PbdLkpZX5s",
            "costTypeId": "22PazefY5x4j",
            "description": "temporary line-item shape verification"
          }
        ]
      },
      "createdDocument": {
        "id": {},
        "name": {},
        "type": {}
      }
    }
  }
}
```

The live API rejected the final request with HTTP 400:

```text
Name must be one of Proposal, Selections, Change Order
```

Earlier validation responses, before the request reached this terminal
business rule, were:

```text
A job location name or address is required
Either a due date or due days must be provided, but not both
```

Response document ID: **none**.

Deletion proof: no temporary document was created in any request, so there was
no document ID to delete or read back. The allowed maximum of one created
temporary document was not consumed.

Live SQL confirmed that all 26 eligible staged documents use
`type = 'customerOrder'`. Therefore changing the probe type to evade the
customer-order naming rule would violate the requirement to use the same type
as the staged documents. Changing the mandated probe name would likewise
violate the requested verification.

## Transformation SQL

**Not executed.** The live-verification gate failed. Per the explicit stop
condition, no `jt_mirror.pending_write` row was transformed or reset.

The post-failure live verification query was:

```sql
select json_build_object(
  'eligible_count', count(*),
  'failed', count(*) filter (where status = 'failed'),
  'staged', count(*) filter (where status = 'staged'),
  'wrapped_elements',
    coalesce(sum(jsonb_array_length(jsonb_path_query_array(
      payload,
      '$.lineItems[*] ? (exists(@.newCostItem) || exists(@.existingCostItem))'
    ))), 0),
  'typed_elements',
    coalesce(sum(jsonb_array_length(jsonb_path_query_array(
      payload,
      '$.lineItems[*] ? (@._type == "costItem")'
    ))), 0)
) as verification
from jt_mirror.pending_write
where domain = 'documents'
  and status in ('failed', 'staged');
```

Live result:

```json
{
  "eligible_count": 26,
  "failed": 20,
  "staged": 6,
  "wrapped_elements": 518,
  "typed_elements": 0
}
```

## Before/After Sample

Before:

```json
{
  "newCostItem": {
    "name": "Karnak #108 Asphalt Primer Spray (14 oz)",
    "unitId": {
      "$ref": "acculynx_unit:CAN"
    },
    "quantity": 3,
    "unitPrice": 27,
    "costCodeId": "22PbdLkpZX5s",
    "costTypeId": "22PazefY5x4j",
    "description": "AccuLynx section: Roofing Section\nSource unit: CAN\nSource line total: 81.00"
  }
}
```

After: **unchanged**, because the required live verification failed.

## Verdict

**FAIL — exited before transformation.**

The bare `_type: "costItem"` request progressed beyond the previously missing
`fromName` field, but JobTread rejects the mandated probe name for the staged
`customerOrder` type. The exact terminal error is:

```text
Name must be one of Proposal, Selections, Change Order
```

No temporary document was created or deleted, and none of the 26 eligible
staging rows was updated.
