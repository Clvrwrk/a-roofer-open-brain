# AccuLynx Estimates and Invoices → JobTread Documents

Target organization: Pro Exteriors (`22PazeRM5FCH`).

This is a mapping contract, not an execution record. Research was read-only: no
JobTread API call was made and every database statement was a `SELECT`. A loader
must read credentials from `SUPABASE_ACCESS_TOKEN` and `JOBTREAD_GRANT_KEY`; no
credential value belongs in code, logs, or crosswalk data. The organization has
one seat. The loader must never create users or memberships; any source
salesperson, creator, modifier, representative, or assignee is descriptive
custom-field/text data only.

## Source Tables

- `public.acculynx_estimates` — verified live; **rows = 210**, of which 34 have
  `archived_at IS NULL`. These are estimate stubs, not complete estimates:
  `title`, `created_date`, and `total_price` are null in all 210 rows, and `raw`
  contains only `_link`, `id`, `isPrimary`, and `job`.
- `public.acculynx_invoices` — verified live; **rows = 1,660**, all unarchived.
  The normalized header is usable. `raw.sections` contains 1,930 sections and
  4,867 embedded items across all 1,660 invoices.
- `public.acculynx_invoice_lines` — verified live; **rows = 0**. Its declared
  columns describe the intended normalized line shape, but it supplies no live
  data. Invoice items must currently be read from
  `public.acculynx_invoices.raw.sections[*].items[*]`.
- **MISSING IN MIRROR: complete estimate headers, sections, and items.** Backfill
  from `GET /jobs/{jobId}/estimates` and
  `GET /estimates/{estimateId}/sections/{sectionId}/items`. These are the
  estimate endpoints identified in
  `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md`
  under Financials/Estimates and in the ingest interpretation at
  `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/mapping.md`.
  The AccuLynx guide recommends date-window pagination for large backfills and
  documents limits of 10 requests/second per API key and 30 requests/second per
  IP.
- **MISSING IN MIRROR: normalized invoice-line rows.** The invoice list payload
  already embeds the needed section/item values, so the loader can use those
  arrays without calling AccuLynx. If a future ingest needs to reconstruct them,
  use the invoice/financials read surface described in
  `/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx/API.md`;
  the local guide does not state an exact invoice-detail path, so that endpoint
  is **unknown** and must be confirmed from the full AccuLynx endpoint reference.

## Target Pave Ops

Only these mutations are in the authoritative
`schema-surface.json` and are required by this contract:

- `createDocument` — create an AccuLynx estimate or invoice as a JobTread
  document. Its documented top-level inputs include `externalId`, `jobId`,
  `accountId`, `type`, `name`, `description`, `issueDate`, `dueDate`, `tax`,
  `taxRate`, `lineItems`, and display/payment options.
- `updateDocument` — update the document found through the crosswalk. Its
  documented inputs include `id`, `externalId`, `lineItems`, and `status`.

No user, membership, payment, recipient, reference, send, or delete operation is
part of this mapping. In particular, a source state of `Paid` is not sufficient
evidence to invent a JobTread payment record.

Document types:

- AccuLynx estimate → JobTread `customerOrder`. The local JobTread schema/examples
  treat approved job sales documents as `customerOrder`; they do not establish
  `estimate` as a valid document type. Therefore `estimate` must not be sent
  unless a later schema inspection proves it is an accepted enum.
- AccuLynx invoice → JobTread `customerInvoice`, explicitly shown by the local
  JobTread examples.

`createDocument` exposes the top-level `lineItems` input, but the local schema
snapshot does not expand that input's child type. The exact nested object shape
is therefore **unknown**. The schema separately shows cost-item concepts such as
`name`, `description`, `quantity`, `unitPrice`, `unitCost`, `costCodeId`,
`costTypeId`, `unitId`, `positionAfter`, and grouping, but this contract does not
assume all of those are legal inside `createDocument.lineItems`. The loader must
validate the nested input type in the JobTread Explorer/schema before its first
write.

## Field Mapping

### Estimates

