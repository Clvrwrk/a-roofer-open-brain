# JobTread Foundations Staging Report

## Domains Staged

Live SQL verification after the scoped replacement:

| Domain | Rows | Pave operation | Execution order |
| --- | ---: | --- | ---: |
| `custom_fields` | 5 | `createCustomField` | 10 |
| `units` | 10 | `createUnit` | 20 |
| `cost_types` | 4 | `createCostType` | 30 |
| `cost_groups` | 0 | `createCostGroup` | 40 |
| `cost_codes` | 13 | `createCostCode` | 45 roots / 46 children |
| `catalog_items` | 123 | `createCostItem` | 50 |
| **Total** | **155** |  |  |

All 155 assigned-domain rows have `status = 'staged'`. Live validation found no invalid Pave operation names, missing `__execution_order` values, duplicate `source_ref` values, or duplicate idempotency keys.

`cost_groups` is intentionally empty. The cost-accounting mapping makes QBO `public.qbo_accounts` the canonical CoA, limits the initial production scope to the 13 active `Cost of Goods Sold` accounts, and directs the loader to express their hierarchy through `createCostCode.parentCostCodeId` rather than duplicate it as a competing cost-group hierarchy.

## Ref Graph

| Emitted `$ref` type | Consumer | Satisfied by |
| --- | --- | --- |
| `acculynx_estimate_items:unit-<UOM>` | `catalog_items.unitId` | The corresponding `units` row at order 20 |
| `qbo_accounts:cost-type-material` | `catalog_items.costTypeId` | `Material` in `cost_types` at order 30 |
| `qbo_accounts:cost-type-labor` | `catalog_items.costTypeId` | `Labor` in `cost_types` at order 30 |
| `qbo_accounts:<qbo_id>` | Child `cost_codes.parentCostCodeId` | Root cost-code rows at order 45; children run at order 46 |

The live graph contains 14 distinct references and zero unresolved references. Catalog references cover all ten staged units. The unit namespace is `acculynx_estimate_items`, which satisfies the executor/R3a `<source_type>:<id>` contract; zero legacy `estimate_items:*` references remain. Of the 123 catalog items, 93 reference `Material` and 30 reference `Labor`. Eight child cost codes reference the two staged QBO parents `21` and `201`.

## Assumptions

- The pilot catalog is compiled only from the 518 `acculynx_backfill.estimate_items` rows belonging to the 25 `jt_mirror.pilot_jobs`. Deduplication is exactly by the requested effective name plus `estimate_unit`, producing 123 catalog rows. Effective name prefers nonblank `override_name`, then `name`.
- Forty-eight catalog keys have more than one observed cost/price tuple. The staged row uses the most recently fetched observation, with `acculynx_id DESC` as a deterministic tie-breaker. This avoids averaging historical prices or inventing a blended catalog price.
- `createCostItem.unitCost` is `coalesce(material_cost, 0) + coalesce(labor_cost, 0)` when either source cost is present; `price` maps to `unitPrice`. Type `4` or a labor-dominant cost maps to `Labor`; other observed pilot items map to `Material`.
- Units are the ten distinct nonblank `estimate_unit` values across the full backfill table, as requested: `BD`, `BRD`, `BX`, `CAN`, `EA`, `HR`, `LF`, `PC`, `SF`, and `SQ`. Source tokens are preserved rather than expanded into invented display names.
- The four controlled cost types are `Material`, `Labor`, `Equipment`, and `Subcontractor`, following the cost-accounting contract. Policy-only inputs such as taxability, time tracking, and margin are omitted because the source does not establish them.
- The Sales Rep options query returned zero distinct nonblank `user_display_name` values across 45 representative rows, so its only staged option is the explicitly required `Unassigned`. No user, membership, invite, or assignee operation is staged.
- `AccuLynx Milestone` preserves the source order and exact spelling: `Lead`, `Prospect`, `Approved`, `Completed`, `Invoiced`, `Closed`, `Cancelled`.
- The scraped official schema documents the `createCustomField` input names but does not enumerate accepted `targetType`/`type` values or the nested option representation. The payloads use the documented semantic values `job`, `dropdown`, `text`, and `url`, with dropdown options represented as ordered string arrays. The executor must schema-preflight these enum tokens and option shape before issuing any JobTread mutation.

## Verdict

**STAGED — R3a foundations validation passed; executor preflight required for `createCustomField`.**

The assigned domains are idempotently compiled in `jt_mirror.pending_write`, dependency ordered, seat-safe, and internally reference-complete. The repository's live `r3a_stage_check.py foundations` check passes with 155 rows, valid operations, well-formed references, and execution ordering present. The 150 non-custom-field rows are shape-aligned with the scraped Pave signatures. The five custom-field rows must not execute until the executor confirms the enum casing and dropdown option representation noted above; no JobTread or AccuLynx API was called during compilation.
