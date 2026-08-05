# JobTread Document Final Staging Repair

## Live Verification

The Pave request body was generated with Python `json.dumps`. The grant key was
loaded from the approved environment file and was neither printed nor written
to this report.

Redacted create request:

```json
{
  "query": {
    "$": {
      "grantKey": "REDACTED"
    },
    "createDocument": {
      "$": {
        "type": "customerOrder",
        "name": "Proposal",
        "subject": "PROBE-DELETE-ME-TYPE",
        "jobId": "22PbdV2auWcv",
        "fromName": "Pro Exteriors",
        "toName": "Probe",
        "taxRate": 0,
        "jobLocationName": "508 Rahm Street, Salina",
        "dueDays": 30,
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
        "subject": {},
        "type": {}
      }
    }
  }
}
```

Create returned HTTP 200 and a real document ID:

```json
{
  "createDocument": {
    "createdDocument": {
      "id": "22PbdgYBtcXN",
      "name": "Proposal",
      "subject": "PROBE-DELETE-ME-TYPE",
      "type": "customerOrder"
    }
  }
}
```

`deleteDocument` for `22PbdgYBtcXN` returned HTTP 200:

```json
{
  "deleteDocument": {}
}
```

Deletion was proved by an immediate Pave read-back, also HTTP 200:

```json
{
  "document": null
}
```

## Transformation SQL

The SQL request body was also generated with Python `json.dumps`. The
transaction first asserted that the eligible set was exactly 26 rows. It then
updated only `domain = 'documents'` rows whose status was `failed` or
`staged`.

```sql
begin;
do $$
declare eligible_count integer;
begin
  select count(*) into eligible_count
  from jt_mirror.pending_write
  where domain = 'documents'
    and status in ('failed', 'staged');

  if eligible_count <> 26 then
    raise exception 'expected 26 eligible document rows, found %',
      eligible_count;
  end if;
end $$;

with eligible as (
  select
    p.id,
    p.payload,
    trim(concat_ws(', ', j.location_street1, j.location_city))
      as job_location_name
  from jt_mirror.pending_write p
  join jt_mirror.crosswalk c
    on c.jt_type = 'job'
   and c.source_id = replace(
     p.payload -> 'jobId' ->> '$ref',
     'acculynx_job:',
     ''
   )
  join public.acculynx_jobs j
    on j.id = c.source_id
  where p.domain = 'documents'
    and p.status in ('failed', 'staged')
),
rebuilt as (
  select
    e.id,
    jsonb_agg(
      (li.elem -> 'newCostItem')
      || jsonb_build_object('_type', 'costItem')
      || case
           when cat.unit_cost is not null
             then jsonb_build_object('unitCost', cat.unit_cost)
           else '{}'::jsonb
         end
      order by li.ord
    ) as line_items
  from eligible e
  cross join lateral jsonb_array_elements(e.payload -> 'lineItems')
    with ordinality li(elem, ord)
  left join lateral (
    select c.payload -> 'unitCost' as unit_cost
    from jt_mirror.pending_write c
    where c.domain = 'catalog_items'
      and c.status = 'executed'
      and c.payload ->> 'name' =
          li.elem -> 'newCostItem' ->> 'name'
      and c.payload ? 'unitCost'
    order by c.id
    limit 1
  ) cat on true
  group by e.id
),
prepared as (
  select
    e.id,
    jsonb_set(
      (
        case
          when e.payload ? 'dueDate' then e.payload - 'dueDays'
          when e.payload ? 'dueDays' then e.payload
          else e.payload || jsonb_build_object('dueDays', 30)
        end
      )
      || jsonb_build_object(
        'name', 'Proposal',
        'subject', e.payload ->> 'name',
        'fromName', coalesce(e.payload ->> 'fromName', 'Pro Exteriors'),
        'toName', coalesce(e.payload ->> 'toName', 'Customer'),
        'taxRate', coalesce(e.payload -> 'taxRate', '0'::jsonb),
        'jobLocationName', e.job_location_name
      ),
      '{lineItems}',
      r.line_items,
      false
    ) as payload
  from eligible e
  join rebuilt r using (id)
),
updated as (
  update jt_mirror.pending_write p
  set
    payload = prepared.payload,
    status = 'staged',
    error = null,
    attempt = 0
  from prepared
  where p.id = prepared.id
  returning p.id
)
select
  count(*) as updated_rows,
  min(id) as min_id,
  max(id) as max_id
from updated;
commit;
```

The mutation returned:

```json
{
  "updated_rows": 26,
  "min_id": 51,
  "max_id": 76
}
```

The catalog lookup found a matching executed catalog item for 517 of 518
document elements. The unmatched element correctly omits `unitCost`.
Duplicate executed catalog matches agreed on `unitCost`; the lowest matching
row ID was selected deterministically.

## Before/After Sample

Before, row 51's first element was wrapped and the document lacked the
incremental business-rule fields:

```json
{
  "name": "AccuLynx Estimate 0b083e9c-85aa-e081-59ba-241078a5b902",
  "type": "customerOrder",
  "jobId": {
    "$ref": "acculynx_job:07a6246d-275a-48b5-84b1-9376a81b0490"
  },
  "lineItems": [
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
  ]
}
```

After:

```json
{
  "id": 51,
  "status": "staged",
  "attempt": 0,
  "error": null,
  "name": "Proposal",
  "subject": "AccuLynx Estimate 0b083e9c-85aa-e081-59ba-241078a5b902",
  "fromName": "Pro Exteriors",
  "toName": "Customer",
  "jobLocationName": "508 Rahm Street, Salina",
  "dueDays": 30,
  "firstLineItem": {
    "_type": "costItem",
    "name": "Karnak #108 Asphalt Primer Spray (14 oz)",
    "unitId": {
      "$ref": "acculynx_unit:CAN"
    },
    "quantity": 3,
    "unitCost": 13.5,
    "unitPrice": 27,
    "costCodeId": "22PbdLkpZX5s",
    "costTypeId": "22PazefY5x4j",
    "description": "AccuLynx section: Roofing Section\nSource unit: CAN\nSource line total: 81.00"
  }
}
```

## Verdict

**PASS.**

Live verification after the update returned:

```json
{
  "eligible_documents": 26,
  "staged_documents": 26,
  "failed_documents": 0,
  "attempt_zero": 26,
  "error_null": 26,
  "name_proposal": 26,
  "subject_present": 26,
  "location_present": 26,
  "exactly_one_due": 26,
  "from_name_present": 26,
  "line_elements": 518,
  "wrapper_elements": 0,
  "typed_cost_items": 518,
  "untyped_or_wrong_type": 0,
  "with_unit_cost": 517
}
```

The single temporary JobTread document was created and deleted. All 26
eligible document rows are staged with cleared errors and reset attempts. No
executed or skipped row was updated.
