# ABC Supply Bridge - Supplier Catalog, Pricing, Order, and Invoice Adapter

Status: planned  
Tier: 1 - SaaS with API  
Primary agents: Accounting, Operations, Sales, Capture, Conductor

Sandbox access is now available for first-pass testing. Use the namespaced env vars from
`metadata.json` and `SANDBOX-TEST-PLAN.md`; if the ABC portal labels the credentials as `ClientID`
and `Client_Secret`, mirror those values into `ABC_SUPPLY_CLIENT_ID` and
`ABC_SUPPLY_CLIENT_SECRET` in repo-root `.env`. Do not use generic credential names in committed
code.

ABC Supply's public API documentation is rich enough to plan a real bridge. The bridge's job is to
turn supplier account, branch, product, pricing, order, notification, delivery, and invoice data into
source-linked atoms without making the brain a pricing-comparison or product-data resale system.

Source docs:

- Portal: https://apidocs.abcsupply.com/
- Getting started and restrictions: https://apidocs.abcsupply.com/getting-started/
- API overview/rates/business-model notes: https://apidocs.abcsupply.com/api-overview/
- Authorization: https://apidocs.abcsupply.com/authorization-methods/
- Endpoint inventory: https://apidocs.abcsupply.com/api-endpoints/

## Authentication

ABC Supply uses OAuth 2.0. The public docs describe these flows:

- Authorization Code Flow
- Authorization Code Flow with PKCE
- Client Credentials for Third-Party Aggregators
- Client Credentials for Individuals and Businesses

Sandbox token host:

- `https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8`

Production token host:

- `https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357`

Core scopes from the public authorization docs:

| Scope | Use |
| --- | --- |
| `location.read` | Location API |
| `product.read` | Product API |
| `account.read` | Account API |
| `pricing.read` | Pricing API |
| `order.read` | Read integration-placed orders |
| `allOrder.read` | Read all orders for enrolled account; individual/business client credentials only |
| `order.write` | Place orders |
| `notification.read` | Read webhooks |
| `notification.write` | Register/update/delete webhooks |
| `invoice.read` | Read individual invoices |
| `invoice.history.read` | Read invoice history |
| `offline_access` | Refresh token for auth-code flows |

Important auth constraint: the docs state that third-party aggregators cannot use client credentials
for pricing; pricing requires a user token on that track.

## Rate limits

Public API overview lists sandbox at 10 transactions/sec for all APIs and production rates by group:

| API group | Production rate |
| --- | --- |
| Account | 20 transactions/sec |
| Product | 10 transactions/sec |
| Pricing | 50 transactions/sec |
| Order | 20 transactions/sec |
| Invoice | 10 transactions/sec |
| Location | 30 transactions/sec |
| Notification | 10 transactions/sec |

## Objects to ingest

### Accounts

ABC models customer hierarchy as sold-to, bill-to, and ship-to accounts. Ship-to is the critical
account for pricing and ordering because it ties the customer to branch access.

Endpoints:

- `POST /search/accounts`
- `GET /soldtos/{soldToNumber}`
- `GET /billtos/{billToNumber}`
- `GET /shiptos/{shipToNumber}`
- `GET /shiptos/{shipToNumber}/contacts`

Atom metadata should retain `soldToNumber`, `billToNumber`, `shipToNumber`, relationship links, and
source URL.

### Branches

Branches determine available products, branch-specific pricing, local services, fulfillment options,
and order constraints.

Endpoints:

- `GET /branches`
- `GET /branches/{BranchNumber}`

Branch atoms should preserve branch number, service list, hours, contacts, location, and branch-home
relationship to ship-to accounts.

### Products and availability

Endpoints:

- `POST /search/items`
- `GET /item/{itemNumber}`
- `GET /api/product/v1/items`
- `GET /api/product/v1/items/{billToNumber}/recents`
- `GET /api/product/v1/items/{billToNumber}/frequents`
- `GET /api/product/v1/items/{billToNumber}/favorites`
- `PUT /api/product/v1/items/{billToNumber}/favorites`
- `POST /search/availability/items`
- `GET /availability/items/{itemNumber}/branches`
- `GET /hierarchy`
- `GET /items/{assetId}/images`

Planning notes:

- Search supports `contains` for `itemDescription` and `itemNumber`.
- Filtering supports `equals` for `itemNumber`, `branchNumber`, and `productFamilyId`.
- Search can embed branch availability, but the docs warn it can reduce endpoint performance.
- Family items may not be filtered by branch availability; filter before displaying or ordering.
- Product availability is not inventory. It indicates whether a branch offers the item.

### Pricing

Endpoint:

- `POST /prices`

Required planning fields include `shipToNumber`, `branchNumber`, `purpose`, `lines[].itemNumber`,
`lines[].quantity`, optional `lines[].uom`, and dimensional length data when applicable. The docs
cap pricing requests at 50 line objects.

Guardrails:

- Do not use pricing data for competitive price comparison or market intelligence.
- A line can return HTTP 200 with a line-level error; check `lines[].status`.
- A price of `0.00` can be a successful response that means branch pricing is missing; do not treat it
as a free item.
- Pricing does not replace availability checks.

### Orders

Endpoints:

- `POST /orders`
- `GET /orders`
- `GET /orderHistory`
- `GET /orderTemplates`
- `GET /orderTemplateId`

Order atoms should preserve ABC order number, purchase order, submitted lines, branch, delivery method,
ship-to, delivery address, and source integration ID. For third-party integrations, order reads may only
return orders placed through that integration.

### Notifications

Endpoints:

- `POST /webhooks`
- `GET /webhooks`
- `GET /webhooks/{webhookId}`
- `PATCH /webhooks/{webhookId}`
- `DELETE /webhooks/{webhookId}`

Events:

- `ORDER_UPDATE`
- `ORDER_INVOICED`

The docs say only `ORDER` webhook type is currently supported and a maximum of five webhooks can be
registered with an application.

### Invoices

Endpoints:

- `GET /invoice/v1/invoices/id/{invoiceId}`
- `GET /invoice/v1/invoices/history/{BillToAccount}`
- `GET /invoice/v1/invoices/pdf/{invoiceId}`

Approved or paid invoice records may become `trust_tier = "instruction"` when the source status makes
the approval/payment state explicit.

## Brain mapping

| Source object | Brain target |
| --- | --- |
| Sold-to/bill-to/ship-to account | Account atom metadata; future supplier-account table |
| Ship-to contact | `public.thoughts` atom; optional contact/person table later |
| Branch | Branch/location atom metadata; supplier branch cache |
| Product/catalog item | Product catalog atom/cache, not job-specific unless quoted/ordered |
| Availability | Branch-item availability atom/cache |
| Price response | Estimate/job-cost atom when tied to a quote/order; otherwise price-cache metadata |
| Order | `public.job`-linked supplier order atom |
| Order update webhook | `job.material_order_status_changed` atom and Conductor event |
| Invoice | Accounting atom; promote only approved/paid states |

## Known constraints

- Public terms prohibit competitive price comparison, product/pricing data resale, sublicensing, and token pooling.
- Branch autonomy means product availability, pricing, and delivery services vary locally.
- Ship-to account and branch selection should happen before product browsing/pricing.
- California Proposition 65 constraints may block ordering if item/branch/delivery address checks fail.
