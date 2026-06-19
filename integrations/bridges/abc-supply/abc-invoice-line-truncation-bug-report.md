# ABC Supply Invoice API — line-item truncation bug report

> Outgoing bug report to ABC Supply's API / Partner Integration team. Copy-paste ready.
> Evidence and tracking context: [`docs/47`](../../../docs/47-external-abc-api-open-conversations.md) (item #2),
> [`docs/48`](../../../docs/48-abc-invoice-ar-and-api-validation-audit.md). Drafted 2026-06-19.

---

**To:** ABC Supply API / Partner Integration team
**From:** Pro Exteriors LLC — API integration (account 2036874)
**Subject:** Bug: Invoice API `GET /invoices/id/{invoiceId}` truncates line items at 10 (header totals correct, line array silently capped)

Hi team,

We've found what looks like a defect in the Invoice API: the invoice-detail endpoint returns a maximum of **10 line items** per invoice, even when the invoice actually has more. The invoice header is complete and correct — only the `lines` array is truncated, with no error, no pagination cursor, and no indication that lines are missing. Details below so your team can reproduce it directly.

**Environment**
- API base: `https://partners.abcsupply.com`
- Auth: OAuth2 client-credentials at `https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357/v1/token`, scope `invoice.read`
- Account (Bill-To): `2036874-1`
- Observed: 2026-06-19, Production

**Endpoint**
`GET /api/invoice/v1/invoices/id/{invoiceId}`

**Steps to reproduce**
1. Obtain a bearer token (client_credentials, scope `invoice.read`).
2. Call `GET /api/invoice/v1/invoices/id/2010452632-001` with `Authorization: Bearer <token>`.
3. Count the elements in the response `lines` array.

**Expected:** `lines` contains all line items on the invoice (this invoice has **26** line items per the official invoice PDF/statement).
**Actual:** `lines` contains exactly **10** items. The remaining 16 are absent. HTTP 200, no warning.

**Evidence (3 invoices, live calls today)**

| invoiceId | `lines` returned | Actual lines (per invoice PDF) | API `subTotal` | API `total` |
|---|---|---|---|---|
| 2010452632-001 | 10 | 26 | 13,296.14 | 14,417.81 |
| 2010874108-001 | 10 | 14 | 8,001.15 | 8,293.74 |
| 2008816395-001 | 10 | 18 | 6,207.63 | 6,750.80 |

Note the `subTotal` and `total` are correct and complete on all three — so the header math is right, but it can't be reconciled against the returned `lines` (the 10 returned lines sum to far less than `subTotal`). The full line set is visible in `GET /api/invoice/v1/invoices/pdf/{invoiceId}`, which confirms the real line counts above.

**Scope of the issue on our account:** across all 560 invoices we've pulled, **zero** have more than 10 lines and **152** sit at exactly 10 — consistent with a hard server-side cap at 10 rather than a coincidence.

**What we ruled out**
- It is not our client truncating — we store the raw response verbatim, and a fresh untouched `curl`/fetch of the endpoint also returns 10.
- We tried to page or expand the line set on the detail endpoint and none had any effect (all still returned 10 lines):
  `?itemsPerPage=100&pageNumber=1`, `?pageSize=100`, `?includeAllLines=true`, `?lineItemsPerPage=100`, `?pageNumber=2`.
- The `pagination` object that the **history** endpoint returns (`GET /api/invoice/v1/invoices/history/{billToAccount}`) does not appear on the detail endpoint, and the detail `lines` array has no pagination metadata or total-count field.

**Business impact**
We rely on invoice line items for price-agreement and unit-of-measure auditing. With lines capped at 10, any invoice longer than 10 lines is silently incomplete, so line-level reconciliation fails for those invoices. We can currently only get full line detail by parsing the PDF, which isn't a viable long-term data path.

**What we'd like**
1. Confirmation of whether `GET /invoices/id/{invoiceId}` has an intended line-item limit, and if so what it is.
2. Either (a) return the full `lines` array, or (b) add pagination on invoice lines (e.g., `pageNumber`/`itemsPerPage`) **plus** a `totalLineCount` field so we can detect and fetch the remainder.
3. Confirmation of whether the same cap affects the Order API line items.

Happy to provide tokens-redacted request/response captures or jump on a call. Thanks for taking a look.

Best,
[Your name]
Pro Exteriors LLC
