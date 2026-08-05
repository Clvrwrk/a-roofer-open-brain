# AccuLynx / QBO Chart of Accounts → JobTread Job Costing

Scope: read-only mapping contract for JobTread organization `22PazeRM5FCH` (“Pro Exteriors”). This document does not authorize a load. The organization has one seat: **the loader must never create users**. Sales representatives and assignees are out of scope for these costing operations and, elsewhere in the bridge, must remain custom-field values.

**Canonical CoA decision:** use `public.qbo_accounts`, filtered to active job-cost-relevant accounts, as the canonical chart of accounts. It is the only verified full, deduplicated account master: 211 rows, 211 distinct `(realm_id, qbo_id)` keys, all active, with names, fully qualified hierarchy, account/subtype, classification, and `parent_ref`. The 56 views in the schema named qbo_registers are account-specific transaction views over `public.v_qbo_register_lines`; they represent only 56 register-capable balance-sheet/vendor accounts and are evidence for usage, not the CoA master. AccuLynx financial/invoice data is job-level transactional data, not a company CoA.

For JobTread job costing, the initial allowlist should be QBO `account_type = 'Cost of Goods Sold'` (13 live accounts). Do not import all 211 GL accounts into JobTread cost codes: bank, credit-card, receivable, payable, equity, fixed-asset, income, and liability accounts are not job cost codes. Expense accounts outside COGS require an accounting-approved allowlist before inclusion.

## Source Tables

- `public.qbo_accounts` — verified base table; **rows = 211**. Canonical CoA.
- `public.v_qbo_register_accounts` — verified view; **rows = 56**. The register-account subset; useful as a completeness warning, not as canonical CoA.
- `public.v_qbo_register_lines` — verified view; **rows = 29,883**. Register transactions; not a cost-code master.
- `public.acculynx_job_financials` — verified base table; **rows = 6,512**. Job-level totals and amendment JSON; no CoA columns.
- `public.acculynx_invoice_lines` — verified base table; **rows = 0**. Its live columns are `id`, `invoice_id`, `section_id`, `section_type`, `item_name`, `price`, `total_price`, `hierarchy_sort_order`, `reference_type`, `raw`, sync/provenance fields, and archive/trust fields. Contrary to the domain hypothesis, the live table has **no cost, quantity, or UOM columns**.
- `public.acculynx_invoices` — verified base table; **rows = 1,660**. Invoice headers only.
- `public.acculynx_estimates` — verified base table; **rows = 210**. Estimate totals only; no mirrored section/item rows.
- `public.acculynx_raw` — verified base table; **rows = 44,582**. It contains 1,628 raw invoice-detail payloads and 6,682 job-financial payloads. The invoice payloads contain 4,722 nested items, but observed item keys are limited to `id`, `itemName`, `price`, `totalPrice`, `hierarchySortOrder`, `referenceType`, sparsely `parentId`, and sparsely `tradeId`; no cost, quantity, or UOM key was observed.

The schema named qbo_registers contains exactly these 56 verified views (qbo_registers itself is a schema, not a source table):

