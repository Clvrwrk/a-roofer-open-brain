# SRS / RoofHub SIPS Mapping Notes

Source docs: https://apidocs.roofhub.pro/llms.txt

## Identifier policy

Always preserve these identifiers in `metadata` when available:

- `sourceSystem`
- `customerCode`
- `accountNumber`
- `jobAccountNumber`
- `branchCode`
- `shipToSequenceNumber`
- `transactionID` / `transactionId`
- `orderID`
- `queueID`
- `productId`
- `itemCode`
- `invoiceNumber`
- delivery ID / coordinate status IDs returned by delivery endpoints

## Atom events

| Source event/object | `metadata.event_type` | Default `trust_tier` |
| --- | --- | --- |
| Customer validation | `supplier_customer_validated` | `evidence` |
| Customer invalid/not eligible | `supplier_customer_validation_failed` | `evidence` |
| Branch location | `supplier_branch_seen` | `evidence` |
| Customer branch location | `supplier_customer_branch_seen` | `evidence` |
| Catalog product | `supplier_product_seen` | `evidence` |
| Active branch product | `supplier_product_availability_seen` | `evidence` |
| Price response | `supplier_price_seen` | `evidence` |
| Price zero/call branch | `supplier_price_requires_branch_call` | `evidence` |
| Order submitted | `supplier_order_submitted` | `evidence` |
| Order queued | `supplier_order_queued` | `evidence` |
| Order status webhook/detail | `supplier_order_status_changed` | `evidence` |
| Delivery detail | `supplier_delivery_seen` | `evidence` |
| Proof of delivery | `supplier_proof_of_delivery_seen` | `evidence` |
| Invoice | `supplier_invoice_seen` | `evidence` |
| Paid/approved invoice | `supplier_invoice_confirmed` | `instruction` |

## Workflow hooks

- `supplier_price_requires_branch_call` should block automatic order submission until a human confirms
  the branch pricing or replaces the line item.
- `supplier_order_queued` should put the order into a pending supplier-confirmation state.
- `supplier_proof_of_delivery_seen` should notify Operations and may attach to customer-facing status
  updates when consent rules allow.
