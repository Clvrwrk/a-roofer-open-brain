# Roofing API Source Intelligence

Status: planning reference v0.1  
Last verified: 2026-06-04  
Related: [18-platform-integrations.md](18-platform-integrations.md), [integrations/bridges/README.md](../integrations/bridges/README.md)

This brief captures the public API surface for roofing supplier and operating-system integrations that
matter to the open brain planning phase. It is intentionally source-linked so implementation planning can
check the vendor documentation instead of guessing at capabilities.

## Planning posture

| Vendor | Public documentation depth | Planning posture |
| --- | --- | --- |
| ABC Supply | Full public endpoint documentation with auth, endpoint list, rates, scopes, and examples. | Ready for bridge design once API access is approved. |
| SRS / RoofHub SIPS | Full public endpoint documentation plus LLM index and .NET SDK guidance. | Ready for bridge design once credentials are issued. |
| AccuLynx | Full public V2 and webhook docs; bridge already exists in this repo. | Existing bridge should use these sources as provenance and stay current with V2 references. |
| QXO | Public capability/registration pages and license terms; endpoint-level docs are not public. | Treat as gated. Plan capability families, then request partner docs before implementation. |

## ABC Supply

Source docs:

- API portal: https://apidocs.abcsupply.com/
- Getting started: https://apidocs.abcsupply.com/getting-started/
- API overview and rates: https://apidocs.abcsupply.com/api-overview/
- Authorization: https://apidocs.abcsupply.com/authorization-methods/
- Endpoint inventory: https://apidocs.abcsupply.com/api-endpoints/
- Bridge folder: [abc-supply](../integrations/bridges/abc-supply/README.md)

Public capabilities:

| API group | Capabilities | Key planning notes |
| --- | --- | --- |
| Order | Place orders, retrieve orders, retrieve order history, retrieve myABCSupply order templates. | Order reads can be integration-scoped unless the enrolled individual-business flow grants broader order read scope. |
| Pricing | Real-time customer-specific item pricing. | Third-party aggregators need a user token for pricing; client-credentials pricing is not available for that track. Line-level pricing status must be checked even when HTTP status is 200. |
| Account | Search sold-to, bill-to, ship-to accounts; read account details and ship-to contacts. | Ship-to account is the key account type for pricing and ordering. |
| Product | Catalog search/read, full catalog, favorites/recent/frequent items, availability, hierarchy, item images. | Availability is branch-specific and separate from pricing. Product families and parking-lot families need UX guardrails. |
| Location | Search branches and read branch detail. | Branches set product offering, pricing, delivery services, and fulfillment constraints locally. |
| Notification | Register/read/update/delete webhooks; order update and order invoiced events. | Maximum five webhooks per application; order webhooks are the real-time loop for delivery/order status. |
| Invoice | Read invoice by ID, invoice history, and invoice PDF. | Good accounting and job-costing feed once invoice scope is granted. |

Published endpoint inventory:

| Group | Method/path |
| --- | --- |
| Order | `POST /orders`, `GET /orders`, `GET /orderHistory`, `GET /orderTemplates`, `GET /orderTemplateId` |
| Pricing | `POST /prices` |
| Account | `POST /search/accounts`, `GET /soldtos/{soldToNumber}`, `GET /billtos/{billToNumber}`, `GET /shiptos/{shipToNumber}`, `GET /shiptos/{shipToNumber}/contacts` |
| Product | `POST /search/items`, `GET /item/{itemNumber}`, `GET /api/product/v1/items`, `GET /api/product/v1/items/{billToNumber}/recents`, `GET /api/product/v1/items/{billToNumber}/frequents`, `GET /api/product/v1/items/{billToNumber}/favorites`, `PUT /api/product/v1/items/{billToNumber}/favorites`, `POST /search/availability/items`, `GET /availability/items/{itemNumber}/branches`, `GET /hierarchy`, `GET /items/{assetId}/images` |
| Location | `GET /branches`, `GET /branches/{BranchNumber}` |
| Notification | `POST /webhooks`, `GET /webhooks`, `GET /webhooks/{webhookId}`, `PATCH /webhooks/{webhookId}`, `DELETE /webhooks/{webhookId}` |
| Invoice | `GET /invoice/v1/invoices/id/{invoiceId}`, `GET /invoice/v1/invoices/history/{BillToAccount}`, `GET /invoice/v1/invoices/pdf/{invoiceId}` |