- `qbo_registers."AA CC Business 1872"` — rows = 2,445
- `qbo_registers."ABC Supply"` — rows = 2,419
- `qbo_registers."American Airlines Chandler"` — rows = 69
- `qbo_registers."American CC"` — rows = 121
- `qbo_registers."Amex (1002)"` — rows = 2,755
- `qbo_registers."Applecard"` — rows = 0
- `qbo_registers."Bank of America CC"` — rows = 42
- `qbo_registers."BOA CC 9797"` — rows = 2,403
- `qbo_registers."BofA Chg Main- 7635"` — rows = 10,733
- `qbo_registers."Capital One 6811"` — rows = 0
- `qbo_registers."Cash"` — rows = 0
- `qbo_registers."Chan Apple CC"` — rows = 13
- `qbo_registers."Chan Chase CC"` — rows = 632
- `qbo_registers."Chase CC"` — rows = 7
- `qbo_registers."Commercial Loans 8358"` — rows = 5
- `qbo_registers."Costco Citi- 1349"` — rows = 1,907
- `qbo_registers."EECU Loan 10451754"` — rows = 2
- `qbo_registers."First United 8597"` — rows = 266
- `qbo_registers."FUB No. 403584543"` — rows = 2
- `qbo_registers."FUB No. 403584550"` — rows = 2
- `qbo_registers."FUB No. 403584576"` — rows = 2
- `qbo_registers."FUB No. 403584584"` — rows = 2
- `qbo_registers."FUB No. 403584626"` — rows = 2
- `qbo_registers."FUB No. 403584642"` — rows = 2
- `qbo_registers."FUB No. 403584659"` — rows = 2
- `qbo_registers."Home Depot Commercial"` — rows = 1,659
- `qbo_registers."Lowe's Commercial"` — rows = 112
- `qbo_registers."Lowes CC"` — rows = 78
- `qbo_registers."Matt Chase 5584"` — rows = 8
- `qbo_registers."Mca Servicing Loan"` — rows = 0
- `qbo_registers."Metal Mart"` — rows = 46
- `qbo_registers."N/P Ally Fin Ram vin2884"` — rows = 4
- `qbo_registers."N/P Auto Chevy Tahoe"` — rows = 2
- `qbo_registers."N/P Auto Ram 3500 (4/2024)"` — rows = 3
- `qbo_registers."N/P Ram1500 ViN5626"` — rows = 2
- `qbo_registers."Nord CC"` — rows = 28
- `qbo_registers."Note Payable - Ally"` — rows = 4
- `qbo_registers."Note Payable - Ally Van 4119"` — rows = 2
- `qbo_registers."Note Payable - Ally Van 5450"` — rows = 2
- `qbo_registers."Note Payable - EECU"` — rows = 9
- `qbo_registers."Note Payable Ford Transit"` — rows = 2
- `qbo_registers."Note Payable Ford Transit Cargo"` — rows = 2
- `qbo_registers."OFX AUD 2"` — rows = 0
- `qbo_registers."OFX MXN"` — rows = 0
- `qbo_registers."OFX USD"` — rows = 125
- `qbo_registers."OLD -BOA CC"` — rows = 0
- `qbo_registers."Pro Ext CC"` — rows = 638
- `qbo_registers."Sammy Chase 7495"` — rows = 13
- `qbo_registers."Shawn Chase 7637"` — rows = 0
- `qbo_registers."Short-term business loans"` — rows = 0
- `qbo_registers."Spark Capital One 9442"` — rows = 1,470
- `qbo_registers."Tab Apple CC"` — rows = 28
- `qbo_registers."Tab Chase CC"` — rows = 576
- `qbo_registers."Ulta CC"` — rows = 97
- `qbo_registers."WEX Fuel"` — rows = 930
- `qbo_registers."Zach Chase 9133"` — rows = 175

**MISSING IN MIRROR:** a normalized AccuLynx chart-of-accounts/cost-code master is absent. The documented AccuLynx company-settings endpoints expose operational lookups, but the reviewed API guide does not identify a company CoA endpoint. Do not invent one. See [AccuLynx API.md](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md), “Company settings lookups” and “Financials.”

**MISSING IN MIRROR:** worksheet sections/items and estimate sections/items with quantity/UOM are absent as normalized tables. Read-only backfill candidates are `GET /jobs/{jobId}/financials`, then `GET /financials/{financialsId}/worksheet`, plus `GET /estimates/{estimateId}/sections` and `GET /estimates/{estimateId}/sections/{sectionId}/items`. These endpoint families are identified in [AccuLynx API.md](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md) (“Financials: … worksheet” and “Estimates”) and the ingest interpretation in [AccuLynx mapping.md](/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/mapping.md) §5. This contract did not call AccuLynx.

