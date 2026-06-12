# DB-2026-06-12-PRICE-FOUNDATION Round 3 Migration Quality Report

**Date:** 2026-06-12  
**Scope:** ABC Supply pricing foundation migration quality, additive compatibility, quarantine strategy, and branch-readiness gates.  
**Production posture:** Supabase read-only analysis only. No production writes. No Supabase branch created.  
**Playground evidence:** Ghost database `price-foundation-r3-20260612-codex` (`hflxxqjk6b`) and Dolt branch `round3-migration-quality`.  

## Decision

**Do not create a Supabase branch yet.**

The migration data-quality problem is solvable, but only with a quarantine-first migration strategy. The current data can preserve 100% of structurally valid `abc_price_list_items` rows into the existing `price_agreement_items` shape, but it cannot produce 95% clean product-resolved reusable pricing from the current fields alone.

The correct next step is a phase-1 additive migration design with source-reference sidecars, SKU/product review queues, branch review queues, and strict reusable-pricing filters.

## Mandatory Requirement Status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Data Quality & Completeness | Partial | 1,067/1,067 rows are row-preservable because `agreement_id` and `unit_price` are present. Only 459/1,067 match existing `products` by SKU. ABC catalog-backed product-shell creation raises product-resolved coverage to 603/1,067. Exact description fallback raises the ceiling only to 614/1,067. |
| Additive Migration Strategy | Pass | Ghost proof created current-table facsimiles first, then added only compatible columns and sidecar tables. No drop/rebuild path is required. |
| Project-Specific Agreement Handling | Partial | No real project/job/one-off/custom/special candidates were found. Synthetic project-specific agreement was constrained, labeled, and excluded from reusable view and matrix. |
| Migration Safety & Auditability | Pass | Every migrated/quarantined sample row has `source_table`, `source_pk`, and `source_hash`; review queue rollback test passed. |
| Trade-off Documentation | Pass | Trade-offs were recorded in Ghost validation and Dolt table `round3_tradeoffs`. |

## Data Mapping Gap Breakdown

| Category | Rows | Percent | Interpretation |
| --- | ---: | ---: | --- |
| Total `abc_price_list_items` | 1,067 | 100.00% | Source count analyzed read-only in Supabase. |
| Row-preservable into `price_agreement_items` shape | 1,067 | 100.00% | Existing target permits raw item fields, nullable `product_id`, `needs_review`, and approval state. |
| Exact existing product SKU match | 459 | 43.02% | Direct canonical path. |
| ABC catalog SKU match total | 603 | 56.51% | Product-resolved after additive product-shell creation from `abc_product_catalog`. |
| Catalog match needing product shell | 144 | 13.50% | Safe to queue for product-shell creation and review. |
| Missing item number | 233 | 21.84% | Description exists, but SKU identity is not reliable enough for automatic reusable pricing. |
| SKU not in ABC catalog or existing products | 231 | 21.65% | Requires vendor/catalog reconciliation. |
| Exact description fallback matched catalog | 22 | 2.06% | Too weak for trusted automatic resolution. |
| SKU or description catalog match | 614 | 57.54% | Best observed product-resolution ceiling from exact rules. |
| Pending approval rows | 1,021 | 95.69% | Preserve rows, but exclude from trusted reusable pricing until approved. |
| Approved existing-product candidates | 37 | 3.47% | Immediately trusted reusable price-item candidates under strict criteria. |
| Bad branch refs in agreement matches | 40 | 4.51% | 6 distinct branch refs require review. |
| Bad branch refs in ABC observations | 288 | 3.18% | 4 distinct branch refs require review. |
| Real project-specific agreement candidates | 0 | 0.00% | Synthetic proof used for one-off isolation. |

## Quarantine And Review Table Designs

### `price_foundation_migration_runs`

Tracks each migration run and stores aggregate source evidence without copying raw exports into committed artifacts.

```sql
id uuid primary key,
migration_key text unique not null,
source_system text not null default 'abc_supply',
started_at timestamptz not null default now(),
completed_at timestamptz,
status text not null,
real_source_metrics jsonb not null default '{}',
notes text
```

