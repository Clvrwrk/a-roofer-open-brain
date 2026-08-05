# AccuLynx Pricing Catalog → JobTread Catalog Mapping Contract

Scope: mirror pricing-catalog evidence into the JobTread organization **Pro Exteriors** (`organizationId = 22PazeRM5FCH`). This contract does not create JobTread users. Sales representatives, creators, modifiers, and assignees must remain source metadata or custom-field values; they must never cause user or membership creation.

Status: **blocked on source backfill and target-field validation**. The live AccuLynx mirror has estimate headers but no pricing-catalog, estimate-section, or estimate-item relation. The mapping below is a contract for fields that a future backfill must capture, not a claim that those fields or rows currently exist.

## Source Tables

- `public.acculynx_api_catalog` — verified live. This is endpoint inventory metadata, not pricing data. It has 28 rows. It contains working entries for `GET /estimates` and `GET /jobs/{job_id}/estimates`, but no pricing/catalog/material/item endpoint entry (the apparent keyword match is only the word `items` in a contacts note).
- `public.acculynx_estimates` — verified live. It has 210 estimate-header rows. Its `raw` JSON objects expose only `_link`, `id`, `isPrimary`, and `job`; zero rows contain `sections`, and zero rows contain the tested item-pricing keys.
- `public.acculynx_write_catalog` — verified live with 38 rows. It is write-operation metadata, not source pricing data, and must not be used by this read-only research or by the pricing backfill.
- **MISSING IN MIRROR: AccuLynx pricing catalog, estimate sections, and estimate items.** No concrete mirror-table name is assigned here because none exists live. The AccuLynx bridge mapping identifies `GET /estimates/{estimateId}/sections/{sectionId}/items` as the line-item source. `API.md` says financial coverage includes estimates and worksheets and identifies the V2 base URL, bearer authentication, pagination guidance, and rate limits. Backfill with read-only calls authenticated by the `ACCULYNX_API_KEY` environment variable:
  1. Use mirrored `public.acculynx_estimates.id` values, or refresh headers with `GET /estimates`.
  2. Fetch `GET /estimates/{estimateId}?includes=sections` or `GET /estimates/{estimateId}/sections?includes=items`.
  3. Where items were not included, fetch `GET /estimates/{estimateId}/sections/{estimateSectionId}/items`.
  4. Optionally fetch `GET /estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}` when the collection response omits detail.
  5. Use `GET /financials/{financialsId}/worksheet` only as a reconciliation source when a job financial ID is available; do not assume worksheet entries are a canonical company catalog.

The public AccuLynx reference exposes job/estimate line items, not a confirmed company-wide pricing-catalog endpoint. Therefore the backfill can reconstruct a **deduplicated observed-item catalog**, but whether it equals the full AccuLynx company catalog is unknown.

Proposed mirror DDL shape (design only; it was not executed). The implementation must substitute reviewed relation identifiers for the placeholders; the placeholders deliberately are not claims about live tables:

```sql
CREATE TABLE <reviewed_section_relation> (
  id text PRIMARY KEY,
  estimate_id text NOT NULL,
  name text,
  position integer,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL,
  account_key text NOT NULL
);

CREATE TABLE <reviewed_item_relation> (
  id text PRIMARY KEY,
  estimate_id text NOT NULL,
  section_id text NOT NULL,
  name text,
  override_name text,
  description text,
  item_type text,
  material_cost numeric,
  labor_cost numeric,
  waste numeric,
  estimate_unit text,
  order_unit text,
  unit_conversion numeric,
  selected_unit numeric,
  total_price numeric,
  fixed_price boolean,
  price numeric,
  quantity numeric,
  measurement_quantity numeric,
  order_quantity numeric,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL,
  account_key text NOT NULL
);
```

The production DDL should also add foreign keys/indexes and an account-scoped uniqueness rule after the real payload and multi-location identity semantics are confirmed.

## Target Pave Ops

The following exact root operation names were verified in `schema-surface.json`:

- `createUnit`
- `updateUnit`
- `createCostItem`
- `updateCostItem`

No delete operation is part of this loader. A source disappearance should be quarantined/reported until lifecycle semantics are agreed; it must not automatically delete a JobTread catalog record.

Relevant documented Pave inputs:

