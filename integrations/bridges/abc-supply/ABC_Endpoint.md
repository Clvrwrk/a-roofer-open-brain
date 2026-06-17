# ABC Supply Production Endpoint Audit

Status: production read audit completed  
Environment: `ABC_SUPPLY_ENV=Production`  
Harness: [`production-sync.mjs`](production-sync.mjs)  
Docs:

- Integration track: https://apidocs.abcsupply.com/individual-business-integration-track/
- Authorization: https://apidocs.abcsupply.com/authorization-methods/
- API endpoint inventory: https://apidocs.abcsupply.com/api-endpoints/

## Executive Answer

ABC Supply's production API can support the Open Brain supplier goals for account access, branch
locations, product catalog, product hierarchy, branch availability, customer-specific pricing,
orders, invoices, contacts, and webhook-driven order/invoice events.

Important limits:

- Product availability is not inventory. ABC documents it as the ability to purchase an item at a
  branch, not on-hand stock.
- Pricing is not a bulk price-list export. `POST /api/pricing/v2/prices` must be called with a
  Ship-To account, branch, item, quantity, and optional UOM.
- The pricing response supports UOM-aware line pricing, but the tested response did not expose a
  stable price-effective-date field. Store `observed_at` and any response date fields when present.
- UOM conversion must be derived from Product API fields (`uoms`, `weights`, `dimensions`) plus
  Pricing API line fields. There is no documented standalone UOM conversion endpoint.
- Write endpoints remain disabled until explicit human approval: order placement, favorite writes,
  webhook register/update/delete. Invoice PDF is also disabled pending storage/PII handling.

## Supabase Actions Taken

The existing `abc_regions` and `abc_vendor_branches` tables already had foreign-key dependents, so
they were not dropped. Instead, the production mirror was applied additively:

- Created `abc_product_catalog` for the Product API catalog mirror.
- Created RLS-enabled ABC mirror tables for endpoint/run logs, Ship-To branch access, contacts,
  pricing observations, UOM evidence, orders, invoices, product hierarchy/availability/images,
  account product signals, webhook configs/events, and order/invoice webhook events.
- Added API mirror columns to `abc_vendor_branches`.
- Added API mirror columns to `abc_regions`.
- Created backup snapshots before altering existing ABC tables:
  `_backup_abc_regions_20260605` and `_backup_abc_vendor_branches_20260605`.

Exact verified table coverage after production sync:

| Table | Verified rows | API-backed rows | Notes |
| --- | ---: | ---: | --- |
| `abc_product_catalog` | 331,249 | 331,249 | 331,251 item records fetched; 331,249 distinct `item_number` rows stored after upsert. |
| `abc_vendor_branches` | 713 | 696 | 696 production branches from Location API; existing curated rows preserved. |
| `abc_regions` | 40 | 32 | 28 Ship-To, 2 Bill-To, 2 Sold-To production account rows; existing region rows preserved. |

## Production Run Evidence

| Run | Output | Result |
| --- | --- | --- |
| Controlled table validation | `.production-runs/2026-06-05T15-38-27-091Z.json` | Accounts, branches, catalog page 1, and broad endpoint audit. 53 requests, 0 rate limits. |
| Full catalog pages 1-283 | `.production-runs/2026-06-05T15-40-15-518Z.json` | 283,000 rows upserted; page 284 hit transient ABC 500; 0 rate limits. |
| Full catalog resume pages 284-332 | `.production-runs/2026-06-05T16-45-23-234Z.json` | 48,251 rows upserted; catalog completed; 0 rate limits. |
| Full account sync | `.production-runs/2026-06-05T16-57-04-396Z.json` | 32 accounts and 32 details upserted; 35 requests; 0 rate limits. |
| Full branch sync | `.production-runs/2026-06-05T16-57-46-911Z.json` | 696 branch details upserted; 747 requests; AK/DC returned 404/no branches; 0 rate limits. |
| Final endpoint audit | `.production-runs/2026-06-05T17-12-54-253Z.json` | Pricing passed with line status `OK`; 54 requests; 0 rate limits. One transient Bill-To search 500, two non-sellable contact candidates before contacts success, no registered webhook. |
| Orders/invoices mirror backfill | `.mirror-runs/2026-06-05T20-46-13-468Z.json` | 27 order-history windows and 54 invoice-history windows from 2000-01-01 through 2026-06-05; 3,146 orders, 18,391 order lines, 3,111 shipments, 520 invoices, and 2,462 invoice lines stored; 114 requests; 0 rate limits. |
| Pricing/branch/contact mirror backfill | `.mirror-runs/2026-06-05T20-49-09-601Z.json` | 887 Ship-To/branch access rows, 20 contacts, 887 price-agreement matches, 9,048 pricing observations from this run, and 444,849 pricing lines stored; 10,700 endpoint requests; 0 rate limits. |

