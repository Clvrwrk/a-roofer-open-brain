# ABC Supply Mapping Notes

Source docs: https://apidocs.abcsupply.com/api-endpoints/

## Identifier policy

Always preserve these identifiers in `metadata` when available:

- `soldToNumber`
- `billToNumber`
- `shipToNumber`
- `branchNumber`
- `itemNumber`
- `assetId`
- `webhookId`
- `invoiceId`
- ABC order number / order ID fields returned by the Order API
- client-provided `requestId` on pricing calls

## Atom events

| Source event/object | `metadata.event_type` | Default `trust_tier` |
| --- | --- | --- |
| Account search/read | `supplier_account_seen` | `evidence` |
| Ship-to contact | `supplier_jobsite_contact_seen` | `evidence` |
| Branch read | `supplier_branch_seen` | `evidence` |
| Product catalog item | `supplier_product_seen` | `evidence` |
| Product availability | `supplier_product_availability_seen` | `evidence` |
| Price response tied to estimate/order | `supplier_price_seen` | `evidence` |
| Order placed | `supplier_order_submitted` | `evidence` |
| Order update webhook | `supplier_order_status_changed` | `evidence` |
| Order invoiced webhook | `supplier_order_invoiced` | `evidence` |
| Approved/paid invoice | `supplier_invoice_confirmed` | `instruction` |
| Invoice PDF | `supplier_invoice_pdf_seen` | `evidence` |

## Workflow hooks

- `supplier_order_status_changed` should notify Operations when a delivery date, delivery method, or
  status changes.
- `supplier_order_invoiced` should notify Accounting and link the order to job-cost review.
- `supplier_price_seen` should stay internal and must not power cross-supplier comparison UX.