## Target Pave Ops

The following exact operation names exist in the authoritative [schema-surface.json](/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork%20Main/GROK/Tools/catalog/jobtread/api/schema-surface.json):

- `createCostGroup`
- `createCostCode`
- `createCostType`
- `createUnit`
- `createCostCodeMapping`
- `createCostTypeMapping`
- `createUnitMapping`

For idempotent reruns of already-created canonical objects, the same surface also verifies `updateCostGroup`, `updateCostCode`, `updateCostType`, and `updateUnit`. Mapping helper update operations are not present; mapping helpers are create/delete only.

The reviewed JobTread schema snapshot gives these relevant input shapes:

- `createCostCode({ name, number, organizationId, parentCostCodeId, qbdIntegrationItemId })`
- `createCostGroup({ description, files, isSelected, isSimpleSelection, lineItems, maxSelectionsAllowed, minSelectionsRequired, name, quantity, quantityFormula, showChildCosts, showChildDeltas, showChildren, showDescription, unitId, documentId, jobId, organizationId, parentCostGroupId, positionAfter })`
- `createCostType({ isTaxable, isTimeTrackable, margin, name, organizationId })`
- `createUnit({ name, organizationId })`
- `createCostCodeMapping({ name, costCodeId })`
- `createCostTypeMapping({ name, costTypeId })`
- `createUnitMapping({ name, unitId })`

No JobTread API was called, so required/optional status and accepted scalar types remain unknown unless stated by the names above. Validate payloads in JobTread’s live Explorer before any production write.

## Field Mapping

### Canonical cost codes

| Source column | Pave input field | Type notes and transform |
| --- | --- | --- |
| `public.qbo_accounts.realm_id` + `qbo_id` | no native field; loader crosswalk key | Text composite source key. Store outside JobTread as `qbo:<realm_id>:account:<qbo_id>`; never expose the realm value in logs or this contract. |
| constant | `createCostCode.organizationId` | Text ID; always `22PazeRM5FCH`. |
| `name` | `createCostCode.name` | Text; trim only. Do not collapse punctuation or correct spelling because name fidelity is needed for reconciliation. |
| `qbo_id` | `createCostCode.number` | Text is assumed but not live-validated. Recommended stable import number: `QBO-<qbo_id>`. This avoids ambiguous duplicate names. If JobTread constrains number format, this transform is **unknown pending Explorer validation**. |
| `parent_ref` | `createCostCode.parentCostCodeId` | Resolve `(realm_id, parent_ref)` through the cost-code crosswalk. Create parent before child. Null remains null. |
| `qbo_id` | `createCostCode.qbdIntegrationItemId` | **Do not map.** The field name is QBD-specific; a QBO account ID is not known to be a QuickBooks Desktop item ID. |
| `active` | loader filter | Import only `TRUE`. Live data currently has 211 active and 0 inactive rows, but retain the filter for future syncs. |
| `account_type` | loader filter | Initial production scope is exact `Cost of Goods Sold`. Other GL types are excluded. |
| `classification` | validation only | COGS rows observed as `Expense`; reject/quarantine contradictory classifications rather than coercing them. |
| `fully_qualified_name` | `createCostCodeMapping.name` | Create an alias mapping to the resolved JobTread cost code. Preserve the QBO colon-delimited hierarchy exactly. |
| `name` | `createCostCodeMapping.name` | Optional second alias only when globally unambiguous among imported codes. Do not create a short-name mapping when duplicates exist. |
| resolved JobTread cost-code ID | `createCostCodeMapping.costCodeId` | Text ID returned by `createCostCode`; store in crosswalk before creating mappings. |

### Cost types

Cost types are a controlled JobTread vocabulary, not a one-row-per-QBO-account copy. The proposed classification is deterministic but requires accounting approval because neither QBO nor AccuLynx supplies a JobTread cost-type ID.

