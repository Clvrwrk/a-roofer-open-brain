# Command Center Performance Workflow - 2026-06-25

Status: active measurement note  
Target: p95 authenticated user action renders under 500ms; cold starts and unavoidable external waits are reported separately.

## Measurement Added

- `app/command-center/scripts/perf-smoke.mjs` fetches critical SSR routes and APIs, reports status, duration, payload bytes, and `server-timing`.
- `npm run perf:smoke` runs the smoke report. Use `COMMAND_CENTER_BASE_URL` to point at local preview/dev and `COMMAND_CENTER_SERVICE_TOKEN` when an API route requires bearer auth.
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

Environment: local dev server on `http://127.0.0.1:4324`, sourced from the existing root `.env`, production Supabase-backed data.

| Surface | Timing | Notes |
| --- | ---: | --- |
| `/` | 107ms | Map shell-first SSR. Live territory API measured separately at 240ms. |
| `/accounting/invoice-audit` warm | 10ms | Server timing: `invoice_audit_summary;dur=0.1`; initial payload 592,537 bytes. |
| Invoice detail expand | 165-199ms | Lazy API payload about 2.4KB for sampled invoice `2001064636-001`. |
| `/weekly-snapshot` | 46ms | Under budget. |
| `/api/vendor-territories` | 240ms | Under budget, but payload is 1.6MB and should be compacted next. |
| `/accounting/price-list/review` | 859ms | Over budget; likely loader/payload issue. |
| `/operations/order-audit` | 1,025ms | Over budget; needs summary-first or cache strategy. |
| `/operations/estimate-audit` | 7,445ms | Highest remaining route bottleneck; loader/view work required. |
| `/accounting/vendor-regions` | 2,088ms | Over budget; likely territory/coverage view fan-out. |

Cold Invoice Audit summary still measured at 3.7-6.1s against the current Supabase view. The warm route is fast because it hits the in-process summary cache; this is a mitigation, not the database fix.

## Supabase/View Notes

- `v_invoice_audit_invoice` is still too slow for cold page load even when selecting only summary columns. Next DB-side step: create a materialized or cache table for invoice summary rollups with office/branch grouping fields and refresh it after invoice imports/audit writes.
- `v_estimate_audit_*` paths are the largest remaining bottleneck and should be measured per underlying query before UI changes. The UI likely needs the same summary-first pattern as Invoice Audit.
- `price-list/review` and `vendor-regions` are payload-heavy. Next step is to split list summaries from item/detail rows and avoid embedding megabyte JSON in SSR HTML.
- `api/vendor-territories` is fast enough but returns 1.6MB; compacting map payload fields will help mobile and repeated map interactions.

## Policy/Security Result

- No third-party repo was installed as a global hook.
- No local MCP server config was added.
- No third-party local stdio/Node MCP was enabled.
- Existing secret variable references were not changed; no raw secret values were added.
