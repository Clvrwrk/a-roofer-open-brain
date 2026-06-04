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
ABC_SUPPLY_SCOPES=account.read location.read product.read pricing.read order.read invoice.read
```

If the ABC portal labels the credentials as `ClientID` and `Client_Secret`, copy those values into `ABC_SUPPLY_CLIENT_ID` and `ABC_SUPPLY_CLIENT_SECRET` in `.env`. Do not use generic names in committed code.

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
