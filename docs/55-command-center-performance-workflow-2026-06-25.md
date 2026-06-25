# Command Center Performance Workflow - 2026-06-25

Status: active measurement note  
Target: p95 authenticated user action renders under 500ms; cold starts and unavoidable external waits are reported separately.

## Measurement Added

- `app/command-center/scripts/perf-smoke.mjs` fetches critical SSR routes and APIs, reports status, duration, payload bytes, and `server-timing`.
- `npm run perf:smoke` runs the smoke report. Use `COMMAND_CENTER_BASE_URL` to point at local preview/dev, `COMMAND_CENTER_PERF_WARMUP=1` to measure user-facing warm-cache navigation, and `COMMAND_CENTER_SERVICE_TOKEN` when an API route requires bearer auth.
- `npm run perf:warm` posts to `/api/performance/warm` and refreshes the in-process Command Center surface caches. It accepts `COMMAND_CENTER_SERVICE_TOKEN`, `AGENT_SERVICE_TOKEN`, or the first `AGENT_SERVICE_TOKENS=agent:token` entry.
- `npm run perf:cadence` reads `/api/performance/cadence` to inspect the first-party warm cadence state without exposing raw identities, secrets, or dynamic record IDs.
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
- Command Center caches warm on process boot, can be warmed manually through `/api/performance/warm`, and now reschedule from first-party human activity rather than third-party session replay.
- `/api/vendor-territories` now serves the warmed territory surface instead of rebuilding directly, and returns a compact map payload that omits heavy office boundary geometry and unused branch audit fields.
- Human WorkOS/local-operator page and API activity schedules an after-session warm once the app is idle; service/named-agent traffic is counted but does not move the human cadence.
- Daily warm time defaults to 5 AM local server time and shifts to one hour before the most commonly observed human usage hour. Configure with `COMMAND_CENTER_DAILY_WARM_HOUR`, `COMMAND_CENTER_HUMAN_SESSION_IDLE_MS`, and `COMMAND_CENTER_MIN_SCHEDULED_WARM_GAP_MS` if needed.

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
| `/api/vendor-territories` | 6ms | Warm cached compact payload, about 754KB locally after trimming boundary geometry and unused branch fields. |
| Invoice detail expand | 165-199ms | Lazy API payload about 2.4KB for sampled invoice `2001064636-001`. |

All smoke-set pages are under the 500ms warm-navigation target. Cold Supabase/view construction is still reported separately and should be fixed at the view/materialization layer rather than hidden.

## Supabase/View Notes

- `v_invoice_audit_invoice` is still too slow for cold page load even when selecting only summary columns. Next DB-side step: create a materialized or cache table for invoice summary rollups with office/branch grouping fields and refresh it after invoice imports/audit writes.
- `v_estimate_audit_*` paths are the largest remaining cold bottleneck and should be measured per underlying query before UI changes. The UI now benefits from a 5-minute loader cache, but the DB shape still needs work.
- `price-list/review` and `vendor-regions` are payload-heavy. Next step is to split list summaries from item/detail rows and avoid embedding megabyte JSON in SSR HTML.
- `api/vendor-territories` is now cached and compacted for the interactive map; future work can split branch popup contact/detail data behind an explicit click if mobile network timing still needs more margin.

## Policy/Security Result

- No third-party repo was installed as a global hook.
- No local MCP server config was added.
- No third-party local stdio/Node MCP was enabled.
- TruConversion was not installed for cache cadence; first-party WorkOS-resolved activity provides enough signal with lower egress/privacy risk.
- Existing secret variable references were not changed; no raw secret values were added.
