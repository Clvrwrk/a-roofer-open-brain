# ABC Supply Sandbox Test Plan

Status: draft v0.1
Related: [`README.md`](README.md), [`metadata.json`](metadata.json), [`29-connection-and-access-checklist.md`](../../../docs/29-connection-and-access-checklist.md)

## Objective

Prove that the ABC Supply bridge can authenticate against the sandbox and read harmless account, branch, catalog, pricing, order, and invoice data without mutating supplier state.

No order placement, webhook registration, favorite updates, or write endpoints are allowed in this phase.

## Env Contract

Use namespaced env vars in app code and scripts:

```bash
ABC_SUPPLY_ENV=sandbox
ABC_SUPPLY_CLIENT_ID=...
ABC_SUPPLY_CLIENT_SECRET=...
ABC_SUPPLY_API_BASE_URL=https://partners-sb.abcsupply.com
ABC_SUPPLY_AUTH_BASE_URL=https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8
ABC_SUPPLY_SCOPES=location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read
```

If the ABC portal labels the credentials as `ClientID` and `Client_Secret`, copy those values into `ABC_SUPPLY_CLIENT_ID` and `ABC_SUPPLY_CLIENT_SECRET` in `.env`. Do not use generic names in committed code.

## Smoke Harness

Run the redacted read-only smoke with:

```bash
node integrations/bridges/abc-supply/sandbox-smoke.mjs
```

The script reads repo-root `.env`, requests a sandbox client-credentials token, starts with
`POST /api/account/v1/search/accounts`, derives sandbox-safe IDs for follow-up reads, and writes a
redacted JSON run summary under ignored `.sandbox-runs/`. It does not print tokens, client secrets,
raw account names, addresses, PDFs, or price values.

Flags:

- `--no-output` prints the summary without writing `.sandbox-runs/`.
- `--include-pdf` will call the invoice PDF endpoint, but should stay off until PDF storage and
  sandbox safety are reviewed.

The harness emits a `supabaseCoverage` block that maps passed/readable endpoint groups to the
planned Open Brain surfaces:

- Locations and account access: `vendors`, `vendor_branches`, branch/location atoms.
- Product catalog: `products`, `product_taxonomy`, `product_color_variants`, `abc_product_categories`.
- Availability: branch-item availability cache and availability atoms.
- Pricing per location: `product_vendor_price_observations`, `price_agreements`,
  `price_agreement_items`, `abc_price_agreements`, `abc_price_list_items`.
- UOM calculations: `product_uom_conversions` using product detail UOM/dimension/weight fields plus
  pricing line UOM fields. ABC does not expose a separate UOM conversion endpoint in the documented
  IB endpoint list.
- Price dates: `abc_price_change_log` or observation effective-date metadata when date/effective
  fields are returned. The current Price Items response shape did not include a price date.
- Orders, invoices, and notifications: supplier-order/job atoms, `invoice_documents`, accounting
  atoms, invoice pricing gate data, and future webhook event atoms.

## Phase 0 - Credential Shape

1. Confirm the sandbox integration track:
   - Client credentials for third-party aggregator.
   - Client credentials for individual/business.
   - Authorization-code flow.
2. Confirm allowed scopes.
3. Confirm whether pricing is available with this credential type.
4. Confirm whether read-only account tests require known sandbox identifiers.

Exit criteria:

- Credential type and scopes are documented.
- No secrets are printed to logs.

## Phase 1 - Token Exchange

Use client credentials only if ABC confirms this is the assigned sandbox flow.

Expected behavior:

- Token endpoint returns an access token.
- Token response is redacted in logs.
- Expiration is captured for refresh scheduling.
- Failure paths classify invalid client, invalid scope, rate limit, and network failure separately.

Exit criteria:

- Bridge can acquire a sandbox token.
- Bridge can fail closed when credentials or scopes are wrong.

## Phase 2 - Read-Only Discovery

