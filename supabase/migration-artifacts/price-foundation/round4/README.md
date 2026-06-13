# DB-2026-06-12-PRICE-FOUNDATION Round 4 SQL Artifacts

These files convert the Round 3 quarantine-first migration strategy into executable SQL for later Supabase branch or staging validation.

## Files

| File | Purpose |
| --- | --- |
| `001_phase1_sidecars.sql` | Creates additive one-off fields, sidecar tables, review queues, indexes, comments, helper UUID function, and a reusable-pricing view. |
| `002_phase1_backfill_and_quarantine.sql` | Idempotently backfills ABC agreements/items where possible, populates SKU/branch/business-rule queues, and records source refs. |
| `003_phase1_validation_queries.sql` | Read-only validation checks for count reconciliation, queue/source-ref integrity, reusable percentages, duplicates, and one-off exclusion. |
| `900_ghost_smoke_fixture.sql` | Ghost-only minimal schema/seed fixture for syntax and behavior smoke tests. Never run this in Supabase. |
| `TRADEOFF_REGISTER.md` | Round 4 decisions and compromises introduced by executable scripts. |

## Recommended Execution Order

For a Supabase branch or staging database that already has the real production schema and `abc_*` data:

1. Run `001_phase1_sidecars.sql`.
2. Run `002_phase1_backfill_and_quarantine.sql`.
3. Run `003_phase1_validation_queries.sql`.
4. Review all open rows in:
   - `price_foundation_sku_review_queue`
   - `price_foundation_branch_review_queue`
   - `price_foundation_business_rule_review_queue`
5. Re-run `003_phase1_validation_queries.sql` after manual review updates.

For a disposable empty Ghost database smoke test:

1. Run `900_ghost_smoke_fixture.sql`.
2. Run `001_phase1_sidecars.sql`.
3. Run `002_phase1_backfill_and_quarantine.sql`.
4. Run `003_phase1_validation_queries.sql`.

## Idempotence

All production-intended scripts are designed to be safe to re-run:

- `001_phase1_sidecars.sql` uses `create table if not exists`, `create index if not exists`, and guarded `alter table` blocks.
- `002_phase1_backfill_and_quarantine.sql` uses deterministic UUIDs and `on conflict` upserts.
- `003_phase1_validation_queries.sql` is read-only.

The default migration key is:

```text
phase1-abc-price-foundation
```

If a branch test needs multiple independent runs in the same database, copy the scripts and replace that key consistently before execution.

## Manual Review Still Required

These scripts intentionally do not treat all migrated rows as reusable pricing.

Manual or agent-assisted review is still required for:

- Missing item numbers.
- SKUs that exist in ABC catalog but not canonical `products`.
- SKUs absent from both `products` and `abc_product_catalog`.
- Bad branch references from agreement matches or observations.
- Pending approval rows.
- Product shell creation, because production `products` requires owner-reviewed manufacturer/taxonomy fields.

## Known Limitations

- The scripts do not create Supabase RLS policies for the new sidecar tables. They enable RLS on those tables, leaving policy design for branch testing.
- Product shells are not automatically inserted into `products`.
- Description-only product matching is intentionally not trusted for reusable pricing.
- Existing historical `price_agreement_items` that lack source refs can only be de-duplicated by best-effort field matching.
- Supabase branch testing is still required before any production migration.

## Branch-Readiness Recommendation

These artifacts are ready for **controlled Supabase branch testing**, not production.

Before branch testing, confirm:

- The target branch has current `abc_*` tables and canonical pricing tables.
- An ABC Supply vendor row exists in `vendors`.
- A human accepts quarantine-first completeness, meaning row preservation plus review queues is acceptable even though automatic product resolution does not reach 95%.

## Validation Status From Round 4 Authoring

This Codex run completed local static artifact checks and follow-up execution
validation in a disposable Ghost Postgres database.

Execution validation database:

```text
price-foundation-r4-validation-20260613-codex (unwc10myfx)
```

Validated execution order:

1. `900_ghost_smoke_fixture.sql`
2. `001_phase1_sidecars.sql`
3. `002_phase1_backfill_and_quarantine.sql`
4. `003_phase1_validation_queries.sql`
5. Re-run `001_phase1_sidecars.sql`
6. Re-run `002_phase1_backfill_and_quarantine.sql`
7. Re-run `003_phase1_validation_queries.sql`

Execution evidence:

- `001_phase1_sidecars.sql` passed initial execution and re-run.
- `002_phase1_backfill_and_quarantine.sql` passed after fixing an ambiguous `target_item_id` alias in the item upsert CTE; re-run also passed.
- `003_phase1_validation_queries.sql` passed after initial execution and after re-run.
- Final validation checks showed `5 / 5` `abc_price_list_items` source refs reconciled, `0` review queue source-ref orphans, `0` source-hash mismatches, `0` duplicate source refs, and `0` one-off rows leaking into the reusable view.

Final Ghost fixture counts after the idempotence re-run:

| Surface | Rows |
| --- | ---: |
| `price_agreements` | 2 |
| `price_agreement_items` | 5 |
| `price_foundation_source_refs` | 9 |
| `price_foundation_sku_review_queue` | 3 |
| `price_foundation_branch_review_queue` | 2 |
| `price_foundation_business_rule_review_queue` | 3 |
| `v_price_foundation_reusable_price_agreement_items` | 1 |

Static checks:

- All required files are present.
- Scripts contain no `drop table`, `drop column`, destructive canonical-table `delete`, or destructive canonical-table `truncate` statements.
- Sidecar/review tables include `source_table`, `source_pk`, and `source_hash`.
- Backfill logic uses `on conflict` upserts and deterministic IDs.