Observed rate-limit responses across these production runs: `0`.

## Mirror Backfill Completion

`mirror-backfill.mjs` was added as the durable read-only mirror harness. It keeps order writes,
favorite writes, webhook writes, and invoice PDF reads disabled unless explicitly approved.

Verified aggregate Supabase coverage after the full production backfill:

| Mirror surface | Verified rows | Notes |
| --- | ---: | --- |
| `abc_ship_to_branch_access` | 887 | 168 distinct ABC branch numbers across Ship-To branch access. |
| `abc_ship_to_contacts` | 20 | 22 of 28 Ship-To contact lookups passed; 6 non-sellable accounts returned 403. |
| `abc_price_agreement_branch_matches` | 887 | Existing branch/region agreements matched where possible; generated `api-current` agreement shells fill gaps. |
| `abc_price_agreements` (`api-current`) | 92 | 56 generated by the full pricing backfill; total includes earlier generated shells. |
| `abc_price_observations` | 9,049 | Includes the full pricing run plus the earlier constrained smoke observation. |
| `abc_price_observation_lines` | 444,851 | 160,412 `OK` lines and 284,439 non-OK line statuses. |
| `abc_order_history` / `abc_orders` | 3,146 / 3,146 | Backfilled as far as the yearly API windows returned data from 2000-01-01 through 2026-06-05. |
| `abc_order_lines` / `abc_order_shipments` | 18,391 / 3,111 | Details matched to existing orders or created as new ABC order records. |
| `abc_invoice_history` / `abc_invoices` | 520 / 520 | Backfilled through both Bill-To accounts as far as the yearly API windows returned data. |
| `abc_invoice_lines` | 2,462 | JSON invoice detail lines only; PDF read remains disabled. |
| `abc_invoice_matches` / `abc_order_invoice_matches` | 931 / 520 | Matched existing invoice documents/line items and order-to-invoice history links. |
| `abc_endpoint_access_log` | 10,815 | Endpoint call log, including recovered retry attempts and denied/non-sellable account responses. |

Pricing caveats from production:

- ABC does not expose a bulk price-list export. The mirror uses `POST /api/pricing/v2/prices` for
  each Ship-To/branch pair and item chunk.
- The full pricing matrix was 887 Ship-To/branch pairs x 591 item-numbered agreement SKUs in 50-item
  batches, or 10,644 pricing requests.
- 9,048 pricing requests passed. 1,596 pricing requests returned HTTP 400 because six Ship-To
  accounts were invalid or not registered in the pricing system. These were stored as endpoint
  failures but not as pricing observations.
- The run saw `0` HTTP 429/rate-limit responses. Intermittent HTTP 500 responses were retried and
  recovered during the long pricing sweep.

## Endpoint Access Matrix

### Account API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `POST /api/account/v1/search/accounts` | Passed in full sync; one later transient 500 on Bill-To search | `abc_regions`, future `abc_account_search_runs` | Use retry/backoff. Search returned 28 Ship-To, 2 Bill-To, 2 Sold-To in the successful full run. |
| `GET /api/account/v1/soldtos/{soldToNumber}` | Passed | `abc_regions` | Stores raw detail plus account hierarchy fields. |
| `GET /api/account/v1/billtos/{billToNumber}` | Passed | `abc_regions` | Stores billing account linkage. |
| `GET /api/account/v1/shiptos/{shipToNumber}` | Passed | `abc_regions` | Stores Ship-To, sellability, branch access, contacts embedded in raw payload. |
| `GET /api/account/v1/shiptos/{shipToNumber}/contacts` | Passed on sellable accounts | `abc_ship_to_contacts` | 22 of 28 Ship-To lookups passed; six non-sellable accounts returned 403. |

### Location API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `GET /api/location/v1/branches?state={state}` | Passed for branch-bearing states | `abc_vendor_branches` | 51 state/DC searches attempted; AK/DC returned 404/no branches. |
| `GET /api/location/v1/branches/{branchNumber}` | Passed | `abc_vendor_branches` | 696 production branch details fetched and upserted. |