Run the lowest-risk read endpoints first:

1. Branch list or branch detail.
2. Account lookup using sandbox-safe identifiers.
3. Catalog item search with a harmless query.
4. Item detail for one returned item.

Exit criteria:

- Responses are captured as redacted fixtures under a future ignored fixture path.
- Mapping notes are updated with field names and identifiers.
- No personally sensitive customer data is committed.

## Phase 3 - Pricing Read

Pricing is allowed only if ABC confirms the sandbox credential track supports it.

Test shape:

- Known sandbox `shipToNumber`.
- Known sandbox `branchNumber`.
- One to three harmless catalog items.
- Quantity `1`.

Guardrails:

- Treat line-level errors as first-class failures.
- Treat `0.00` as missing branch pricing unless ABC docs say otherwise.
- Do not use pricing output for competitive comparison.

Exit criteria:

- Price response is mapped to supplier-price cache metadata.
- No user-facing quote or accounting record is created from sandbox data.

## Phase 4 - Order And Invoice Reads

Read only:

- Existing orders visible to the sandbox integration.
- Existing order history.
- Existing invoice metadata.
- Invoice PDF only if ABC confirms PDFs are safe in sandbox and storage handling is ready.

Exit criteria:

- Order and invoice identifiers map to source-linked atoms.
- PDF handling plan exists before any file is persisted.

## Phase 5 - Human Review Gate

Before write endpoints:

1. Human confirms ABC sandbox write operations are safe.
2. Test purchase order naming convention is documented.
3. Rollback/cancel behavior is understood.
4. Auditor has reviewed payloads and logs.

Only then may a separate write-endpoint plan cover:

- `POST /orders`
- Webhook registration.
- Favorites or template changes.

## Agent Ownership

- Sales owns estimate and proposal implications.
- Operations owns branch, availability, delivery, and material sequence implications.
- Accounting owns invoices, job costing, and supplier-account reconciliation.
- Capture records source-linked atoms.
- Conductor routes exceptions and human-review gates.
- Auditor blocks promotion when data provenance, pricing legality, or write safety is unclear.

## Latest Smoke Result

Run: `2026-06-04T22:15:03Z`
Output: ignored local file `.sandbox-runs/2026-06-04T22-15-03-979Z.json`

Summary:

- OAuth client-credentials token exchange passed with read-only discovery scopes; token lifetime was
  `1800` seconds.
- ABC's recommended `accountType = Ship-To` account search returned `49` sandbox Ship-To accounts
  across `10` pages and provided Ship-To branch access before pricing.
- Passed read/read-like endpoints: branch search/detail, product hierarchy/catalog/search/detail,
  product availability search/detail, item image fetch, order history/detail, sold-to/bill-to/ship-to
  detail, ship-to contacts via `/api/account/v1`, recent/frequent/favorite item reads, per-branch
  pricing reads for `3` Ship-To-access branches with line status `OK`, order templates/list/detail,
  invoice history, and invoice-by-ID.
- Product/UOM coverage found product detail field paths for weights, UOMs, and dimensions, and
  pricing response field paths for `lines[].quantity` and `lines[].uom`. No pricing date/effective
  field was returned in this sandbox response shape.
- Request stats: `29` total HTTP requests, `0` rate-limited responses, observed rate `0.65` req/sec,
  average endpoint latency `1565` ms, max endpoint latency `10247` ms.
- Non-passing read endpoints: documented ship-to contacts path `/api/accounts/v1/.../contacts`
  returned `401`, while `/api/account/v1/.../contacts` passed; notification webhooks returned `404`
  because no sandbox webhook was registered.
- Skipped by guardrail: favorite write, order placement, webhook register/update/delete, and invoice
  PDF download.
- A Codex heartbeat automation named `ABC sandbox 2-hour validation` will run the same script three
  more times at two-hour intervals to complete the requested four-run validation spread.
