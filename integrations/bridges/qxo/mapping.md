# QXO Mapping Notes

Source docs:

- https://www.qxo.com/customapi
- https://go.qxo.com/qxoapi
- https://www.qxo.com/integrations/api-license-terms

QXO endpoint schemas are not public. This mapping is a placeholder for the expected supplier-bridge
object model and must be revised after partner documentation is received.

## Planned atom events

| Planned source event/object | `metadata.event_type` | Default `trust_tier` |
| --- | --- | --- |
| Account/contact | `supplier_account_seen` | `evidence` |
| Branch/location | `supplier_branch_seen` | `evidence` |
| Product | `supplier_product_seen` | `evidence` |
| Availability | `supplier_product_availability_seen` | `evidence` |
| Price | `supplier_price_seen` | `evidence` |
| Order placed | `supplier_order_submitted` | `evidence` |
| Order/delivery update | `supplier_order_status_changed` | `evidence` |
| Delivery photo | `supplier_delivery_photo_seen` | `evidence` |
| Invoice/payment status | `supplier_invoice_seen` | `evidence` |
| Approved/paid invoice | `supplier_invoice_confirmed` | `instruction` |

## Required partner-doc additions

Replace this placeholder once QXO provides:

- Stable identifiers for accounts, branches, products, orders, deliveries, invoices, and payments.
- Webhook event names and payload schemas.
- Status enum meanings.
- Error response format.
- Invoice and delivery-photo retention/linking rules.
