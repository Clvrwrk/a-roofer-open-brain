# 38 — Price Foundation Migration Review Dashboard

Command Center surface under **Data Quality → Price Foundation** that makes the
Phase 1 price-foundation migration operational and reviewable: it surfaces
review-gated records so a human (and, later, the Supabase Superagent) can resolve,
reject, or defer them before they reach reusable pricing.

Status: **MVP built 2026-06-13.** Read surface + write actions live.

## Model

```
 abc_price_list_items (1067)            abc_price_agreement_branch_matches (887)
         │  derived live (no copy)                  │  derived live
         ▼                                          ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  Exclusive trust partition over the 1067 source records:      │
 │   • Immediately reusable  46  (approved · has_sku · item#)     │
 │   • SKU Review Queue      233  (no catalog SKU identity)       │
 │   • Business Rule Queue   788  (has identity, pending approval)│
 │  Orthogonal dimension:                                         │
 │   • Branch Review Queue    56  (match_type=generated_api_new)  │
 └──────────────────────────────────────────────────────────────┘
         │  LEFT JOIN on review_key
         ▼
 price_foundation_review_actions   ← resolution overlay (this migration)
         │
         ▼
 Overview page  +  Queues working screen  →  /api/.../review  →  dashboard_action_log
```

The three queues are **derived live** from source tables on every request; the
source rows stay canonical. Only the human/agent *resolution state* is persisted,
in an additive overlay keyed by a deterministic `review_key`
(`{queue}:{source_table}:{source_pk}`). The wireframe numbers in the original spec
(37/604/426) were illustrative; the dashboard shows the real derived partition
(46/233/788, branch 56).

### Queue derivation rules (single source of truth: `src/lib/price-foundation.ts`)

| Queue | Source | Rule | Problem category |
|-------|--------|------|------------------|
| SKU Review | `abc_price_list_items` | `has_sku = false` | `missing_item_number` / `sku_not_in_catalog` |
| Business Rule | `abc_price_list_items` | `has_sku = true AND approval_status <> 'approved'` | `pending_approval` |
| Branch Review | `abc_price_agreement_branch_matches` | `match_type = 'generated_api_new'` | `unverified_branch_match` |
| Immediately reusable (card) | `abc_price_list_items` | `has_sku AND item_number present AND approval_status = 'approved'` | — |

SKU + Business Rule + Reusable partition the 1067 source rows exactly (no overlap).
The card partition is exclusive; the queue tabs are diagnostic lenses and may overlap.

## Schema (additive, reversible)

`schemas/cleverwork-roofer/81-price-foundation-review.sql` — applied as migration
`price_foundation_review_actions_overlay`.

```
price_foundation_review_actions
  review_key (unique)  queue_type  source_table  source_pk  problem_category
  resolution_status (open|resolved|rejected|deferred)  resolution  note  defer_until
  proposed_by_agent (reserved for Phase 2)  reviewed_by  reviewed_at  action_log_id → dashboard_action_log
```

RLS enabled, service-role-only, mirrors `80-command-center-workflows.sql`. No source
table was modified; nothing is deleted on resolve (status overlay only).

## Routes & files

| Path | File |
|------|------|
| `/data-quality` → redirect | `src/pages/data-quality/index.astro` |
| `/data-quality/price-foundation` (Overview) | `src/pages/data-quality/price-foundation/index.astro` |
| `/data-quality/price-foundation/queues` (working screen) | `src/pages/data-quality/price-foundation/queues.astro` |
| `POST /api/data-quality/price-foundation/review` | `src/pages/api/data-quality/price-foundation/review.ts` |
| Surface/derivation lib | `src/lib/price-foundation.ts` |
| Client scripts | `src/scripts/price-foundation-overview.ts`, `price-foundation-queues.ts` |
| Stat card | `src/components/data-quality/PfStatCard.astro` |
| Nav + styles | `src/layouts/AppShell.astro`, `src/styles/global.css` (Data Quality block) |

**Refresh data** re-runs the SSR loaders (live source queries). Detail tables hydrate
a window of 150 rows per queue and filter client-side; summary counts use exact totals,
and the table footer shows "showing N of TOTAL" so the cap is never silent.

## Auth

Matches the existing Command Center: local-actor in dev, WorkOS when
`COMMAND_CENTER_AUTH_MODE=workos`. Resolve/reject/defer requires `approval.decide`
plus access to `accounting` or `system` — Owner/Accounting edit; Auditor/Viewer are
read-only (action buttons hidden, server re-checks 403). Every action writes an
immutable `dashboard_action_log` row (`workflow=price-foundation-review`) and upserts
the overlay (latest decision wins).

## Roadmap (per original spec)

- **Phase 2** — agent-proposed resolutions: set `proposed_by_agent=true`, surface
  suggestions for human confirm. Column already present.
- **Phase 3** — notifications (queue growth, aging), bulk actions (checkbox column
  stubbed in markup).
- **Phase 4** — autonomous low-risk resolution by the Superagent with oversight.

## Open items

- `is_one_off` / `is_reusable` are **not modeled** on `price_agreements`. Reusable-
  pricing health approximates leakage as approved-but-still-flagged (`approval_status
  = 'approved' AND needs_review = true`, must be 0). Add the columns to make it exact.
- RLS policies tied to WorkOS roles deferred until WorkOS env vars are live (service
  role only today).
- Branch queue currently keys off `generated_api_new`; revisit if a confidence
  threshold or an `abc_price_observations` bad-branch signal proves better.
