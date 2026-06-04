# QXO Bridge - Gated Supplier API Planning Notes

Status: gated/planned  
Tier: likely 1 - SaaS with API, endpoint docs not public  
Primary agents: Accounting, Operations, Sales, Capture, Conductor

QXO publishes public API capability pages and API license terms, but the endpoint-level reference,
auth model, schemas, rate limits, webhook details, and sandbox docs are not publicly visible from the
reviewed pages. This folder preserves the capability map and the exact questions that must be answered
before implementation.

Source docs:

- API services page: https://www.qxo.com/customapi
- API registration/capability form: https://go.qxo.com/qxoapi
- API license terms: https://www.qxo.com/integrations/api-license-terms

## Publicly described capabilities

| API family | Public description | Brain planning value |
| --- | --- | --- |
| Order API | Place material orders and track order status/deliveries from project-management software. | Supplier order atoms, delivery status, PO reconciliation. |
| Pricing API | Real-time pricing for single or multiple QXO products. | Estimate and quote pricing feed, subject to license and account restrictions. |
| Account API | Customer account information, billing addresses, contacts, and account attributes. | Supplier account and branch/account relationship cache. |
| Product API | Product catalog details, availability, and hierarchy attributes. | Product catalog and availability cache. |
| Delivery tracking API | Material order status, project delivery tracking, and delivery photos. | Operations status atoms and customer updates; photos may support evidence trails. |
| Invoice API | Invoices, invoiced data, payment status, and financial information. | Accounting atoms and job-cost reconciliation. |

## Gated implementation questions

Before this bridge can move from planning to implementation, request the partner API package and confirm:

- Authentication flow and token lifetime.
- Sandbox and production base URLs.
- Scopes/permissions for each API family.
- Endpoint inventory, methods, paths, request schemas, response schemas, and examples.
- Rate limits and retry guidance.
- Webhook/event support for order, delivery, invoice, and payment changes.
- Delivery-photo access pattern and retention rules.
- Invoice PDF access rules.
- Whether QXO supports multi-account/multi-branch selection and how branch-specific pricing is represented.
- Certification requirements and production go-live checklist.

## License and security posture

The public API license terms restrict unauthorized copying, reverse engineering, resale/sublicensing,
excessive or abusive usage, unlawful use, and uses that compete with QXO services. Treat QXO data as
customer-internal operational data only.

Brain rules:

- Do not use QXO pricing or product data for market intelligence or supplier comparison products.
- Do not expose QXO catalog/pricing outside the customer account without explicit written permission.
- Store credentials only in secrets storage.
- Record source provenance on every atom so data can be traced back to QXO source objects once endpoint
  docs are available.

## Planned objects

| Planned source object | Brain target |
| --- | --- |
| Account/contact | Supplier account/contact atoms |
| Branch/location | Branch/location atoms and supplier branch cache |
| Product/catalog item | Product catalog atoms/cache |
| Availability | Branch-item availability atoms/cache |
| Price | Estimate/order pricing atoms |
| Order | Supplier order atoms linked to `public.job` |
| Delivery status/photo | Operations/customer-status atoms and possible evidence atoms |
| Invoice/payment status | Accounting atoms and job-cost reconciliation |

## Planning constraint

Do not implement this bridge from public pages alone. The public pages confirm capability families,
not the integration contract.
