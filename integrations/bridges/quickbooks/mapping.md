# QuickBooks Online → Brain Schema Field Mapping

**API version documented against:** QBO REST API v3
**Adapter version:** 1.0.0
**Last reviewed:** 2026-05-29

---

## 1. Invoice → `public.thoughts` atom + `public.insurance_claim` linkage

**QBO endpoint:** `GET /v3/company/{realmId}/invoice/{invoiceId}`

| QBO Field | Brain Field | Transform / Notes |
|-----------|-------------|------------------|
| `Invoice.Id` | `metadata.external_id` | QBO invoice ID |
| `Invoice.DocNumber` | `metadata.invoice_number` | Cross-ref with AccuLynx invoice number |
| `Invoice.TxnDate` | `original_capture_date` | DATE |
| `Invoice.DueDate` | `metadata.due_date` | |
| `Invoice.TotalAmt` | `metadata.total_amount` | NUMERIC |
| `Invoice.Balance` | `metadata.balance` | NUMERIC; zero = fully paid |
| `Invoice.CustomerRef.name` | `metadata.customer_name` | |
| `Invoice.Line[]` | `metadata.line_items` | JSONB array of `{description, qty, rate, amount}` |
| `Invoice.ClassRef.name` | `metadata.qbo_class` | Job costing class; used to link to `public.job` |
| Derived | `content` | See templates below |
| `"hard"` | `soft_or_hard` | All invoices are hard atoms |
| `Invoice.Balance == 0 ? "instruction" : "evidence"` | `trust_tier` | Fully paid invoices are instruction tier |
| SHA-256(`quickbooks:{InvoiceId}:invoice:{TotalAmt}:{Balance}`) | `content_fingerprint` | |

### Invoice Content Templates

| Scenario | content |
|----------|---------|
| Invoice issued | `"Invoice #{DocNumber} issued to {customer}: ${TotalAmt}, due {DueDate}."` |
| Invoice partially paid | `"Invoice #{DocNumber}: ${TotalAmt} total, ${Balance} outstanding."` |
| Invoice fully paid | `"Invoice #{DocNumber} fully paid: ${TotalAmt} on {TxnDate}."` |

---

## 2. Payment → `public.thoughts` atom

**QBO endpoint:** `GET /v3/company/{realmId}/payment/{paymentId}`

| QBO Field | Brain Field | Transform |
|-----------|-------------|-----------|
| `Payment.Id` | `metadata.external_id` | |
| `Payment.TxnDate` | `original_capture_date` | DATE |
| `Payment.TotalAmt` | `metadata.payment_amount` | |
| `Payment.CustomerRef.name` | `metadata.customer_name` | |
| `Payment.PaymentMethodRef.name` | `metadata.payment_method` | "Check", "Credit Card", "ACH" |
| `Payment.Line[].LinkedTxn[]` | `metadata.applied_to_invoices` | Array of invoice IDs |
| Derived | `metadata.payment_type` | See payment type classification below |
| `"instruction"` | `trust_tier` | Confirmed received payments are instruction tier |
| `"hard"` | `soft_or_hard` | |

### Payment Type Classification

| Customer name / memo pattern | `metadata.payment_type` |
|-----------------------------|------------------------|
| Contains known carrier name (State Farm, Allstate, Travelers, etc.) + "ACV" | `"acv_insurance"` |
| Contains known carrier name + "depreciation" or "RCV" | `"rcv_supplement"` |
| Contains "supplement" | `"supplement"` |
| Contains carrier name (no ACV/RCV keyword) | `"insurance_general"` |
| Standard customer payment | `"customer"` |
| Internal transfer | `"internal"` |

When `payment_type` is any insurance variant, the bridge attempts to match `metadata.customer_name`
to an open `public.insurance_claim` by carrier name and links `metadata.claim_id`.

---

## 3. Bill (Subcontractor Invoice) → `public.thoughts` atom

**QBO endpoint:** `GET /v3/company/{realmId}/bill/{billId}`

| QBO Field | Brain Field | Transform |
|-----------|-------------|-----------|
| `Bill.Id` | `metadata.external_id` | |
| `Bill.VendorRef.name` | `metadata.vendor_name` | Subcontractor name |
| `Bill.TxnDate` | `original_capture_date` | |
| `Bill.TotalAmt` | `metadata.bill_amount` | |
| `Bill.ClassRef.name` | `metadata.qbo_class` | Job class for cost allocation |
| `"sub_cost"` | `metadata.payment_type` | |
| `"evidence"` | `trust_tier` | Bill received, not yet paid → evidence |
| SHA-256(`quickbooks:{BillId}:bill:{TotalAmt}`) | `content_fingerprint` | |

**Content:** `"Subcontractor bill from {vendor}: ${TotalAmt} for class {class}. Received {date}."`

---

## 4. Job Cost Linkage

The bridge links financial atoms to `public.job` via QBO class names. The mapping strategy:

```
1. Read QBO classes: GET /v3/company/{realmId}/query?query=SELECT * FROM Class
2. For each class, attempt to match to public.job by:
   a. Exact match: class.Name == job.title
   b. Partial match: class.Name contains job.external_ref (AccuLynx job ID)
   c. Address match: class.Name contains a property address fragment
3. Matched jobs are stored in adapter config cache.
4. Unmatched transactions: set metadata.qbo_class_unlinked = true; flag for human review.
```

---

## 5. Insurance Supplement Accounting Flow

The full financial trail for an insurance job produces the following atom sequence:

| Event | `metadata.payment_type` | `trust_tier` | When |
|-------|------------------------|-------------|------|
| Invoice issued (ACV amount) | `"invoice"` | `"evidence"` | At claim approval |
| ACV check received | `"acv_insurance"` | `"instruction"` | On carrier payment |
| Supplement invoice issued | `"invoice"` | `"evidence"` | Post-supplement approval |
| Depreciation recovery check | `"rcv_supplement"` | `"instruction"` | On final carrier payment |
| Deductible collected from homeowner | `"customer"` | `"instruction"` | At contract signing |

This sequence, when complete, gives `@ob-accounting` the full recovery picture:
total claim value, amounts recovered, deductible netted, final job margin.

---

## Fields Not Mapped

| QBO Field | Reason |
|-----------|--------|
| `Invoice.EmailStatus` | CRM function; not needed in brain |
| `Invoice.BillEmail` | PII — not stored |
| `Payment.ARAccountRef` | Internal QB ledger; not job-relevant |
| Tax details (`TxnTaxDetail`) | Tax compliance is QB's domain; not atomized |
| Attachments | QuickBooks attachments are not downloaded; only AccuLynx + CompanyCam photo atoms are used |