### `price_foundation_source_refs`

Audit and rollback sidecar for every migrated or quarantined source row.

```sql
id uuid primary key,
run_id uuid not null references price_foundation_migration_runs(id),
source_table text not null,
source_pk text not null,
source_hash text not null,
target_table text,
target_pk uuid,
migration_status text not null,
match_type text,
confidence smallint,
review_queue text,
created_at timestamptz not null default now(),
unique (run_id, source_table, source_pk)
```

### `price_foundation_sku_review_queue`

Dedicated queue for missing item numbers, ABC catalog-only SKUs, and SKUs not found in catalog/products.

```sql
id uuid primary key,
run_id uuid not null references price_foundation_migration_runs(id),
source_table text not null default 'abc_price_list_items',
source_pk text not null,
problem_category text not null,
raw_item_number text,
raw_description text,
raw_description_normalized text,
candidate_product_id uuid references products(id),
proposed_resolution text,
resolution_status text not null default 'open',
reviewed_by text,
reviewed_at timestamptz,
created_at timestamptz not null default now(),
unique (run_id, source_table, source_pk, problem_category)
```

### `price_foundation_branch_review_queue`

Dedicated queue for unresolved branch references from agreement matches and observations.

```sql
id uuid primary key,
run_id uuid not null references price_foundation_migration_runs(id),
source_table text not null,
source_pk text not null,
problem_category text not null,
raw_branch_number text,
candidate_branch_id uuid references vendor_branches(id),
proposed_resolution text,
resolution_status text not null default 'open',
created_at timestamptz not null default now(),
unique (run_id, source_table, source_pk, problem_category)
```

### `price_foundation_business_rule_review_queue`

Queue for structurally valid rows blocked by trust/business rules such as pending approval.

```sql
id uuid primary key,
run_id uuid not null references price_foundation_migration_runs(id),
source_table text not null,
source_pk text not null,
problem_category text not null,
rule_name text not null,
proposed_resolution text,
resolution_status text not null default 'open',
created_at timestamptz not null default now(),
unique (run_id, source_table, source_pk, rule_name)
```

## Mapping And Cleansing Rules

| Rule | Action | Reusable pricing allowed immediately |
| --- | --- | --- |
| Existing product SKU match | Insert/update `price_agreement_items` with `product_id`, `match_type='existing_product_sku'`, confidence 100. | Yes, only when agreement is reusable, item is approved, and `needs_review=false`. |
| ABC catalog SKU match, no product | Create additive product shell from `abc_product_catalog`; insert item as review-gated. | No. Product owner/accounting review required first. |
| Missing item number | Insert item with `product_id=null`, raw description, `needs_review=true`; route to SKU queue. | No. Do not infer reusable SKU from description alone. |
| SKU absent from catalog/products | Preserve raw SKU, insert item as review-gated; route to SKU queue. | No. Vendor/catalog reconciliation required. |
| Pending approval | Preserve row and source ref; route to business-rule queue. | No. Approval workflow must complete. |
| Bad branch reference | Route to branch review queue; do not create canonical branch FK until reviewed. | No. |
| Project-specific/one-off agreement | Set `is_one_off=true`, `agreement_scope='project_specific'`, require `one_off_label`; reusable views and matrix filter `is_reusable`. | No. |

## Additive Migration Strategy

Phase 1 must coexist with current production tables:

- Keep existing `products`, `vendors`, `vendor_branches`, `price_agreements`, and `price_agreement_items`.
- Add only compatible columns to `price_agreements`:
  - `is_one_off boolean not null default false`
  - `one_off_label text`
  - `agreement_scope text not null default 'reusable'`
  - `is_reusable boolean generated always as (not is_one_off and agreement_scope = 'reusable') stored`
  - `source_abc_table text`
  - `source_abc_id text`
