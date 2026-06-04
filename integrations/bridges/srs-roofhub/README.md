# SRS / RoofHub SIPS Bridge - Supplier Ordering, Pricing, Delivery, and Invoice Adapter

Status: planned  
Tier: 1 - SaaS with API  
Primary agents: Accounting, Operations, Sales, Capture, Conductor

SRS Integration Partner Services (SIPS) exposes a broad partner API for supplier order flow, product
catalog, pricing, branch/customer validation, delivery status, proof of delivery, and invoices.

Source docs:

- Portal: https://apidocs.roofhub.pro/srs-integration-partner-services-sips-1613923m0
- LLM index: https://apidocs.roofhub.pro/llms.txt
- SDK/security guide: https://apidocs.roofhub.pro/-2133410m0
- Orders guide: https://apidocs.roofhub.pro/orders-1612444m0
- Price endpoint: https://apidocs.roofhub.pro/price-32656412e0
- Catalog endpoint: https://apidocs.roofhub.pro/catalog-32754922e0
- Branch locations endpoint: https://apidocs.roofhub.pro/branch-locations-32754987e0
- Submit order endpoint: https://apidocs.roofhub.pro/submit-order-21007252e0

## Environments

The public SDK guide lists:

| Environment | Base URL |
| --- | --- |
| Staging | `https://services-qa.roofhub.pro` |
| Production | `https://services.roofhub.pro` |

## Authentication

SIPS uses an authentication token flow with `client_id` and `client_secret`, then bearer token
authorization for API requests. The SDK guide says bearer tokens have a 24-hour lifetime.

Required secret names for this repo:

- `SRS_ROOFHUB_CLIENT_ID`
- `SRS_ROOFHUB_CLIENT_SECRET`
- `SRS_ROOFHUB_WEBHOOK_SECRET` once webhook docs/credentials are issued

Implementation rules:

- Never hardcode credentials or base URLs.
- Reuse a bearer token for a session instead of requesting one per call.
- Refresh before or on expiry.
- Do not log client secret, access token, or raw webhook secrets.

## Public endpoint surface

The SIPS LLM index and endpoint pages expose these planning groups:

| Group | Public endpoints/capabilities |
| --- | --- |
| Authentication | `Token` |
| Orders | Delivery Details, Deliveries List, Proof of Delivery, Order Details, Order List, Submit Order |
| Invoices | Invoice Details, Invoices List, Invoice Pdf |
| Products | Price, UOM Conversion, Color Recommendations, Catalog Item Convert, Catalog, By Item Codes |
| Customers | Customer Details, Validate Customer, Order Templates |
| Branches | Branch Locations, Active Branch Products, Customer Branch Locations |
| Deliveries | Coordinates |

Known concrete paths from public pages:

- `POST /orders/v2/Submit`
- `POST /products/v2/price`
- `GET /products/v2/catalog`
- `GET /branches/v2/branchLocations`
- `POST /invoices/list`

## Objects to ingest

### Customer validation

Validate the customer before order flow. The SDK guide highlights `validIndicator`, `accountNumber`,
`accountName`, and `creditStatus` as important fields.

### Branches

Branch-location responses include brand, branch name/code, address, phone/fax, shipping methods,
sales types, business hours, and order email addresses.

Customer branch-location calls are especially important because they return customer-specific branch
relationships and `jobAccountNumber`, which is required for order submission.

### Products and active branch products

Product catalog responses include product IDs, names, descriptions, features, UOMs, category,
manufacturer, images, substitution flags, options, and variants.

Planning rules:

- Cache product catalog data.
- Cache branch active-product lists by branch.
- Refresh catalog daily/weekly depending on volume.
- Fetch pricing in real time for checkout or purchase-order confirmation.

### Pricing

The v2 price endpoint accepts source system, customer code, branch code, transaction ID,
job account number, and product list with product ID/name/options/quantity/UOM.

Important public guidance:

- Price responses are cached for four hours.
- If `pricing = 0`, partners must not display `$0`; display a branch-contact message instead.
- If availability says to call the branch, surface that message to the user.

### Orders

`POST /orders/v2/Submit` accepts source system, customer code, `jobAccountNumber`, `branchCode`,
account number, transaction fields, ship-to address, PO details, line-item details, and customer
contact info. The response includes message, transaction ID, order ID, and queue ID.

The public order-flow guide says async order submission with webhooks is preferred; synchronous order
submission returns immediate success/failure from the ERP.

### Deliveries and proof of delivery

Delivery details, delivery list, proof-of-delivery PDF/images, and coordinates should become
Operations/customer-status atoms linked to supplier orders and brain jobs.

### Invoices

Invoice list, details, and PDFs are Accounting atoms. Promote only source-confirmed paid/approved
financial states to `trust_tier = "instruction"`.

## Brain mapping

| Source object | Brain target |
| --- | --- |
| Customer validation | Supplier account eligibility atom |
| Branch location | Supplier branch atom/cache |
| Customer branch location | Customer-branch relationship atom; preserve `jobAccountNumber` |
| Catalog product | Product catalog atom/cache |
| Active branch product | Branch availability atom/cache |
| Price response | Estimate/order pricing atom; line-level status preserved |
| Submitted order | Supplier order atom linked to `public.job` when possible |
| Async order webhook | `supplier_order_status_changed` atom and Conductor event |
| Delivery/POD | Operations and customer-status atoms; POD can be EEAT/claim evidence if job-linked |
| Invoice/PDF | Accounting atom and invoice document metadata |

## Known constraints

- Endpoint documentation is public, but credentials, webhook event list, and exact rate limits must be
  confirmed during partner onboarding.
- Production should prefer async order submission and webhook reconciliation.
- The .NET SDK is useful if the bridge is implemented in a .NET service; this repo's Deno/TypeScript
  bridge can still use the REST API directly.