| Source column/path | Pave input field | Type notes and transform |
| --- | --- | --- |
| `acculynx_estimates.id` | `createDocument.externalId` | Text GUID. Namespace as `acculynx:estimate:{account_key}:{id}` because source IDs are partitioned by account. |
| `acculynx_estimates.job_id` | `createDocument.jobId` | Resolve `(account_key, job_id)` through the job crosswalk; do not load without one unambiguous JT job. |
| constant | `createDocument.type` | `customerOrder`; do not use unverified `estimate`. |
| `title` | `createDocument.name` | Text; currently null in every row. After detail backfill use source title, else deterministic fallback `AccuLynx Estimate {estimate_number or id}`. |
| `description`, `notes` | `createDocument.description` | Trim and join nonblank values with a labeled separator. Currently completeness is unknown. |
| `estimate_number` | `createDocument.subject` or `name` suffix | Text; nullability allowed. There is no documented `number` create input. |
| `created_date` | `createDocument.issueDate` | UTC timestamp/date after detail backfill; currently null in every row. Do not substitute `synced_at` as a business date. |
| `total_price` | reconciliation only | Numeric; currently null in every row. Do not create a priced estimate until detail is backfilled and reconciled. |
| `tax_total` | `createDocument.tax` | Numeric currency amount, only after detail backfill and reconciliation. |
| `tax_rate` | `createDocument.taxRate` | Numeric rate; scale is unknown (fraction versus percentage) and must be profiled after backfill. |
| `raw` estimate sections/items | `createDocument.lineItems` | Missing today. Preserve section order and item order. Exact Pave child input shape is unknown pending schema validation. |
| `is_primary` | descriptive text/custom-field value | Boolean; never an assignee. Could label the document “Primary” without creating a user. |
| `created_by_user_id`, `modified_by_user_id` | descriptive custom-field/text value | Source identifiers only; never create or assign a JT user. |
| `archived_at`, `archive_reason` | loader eligibility/audit | Exclude archived estimates by default; retain reason in loader audit output. |

### Invoices

| Source column/path | Pave input field | Type notes and transform |
| --- | --- | --- |
| `acculynx_invoices.id` | `createDocument.externalId` | Text GUID; namespace as `acculynx:invoice:{account_key}:{id}`. |
| `acculynx_invoices.job_id` | `createDocument.jobId` | Resolve `(account_key, job_id)` through the job crosswalk. |
| constant | `createDocument.type` | `customerInvoice`. |
| `invoice_name` | `createDocument.name` | Text; fallback `AccuLynx Invoice {invoice_number or id}`. |
| `invoice_number`, `invoice_sequence` | `createDocument.subject` / description | Preserve as labeled source metadata. `createDocument` has no documented `number` input. |
| `invoice_date` | `createDocument.issueDate` | `timestamptz`; normalize to the date expected by Pave without changing the source instant in the audit record. |
| `due_date` | `createDocument.dueDate` | Source is text. Only 461 values match a leading `YYYY-MM-DD`; 1,199 are blank. Send null for blank/unparseable values. |
| `total_price` | reconciliation control | Numeric header total; do not send as a separate invented Pave field. It must equal the computed JT price after line/tax transformation. |
| `balance_due` | descriptive custom-field/text value | Numeric snapshot. It cannot establish payment events or payment dates. |
| `current_invoice_state` | `updateDocument.status` | Proposed mapping below; apply only after the enum is schema-validated. |
| `raw.sections[*].invoiceWorkSheetSectionType` | `lineItems` grouping/description | Values observed: `Invoice`, `InsuranceClaim`, `Discount`, `WorkNotDoing`, `ChangeOrder`, `Supplement`, `Upgrade`. Preserve as group label if the validated child input supports groups; otherwise prefix item descriptions. |
| `raw.sections[*].id` | loader line crosswalk metadata | Text GUID; namespace with account and invoice. |
| `raw.sections[*].totalPrice` | section reconciliation control | Numeric. Paid and unpaid headers reconcile exactly to section totals. |
| `raw.sections[*].items[*].id` | loader line crosswalk metadata | Text GUID. The empty normalized table calls the equivalent column `id`. |
| `...itemName` | `lineItems` child name | Text, subject to nested-input validation. Equivalent normalized column: `item_name`. |
| `...price` | `lineItems` child price candidate | Numeric. Source exposes no quantity/UOM; do not infer that this is a unit price until validated. Equivalent normalized column: `price`. |
| `...totalPrice` | `lineItems` extended-total control | Numeric. If no quantity is available, the safest provisional transform is one quantity at the extended total, but only after child-schema validation. Equivalent normalized column: `total_price`. |
| `...hierarchySortOrder` | `lineItems` ordering | Integer; stable ascending order within section. Equivalent normalized column: `hierarchy_sort_order`. |
| `...parentId` | group/hierarchy reconstruction | Present on 102 of 4,867 embedded items. Preserve the relation; do not double-count parent and child totals. |
| `...referenceType`, `...tradeId` | description/custom-field value | Preserve as source metadata; no verified direct Pave field. |
| `archived_at`, `archive_reason` | loader eligibility/audit | All 1,660 invoices are currently unarchived. |

