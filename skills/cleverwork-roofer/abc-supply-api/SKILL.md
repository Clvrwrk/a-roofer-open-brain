---
name: abc-supply-api
description: >
  Authoritative data map for ABC Supply — where every kind of ABC data lives
  (tables + columns), which API endpoint populates it, and what is NOT available
  via the API (human-in-the-loop / portal-only). READ THIS FIRST before searching
  ABC tables or wondering whether an ABC API call exists. Triggers: "ABC data",
  "ABC API", "ABC invoice/order/pricing/agreement", "where is <ABC thing> stored",
  "is there an ABC endpoint for X", paid/AR/open-invoice/due-date questions, or any
  ABC sync/ingest task. Saves re-deriving the schema every session.
metadata:
  type: reference
---

# ABC Supply — API ↔ Table data map

> **SOURCE OF TRUTH = the official API docs. Read them FIRST, before guessing
> field names or whether an endpoint exists.** Every vendor works this way — see
> "Vendor API rule" at the bottom.
> - **Live docs:** <https://apidocs.abcsupply.com/> (per-endpoint request/response
>   schemas, e.g. `/get-orders/`, `/get-invoices/`). The doc's field paths are
>   authoritative; if our synced column disagrees, the sync is wrong, not the doc.
> - **Local mirror:** `integrations/bridges/abc-supply/ABC_Endpoint.md` (full
>   endpoint catalog, kept in-repo so it works offline / in the sandbox).

Account: PE = ABC bill-to **2036874** (ship-tos `2036874-NN`). Sync script:
`integrations/bridges/abc-supply/mirror-backfill.mjs` (`--env=production --only=<area> --detail-mode=missing --history-start=YYYY-MM-DD`).
API base (prod) `https://partners.abcsupply.com`. Creds in `.env`
(`ABC_SUPPLY_CLIENT_ID/SECRET/ENV` — **note both Sandbox+Production lines are
uncommented; always pass `--env=production`**).

## The complete ABC API endpoint catalog (there are NO others)
- **account**: `POST /account/v1/search/accounts`, `GET /account/v1/{billtos|shiptos|soldtos}/{n}`, `/shiptos/{n}/contacts` → `abc_regions`, `abc_ship_to_contacts`
- **location**: `GET /location/v1/branches[/{n}]` → `abc_vendor_branches`
- **product**: `GET /product/v1/items[/{n}]`, `/hierarchy`, `/availability`, favorites/frequents/recents, `POST /search/items` → `abc_product_catalog`
- **pricing**: `POST /pricing/v2/prices` → price observations (via `mirror-backfill`/`production-sync`)
- **order**: `GET /order/v2/orders/orderHistory`, `/orders/{orderNumber}`, templates; `POST /orders` (guarded, not called) → `abc_order_history`, `abc_orders`, `abc_order_lines`, `abc_order_shipments`
- **invoice**: `GET /invoice/v1/invoices/history/{billTo}`, `/id/{invoiceId}`, `/pdf/{invoiceId}` (PDF gated) → `abc_invoice_history`, `abc_invoices`, `abc_invoice_lines`
- **notification**: webhooks CRUD

## Where data lives — and what the API does NOT give you
| You want… | Table.column | Source |
|---|---|---|
| Invoices (AP: ABC→PE) | `abc_invoices` (+ `_lines`, `_history`) | `/invoice/v1/...` |
| Invoice PO / job ref | `abc_invoices.purchase_order_number` = `"KS-147"` | invoice API ✓ |
| **Invoice paid/unpaid + paid date** | `invoice_documents.payment_status` / `paid_at` | **NOT in ABC API — portal AR export (CSV), human-in-the-loop.** Verified: the invoice history+detail payloads carry total/subTotal/tax but **no balance, total_due, due_date, terms, or paid status**, and there is **no AR/statement/balance endpoint**. |
| **Invoice open balance / due date / terms** | not stored (CSV only) | **HIL: ABC portal "open invoices" export.** This is the source of the "169 active" count + due dates. No API substitute. |
| Invoice PDF | `invoice_documents.storage_bucket/path` (bucket `invoices`, `abc-supply/2026/...pdf`) | uploaded; served via `/api/invoice-audit/pdf/[invoiceNumber]` (signed URL) |
| Orders (placed, pre-invoice) | `abc_orders` (+ `_lines`, `_shipments`, `_history`) | `/order/v2/...` |
| **Order PO / job ref + client** | `raw->'salesOrder'->>'purchaseOrder'` = `"CO-227: Client"` (`{job#}: {client}`) | order API ✓ — but the **`purchase_order_number` column was an empty-extraction bug** until 2026-06-18 (read `purchaseOrder`, not `purchaseOrderNumber`). |
| **Order LINE qty / UOM / price / total** | read from `abc_order_lines.raw` — see below | order API ✓ — **order lines ARE priced** (earlier "no price" note was wrong). The sync mapped the wrong keys, so the `quantity`/`uom`/`item_description` **columns are 0/empty**; the views read raw instead. |
| **Order date (for the 60-day archive)** | `raw->'salesOrder'->>'createdDate'` (fallback `raw->'dates'->>'orderedOn'`) | order API ✓ |
| **Order status** | `raw->'salesOrder'->>'status'` (Picked Up / Delivered / Processed / Invoiced / Canceled …) | order API ✓ |
| **Item description** (orders + general) | `abc_product_catalog.item_description` by `item_number` | catalog — order/invoice **lines carry NO description**, only `links.href` to product detail; join the catalog. |
| Negotiated price agreements | `abc_price_agreements` (+ `abc_price_list_items` = items, `abc_price_agreement_branch_matches` = branch↔agreement) | pricing/import |
| Agreement lifecycle/expiry | `abc_price_agreements.effective_date/expiry_date/staleness_status` (critical/serious/problem/ok) + `staleness_alert_sent_at` | schema 71 / `abc-price-gaps.ts` |
| Purchase ledger (item spend by year) | `abc_line_items` (16k, source_year 2023-2026, `ext_price`, `inv_qty`, `branch_state`, `acculynx_job_id` [empty]) | derived |
| Branch manager contact | `vendor_branches.manager_name/email` (filled via crosswalk, schema 97) | ABC Location API `manager_json` |