- `createUnit({ name, organizationId })`
- `updateUnit({ id, isActive, name })`
- `createCostItem({ allowanceType, costCodeId, costTypeId, customFieldValues, description, files, globalId, hasFinalActualCost, isEditable, isSelected, isSpecification, isTaxable, jobArea, jobCostItemId, name, organizationCostItemId, quantity, quantityFormula, requireSpecificationApproval, showDescription, showQuantity, sourceCostItemId, unitCost, unitCostFormula, unitId, unitPrice, unitPriceFormula, costGroupId, documentId, jobId, organizationId, positionAfter })`
- `updateCostItem({ allowanceType, costCodeId, costTypeId, customFieldValues, description, files, globalId, hasFinalActualCost, id, isEditable, isSelected, isSpecification, isTaxable, jobArea, jobCostItemId, name, organizationCostItemId, quantity, quantityFormula, requireSpecificationApproval, showDescription, showQuantity, sourceCostItemId, unitCost, unitCostFormula, unitId, unitPrice, unitPriceFormula, costGroupId, positionAfter })`

## Field Mapping

The source columns in this table are required fields for the hypothetical item backfill shape above. They are not columns of a current mirror table.

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| constant `22PazeRM5FCH` | `organizationId` | JobTread opaque ID/string. Set only on `createUnit` and organization-catalog `createCostItem`. Never infer from source data. |
| `estimate_unit` | `createUnit.name` / existing `unitId` | Trim and normalize case/whitespace; preserve meaningful abbreviations such as `SQ`, `LF`, `EA`. Resolve to an existing organization Unit first. Create only when no normalized match exists. |
| `order_unit` | no direct CostItem field; possible Unit/crosswalk metadata | Preserve separately. JobTread CostItem exposes one `unitId`; AccuLynx exposes estimate and order units plus conversion. Which unit should be primary is unknown. Default proposal: use `estimate_unit`; never discard `order_unit` or `unit_conversion`. |
| `id` | external crosswalk key; possibly `globalId` only after validation | AccuLynx UUID/text. Store in the loader crosswalk. The semantics and accepted format of Pave `globalId` are unknown, so do not populate it until tested in a non-production validation path. |
| `name`, `override_name` | `name` | String. Prefer nonblank `override_name`, else `name`; trim. Do not merge unlike items solely because names match. |
| `description` | `description` | String, direct after whitespace normalization. If source provenance must be embedded because no custom field is available, append a short non-secret marker containing only the AccuLynx item GUID. |
| `material_cost`, `labor_cost` | `unitCost` | Numeric/currency. **Unknown aggregation rule.** Candidate: `material_cost + labor_cost` when both are per-estimate-unit costs. Do not load until real payloads confirm their grain and whether `waste` is already included. |
| `price` | `unitPrice` | Numeric/currency candidate. Load only if confirmed as per `estimate_unit`; do not substitute `total_price`. |
| `total_price` | no direct catalog field | Numeric extended total from an observed estimate. Never map directly to `unitPrice`; retain as provenance/reconciliation evidence. |
| `quantity`, `measurement_quantity`, `order_quantity` | no catalog quantity by default | Numeric observed transaction quantities. Catalog items should not inherit a historical job quantity. These values support price/UOM validation only. |
| `unit_conversion` | no confirmed Pave input | Numeric conversion between estimate and order units. Preserve in source/crosswalk metadata. A one-unit JobTread CostItem cannot represent this losslessly without an additional convention. |
| `waste` | no confirmed Pave input | Numeric; meaning may be percent or factor. Preserve, do not fold into cost/price until payload semantics are confirmed. |
| `item_type` | `costTypeId` only through an approved lookup | AccuLynx enum observed in docs: `SKU`, `Product`, `CustomSKU`, `Labor`, `SKUAndLabor`. Map only through a configured JobTread CostType crosswalk. Never send the enum text as an ID. |
| source category/section (not yet shaped) | `costCodeId` only through an approved lookup | Requires a stable AccuLynx category or section taxonomy and a JobTread CostCode crosswalk. Section names from individual estimates may be job-specific; mapping is unknown. |
| `fixed_price` | no proven direct mapping | Boolean. `unitPriceFormula` is not equivalent. Preserve as metadata pending confirmed JobTread semantics. |
| derived catalog defaults | `isEditable`, `showDescription`, `showQuantity`, `isTaxable`, `isSpecification` | Policy fields, not source mappings. Values require business approval; do not invent defaults in the loader. |
| sales rep / creator / modifier identifiers | `customFieldValues` only if a matching field exists | Preserve as custom-field values or source metadata. **Never create a user, membership, or assignee.** Custom-field IDs and value shapes are currently unknown. |

