## Scope

Compilation used only mirrored SQL sources. No AccuLynx, JobTread, or other
external API was called.

| Measure | Live count |
| --- | ---: |
| Source jobs | 6,574 |
| Non-archived, non-sandbox jobs | 6,574 |
| Source estimates on in-scope jobs | 212 |
| Estimates already crosswalked as `document` | 26 |
| Remaining estimates eligible for staging | 186 |
| Backfilled estimate line items staged | 4,222 |
| Eligible estimates with no backfilled items | 2 |

The required `archived_at is null` and `account_key <> 'sandbox'` filters were
applied at the job boundary. The current mirror contains zero archived-job
estimates and zero sandbox estimates, so those filters excluded zero document
rows in this run. The live estimate source has increased from the brief's
approximate 210 to 212 rows; crosswalk-aware exclusion, rather than the
approximate count, determined the final scope.

Remaining documents by source account: Wichita 91, Texas 53, Kansas City 31,
multi-family/commercial 6, and Colorado 5.

## Domains Staged

| Domain | Pave operation | Status | Execution order | Rows |
| --- | --- | --- | ---: | ---: |
| `documents` | `createDocument` | `staged` | 110 | 186 |

The 186 payloads contain the executed pilot's exact top-level key set and bare
`_type: "costItem"` line-item shape. All use `type: "customerOrder"`,
`name: "Proposal"`, `dueDays: 30`, `taxRate: 0`, `fromName: "Pro Exteriors"`,
and `showQuantity: true`. Customer names and job address labels are populated
for every row.

All remaining jobs are not yet crosswalked, so all 186 `jobId` fields use typed
`acculynx_job:<id>` references. Of 4,222 item `unitId` values, 4,201 use literal
crosswalked JobTread unit IDs and 21 use typed `acculynx_unit:<unit>`
references. Cost catalog semantics match the pilot: 3,767 items resolved by
executed catalog-item name, while 455 used the established deterministic
material/labor fallback. Every `costCodeId` and `costTypeId` is a literal,
crosswalk-backed JobTread ID.

The two header-only documents have empty `lineItems` arrays:

- `acculynx_estimates:6f3c425d-625a-0e73-62a9-0278cc187bf0`
- `acculynx_estimates:b5544d07-ea9b-b12d-a0bd-e1157a1306b3`

## Truncations Applied

| Transformation | Count |
| --- | ---: |
| Estimate GUID hyphens stripped for 32-character `externalId` | 186 |
| `externalId` values requiring further truncation | 0 |
| Job names emitted or truncated by this domain | 0 |

Document subjects retain the original estimate title when present. All 186
remaining source titles are blank, so the proven pilot fallback
`AccuLynx Estimate <GUID>` was used. Job names are not document payload fields,
so the 30-character job-name truncation rule did not alter this domain.

## Assumptions

- A crosswalk match on `jt_type = 'document'` and the globally unique AccuLynx
  estimate GUID is authoritative even though the pilot crosswalk rows have null
  `source_account_key`; this excluded all 26 executed pilot documents.
- Estimate eligibility follows the brief's job-level archive rule. Estimate
  rows marked `not_seen_in_api` remain eligible when their jobs are active, as
  in the executed pilot.
- Customer display names come from each job's primary contact reference in the
  mirrored job JSON, with the cleaned job name and then `Customer` as
  deterministic fallbacks. No fallback was needed in this run.
- `unitCost` is `coalesce(material_cost, 0) + coalesce(labor_cost, 0)`.
  `unitPrice` is the backfilled item `price`; section name, source unit, and
  source line total are preserved in each line description.
- Header descriptions retain the pilot metadata structure: estimate ID,
  primary flag, mirrored header total availability, and source archive marker.
- Idempotent replacement deleted only this domain's rows with
  `status = 'staged'`. Executed rows were preserved; no skipped, failed, or
  other-domain rows were touched.
- No user invite, membership, assignee, or `notify` field is present.

## Verdict

**PASS — 186 full-scope `documents` writes are staged and ready for executor
preflight.** Live validation found 186 `createDocument` rows, 4,222 bare cost
items, zero crosswalk collisions, zero malformed refs, zero invalid catalog
IDs, zero payload-key mismatches, zero hard-limit violations, and no `notify`
field. The domain now contains 186 staged rows plus the preserved 26 executed
pilot rows.