Proposed status policy:

| AccuLynx state | JobTread handling | Rationale |
| --- | --- | --- |
| `Unpaid` (351) | `pending` | `pending customerInvoice` is explicitly used by the JobTread “open invoices” example. |
| `Paid` (1,097) | `approved`, plus retain `balance_due` as source metadata | `approved customerInvoice` is a documented state, but it does **not** reproduce payment history. Do not call a payment operation without source payment IDs, amounts, and dates. |
| `Void` (212) | quarantine/skip by default | The local snapshot does not establish a legal void/canceled document status. Do not create an apparently collectible invoice and do not use a delete operation. If business requires visibility, load only after a human chooses a validated JT status and representation. |
| Estimate (no state present) | leave at create default/draft | The source mirror has no estimate lifecycle field. Never infer pending/approved from `is_primary`. |

If the JobTread schema rejects any proposed status enum, stop that row and record
an actionable error; do not silently substitute a different state.

## Gaps & Risks

- Estimate fidelity is currently insufficient: all 210 rows lack normalized
  title, creation date, and total, and their raw JSON contains no sections/items.
  They are identifiers for a backfill, not load-ready sales documents.
- `acculynx_invoice_lines` is empty. Embedded invoice JSON is usable now, but
  relying on it couples the loader to the raw payload until normalization is
  repaired.
- The nested type of `createDocument.lineItems`, its required fields, grouping
  syntax, and replacement-versus-merge behavior on `updateDocument` are unknown
  from the approved local snapshot. A schema/Explorer preflight is mandatory.
- Quantity and UOM are absent from embedded invoice items. `price` and
  `totalPrice` must not be treated as proven unit-price math. The provisional
  quantity-one representation loses original quantity/UOM fidelity.
- Item hierarchies can contain parent totals and child totals. Summing every item
  double-counts some invoices; section totals are the authoritative intermediate
  control.
- Section totals reconcile to invoice headers for all 1,097 Paid and all 351
  Unpaid invoices. Of 212 Void invoices, 199 do not reconcile; their section
  totals appear to preserve pre-void economics while the header reflects the
  void. Quarantine voids rather than forcing a balancing line.
- `Paid` is an AccuLynx collection state, while JobTread document `approved`
  describes document status. Without mirrored payment transaction detail,
  payment dates/methods and true paid state are lost.
- Taxes are not separately normalized on invoices. Do not invent `tax`,
  `taxRate`, or taxable flags from the total alone.
- Job/account crosswalks are dependencies outside these three tables. A missing
  or ambiguous `(account_key, job_id)` must block the document.
- Source IDs must include `account_key` in every natural key. Reusing a bare GUID
  risks cross-account collisions.
- The local JobTread guide says rate limiting is per grant but gives no numeric
  limit. Use conservative serial/concurrency-limited writes, honor `429` and
  retry hints with exponential backoff plus jitter, and never retry a create
  unless idempotency has been proven by lookup/crosswalk.
- AccuLynx backfill limits are documented as 10 requests/second per key and 30
  requests/second per IP. Page by date/job, back off on `429`, and retry only
  idempotent reads.
- JobTread grant keys are carried in the Pave root body and are easy to leak.
  Redact request bodies and refer to `JOBTREAD_GRANT_KEY` by env-var name only.
- No new users may ever be created. Source user/representative fields remain
  strings/custom-field values and must never become memberships or assignees.

## Loader Plan

1. **Preflight without mutation.** Validate organization id `22PazeRM5FCH`,
   accepted `customerOrder`/`customerInvoice` types, document status enums, and
   the exact nested `lineItems` input. Confirm whether `externalId` is queryable
   and unique within the organization and whether `updateDocument.lineItems`
   replaces or merges children.
2. **Build dependencies first.** Require existing account/location/job mappings.
   Resolve source job key `(account_key, job_id)` to exactly one JT `jobId` and,
   when required by the document type, its customer `accountId`. Never create a
   user or membership.