Observed-item deduplication key proposal:

```text
account_key
+ normalized(name/override_name)
+ normalized(estimate_unit)
+ item_type
+ normalized(description)
+ material_cost
+ labor_cost
+ price
```

Retain every contributing AccuLynx item GUID behind the deduplicated record. Do not treat a name-only match as identity.

## Gaps & Risks

- **No source catalog rows exist in the mirror.** The current contract cannot be executed until estimate sections/items are backfilled.
- **Catalog fidelity is unknown.** Publicly documented reads expose items used on estimates, which may omit unused, archived, location-specific, template-only, or vendor-linked AccuLynx catalog entries.
- **No live AccuLynx API was called for this research.** Payload fields come from the local AccuLynx API reference; nullable behavior and actual customer values remain unverified.
- **JobTread input types are only partially documented in the local scrape.** Field names are known, but requiredness, enum constraints, numeric precision, custom-field value shape, and `globalId` semantics are unknown. Validate them before mutation.
- **UOM is lossy.** AccuLynx has estimate unit, order unit, and conversion; the identified JobTread CostItem surface has a single `unitId`. Price must be normalized to the selected pricing UOM before comparison or loading. Never compare or derive price using raw quantity/unit fields without confirmed conversion semantics.
- **Cost composition is unknown.** It is not proven whether `price`, `material_cost`, and `labor_cost` are unit or extended values, or whether overhead, profit, tax, and waste are already embedded.
- **Historical variation can create duplicates.** One conceptual item may appear with overridden names/descriptions or changed prices. Conversely, same-name items may be materially different.
- **CostType and CostCode dependencies are unresolved.** IDs must come from existing JobTread records/crosswalks; this contract does not authorize creating those entities.
- **No new users.** The target has one seat. Any logic that maps AccuLynx user IDs to JobTread user/membership/assignment creation is prohibited.
- **Rate limits:** AccuLynx documentation states 10 requests/second per API key and 30 concurrent requests/second per IP. Backfills must cap below the key limit, honor `429`, use jittered exponential backoff for idempotent GETs, and checkpoint progress. JobTread rate limits are per grant but exact numbers are unpublished; serialize or use small batches and back off on throttling.
- **Secrets:** use `ACCULYNX_API_KEY` and `JOBTREAD_GRANT_KEY` by environment-variable name only. Do not log request bodies containing grant keys or copy credential values into state, logs, or this contract.

## Loader Plan

1. **Backfill source evidence, read-only from AccuLynx.** Page estimate headers, then fetch sections/items using `ACCULYNX_API_KEY`. Cap sustained traffic below 10 requests/second (recommended initial concurrency 3–5), checkpoint each estimate/section, and retry only idempotent GETs.
2. **Persist source mirror rows.** A separate, authorized implementation may create reviewed relations only after schema review; this research task executed no DDL. Upsert source items by `(account_key, id)` and retain raw JSON.
3. **Profile before loading.** Count null/blank names, UOMs, item types, cost/price fields, GUID collisions, and distinct conversion pairs. Stop on unknown currency/UOM semantics.
4. **Read target dependencies.** Query existing JobTread Units, CostTypes, CostCodes, custom-field definitions, and catalog CostItems for organization `22PazeRM5FCH`. This research worker made no JobTread API calls. Build normalized-name indexes and preserve opaque IDs exactly.
5. **Resolve Units first.** For each distinct normalized `estimate_unit`, reuse a unique existing Unit. If none exists, call `createUnit`; if the crosswalk points to a renamed unit, call `updateUnit` only after confirming the target ID. Initial mutation batch size: 10 operations, then reduce on throttling. Never create duplicate names.
6. **Build an external crosswalk.** Required durable key:

   ```text
   source_system = acculynx
   source_account_key
   source_entity = estimate_item
   acculynx_guid
   jobtread_entity = cost_item
   jobtread_id
   source_fingerprint
   last_synced_at
   ```

   A deduplicated catalog CostItem may have multiple AccuLynx GUID aliases. Store a separate alias row per GUID. Do not rely on descriptions or mutable names as the only crosswalk.