### Product API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `GET /api/product/v1/items` | Passed full crawl | `abc_product_catalog` | 332 pages, 331,251 item records fetched, 331,249 distinct item rows stored. |
| `GET /api/product/v1/items/{itemNumber}` | Passed | `abc_product_catalog`, future `abc_product_detail_snapshots` | Detail includes product attributes, weights, dimensions, and UOM fields. |
| `POST /api/product/v1/search/items` | Passed | Future `abc_product_search_results` | Useful for branch/product workflows; not a replacement for full catalog ingest. |
| `POST /api/product/v1/search/availability/items` | Passed | Future `abc_product_availability` | Availability means purchasable at branch, not stock count. |
| `GET /api/product/v1/availability/items/{itemNumber}/branches` | Passed | Future `abc_product_availability` | Returns available branches for an item. |
| `GET /api/product/v1/hierarchy` | Passed | Future `abc_product_hierarchy` | Final audit saw 9,026 hierarchy rows. |
| `GET /api/product/v1/items/{assetId}/images` | Passed | Future `abc_product_images` or storage metadata | Returned PNG image bytes; store metadata unless image storage is approved. |
| `GET /api/product/v1/items/{billToNumber}/recents` | Passed | Future `abc_recent_items` | Account-specific product signal. |
| `GET /api/product/v1/items/{billToNumber}/frequents` | Passed | Future `abc_frequent_items` | Account-specific product signal. |
| `GET /api/product/v1/items/{billToNumber}/favorites` | Passed | Future `abc_favorite_items` | Read only. |
| `PUT /api/product/v1/items/{billToNumber}/favorites/{itemNumber}` | Not called | Future guarded action log | Write endpoint. Requires explicit approval. |

### Pricing API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `POST /api/pricing/v2/prices` | Passed and full matrix attempted | `abc_price_observations`, `abc_price_observation_lines`, future `product_vendor_price_observations` | Full run attempted 10,644 Ship-To/branch/item-chunk requests; 9,048 passed; 0 rate limits. |

### Order API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `GET /api/order/v2/orders/orderHistory` | Passed and backfilled | `abc_order_history` | 3,146 order history rows from yearly windows through 2026-06-05. |
| `GET /api/order/v2/orders/{orderNumber}` | Passed and backfilled | `abc_orders`, `abc_order_lines`, `abc_order_shipments` | 3,146 order details, 18,391 lines, and 3,111 shipment rows stored. |
| `GET /api/order/v2/orders/templates` | Passed | Future `abc_order_templates` | Template list passed. |
| `GET /api/order/v2/orders/templates/{templateId}` | Passed | Future `abc_order_template_lines` | Template detail passed. |
| `POST /api/order/v2/orders` | Not called | Future guarded `abc_order_submissions` | Write endpoint. Requires explicit approval and rollback/cancel procedure. |

### Notification API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `GET /api/notification/v2/webhooks` | Accessible; returned 404/no webhook | Future `abc_webhook_configs` | 404 means no registered webhook for the application, not an auth failure. |
| `GET /api/notification/v2/webhooks/{webhookId}` | Not called | Future `abc_webhook_configs` | Needs registered webhook ID. |
| `POST /api/notification/v2/webhooks` | Not called | Future guarded action log | Write endpoint. Requires explicit approval. |
| `PATCH /api/notification/v2/webhooks/{webhookId}` | Not called | Future guarded action log | Write endpoint. Requires explicit approval. |
| `DELETE /api/notification/v2/webhooks/{webhookId}` | Not called | Future guarded action log | Write endpoint. Requires explicit approval. |
| Order update event | Docs only | Future `abc_webhook_events_raw`, `abc_order_status_events` | Requires webhook registration before live event capture. |
| Order invoiced event | Docs only | Future `abc_webhook_events_raw`, `abc_order_invoiced_events` | Requires webhook registration before live event capture. |

### Invoice API

| Endpoint | Production status | Current table target | Notes |
| --- | --- | --- | --- |
| `GET /api/invoice/v1/invoices/history/{billToNumber}` | Passed and backfilled | `abc_invoice_history` | 520 invoice history rows across both Bill-To accounts. |
| `GET /api/invoice/v1/invoices/id/{invoiceId}` | Passed and backfilled | `abc_invoices`, `abc_invoice_lines` | 520 invoice details and 2,462 invoice lines stored. |
| `GET /api/invoice/v1/invoices/pdf/{invoiceId}` | Not called | Future storage object plus `abc_invoice_pdfs` metadata | Disabled until PDF storage, retention, and PII handling are approved. |

