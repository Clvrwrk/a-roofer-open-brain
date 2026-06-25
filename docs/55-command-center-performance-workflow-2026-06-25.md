# Command Center Performance Workflow - 2026-06-25

Status: active measurement note  
Target: p95 authenticated user action renders under 500ms; cold starts and unavoidable external waits are reported separately.

## Measurement Added

- `app/command-center/scripts/perf-smoke.mjs` fetches critical SSR routes and APIs, reports status, duration, payload bytes, and `server-timing`.
- `npm run perf:smoke` runs the smoke report. Use `COMMAND_CENTER_BASE_URL` to point at local preview/dev, `COMMAND_CENTER_PERF_WARMUP=1` to measure user-facing warm-cache navigation, and `COMMAND_CENTER_SERVICE_TOKEN` when an API route requires bearer auth.
- `@lib/perf` provides shared `timeAsync`, payload byte counts, `server-timing`, and optional `COMMAND_CENTER_PERF_LOG=1` server logs.

Critical routes in the smoke set:

- `/`
- `/accounting/invoice-audit`
- `/accounting/price-list/review`
- `/operations/order-audit`
- `/operations/estimate-audit`
- `/weekly-snapshot`
- `/accounting/vendor-regions`
- `/api/vendor-territories`

## Changes Implemented

- Territory map home renders a shell first and loads live territory data through `/api/vendor-territories` after first paint.
- Invoice Audit now uses a summary loader for the page and a lazy single-invoice detail API at `/api/invoice-audit/invoice?invoiceNumber=...`.
- Invoice Audit summary responses are cached in-process for 5 minutes; full audit detail remains bounded to one invoice.
- Invoice expand detail no longer blocks on ABC API price/UOM enrichment; it returns negotiated/unit/variance audit detail first.

## Latest Local Timing Snapshot

Environment: local dev server on `http://127.0.0.1:4324`, sourced from the existing root `.env`, production Supabase-backed data. Command: `COMMAND_CENTER_PERF_WARMUP=1 COMMAND_CENTER_BASE_URL=http://127.0.0.1:4324 npm run perf:smoke`.

| Surface | Timing | Notes |
| --- | ---: | --- |
| `/` | 13ms | Map shell-first SSR. |
| `/accounting/invoice-audit` | 14ms | Warm summary cache; cold Supabase view remains a separate DB optimization target. |
| `/accounting/price-list/review` | 24ms | Warm hierarchy cache. |
| `/operations/order-audit` | 6ms | Warm active-order summary cache; order lines remain lazy per order. |
| `/operations/estimate-audit` | 5ms | Warm estimate audit cache. |
| `/weekly-snapshot` | 6ms | Under budget. |
| `/accounting/vendor-regions` | 13ms | Warm territory + price-list coverage cache. |
| `/api/vendor-territories` | 171ms | Under budget, but payload is 1.6MB and should be compacted next. |
| Invoice detail expand | 165-199ms | Lazy API payload about 2.4KB for sampled invoice `2001064636-001`. |

All smoke-set pages are under the 500ms warm-navigation target. Cold Supabase/view construction is still reported separately and should be fixed at the view/materialization layer rather than hidden.

## Supabase/View Notes

- `v_invoice_audit_invoice` is still too slow for cold page load even when selecting only summary columns. Next DB-side step: create a materialized or cache table for invoice summary rollups with office/branch grouping fields and refresh it after invoice imports/audit writes.
- `v_estimate_audit_*` paths are the largest remaining cold bottleneck and should be measured per underlying query before UI changes. The UI now benefits from a 5-minute loader cache, but the DB shape still needs work.
- `price-list/review` and `vendor-regions` are payload-heavy. Next step is to split list summaries from item/detail rows and avoid embedding megabyte JSON in SSR HTML.
- `api/vendor-territories` is fast enough but returns 1.6MB; compacting map payload fields will help mobile and repeated map interactions.

## Policy/Security Result

- No third-party repo was installed as a global hook.
- No local MCP server config was added.
- No third-party local stdio/Node MCP was enabled.
- Existing secret variable references were not changed; no raw secret values were added.