| Source column/value | Pave input field | Type notes and transform |
| --- | --- | --- |
| constant | `createCostType.organizationId` | `22PazeRM5FCH`. |
| `account_sub_type = 'CostOfLaborCos'` or approved labor-name rule | `createCostType.name` | Map to controlled value `Labor`. |
| `account_sub_type = 'SuppliesMaterialsCogs'` | `createCostType.name` | Map to controlled value `Material`, except names explicitly approved as subcontractor/reimbursement exceptions. |
| `account_sub_type = 'EquipmentRentalCos'` | `createCostType.name` | Map to controlled value `Equipment`. |
| approved name match such as `Subcontractors` | `createCostType.name` | Map to controlled value `Subcontractor`. Name-based exception list must be reviewed and versioned. |
| other COGS subtype/name | no automatic target | `Other` is a possible controlled value, but creating it is **unknown pending accounting approval**. Quarantine unmatched rows. |
| controlled policy | `createCostType.isTaxable` | Boolean. Unknown from source; do not infer from account subtype. Require organization policy. |
| controlled policy | `createCostType.isTimeTrackable` | Boolean. Candidate `TRUE` for Labor and `FALSE` otherwise; unknown pending approval. |
| controlled policy | `createCostType.margin` | Numeric semantics/units are not established by the reviewed snapshot. Omit until validated. |
| QBO subtype/name aliases | `createCostTypeMapping.name` | Text alias such as exact `CostOfLaborCos`; do not use fuzzy matching. |
| resolved JobTread cost-type ID | `createCostTypeMapping.costTypeId` | Text ID returned by `createCostType`. |

### Units

| Source column/value | Pave input field | Type notes and transform |
| --- | --- | --- |
| AccuLynx estimate/worksheet item UOM | `createUnit.name` | **MISSING IN MIRROR.** Once backfilled, trim and canonicalize through an approved alias dictionary (`EA`→`Each`, `SQ`→`Square`, etc.). The exact JobTread unit vocabulary is unknown until existing units are read. |
| constant | `createUnit.organizationId` | `22PazeRM5FCH`. |
| raw AccuLynx UOM token | `createUnitMapping.name` | Preserve exact source token as the import alias. |
| resolved JobTread unit ID | `createUnitMapping.unitId` | Text ID returned by `createUnit`. |
| no source UOM | no automatic target | Do not silently assign `Each` to every item. A default may be introduced only as an explicit, approved loader policy. |

### Cost groups and AccuLynx financial evidence

| Source column/value | Pave input field | Type notes and transform |
| --- | --- | --- |
| `public.qbo_accounts` hierarchy | `createCostGroup.*` | **No direct mapping recommended.** Cost-code hierarchy is represented by `parentCostCodeId`; duplicating it as cost groups would create two competing hierarchies. |
| AccuLynx worksheet sections | `createCostGroup.name` | **MISSING IN MIRROR.** If worksheet detail is backfilled and section semantics prove stable, section name may map to group name at job or catalog scope. |
| AccuLynx worksheet section parent | `createCostGroup.parentCostGroupId` | Resolve through a separate section/group crosswalk; currently unknown because section detail is absent. |
| AccuLynx worksheet section order | `createCostGroup.positionAfter` | Resolve prior sibling’s JobTread ID. Exact input shape is unknown pending Explorer validation. |
| `public.acculynx_job_financials.approved_job_value`, `balance_due`, `worksheet_total`, amendment totals | no field in the seven scoped ops | Numeric reconciliation evidence only. These totals do not define cost codes, types, units, or groups. |
| `public.acculynx_invoice_lines.price`, `total_price` | no field in the seven scoped ops | Numeric sale-price evidence only. The live normalized table is empty and exposes no cost/UOM. Do not derive CoA categories from item text. |

## Gaps & Risks