7. **Idempotent CostItem upsert.**
   - If an AccuLynx GUID alias has a JobTread ID, read that target and call `updateCostItem` only when the normalized source fingerprint differs.
   - If no GUID alias exists, attempt a conservative match on the full deduplication key plus resolved Unit/CostType/CostCode. Accept only one exact match; otherwise quarantine for review.
   - If no match exists and all required mappings are known, call `createCostItem` with `organizationId = 22PazeRM5FCH`, require the returned `id`, and immediately record the crosswalk.
   - If multiple matches exist, do not mutate.
8. **Dependency order:** verified estimate headers → backfilled section records → backfilled item records → UOM profiling → JobTread Units → CostType/CostCode/custom-field crosswalk validation → JobTread CostItems → reconciliation.
9. **Batching and recovery:** start with 10 Pave mutations per controlled batch, checkpoint each returned `id`, and use exponential backoff with jitter. Because Pave requires `id` in returned object selections, request it on every create/update. Resume from crosswalk/checkpoint state, never by replaying blind creates.
10. **Reconcile.** Compare source GUID coverage, deduplicated catalog count, Unit coverage, quarantines, and field-level fingerprints. Do not auto-delete or auto-deactivate records absent from one source run.

## Evidence

All queries below were executed against Supabase project `rnhmvcpsvtqjlffpsayu` through the database query endpoint. They were read-only `SELECT` statements. No JobTread API call was made.

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema = 'public'
  AND table_name LIKE 'acculynx_%'
  AND (
    lower(table_name) LIKE '%catalog%'
    OR lower(table_name) LIKE '%price%'
    OR lower(table_name) LIKE '%item%'
    OR lower(table_name) LIKE '%product%'
    OR lower(table_name) LIKE '%material%'
  )
ORDER BY table_name;
```

Result: **rows = 2**: `public.acculynx_api_catalog` and `public.acculynx_write_catalog`; both are endpoint/write metadata, not domain pricing tables.

```sql
SELECT count(*) AS rows
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema = 'public'
  AND table_name LIKE 'acculynx_%'
  AND (
    lower(table_name) LIKE '%price%'
    OR lower(table_name) LIKE '%item%'
    OR lower(table_name) LIKE '%product%'
    OR lower(table_name) LIKE '%material%'
  );
```

Domain pricing/catalog tables: **rows = 0**

```sql
SELECT count(*) AS rows
FROM public.acculynx_api_catalog;
```

`public.acculynx_api_catalog`: **rows = 28**

```sql
SELECT count(*) AS rows
FROM public.acculynx_write_catalog;
```

`public.acculynx_write_catalog`: **rows = 38**

```sql
SELECT id, endpoint_pattern, method, category, subcategory,
       requires_param, is_collection, response_keys, target_table,
       sync_enabled, last_probe_status, notes
FROM public.acculynx_api_catalog
WHERE endpoint_pattern IN ('/estimates', '/jobs/{job_id}/estimates')
ORDER BY id;
```

Result: **rows = 2**

- `/jobs/{job_id}/estimates`, `GET`, target `acculynx_estimates`, sync enabled, last probe `200`
- `/estimates`, `GET`, target `acculynx_estimates`, sync enabled, last probe `200`

```sql
SELECT count(*) AS rows
FROM public.acculynx_estimates;
```

`public.acculynx_estimates`: **rows = 210**

```sql
SELECT DISTINCT jsonb_object_keys(raw) AS key
FROM public.acculynx_estimates
ORDER BY key;
```

Result: **rows = 4** distinct top-level keys: `_link`, `id`, `isPrimary`, `job`.

```sql
SELECT count(*) AS rows
FROM public.acculynx_estimates
WHERE raw ? 'sections';
```

Estimate rows carrying sections: **rows = 0**

```sql
SELECT count(*) AS rows
FROM public.acculynx_estimates
WHERE raw::text ~ '"(materialCost|laborCost|estimateUnit|orderUnit|unitConversion|fixedPrice|price|quantity)"';
```

Estimate rows carrying tested line-item pricing keys: **rows = 0**

```sql
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'acculynx_estimates'
ORDER BY ordinal_position;
```

Result: **rows = 29** columns. The verified shaped columns are estimate-header fields plus `raw`; there are no section/item/UOM columns.

```sql
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'acculynx_api_catalog'
ORDER BY ordinal_position;
```

Result: **rows = 16** columns.
