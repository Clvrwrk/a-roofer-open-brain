## Domains Staged

Live SQL verification after replacement of this compiler's prior `staged` rows:

| Domain | Pave operation | Staged rows | Execution order |
| --- | --- | ---: | ---: |
| `documents` | `createDocument` | 26 | 110 |
| `daily_logs` | `createDailyLog` | 25 | 120 |

The 26 documents cover every estimate joined to the 25 pilot jobs. They contain
518 estimate line items from `acculynx_backfill.estimate_items`; no pilot
estimate lacked backfilled items. The 25 daily logs cover all 25 pilot jobs and
summarize 80 milestone-history rows chronologically.

## Ref Graph

| Emitted reference | Used by | Satisfied by earlier band |
| --- | --- | --- |
| `acculynx_job:<job_id>` | `jobId` on all 26 documents and all 25 daily logs | jobs, band 90 |
| `acculynx_unit:<normalized_estimate_unit>` | `unitId` on 517 document line items | units, band 20 |

One of the 518 estimate items has no source `estimate_unit`, so its documented
optional `unitId` input is omitted rather than invented.

## Assumptions

- Every pilot estimate was staged as requested, including 25 source estimate
  stubs marked `not_seen_in_api`; the brief's “every pilot job's estimates”
  instruction was treated as overriding the estimates contract's default
  archived-row exclusion.
- All 26 normalized estimate headers have null `title`, `estimate_number`,
  `created_date`, `total_price`, `tax_total`, and `tax_rate`. Deterministic names
  use `AccuLynx Estimate <id>`. No `issueDate`, `tax`, or `taxRate` was invented.
  The unavailable header total is stated in each document description.
- No estimate required the allowed header-only fallback because all 26 have
  backfilled items. Source section names, units, and line totals are preserved
  in line descriptions.
- The scraped schema documents `lineItems` at the `createDocument` root but does
  not expand its nested input type. Nested fields were limited to the documented
  cost-item inputs `name`, `description`, `quantity`, `unitId`, and `unitPrice`.
  Source total is descriptive because the documented mutation input has no
  independent line-total field; JobTread derives it from quantity and unit price.
- `estimate_unit` is the unit authority, consistent with the pricing-catalog
  mapping. It is normalized to uppercase for the `acculynx_unit` reference.
- Each job receives one aggregate daily log dated to its latest milestone in
  `America/Los_Angeles`. The narrative preserves every milestone's full UTC
  timestamp and chronological order. `notify` is `false`; no assignees, users,
  memberships, or invitations are present.

## Verdict

**STAGED.** Live verification found 26 `documents` rows and 25 `daily_logs`
rows, all with `status='staged'`, the required execution bands, and valid job
references. This compiler deleted and replaced only prior staged rows in its two
assigned domains. No external source or JobTread API was called.