- **AccuLynx CoA fidelity:** no AccuLynx company CoA/cost-code master was found. QBO is therefore canonical, while AccuLynx job financials remain reconciliation evidence. Any AccuLynx-only cost category is currently invisible.
- **Register-schema trap:** the 56 views in the schema named qbo_registers are not 56 CoA tables. They are filtered transaction views over `public.v_qbo_register_lines`; using them as the CoA would omit 155 of 211 live accounts and emphasize balance-sheet/payment registers rather than job costs.
- **QBO-to-job-cost scope:** only 13 accounts are typed COGS. Some potentially job-relevant costs may live under ordinary Expense accounts. Importing those without an approved allowlist risks polluting JobTread with overhead.
- **Cost type ambiguity:** QBO account subtype is not equivalent to JobTread cost type. In particular, `SuppliesMaterialsCogs` includes accounts whose names suggest subcontractors or reimbursements. Name exceptions require human approval.
- **No usable AccuLynx line-cost/UOM mirror:** `public.acculynx_invoice_lines` has zero rows and no cost/quantity/UOM columns. Raw invoice items contain sale prices only. Estimate and worksheet item backfills are prerequisites for units and detailed budget reconstruction.
- **Cost-group semantics unknown:** JobTread cost groups appear contextual to an organization, job, document, or parent group. The source has no verified organization-level group master. Do not create groups merely to mirror GL hierarchy.
- **Pave input uncertainty:** operation names and input field names are documented locally, but required fields, enum domains, number formats, and response shapes were not live-tested. Use the JobTread Explorer before loading.
- **No-user invariant:** none of these operations should carry a user, membership, assignee, or sales-rep input. Never call `createRole`, create/update membership operations, or any user-creation mechanism as part of this loader.
- **Destructive drift:** mapping helpers lack update operations in the authoritative surface. If an alias changes target, deletion/recreation would be destructive and must require explicit approval; default behavior should be quarantine/report.
- **Duplicate mappings:** a leaf `name` can be duplicated under different QBO parents. Prefer `fully_qualified_name`; create short-name mappings only after an exact uniqueness check.
- **QBD/QBO mismatch:** never place QBO account IDs in `qbdIntegrationItemId`.
- **Rate limits:** the JobTread documentation says limits are per grant but does not publish exact thresholds. Use serial/small-batch writes, exponential backoff with jitter on `429`, and checkpoint after every success. The AccuLynx guide states 10 requests/second per API key and 30 requests/second per IP; any future read-only backfill must stay below both and page by date windows.
- **Credentials:** loaders should reference `SUPABASE_ACCESS_TOKEN` and `JOBTREAD_GRANT_KEY` by environment-variable name only. Never write their values to files, payload logs, error traces, or crosswalks.

## Loader Plan

This is a future implementation plan, not authorization to call JobTread.

1. **Preflight reads:** with a read-capable JobTread grant, query organization `22PazeRM5FCH` for existing cost codes, cost types, units, groups, and mappings. Request `id` on every object as required by the Pave guide. Confirm exact pagination, input constraints, and whether stable source markers can be stored natively.
2. **Freeze scope:** select active QBO COGS accounts; produce an accounting-review report for excluded Expense accounts and proposed cost-type exceptions. No production creation until approved.
3. **Crosswalk model:** maintain an external durable crosswalk keyed by `(target_org_id, source_system, source_entity, source_key)`. Required keys:
   - `qbo/account/<realm_id>/<qbo_id>` ↔ JobTread cost-code ID
   - `policy/cost-type/<canonical-name>` ↔ JobTread cost-type ID
   - `acculynx/unit/<normalized-token>` ↔ JobTread unit ID
   - if later approved, `acculynx/worksheet-section/<section-guid>` ↔ JobTread cost-group ID
   
   AccuLynx entity GUIDs are text UUIDs; JobTread IDs are opaque text. Never derive one from the other.
