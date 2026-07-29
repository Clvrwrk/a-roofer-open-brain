# jt-acculynx-mirror Staging Data Repair — Second Pass

## Repairs Applied

- Updated the 4 eligible `cost_types` rows that were `failed`:
  - Added `"isTimeTrackable": false` with `jsonb_set`.
  - Preserved the existing `isTaxable` value.
  - Left `margin` absent as directed.
  - Reset each row to `status='staged'`, `error=null`, and `attempt=0`.
  - Rationale: these cost types derive from QBO expense accounts, and time tracking is not mirrored.
- Updated all 123 eligible `catalog_items` rows (11 formerly `failed`, 112 already `staged`):
  - Added a `costCodeId` object containing an exact executed cost-code `source_ref`.
  - Reset the 11 formerly failed rows to `status='staged'`, `error=null`, and `attempt=0`.
  - Added the mechanically derivable required field `"quantity": 1` to all 123 rows. Each catalog row defines one catalog unit through its existing `unitId`, `unitCost`, and `unitPrice`.
- Checked all staged payloads for `payload->>'notify'='true'`. Count found and changed: **0**.
- Every update was restricted to rows whose status was `failed` or `staged`. No `executed` or `skipped` row was updated.

## Cost Code Assignment

The 13 executed `cost_codes` rows and their crosswalk entries were inspected before assignment. The deterministic assignment rule, in priority order, was:

1. Item names containing `rental` or `crane` map to **Equipment rental - COGS**.
2. Item names containing `freight` or `delivery` map to **Freight in - COGS**.
3. Items whose existing `costTypeId.$ref` identifies labor map to **Cost of labor - COGS**.
4. Items whose existing `costTypeId.$ref` identifies material map to **Supplies & materials - COGS**.
5. Any item not classified by the preceding rules maps to the general **Cost of goods sold** code.

The catalog contained no freight/delivery or unclassified fallback items. The one crane-rental item matched the equipment-specific rule before its broader labor classification.

| Executed cost code | Number | Exact `$ref` stored in `costCodeId` | Items |
| --- | --- | --- | ---: |
| Cost of labor - COGS | QBO-85 | `qbo_accounts:85` | 29 |
| Equipment rental - COGS | QBO-86 | `qbo_accounts:86` | 1 |
| Supplies & materials - COGS | QBO-88 | `qbo_accounts:88` | 93 |
| **Total** |  |  | **123** |

## Required-Field Sweep

Live post-repair validation used the supplied operation signatures and required reference-object shapes.

| Staged domain | Rows checked | Result | Gaps |
| --- | ---: | --- | ---: |
| `cost_types` | 4 | Pass: `name`, `organizationId`, boolean `isTaxable`, and boolean `isTimeTrackable`; `margin` intentionally absent per repair instruction | 0 |
| `catalog_items` | 123 | Pass: `costCodeId.$ref`, `costTypeId.$ref`, `name`, numeric `quantity`, `unitCost`, `unitPrice`, `unitId.$ref`, and `organizationId` | 0 |
| `customer_accounts` | 24 | Pass: `name`, `type`, and `organizationId` | 0 |
| `vendor_accounts` | 50 | Pass: `name`, `type`, and `organizationId` | 0 |
| `locations` | 25 | Pass: `accountId.$ref` and `address` | 0 |
| `jobs` | 25 | Pass: `locationId.$ref` and `name` | 0 |
| `documents` | 26 | Pass: `jobId.$ref`, `type`, and `name` | 0 |
| `daily_logs` | 25 | Pass: `jobId.$ref`, `date`, and `notes` | 0 |
| `job_custom_values` | 25 | Pass: `id.$ref` and `customFieldValues` | 0 |

No customer account required a mechanical `type='customer'` repair; all 24 already contained a type.

## Unresolved

None. The required-field sweep found no non-derivable gaps.

## Verdict

**PASS — staging queue is ready for execution.**

Final live SQL verification:

- Failed rows across `jt_mirror.pending_write`: **0**
- Staged `catalog_items`: **123**
- Staged catalog items with non-empty `costCodeId.$ref`: **123**
- Staged catalog items passing the complete required-field check: **123**
- Staged `cost_types`: **4**
- Staged cost types with both required booleans: **4**
- Staged payloads with `notify=true`: **0**