## Order LINE fields — exact raw paths (`abc_order_lines.raw`, per get-orders docs)
The synced `quantity`/`uom`/`item_description` columns are wrong (0/empty) — **read raw**:
- `raw->'orderedQty'->>'value'` = quantity · `raw->'orderedQty'->>'uom'` = UOM (e.g. PC, SQ, BD)
- `raw->'unitPrice'->>'value'` = per-unit price · `raw->>'amount'` = line total
- `raw->>'itemNumber'` = item code · description ← `abc_product_catalog` by item number
- (invoice lines mirror this shape under `abc_invoice_lines.raw`.)

## Order auto-archive rule (Order Audit)
An order leaves the active catch-window — `disposition='archived'`, by `system` — once
`salesOrder.status ILIKE 'invoiced'` **OR** `salesOrder.createdDate` is older than 60 days.
Computed in-view (`v_order_audit_order`), self-maintaining (no cron). The Order Audit page
defaults to active orders so it catches over-negotiated pricing *before* it hits invoicing.

## Gotchas that have burned us (don't rediscover)
- **No ABC AR/paid/due-date API.** Open/paid/due-date come ONLY from the ABC portal CSV export (`ABCSUPPLY_*.csv`: INVOICE_NUMBER, TOTAL_DUE, DUE_DATE, TERMS). Ingest that as the AR feed; there is no endpoint.
- **All item-bearing price agreements are EXPIRED** (central agreement id 1, 231 items, lapsed 2026-04-20). The "active" API agreements (`API-2036874-12-*`) are empty shells. So audits compare against expired-but-real prices → drive renewals.
- **Order/invoice PO ↔ AcuLynx job**: match the normalized PO prefix to `acculynx_jobs.job_name` prefix (the PE job number is in `job_name`, NOT the empty `job_number` column). See `v_invoice_acculynx_match` (104).
- **mirror-backfill upserts must dedupe by conflict key** (ABC history returns dup invoice_numbers → "ON CONFLICT cannot affect row a second time"). Fixed 2026-06-18.
- Reporting views built this work: `v_invoice_audit_*` (99), `v_invoice_line_audit_*` (100), `v_branch_price_list` (101), `v_price_agreement_audit` (102), `v_negotiated_catalog` (103), `v_invoice_acculynx_match` (104), `v_order_audit_*` + `v_order_acculynx_match` (106, repriced in 107).

## Refresh commands
- Invoices: `node integrations/bridges/abc-supply/mirror-backfill.mjs --env=production --only=invoices --detail-mode=missing --history-start=2026-01-01`
- Orders: same with `--only=orders`. Both nightly-safe; `detail-mode=missing` only fetches new records. Run on a real host (not the Cowork VM — it reaps long jobs at ~45s).
- **Sync bug to fix when touched:** `mirror-backfill.mjs` `orderLineRows()` maps `line.quantity/uom` (don't exist) instead of `orderedQty.value/uom`, and omits `unitPrice.value`/`amount`. Until fixed, the order-line columns stay empty and views must read `raw`. Fix it to populate the columns and add `unit_price`/`extended_price`.

## Vendor API rule (applies to EVERY vendor, not just ABC)
When a task involves connecting to or retrieving data from any vendor (ABC, AcuLynx,
EagleView, GAF, Roofr, …), the workflow is always the same:
1. **Read the vendor's official API documentation FIRST** — it is the ultimate source
   of truth for endpoints, field names, and response shapes. Don't guess or re-derive
   from the DB. Each vendor's `skills/cleverwork-roofer/<vendor>-api/SKILL.md` links its
   docs (live URL + in-repo mirror).
2. Then consult the brain data-map (this skill) for where each field lands in our tables
   and **what is NOT in the API** (human-in-the-loop / portal-only).
3. If the docs reveal a field the sync maps wrong or misses, fix the sync — and update
   this skill so the next session doesn't rediscover it.
A vendor without a documented API-data-map skill yet → create one the first time we
touch it (docs link + endpoint catalog + table map + HIL gaps).