4. **Match before create:** resolve in this order: existing crosswalk → exact stable import number (`QBO-<qbo_id>`) within the organization → exact reviewed natural key. If more than one candidate matches, stop and quarantine; never choose by fuzzy name.
5. **Dependency order:**
   1. approved controlled units via `createUnit`;
   2. approved controlled cost types via `createCostType`;
   3. root cost codes via `createCostCode`;
   4. child cost codes in parent-depth order;
   5. exact aliases via `createUnitMapping`, `createCostTypeMapping`, and `createCostCodeMapping`;
   6. cost groups only after worksheet-section backfill and separate approval.
6. **Idempotent upsert behavior:** create only when no crosswalk/natural-key match exists. When the crosswalk resolves, compare normalized mutable fields and use the corresponding verified `update*` op only for approved changes. Never delete on source disappearance; mark the discrepancy for review.
7. **Checkpoint immediately:** after each successful create, persist the source key ↔ returned JobTread ID before proceeding to dependents. Request the returned object’s `id`.
8. **Batch size:** start with one object per request for a 5-object canary. If responses and throttling are clean, use batches of at most **10 independent creates** per request, or remain serial if Pave mutations are not transactionally isolated. Parent/child operations stay sequential by depth. Pause and back off on `429`; retry only requests whose idempotency can be proven by preflight lookup.
9. **Canary and reconciliation:** create one approved cost type, one unit only if sourced, one root code, one child code, and their exact mappings. Re-read JobTread, compare names/numbers/parents, and confirm no user/membership count change.
10. **Full load and audit:** load remaining approved rows, then reconcile source cardinality, crosswalk cardinality, JobTread IDs, parent resolution, and alias uniqueness. Compare AccuLynx financial totals only as evidence; do not expect CoA-row totals to equal job financial totals.

## Evidence

All database statements below were executed against Supabase project `rnhmvcpsvtqjlffpsayu` through the management query endpoint. They are `SELECT`/`information_schema` only. Authentication used the environment variable `SUPABASE_ACCESS_TOKEN`; no credential value is reproduced here.

### Live object inventory

```sql
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'qbo_registers'
ORDER BY table_name;
```

Result: **rows = 56** metadata rows, all `VIEW`. The exact names are enumerated under “Source Tables.”

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND (
    table_name LIKE 'acculynx\_%' ESCAPE '\'
    OR table_schema = 'qbo_registers'
  )
ORDER BY table_schema, table_name;
```

Result: **rows = 30**; all are the verified `public.acculynx_*` base tables. The name qbo_registers identifies a schema, not a base-table object.

```sql
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_name ILIKE '%qbo%'
   OR table_schema ILIKE '%qbo%'
ORDER BY table_schema, table_name;
```

Result: **rows = 76**: 18 public QBO base tables, 2 public QBO views, and 56 views in the schema named qbo_registers.

### Canonical CoA proof

```sql
SELECT count(*)::bigint AS rows,
       count(DISTINCT (realm_id, qbo_id))::bigint AS distinct_keys,
       count(*) FILTER (WHERE active IS TRUE)::bigint AS active_rows,
       count(*) FILTER (WHERE active IS FALSE)::bigint AS inactive_rows
FROM public.qbo_accounts;
```

Result: **rows = 211**, `distinct_keys = 211`, `active_rows = 211`, `inactive_rows = 0`.

```sql
SELECT account_type, account_sub_type, count(*)::bigint AS rows
FROM public.qbo_accounts
GROUP BY account_type, account_sub_type
ORDER BY account_type, account_sub_type;
```

Result: **rows = 68** grouped type/subtype combinations. Summing groups where `account_type = 'Cost of Goods Sold'` gives **rows = 13** source accounts.

```sql
SELECT qbo_id, name, fully_qualified_name, account_type,
       account_sub_type, classification, active, parent_ref