3. **Maintain a durable crosswalk** outside this read-only contract:
   `(source_system='acculynx', entity_type, account_key, acculynx_guid) ->
   (jt_organization_id, jt_id, source_modified_at, payload_hash, synced_at)`.
   Use entity types `estimate`, `invoice`, `invoice_section`, and `invoice_item`.
   The primary idempotency key is
   `(entity_type, account_key, acculynx_guid, jt_organization_id)`.
4. **Backfill estimates before loading them.** Use the two documented estimate
   read endpoints, persist complete headers/sections/items through the owning
   ingest process, then rerun counts and total reconciliation. Do not generate
   zero-dollar placeholders from the current stubs.
5. **Normalize invoice payloads in memory.** Sort sections in source array order
   and items by `hierarchySortOrder`; retain section/item GUIDs and parent links.
   Exclude/quarantine void invoices. Translate sections to groups only if the
   validated nested input supports them.
6. **Reconcile before mutation.** For Paid/Unpaid invoices require:
   `round(sum(section.totalPrice), 2) = round(invoice.total_price, 2)`. After
   transformation, calculate the intended JT line/group/tax total and require
   the same equality. Never add an unlabeled “rounding” or “migration” line to
   conceal a material mismatch. Permit at most $0.01 only if JobTread's rounding
   rules have been proven; otherwise quarantine.
7. **Idempotent upsert.** Look up the crosswalk first and, if supported, confirm
   by the namespaced `externalId`. No match: call `createDocument` once, request
   its `id`, and atomically record the crosswalk. Existing match with changed
   payload hash: call `updateDocument` by JT `id`. Same hash: no-op. Conflicting
   externalId or multiple matches: stop and review. Never use delete/recreate as
   an update strategy.
8. **Apply state separately.** Create the content, verify returned totals, then
   apply the validated status with `updateDocument`. Keep estimates draft,
   Unpaid invoices pending, and Paid invoices approved under the proposed policy.
   Keep voids quarantined until their representation is approved.
9. **Batch conservatively.** Start with one reconciled invoice in a non-production
   validation context, then a human-approved 10-document cohort. For the eventual
   production run, process **25 documents per checkpoint**, one mutation in
   flight per grant initially. Persist a checkpoint after each document, back
   off with jitter on `429`/transient failures, and pause on schema or total
   errors. Batch size is an operational checkpoint, not a single Pave request.
10. **Post-write controls.** Compare JT document id/type/status, source
    `externalId`, line count, and total against the source control record. Report
    created/updated/skipped/quarantined counts and dollar deltas. Do not send
    documents or notifications.

## Evidence

All evidence below came from live project `rnhmvcpsvtqjlffpsayu` on
2026-07-27. Statements were submitted through the Supabase database-query
endpoint using `SUPABASE_ACCESS_TOKEN`. Only `SELECT` and
`information_schema` reads were used.

### Verified table shapes

```sql
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'acculynx_estimates',
    'acculynx_invoices',
    'acculynx_invoice_lines'
  )
ORDER BY table_name, ordinal_position;
```

Result: all three exact tables were present. Verified column counts:
`acculynx_estimates` = 29, `acculynx_invoices` = 20, and
`acculynx_invoice_lines` = 17.

### Live row counts and completeness

```sql
SELECT 'acculynx_estimates' AS table_name,
       count(*) AS rows,
       count(*) FILTER (WHERE archived_at IS NULL) AS active_rows
FROM public.acculynx_estimates
UNION ALL
SELECT 'acculynx_invoices', count(*),
       count(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_invoices
UNION ALL
SELECT 'acculynx_invoice_lines', count(*),
       count(*) FILTER (WHERE archived_at IS NULL)
FROM public.acculynx_invoice_lines;
```

- `acculynx_estimates`: **rows = 210**; active rows = 34.
- `acculynx_invoices`: **rows = 1,660**; active rows = 1,660.
- `acculynx_invoice_lines`: **rows = 0**; active rows = 0.

```sql
SELECT count(DISTINCT job_id) AS jobs,
       count(*) FILTER (WHERE total_price IS NULL) AS null_total_price,
       count(*) FILTER (WHERE title IS NULL) AS null_title,
       count(*) FILTER (WHERE is_primary) AS primary_rows,
       min(created_date) AS min_created,
       max(created_date) AS max_created
FROM public.acculynx_estimates;
```

Result: **rows = 210**, jobs = 182, null total rows = 210, null title rows =
210, primary rows = 182, and both created-date bounds are null.

```sql
SELECT current_invoice_state, count(*) AS rows
FROM public.acculynx_invoices
GROUP BY current_invoice_state
ORDER BY rows DESC;
```