## Mirror Table Plan

Create API-fidelity tables first, then map selected fields into existing canonical product/vendor/job
tables. Keep raw JSON for audit and reprocessing.

### Shared sync tables

- `abc_api_sync_runs`: one row per harness/sync run, including environment, started/ended timestamps,
  request totals, 429 count, failures, and output path.
- `abc_endpoint_access_log`: one row per endpoint call, status, latency, status category, path
  template, and redacted error summary.
- `abc_api_raw_payloads`: optional append-only raw response archive keyed by endpoint, source ID,
  `abc_fetched_at`, and payload hash.

### Account and location tables

- Keep `abc_regions` as the account hierarchy mirror for now because it already exists and has
  dependents. Add a future view or rename only during a planned migration.
- Add `abc_ship_to_contacts` for `GET /shiptos/{shipToNumber}/contacts`.
- Keep `abc_vendor_branches` as the ABC branch mirror because it already exists and has dependents.
- Add `abc_ship_to_branch_access` to normalize Ship-To to branch access, instead of storing only
  `branch_numbers[]`.

### Product tables

- `abc_product_catalog`: current full-catalog table keyed by `item_number`.
- `abc_product_hierarchy`: hierarchy rows from `GET /hierarchy`.
- `abc_product_availability`: branch availability from search/detail availability endpoints.
- `abc_product_images`: image asset metadata. Store binary images only after storage policy approval.
- `abc_recent_items`, `abc_frequent_items`, `abc_favorite_items`: account-specific product signals.

### Pricing and UOM tables

- `abc_price_observations`: one pricing request/response context, keyed by Ship-To, branch, purpose,
  observed timestamp, and request hash.
- `abc_price_observation_lines`: one row per priced line with item, quantity, UOM, status code,
  returned price fields, and raw line JSON.
- `abc_uom_calculations`: derived conversion evidence from Product API weights/dimensions/UOM fields
  and Pricing API line UOM fields.
- Continue feeding canonical `product_vendor_price_observations` from accepted pricing observations.

### Order tables

- `abc_order_history`: paginated history summaries.
- `abc_orders`: order detail headers.
- `abc_order_lines`: order line details.
- `abc_order_shipments`: shipment/delivery details when present.
- `abc_order_templates` and `abc_order_template_lines`: template list/detail.
- `abc_order_submissions`: write-attempt audit table, inactive until order writes are approved.

### Notification tables

- `abc_webhook_configs`: registered webhook metadata.
- `abc_webhook_events_raw`: immutable incoming webhook payloads.
- `abc_order_status_events`: normalized order update events.
- `abc_order_invoiced_events`: normalized invoice events from webhooks.

### Invoice tables

- `abc_invoice_history`: invoice history summaries.
- `abc_invoices`: invoice JSON detail headers.
- `abc_invoice_lines`: invoice detail lines.
- `abc_invoice_pdfs`: PDF metadata only unless storage is approved; binary should live in a private
  Supabase Storage bucket with explicit RLS/storage policies.

## Operational Recommendations

1. Keep `production-sync.mjs` read-only by default. Add separate, approval-gated scripts for orders,
   favorites, and webhooks.
2. Add retry/backoff for Account API search because production showed a transient 500 even though the
   successful full account sync passed.
3. Schedule full catalog refresh off-hours. Use `sinceLastModifiedDateTime` once confirmed against
   ABC production behavior to reduce full-crawl load.
4. Store pricing as observations. Do not infer contract-effective dates unless ABC returns an explicit
   date field or the source is a dated price agreement.
5. Normalize Ship-To branch access into a junction table before relying on pricing automation.
6. Register webhooks only after a human approves endpoint URL, secret handling, replay/idempotency,
   and event retention.

## Supabase Security Note

Supabase reported RLS disabled on `public.spatial_ref_sys`,
`public._backup_abc_regions_20260605`, and `public._backup_abc_vendor_branches_20260605`.
Do not enable RLS blindly if any client currently depends on those backup tables. The remediation SQL
to review is:

```sql
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_abc_regions_20260605 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_abc_vendor_branches_20260605 ENABLE ROW LEVEL SECURITY;
```
