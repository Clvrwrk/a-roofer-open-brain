# DB-2026-06-12-PRICE-FOUNDATION Phase 1 Supabase Branch Run

**Date:** 2026-06-13  
**Branch test:** `price-foundation-phase1-20260613`  
**Parent project ref:** `rnhmvcpsvtqjlffpsayu`  
**Branch project ref:** `qfsnllcejcnvjooovdfn`  
**Data policy used:** data-less preview branch  
**Verdict:** Retest required; branch migration replay failed before Round 4 artifacts could be applied.

## Human Acceptance Recorded

The human accepted:

- Quarantine-first migration strategy.
- Agent ownership of review queues.
- No automatic product shell creation from ABC catalog data.
- Supabase branch testing for project `rnhmvcpsvtqjlffpsayu`.

The production-data-copy choice was left ambiguous because the approval sentence retained both options joined by `OR`. The first branch attempt therefore used the safer default: data-less preview branch.

## Phase 0 Result

The Supabase branch was created successfully, but branch setup did not reach a usable migration state.

| Check | Result |
| --- | --- |
| Branch created | Pass |
| Branch reachable | Pass |
| Branch status | Fail: `MIGRATIONS_FAILED` |
| Preview project status | Pass: `ACTIVE_HEALTHY` |
| Data copied from production | No |

## Migration Replay Boundary

The branch migration history stopped at:

```text
20260420200455 add_fk_index_call_interactions_lead_list_id
```

The parent production project has many later migrations, including the ABC/pricing migrations required for this work. Because the branch migration replay stopped early, the branch did not contain the required source or canonical pricing tables.

## Schema Prerequisite Check

The following `to_regclass` checks returned `null` on the branch:

- `public.abc_product_catalog`
- `public.abc_vendor_branches`
- `public.abc_price_agreements`
- `public.abc_price_list_items`
- `public.abc_price_agreement_branch_matches`
- `public.abc_price_observations`
- `public.product_vendor_price_observations`
- `public.products`
- `public.vendors`
- `public.vendor_branches`
- `public.price_agreements`
- `public.price_agreement_items`
- `public.product_price_matrix`

## Artifact Execution Result

The Round 4 artifacts were not applied to the Supabase branch:

1. `001_phase1_sidecars.sql`
2. `002_phase1_backfill_and_quarantine.sql`
3. `003_phase1_validation_queries.sql`

Reason: prerequisite canonical and `abc_*` tables were absent because branch migration replay failed.

## Proof Record

Database Playground proof record:

```text
/Users/chussey/.database-playground/supabase-proofs/DB-2026-06-12-PRICE-FOUNDATION-phase1-supabase-branch-smoke-retest-2026-06-13T02-42-35-750Z.json
```

## Decision

The Round 4 SQL artifacts remain Ghost-validated and branch-ready, but this specific Supabase branch run is not valid evidence for real branch execution.

Do not use this failed data-less branch to make production decisions.

## Retest Options

1. Repair parent migration replay so a data-less branch can apply all migrations through the ABC/pricing layer.
2. Create a new branch with an explicitly approved production data copy.
3. Create a bounded seeded branch/copy that includes only the required canonical pricing and `abc_*` tables.

## Required Approval Before Production Data Copy

Use an explicit selection before creating a branch with production data:

```text
I approve creating a Supabase branch for rnhmvcpsvtqjlffpsayu with production data copy for DB-2026-06-12-PRICE-FOUNDATION Phase 1 testing.
```

Without that explicit approval, continue using data-less or bounded seeded branch testing only.