Brain implications:

- Best first bridge value is vendor pricing/catalog/order/invoice atomization for estimator and accounting workflows.
- Capture ship-to, bill-to, sold-to, branch, item, order, delivery, and invoice identifiers in atom metadata.
- Never use ABC data for cross-vendor price comparison, market intelligence packaging, resale, sublicensing, or token pooling; public terms warn against these use cases.
- For estimates, always select ship-to and branch before browsing or pricing items.
- Treat `0.00` pricing as a successful response that still requires branch follow-up when line status says pricing is missing.

## SRS / RoofHub SIPS

Source docs:

- API portal: https://apidocs.roofhub.pro/srs-integration-partner-services-sips-1613923m0
- LLM index: https://apidocs.roofhub.pro/llms.txt
- SDK/security guide: https://apidocs.roofhub.pro/-2133410m0
- Order flow guide: https://apidocs.roofhub.pro/orders-1612444m0
- Bridge folder: [srs-roofhub](../integrations/bridges/srs-roofhub/README.md)

Public capabilities:

| API group | Capabilities | Key planning notes |
| --- | --- | --- |
| Authentication | OAuth/client-credentials token exchange. | Public SDK guide says bearer tokens have a 24-hour lifetime; reuse tokens and refresh before expiry. |
| Orders | Submit orders, list orders, read order details, delivery details, deliveries list, proof of delivery. | SRS recommends asynchronous order submission with webhooks for production order flow. |
| Invoices | Invoice list, invoice details, invoice PDF. | Good accounting feed for invoice status, PDF archive, and job-cost evidence. |
| Products | Catalog, product by item codes, real-time price, UOM conversion, color recommendations, catalog item conversion. | Catalog can be cached; pricing should be refreshed at checkout. Price response is documented as cached for four hours. |
| Customers | Customer details, customer validation, order templates. | Validate the customer before submitting an order; `validIndicator` gates order eligibility. |
| Branches | Branch locations, active branch products, customer branch locations. | `jobAccountNumber` and `branchCode` are critical for order submission. |
| Deliveries | Coordinate status for orders. | Useful for customer status updates and ops visibility. |
| Webhooks | Order flow notifications. | Design the bridge to accept async updates before enabling production ordering. |

Published endpoint inventory from SIPS LLM index:

| Group | Method/path or endpoint name |
| --- | --- |
| Authentication | `Token` |
| Orders | `Delivery Details`, `Deliveries List`, `Proof of Delivery`, `Order Details`, `Order List`, `Submit Order` (`POST /orders/v2/Submit`) |
| Invoices | `Invoice Details`, `Invoices List` (`POST /invoices/list`), `Invoice Pdf` |
| Products | `Price` (`POST /products/v2/price`), `UOM Conversion`, `Color Recommendations`, `Catalog Item Convert`, `Catalog` (`GET /products/v2/catalog`), `By Item Codes` |
| Customers | `Customer Details`, `Validate Customer`, `Order Templates` |
| Branches | `Branch Locations` (`GET /branches/v2/branchLocations`), `Active Branch Products`, `Customer Branch Locations` |
| Deliveries | `Coordinates` |

Brain implications:

- SRS is strong enough for a supplier bridge that can support quote-to-order, invoice capture, and delivery visibility.
- Cache product catalogs and branch lists; fetch pricing before checkout or purchase-order confirmation.
- If `pricing = 0`, partner guidance requires displaying a branch-contact message instead of a zero-dollar price.
- Preserve `transactionID`, `orderID`, `queueID`, `customerCode`, `jobAccountNumber`, `branchCode`, `productId`, and `itemCode` in metadata.
- Production order submission should be asynchronous with webhook reconciliation.

## AccuLynx

Source docs:

