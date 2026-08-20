# 97 — Price-agreement resolution chain + silo audit (2026-08-19)

Walkthrough of how an invoice reaches a price agreement, and an audit of the three
boundaries that must never bleed: **vendor ↔ branch**, **PE office ↔ vendor**,
**PE office ↔ branch**.

## The chain, hop by hop (ABC)

### Hop 0 — which field identifies the branch

`abc_invoices.branch_number_extracted` is a **generated column**:
`NULLIF(raw->'branch'->>'number','')`. It comes from the ABC API's `branch` object:

```json
"branch": { "number": "97", "name": "097 Wichita, KS", "city": "Wichita", "state": "KS" }
```

**There is no "Ship By Branch" field in the ABC payload.** Neither the invoice API nor the
orders API exposes one. What exists:

| field | what it is | used for pricing? |
|---|---|---|
| `branch.number` | the ABC branch that owns/fulfils the order | **yes — this is the key** |
| `branch.storefront` | vendor discriminator (`"abc"`) | not yet used (see follow-ups) |
| `shipTo.number` | PE customer ship-to **account** (`2036874-16`), not a branch | secondary tier only |
| `soldTo` / `billTo` | PE master + billing accounts | no |
| `shipment.delivery` / `shipments[]` | delivery address, shipment number, status | no — **no branch on a shipment** |

A worked example of why the distinction matters: invoice `2013447570-001` has
`branch.number = 97` (Wichita, KS) while `shipTo` is account `2036874-16` whose address is
PE's **Richardson, TX** office. Pricing follows the branch, not the ship-to address.

### Hop 1 — branch → PE office (`v_invoice_pricing_office`)

```sql
abc_invoices i
JOIN vendor_branches vb ON vb.branch_number = i.branch_number_extracted
                       AND vb.pricing_status = 'covered'
JOIN vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'   -- vendor-scoped
WHERE vb.pricing_territory_office_id IS NOT NULL
```

Only **covered** branches carry a `pricing_territory_office_id`: ABC 70 of 756, SRS 43 of
453, QXO 59 of 566. An out-of-boundary branch resolves no office, so its lines price as
no-price rather than borrowing a neighbour's book.

### Hop 2 — PE office → agreement versions (`v_office_agreement_versions`)

```sql
abc_price_agreements a
LEFT JOIN abc_price_agreement_branch_matches m ON m.abc_price_agreement_id = a.id
JOIN vendor_branches vb ON vb.pricing_status = 'covered'
     AND ltrim0(vb.branch_number) = ltrim0(COALESCE(a.branch_number, m.branch_number))
JOIN vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'   -- vendor-scoped
WHERE a.agreement_number !~* '^API-' AND EXISTS (items on the agreement)
```

API-sourced pseudo-agreements are excluded from the negotiated book; they are a separate
benchmark cascade.

### Hop 3 — agreement → line price (three sub-tiers, first match wins)

Inside `v_invoice_audit_invoice`, per line, ordered by `pri, unit_match DESC, match_rank`:

1. **item number** on the office's latest non-superseded version as at the invoice date
2. **description** — exact/prefix, then trigram similarity ≥ 0.45
3. **ship-to branch match** — `abc_price_agreement_branch_matches.ship_to_number`,
   **gated by an EXISTS back onto the invoice's own office**, so it can only ever select an
   agreement already in that office's set

"Latest non-superseded" is a `NOT EXISTS` on a newer version of the *same agreement number*
for the *same office* effective on or before the invoice date — which is why a lapsed
agreement still prices when nothing replaced it (the "expired at invoice date" warning on
the credit-memo evidence panel).

Finally, the resolved price counts **only if the UOM matches identically**
(`NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom`); otherwise the line is no-price
rather than compared across units.

### The non-ABC arm (SRS, QXO)

```sql
price_agreements pa
JOIN vendor_branches vb2 ON vb2.id = pa.vendor_branch_id
                        AND vb2.pricing_territory_office_id = vb.pricing_territory_office_id  -- office
JOIN price_agreement_items pai ON pai.agreement_id = pa.id AND (item OR description match)
WHERE pa.vendor_id = vi.vendor_id                                                             -- vendor
  AND pa.is_active IS NOT FALSE AND pa.effective_date <= vi.invoice_date
```

The invoice's branch comes from `vendor_invoices.vendor_branch_id` — a real FK, so it
cannot resolve the wrong vendor by construction.

## Silo audit

| boundary | verdict |
|---|---|
| **vendor ↔ branch** (pricing) | **clean.** Both ABC hops filter `vendors.slug = 'abc-supply'`; the vendor arm filters `pa.vendor_id = vi.vendor_id`. |
| **PE office ↔ vendor** | **clean.** The ABC arm reads only `abc_price_*` tables; the vendor arm is vendor_id-filtered. No office can lend vendor A's book to vendor B. |
| **PE office ↔ branch** | **clean.** Agreements are selected for the invoice's own office, including the ship-to sub-tier, which is EXISTS-gated back onto that office. |
| **vendor ↔ branch** (display) | **WAS BLEEDING — fixed, migration 238.** |

### The display bleed

`v_invoice_audit_invoice` resolved `branch_name` and `office` from `vendor_branches` on the
**bare branch number with no vendor filter**. ABC and QXO share **33 branch numbers** (QXO
carries ABC's numbering), so `ORDER BY (office IS NOT NULL) DESC LIMIT 1` could return
QXO's row for an ABC invoice.

Live effect: **4 ABC invoices** resolved a QXO branch row; **2 displayed the wrong PE
office**:

| invoice | ABC branch | was shown under | now |
|---|---|---|---|
| `2009375632-001` | 472 Lenexa, KS | Richardson, TX (QXO "West Ft. Worth") | Lenexa, KS area |
| `2012882317-001` | 184 Conley, GA | Denver, CO (QXO "Denver Branch") | Conley, GA area |
| `2013245858-001` | 516 Doraville, GA | wrong vendor row; office fell through | unchanged |
| `2013275562-001` | 516 Doraville, GA | wrong vendor row; office fell through | unchanged |

It never reached a price on those rows only because their ABC branches are not `covered`,
so `mv_invoice_pricing_office` had no row at all — they showed another vendor's office next
to no-price lines. That is luck, not design: today no colliding number carries an office on
both vendors, but the first one that does makes the `ORDER BY` a coin flip.

**I had propagated the same unscoped lateral into `v_credit_memo_match` (migration 236b)**,
which put credit memo `2009375632-001` and its $422.14 under Richardson, TX.

Fix: a named, vendor-scoped function `abc_display_branch(branch_no)`, used by both views,
so the next copy cannot silently drop the filter.

Verified after apply: 0 ABC invoices resolve a non-ABC branch row (was 4); row count
unchanged at 1,122; `sum(at_risk)` unchanged at $4,676.63 — pricing untouched.

## Follow-ups this surfaced

1. **`branch.storefront` is the vendor key ABC gives us** and we do not use it. Matching on
   it (rather than inferring the vendor from which table the row landed in) would make the
   vendor silo structural instead of conventional.
2. **Branches 472, 184, 516 have no `pricing_territory_office_id`.** Their invoices price as
   no-price and display a `"<city>, <state> area"` pseudo-office. Assign the office, or
   confirm `out_of_boundary` is correct.
3. The ship-to sub-tier keys on `ship_to_number`, a PE **account**, not a branch. It is
   office-gated so it cannot bleed, but it is worth knowing it is a different key space
   from the other two tiers.
