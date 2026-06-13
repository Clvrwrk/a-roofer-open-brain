# Round 4 Trade-off Register

## DB-2026-06-12-PRICE-FOUNDATION

| ID | Trade-off | Benefit | Cost / Risk | Decision |
| --- | --- | --- | --- | --- |
| R4-T1 | Use deterministic UUIDs derived from source keys for migrated rows and queue rows. | Makes scripts idempotent and safe to re-run in branch/staging. | Deterministic IDs are not security primitives and could collide in theory. | Accepted for migration identity only; documented helper is not for security. |
| R4-T2 | Add `source_hash` directly to review queues in addition to `price_foundation_source_refs`. | Review queues are auditable on their own and easier to inspect. | Slight duplication of hash data. | Accepted because auditability is a hard requirement. |
| R4-T3 | Do not auto-create product shells from `abc_product_catalog`. | Avoids invalid `products` rows where manufacturer/taxonomy ownership is missing. | More rows remain review-gated after backfill. | Accepted; product shell creation needs a separate reviewed script. |
| R4-T4 | Treat pending approvals as business-rule queue rows while still preserving target items. | Prevents data loss and blocks untrusted pricing from reusable paths. | Backfilled target table contains many review-gated rows. | Accepted; reusable view filters strictly. |
| R4-T5 | Use a single `source_refs` row per source record even when a row has multiple review categories. | Keeps source-reference uniqueness simple and idempotent. | Detailed multi-category review state lives in queue tables and `problem_categories`, not multiple source-ref rows. | Accepted; `problem_categories` array records all categories. |
| R4-T6 | Enable RLS on sidecar tables but do not define broad policies in these SQL artifacts. | Avoids accidental exposure through app APIs before branch-specific role design. | Review UI/API access will require policy work in branch testing. | Accepted; this round is migration artifact creation, not full RLS design. |
| R4-T7 | Use best-effort field matching to avoid duplicating existing `price_agreement_items` without source refs. | Reduces duplicate rows when prior manual/import rows already exist. | Cannot guarantee perfect de-duplication without historical source IDs. | Accepted; validation queries must inspect duplicate or unexpected counts. |
| R4-T8 | Complete artifact authoring before execution proof when Ghost/Dolt MCP calls were initially blocked, then rerun validation once MCP access was restored. | Preserved Round 4 momentum while still requiring executable proof before branch recommendation. | The initial artifact commit included one SQL ambiguity that only surfaced during Ghost execution. | Accepted; follow-up Ghost validation is now recorded in the README. |
| R4-T9 | Resolve item upsert IDs with a separate `resolved_target_item_id` alias instead of reusing `target_item_id`. | Preserves the source-derived target ID from classification while avoiding ambiguous column references in the upsert CTE. | Adds one extra internal alias to the migration query. | Accepted after Ghost execution found the ambiguity. |

## Recommendation

The Round 4 SQL artifacts are suitable for a controlled Supabase branch test. They are not production-approved until the branch run proves count reconciliation, queue integrity, RLS access policy behavior, and manual review workflow ownership.