- Getting started: https://apidocs.acculynx.com/docs/getting-started
- Authentication: https://apidocs.acculynx.com/docs/authentication
- Rate limits: https://apidocs.acculynx.com/docs/rate-limits
- API reference root: https://apidocs.acculynx.com/reference
- Webhook endpoints: https://apidocs.acculynx.com/docs/endpoints
- Bridge folder: [acculynx](../integrations/bridges/acculynx/README.md)
- Source provenance sheet: [acculynx/SOURCES.md](../integrations/bridges/acculynx/SOURCES.md)

Public capabilities:

| API area | Capabilities | Key planning notes |
| --- | --- | --- |
| Auth/rates | API key per integration/location; 30 req/sec per IP and 10 req/sec per API key. | Backoff on HTTP 429; every location in multi-location accounts may need its own connection. |
| Jobs | List/read jobs with date filters, milestone filters, assignment filter, includes. | Dead/unassigned leads require `assignment=unassigned`; use modified-date pulls for reconciliation. |
| Contacts | Company contact list/detail, contact types, job contacts. | Use `includes=emailAddress,phoneNumber` where available. |
| Milestones | Current milestone, milestone history, milestone-change webhooks. | Milestone naming can be account-specific; keep mapping configurable. |
| Estimates/financials | Job estimates, estimate detail, job financials with worksheet/amendments, payments, payments overview, invoices, supplements. | Supplements are company-level `GET /api/v2/supplements` with optional `jobId`, not a nested job endpoint. |
| Messages/photos | Job message write/reply APIs and job media paths. | Dedicated message/contact-log reads are limited; use supported detail/history/includes where available. |
| Webhooks | Subscriptions CRUD, test event, topics. | Store subscription secret; verify inbound webhook signatures before atomization. |

Brain implications:

- AccuLynx remains the primary PM system of record. The bridge should be the first operational atom source for leads, jobs, milestones, contacts, insurance, estimates, financials, and invoices.
- Webhooks trigger near-real-time capture; scheduled pulls close gaps when webhooks are unavailable or tier-gated.
- Promote only approved/paid financial records, signed change orders, approved supplements, and confirmed warranty records to `trust_tier = "instruction"`.

## QXO

Source docs:

- Public API services page: https://www.qxo.com/customapi
- API registration form/capability page: https://go.qxo.com/qxoapi
- API license terms: https://www.qxo.com/integrations/api-license-terms
- Bridge folder: [qxo](../integrations/bridges/qxo/README.md)

Public capabilities:

| Capability family | Publicly described value | Planning note |
| --- | --- | --- |
| Order API | Place material orders and track order status/deliveries from business software. | Endpoint docs are gated; request partner package before estimating implementation effort. |
| Pricing API | Real-time pricing for one or multiple products. | Treat as account/branch-specific and restricted by license terms. |
| Account API | Customer account data including billing addresses, contacts, and account attributes. | Requires active QXO customer/partner access. |
| Product API | Product catalog/details, availability, and hierarchy attributes. | Public page confirms capability, not schema. |
| Delivery tracking API | Material order status and delivery photos. | Strong fit for ops and customer communication atoms once docs are available. |
| Invoice API | Invoices, invoiced data, payment status, and financial info. | Good accounting bridge candidate after endpoint review. |

Brain implications:

- QXO should be tracked as a gated supplier integration, not implemented from public docs alone.
- Public license terms restrict competitive, sublicensing, excessive, and unauthorized uses; architecture must keep QXO data internal to the customer account and avoid market-intelligence use.
- Planning should reserve the same object model as other supplier bridges: account, branch/location, product, availability, price, order, delivery, delivery photo, invoice, and payment status.

## Open questions before implementation

- ABC Supply: Which integration track applies for Pro Exteriors/Open Brain: individual business, third-party aggregator, or both?
- ABC Supply: Will the first release use user authorization, client credentials, or both?
- SRS: Will credentials include SDK access, REST-only access, or both?
- SRS: Which webhook events are enabled for production async order submission?
- QXO: Can QXO provide endpoint-level docs, sandbox credentials, auth model, scopes, rate limits, webhook docs, and sample schemas?
- AccuLynx: Which webhook topics are available in the target account tier, and do message/photo reads require includes or history pulls in that account?
