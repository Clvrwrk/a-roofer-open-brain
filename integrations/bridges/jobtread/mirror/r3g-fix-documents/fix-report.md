# jt-acculynx-mirror Document Tagged-Union Repair

## Transformation SQL

The same guarded JSONB transformation was executed first for the canary row with
`d.id = 51`, then for the remaining rows with `d.id <> 51`. Both executions also
required `domain = 'documents'` and `status in ('failed', 'staged')`. The canary
was excluded from the second execution so it could not be wrapped twice.

```sql
with elems as (
  select d.id, e.el, e.ord
  from jt_mirror.pending_write d
  cross join lateral jsonb_array_elements(d.payload->'lineItems')
    with ordinality e(el, ord)
  where d.domain = 'documents'
    and d.status in ('failed', 'staged')
    and /* canary: d.id = 51; bulk pass: */ d.id <> 51
),
resolved as (
  select
    e.*,
    coalesce(
      (
        select min(x.jt_id)
        from jt_mirror.crosswalk x
        where x.jt_type = 'costCode'
          and x.source_table =
              split_part(c.payload->'costCodeId'->>'$ref', ':', 1)
          and x.source_id =
              split_part(c.payload->'costCodeId'->>'$ref', ':', 2)
      ),
      (
        select min(x.jt_id)
        from jt_mirror.crosswalk x
        where x.jt_type = 'costCode'
          and x.source_table = 'qbo_accounts'
          and x.source_id = case
            when e.el->>'name' ~* '(labor|install|tear.?off|remove|repair)'
              then '85'
            else '21'
          end
      )
    ) as cost_code_id,
    coalesce(
      (
        select min(x.jt_id)
        from jt_mirror.crosswalk x
        where x.jt_type = 'costType'
          and x.source_table =
              split_part(c.payload->'costTypeId'->>'$ref', ':', 1)
          and x.source_id =
              split_part(c.payload->'costTypeId'->>'$ref', ':', 2)
      ),
      (
        select min(x.jt_id)
        from jt_mirror.crosswalk x
        where x.jt_type = 'costType'
          and x.source_table = 'qbo_accounts'
          and x.source_id = case
            when e.el->>'name' ~* '(labor|install|tear.?off|remove|repair)'
              then 'cost-type-labor'
            else 'cost-type-material'
          end
      )
    ) as cost_type_id
  from elems e
  left join lateral (
    select ci.payload
    from jt_mirror.pending_write ci
    where ci.domain = 'catalog_items'
      and ci.status = 'executed'
      and ci.payload->>'name' = e.el->>'name'
    order by
      case when
        regexp_replace(
          split_part(ci.payload->'unitId'->>'$ref', ':', 2),
          '^unit-', ''
        ) =
        regexp_replace(
          split_part(e.el->'unitId'->>'$ref', ':', 2),
          '^unit-', ''
        )
      then 0 else 1 end,
      ci.id
    limit 1
  ) c on true
),
transformed as (
  select
    id,
    jsonb_agg(
      jsonb_build_object(
        'newCostItem',
        el || jsonb_build_object(
          'costCodeId', cost_code_id,
          'costTypeId', cost_type_id
        )
      )
      order by ord
    ) as line_items,
    bool_and(cost_code_id is not null and cost_type_id is not null)
      as all_resolved
  from resolved
  group by id
)
update jt_mirror.pending_write d
set payload = jsonb_set(d.payload, '{lineItems}', t.line_items, false),
    status = 'staged',
    error = null,
    attempt = 0
from transformed t
where d.id = t.id
  and t.all_resolved;
```

The `bool_and` guard prevented any row from being updated unless every one of
its line items resolved both IDs. The canary updated 1 row and the bulk pass
updated the remaining 25 rows.

## Cost Id Resolution (match rate, fallback count)

- Document rows: **26**
- Line-item elements: **518**
- Exact catalog-name matches: **517** (**99.81%**)
- Fallback elements: **1** (**0.19%**)
- Duplicate executed catalog names: **0**

The catalog lookup prefers a normalized unit match if a name is ambiguous.
There were no duplicate catalog names, so no unit tie-break was needed.

The only unmatched element was `Permit` (no unit reference). It is not
labor-like, so the established deterministic rule assigned the general **Cost
of goods sold** cost code (`qbo_accounts:21`) and the **Material** cost type
(`qbo_accounts:cost-type-material`). Both references were resolved to literal
JobTread IDs through `jt_mirror.crosswalk`. Labor and Subcontractor default
cost-type crosswalk entries were included in the lookup population; no
Subcontractor fallback was required.

## Before/After Sample (one element)

Canary: pending-write row `51`, first line item.

Before:

```json
{
  "name": "Karnak #108 Asphalt Primer Spray (14 oz)",
  "unitId": {"$ref": "acculynx_unit:CAN"},
  "quantity": 3,
  "unitPrice": 27,
  "description": "AccuLynx section: Roofing Section\nSource unit: CAN\nSource line total: 81.00"
}
```

After:

```json
{
  "newCostItem": {
    "name": "Karnak #108 Asphalt Primer Spray (14 oz)",
    "unitId": {"$ref": "acculynx_unit:CAN"},
    "quantity": 3,
    "unitPrice": 27,
    "costCodeId": "22PbdLkpZX5s",
    "costTypeId": "22PazefY5x4j",
    "description": "AccuLynx section: Roofing Section\nSource unit: CAN\nSource line total: 81.00"
  }
}
```

All original fields and values are unchanged inside `newCostItem`; only the two
literal ID fields were added.

## Verdict

**PASS — all targeted document staging rows now use the required tagged union.**

Live post-repair SQL verification:

- Staged documents: **26**
- Failed documents: **0**
- Staged documents with `error is null` and `attempt = 0`: **26**
- Line-item elements checked: **518**
- Bare elements or wrappers with a non-exact top-level union shape: **0**
- `newCostItem` elements missing `costCodeId` or `costTypeId`: **0**
- Elements whose cost code/type IDs are absent from the corresponding
  crosswalk type: **0**