FROM public.qbo_accounts
WHERE account_type = 'Cost of Goods Sold'
ORDER BY fully_qualified_name;
```

Result: **rows = 13**.

```sql
SELECT count(*)::bigint AS rows FROM public.v_qbo_register_accounts;
SELECT count(*)::bigint AS rows FROM public.v_qbo_register_lines;
```

Results: `public.v_qbo_register_accounts` **rows = 56**; `public.v_qbo_register_lines` **rows = 29,883**.

```sql
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'qbo_registers'
ORDER BY table_name
LIMIT 3;
```

Result: **rows = 3**. Each definition selects from `v_qbo_register_lines` and filters by `account_ref` or `account_name`, proving the schema contains register views rather than independent CoA masters.

### AccuLynx population and shape

```sql
SELECT 'public.acculynx_job_financials' AS table_name,
       count(*)::bigint AS rows
FROM public.acculynx_job_financials
UNION ALL
SELECT 'public.acculynx_invoice_lines', count(*)::bigint
FROM public.acculynx_invoice_lines
UNION ALL
SELECT 'public.acculynx_invoices', count(*)::bigint
FROM public.acculynx_invoices
UNION ALL
SELECT 'public.acculynx_estimates', count(*)::bigint
FROM public.acculynx_estimates
UNION ALL
SELECT 'public.acculynx_raw', count(*)::bigint
FROM public.acculynx_raw
ORDER BY table_name;
```

Results:

- `public.acculynx_estimates`: **rows = 210**
- `public.acculynx_invoice_lines`: **rows = 0**
- `public.acculynx_invoices`: **rows = 1,660**
- `public.acculynx_job_financials`: **rows = 6,512**
- `public.acculynx_raw`: **rows = 44,582**

```sql
SELECT resource_type, count(*)::bigint AS rows,
       count(DISTINCT api_endpoint)::bigint AS endpoints
FROM public.acculynx_raw
GROUP BY resource_type
ORDER BY resource_type;
```

Relevant results: `invoice_lines` **rows = 1,628**; `invoices` **rows = 6,682**; `job_financials` **rows = 6,682**.

```sql
SELECT count(*)::bigint AS rows
FROM public.acculynx_raw r
CROSS JOIN LATERAL
  jsonb_array_elements(COALESCE(r.payload->'sections', '[]'::jsonb)) s
CROSS JOIN LATERAL
  jsonb_array_elements(COALESCE(s->'items', '[]'::jsonb)) i
WHERE r.resource_type = 'invoice_lines';
```

Result: nested invoice items **rows = 4,722**.

```sql
SELECT key, count(*)::bigint AS rows
FROM public.acculynx_raw r
CROSS JOIN LATERAL
  jsonb_array_elements(COALESCE(r.payload->'sections', '[]'::jsonb)) s
CROSS JOIN LATERAL
  jsonb_array_elements(COALESCE(s->'items', '[]'::jsonb)) i
CROSS JOIN LATERAL jsonb_object_keys(i) key
WHERE r.resource_type = 'invoice_lines'
GROUP BY key
ORDER BY key;
```

Result: **rows = 8** distinct item keys. `id`, `itemName`, `price`, `totalPrice`, `hierarchySortOrder`, and `referenceType` occur on all 4,722 items; `parentId` occurs on 102 and `tradeId` on 52. No observed key represents cost, quantity, or UOM.

### Per-register counts

The per-view counts in “Source Tables” came from a generated `UNION ALL` of read-only statements of this exact form for all 56 names:

```sql
SELECT '<exact table name>' AS table_name, count(*)::bigint AS rows
FROM qbo_registers."<exact table name>"
UNION ALL
-- repeated for every name returned by information_schema.tables
SELECT '<exact table name>' AS table_name, count(*)::bigint AS rows
FROM qbo_registers."<exact table name>"
ORDER BY table_name;
```

Result: **rows = 56** count records. Each individual `rows = N` is recorded beside its exact verified view name above.
