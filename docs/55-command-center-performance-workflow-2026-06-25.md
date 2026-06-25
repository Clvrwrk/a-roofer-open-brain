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
- Browser navigation now uses a same-origin service worker plus AppShell prefetch so previously loaded Command Center pages are served immediately from the user-specific browser cache while the network refresh updates behind the scenes.
- The browser cache now stores the last complete rendered page, not merely the latest server HTML. AppShell snapshots the current DOM after load, user interactions, and lazy-detail renders; the service worker rejects incomplete fallback states such as "Supabase pending", "No invoices found", loading messages, WorkOS login pages, or map failure screens so they cannot overwrite a useful view.
- Invoice Audit keeps its lazy-loaded invoice-line payload in sync with the embedded page JSON and prefetches likely sibling invoice details after office/branch/invoice expansion. A user should see the last full tree they were working in immediately, while detail APIs warm slightly ahead of the next nested click.
- Invoice Audit empty/pending summaries are no longer retained as valid server-cache entries. If the browser lands on an all-zero/pending Invoice Audit screen, the page performs one forced live refresh using a query-string cache bypass, updates the canonical service-worker cache when live rows return, and removes the refresh parameter from the URL.
- Invoice detail prefetch is capped and staggered so background warming does not compete with the invoice detail the human just opened.
- `/api/vendor-territories` now serves the warmed territory surface instead of rebuilding directly, and returns a compact map payload that omits heavy office boundary geometry and unused branch audit fields.
- Human WorkOS/local-operator page and API activity schedules an after-session warm once the app is idle; service/named-agent traffic is counted but does not move the human cadence.
- Expired server-side surface caches now serve stale data for up to the daily warm window while refreshing in the background, so an expired in-memory cache should not make the human click wait on Supabase.
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

## Latest Cache Regression Check

Environment: local dev server on `http://127.0.0.1:4331`, sourced from the root `.env`. Commands: `npm run build`; `COMMAND_CENTER_BASE_URL=http://127.0.0.1:4331 npm run perf:warm`; `COMMAND_CENTER_BASE_URL=http://127.0.0.1:4331 PERF_SMOKE_FAIL=1 npm run perf:smoke`; fetched `/sw.js` and syntax-checked it with `new Function(...)`.

Smoke result after the warm job:

| Surface | Timing | Notes |
| --- | ---: | --- |
| `/` | 25ms | Under user-click budget. |
| `/accounting/invoice-audit` | 9ms | Empty/pending local data state was present but is now non-cacheable. |
| `/accounting/price-list/review` | 31ms | Under user-click budget; still a large HTML payload. |
| `/operations/order-audit` | 7ms | Under user-click budget. |
| `/operations/estimate-audit` | 5ms | Under user-click budget. |
| `/weekly-snapshot` | 8ms | Under user-click budget. |
| `/accounting/vendor-regions` | 16ms | Under user-click budget. |
| `/api/vendor-territories` | 6ms | Warm cached compact payload. |

The warm job itself took about 18s locally because it refreshes slow Supabase-backed surfaces in the background. That cost is intentionally moved off the user's navigation path.

Follow-up fix after live QA: forced Invoice Audit refresh on local Supabase-backed data returned `Supabase live`, 14 offices, and 975 open invoices. Browser QA opened the first office, branch, and invoice via chevrons; the detail body rendered 3 line rows, 2 category groups, no stuck loading state, no failed-detail message, and no console errors.

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
- Browser cache entries are scoped by resolved actor id and cleared on logout; `/auth/*` and login redirects are not cached.
- Incomplete SSR results are explicitly blocked from the browser page cache, so a transient empty/pending render should not replace the user's last complete working screen.
- Supabase query errors in Invoice Audit pagination now throw instead of silently becoming empty arrays; empty dashboards should be treated as a real failure state, not cached as successful data.