- Add sidecar review and source-reference tables under `price_foundation_*`.
- Use `price_agreement_items.needs_review`, `approval_status`, `raw_item_number`, and `raw_description` to preserve low-confidence rows without treating them as trusted pricing.
- Build reusable pricing views and `product_price_matrix` only from approved, non-review, non-one-off rows.

## Project-Specific Agreement Validation

Real-data scan found zero likely project-specific agreement candidates. Ghost validation used a representative synthetic agreement:

- `is_one_off=true`
- `agreement_scope='project_specific'`
- `one_off_label='Project-specific representative test'`

Validation results:

- One-off item count in reusable view: 0.
- One-off product count in `product_price_matrix`: 0.
- Unlabeled one-off insert was rejected by constraint.

## Ghost Validation Results

| Check | Result |
| --- | --- |
| All sample rows have source refs | Pass |
| SKU review queue routes sample failures | Pass |
| Branch review queue routes bad branch refs | Pass |
| Business-rule review queue routes pending approval | Pass |
| Reusable view excludes one-off item | Pass |
| Matrix excludes one-off item | Pass |
| Matrix includes trusted reusable item only | Pass |
| Review queue rollback preserves open status | Pass |
| One-off label constraint rejects unlabeled one-offs | Pass |

## Migration Approval Checklist

Decision: **Blocked for Supabase branch testing**.

| Gate | Name | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Data Integrity & Completeness | Fail | 95% clean product-resolved mapping is not achievable from current data; observed ceiling is 57.54% using exact SKU plus exact description fallback. |
| 2 | Constraint & Relationship Integrity | Blocked | Ghost representative constraints pass, but full migration SQL has not been run against a real Supabase branch/copy. |
| 3 | Core Query Performance | Pass | Round 2 showed active lookup p95 0.921ms and matrix read p95 0.140ms at 500k observations. |
| 4 | Scalability Validation | Blocked | 500k passed in Round 2; 1M to 5M branch/copy proof remains open. |
| 5 | Security & Access Control | Blocked | Ghost RLS passed in Round 2, but Supabase JWT/RLS branch proof remains missing. Hard blocker. |
| 6 | Migration Safety & Rollback | Pass | Ghost additive DDL and review-queue rollback tests passed. |
| 7 | Trade-off Acceptability | Blocked | Trade-offs documented, but human acceptance is still required. |
| 8 | Maintainability Score | Blocked | Proposed design is maintainable enough to continue, but human maintainability acceptance is required before promotion. |

## Trade-Off Register

| ID | Trade-off | Benefit | Risk | Decision |
| --- | --- | --- | --- | --- |
| T1 | Preserve every structurally valid price-list row, even with `product_id=null`. | Prevents data loss and preserves auditability. | Reusable pricing must filter review-gated rows strictly. | Accept. |
| T2 | Create additive product shells for ABC catalog matches not already in products. | Raises product-resolved rows from 459 to 603. | Product owner review required. | Accept, review-gated. |
| T3 | Reject description-only product resolution for reusable pricing. | Avoids false matches and pricing leakage. | Leaves many rows quarantined. | Accept. |
| T4 | Use sidecar migration tables instead of heavy first-phase table alteration. | Coexists with production tables. | Extra joins and table ownership. | Accept for phase 1. |
| T5 | Treat pending approval as business-rule quarantine. | Preserves rows without trusting them prematurely. | Only 37 rows are immediately trusted under strict criteria. | Accept. |
| T6 | Use synthetic one-off validation until real project rows exist. | Proves behavior now. | Real-data proof remains open. | Accept temporarily. |

## Recommendation

The migration data-quality issues are **solvable within acceptable risk** if the team accepts a quarantine-first migration. They are **not solvable as a clean 95% product-resolved automatic migration** from the current `abc_*` fields.

Do not move to Supabase branch testing until these blockers are cleared:

1. Human accepts the quarantine-first interpretation of completeness.
2. Draft migration SQL is written as additive DDL plus idempotent backfill.
3. Direct Postgres copy or Supabase branch proof is available.
4. Supabase JWT/RLS policies are validated on the branch.
5. Product-owner/accounting review workflow is defined for the 604+ review-gated rows.