Result: Paid **rows = 1,097**; Unpaid **rows = 351**; Void
**rows = 212**.

```sql
SELECT count(*) FILTER (
         WHERE due_date ~ '^\d{4}-\d{2}-\d{2}'
       ) AS parseable_due_dates,
       count(*) FILTER (WHERE due_date = '') AS blank_due_dates
FROM public.acculynx_invoices;
```

Result over **rows = 1,660**: parseable due dates = 461; blank due dates =
1,199.

### Raw payload coverage

```sql
SELECT key, count(*) AS rows_with_key, jsonb_typeof(raw->key) AS value_type
FROM public.acculynx_estimates
CROSS JOIN LATERAL jsonb_object_keys(raw) AS key
GROUP BY key, jsonb_typeof(raw->key)
ORDER BY key;
```

Result over **rows = 210**: only `_link`, `id`, `isPrimary`, and `job` occur,
each on all 210 rows.

```sql
SELECT count(*) AS invoice_rows,
       sum(jsonb_array_length(raw->'sections')) AS total_sections,
       count(*) FILTER (
         WHERE jsonb_array_length(raw->'sections') = 0
       ) AS invoices_zero_sections,
       min(jsonb_array_length(raw->'sections')) AS min_sections,
       max(jsonb_array_length(raw->'sections')) AS max_sections
FROM public.acculynx_invoices;
```

Result: **rows = 1,660**, total sections = 1,930, invoices with zero
sections = 0, min sections = 1, max sections = 5.

```sql
WITH items AS (
  SELECT i.id AS invoice_id, i.account_key,
         section->>'invoiceWorkSheetSectionType' AS section_type,
         item
  FROM public.acculynx_invoices AS i
  CROSS JOIN LATERAL jsonb_array_elements(i.raw->'sections') AS section
  CROSS JOIN LATERAL jsonb_array_elements(section->'items') AS item
)
SELECT count(*) AS embedded_items,
       count(DISTINCT invoice_id) AS invoices_with_items,
       count(*) FILTER (WHERE item = '{}'::jsonb) AS empty_items
FROM items;
```

Result: embedded item **rows = 4,867**, invoices with items = 1,660, empty
items = 0. Item-key inspection found `id`, `itemName`, `price`, `totalPrice`,
`hierarchySortOrder`, and `referenceType` on all 4,867 rows; `parentId` on 102
and `tradeId` on 47.

```sql
SELECT section->>'invoiceWorkSheetSectionType' AS section_type,
       count(*) AS rows
FROM public.acculynx_invoices
CROSS JOIN LATERAL jsonb_array_elements(raw->'sections') AS section
GROUP BY section->>'invoiceWorkSheetSectionType'
ORDER BY rows DESC;
```

Result: Invoice **rows = 1,451**; InsuranceClaim = 360; Discount = 44;
WorkNotDoing = 30; ChangeOrder = 24; Supplement = 12; Upgrade = 9.

### Totals reconciliation

```sql
WITH section_sums AS (
  SELECT i.id, i.account_key, i.current_invoice_state,
         i.total_price AS invoice_total,
         sum((section->>'totalPrice')::numeric) AS section_sum
  FROM public.acculynx_invoices AS i
  CROSS JOIN LATERAL jsonb_array_elements(i.raw->'sections') AS section
  GROUP BY i.id, i.account_key, i.current_invoice_state, i.total_price
)
SELECT current_invoice_state,
       count(*) AS rows,
       count(*) FILTER (
         WHERE abs(section_sum - invoice_total) <= 0.01
       ) AS reconciled_penny,
       count(*) FILTER (
         WHERE abs(section_sum - invoice_total) > 0.01
       ) AS mismatch_penny,
       min(section_sum - invoice_total) AS min_delta,
       max(section_sum - invoice_total) AS max_delta
FROM section_sums
GROUP BY current_invoice_state
ORDER BY current_invoice_state;
```

Result:

- Paid: **rows = 1,097**; reconciled = 1,097; mismatched = 0.
- Unpaid: **rows = 351**; reconciled = 351; mismatched = 0.
- Void: **rows = 212**; reconciled = 13; mismatched = 199; delta range
  = -10,181.18 to 506,562.00.

The evidence supports section totals as the pre-load control for non-void
invoices and supports quarantining voids. It does not establish the exact nested
Pave line-item input, tax treatment, or a lossless payment migration; those
remain explicit preflight gaps.
