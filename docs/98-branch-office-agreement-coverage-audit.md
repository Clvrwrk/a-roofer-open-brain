# 98 — Branch → office → agreement coverage audit (2026-08-19)

Follow-on from docs/97. Four questions from Chris, answered against prod.

## 1. "Shipping Branch" on the invoice PDF — is it in the API?

**Yes. It is the field we already key on.** The PDF's `Shipping Branch: 113 Wichita, KS
(316) 265-8276` is the API's `branch` object:

```json
"branch": { "number": "113", "name": "113 Wichita, KS", "city": "Wichita",
            "state": "KS", "postal": "67214-4015", "addressLine1": "1321 E 1st St N", "phone": "" }
```

Verified on the invoice in the screenshot (`2008759785-001`): `branch_number_extracted =
'113'`, matching the PDF exactly. No OCR is needed and none is performed for this field.

My earlier phrasing — "there is no Ship By Branch field" — was literally true of the field
*name* and unhelpful about the substance. ABC labels it `branch` in JSON and "Shipping
Branch" on the printed form; they are the same thing, and it is hop 0 of the pricing chain.
The only thing the PDF carries that the API does not is the branch **phone number** (the
API returns `""`).

## 2. Do SRS and QXO follow the same workflow as ABC?

**No — three materially different pipelines.** This matters because "the workflow" has been
described as if it were one thing.

| | ABC | SRS | QXO |
|---|---|---|---|
| ingest | **REST API** (`partners.abcsupply.com`) + CSV history | **PDF extraction** | **PDF extraction** |
| invoices | 1,089 (`abc_invoices`) | 90 (`vendor_invoices`) | 6 (`vendor_invoices`) |
| raw payload | full structured JSON | `{source_file, return_address, notes}` | `{file, source}` |
| branch key | `raw->'branch'->>'number'` → **number match** | `vendor_branch_id` **FK**, 90/90 | `vendor_branch_id` **NULL, 0/6** |
| agreements | `abc_price_agreements` / `abc_price_list_items` | `price_agreements` / `price_agreement_items` | same tables — **none exist** |
| office → agreement | `mv_office_agreement_versions`, **latest non-superseded version** as at the invoice date | direct join on `is_active` + `effective_date <=` — **no supersession logic** | n/a |
| can price today | yes | yes | **no** |

Three asymmetries worth fixing:

1. **QXO invoices carry no `vendor_branch_id`** (0 of 6). The vendor arm of
   `v_invoice_audit_invoice` joins `vendor_branches ON vb.id = vi.vendor_branch_id`, so QXO
   resolves no branch → no office → no price, even if agreements existed.
2. **SRS has no version-supersession rule.** ABC picks the latest non-superseded version of
   an agreement number for the office as at the invoice date. SRS takes any active
   agreement with `effective_date <= invoice_date`, ordered by UOM match then *lowest
   price*. A superseded SRS agreement can therefore win.
3. **QXO has no agreements at all** (see §4).

## 3. Match on `branch.storefront` — do SRS and QXO have the same key?

**No, and it would not solve the collision.** Verified:

- `storeFront` / `branch.storefront` is present on ABC records and is **always the constant
  `"abc"`** — 676 invoices and all 3,178 orders. It identifies the API you called, not the
  vendor of a given branch.
- SRS and QXO are **PDF-sourced**. Their `raw` is a file pointer; there is no storefront, no
  branch object, no structured vendor key.

So storefront cannot police the ABC↔QXO branch-number collision, because QXO never comes
through that API. The structural key is our own `vendors.id` FK on `vendor_branches` and
`vendor_invoices` — which is exactly what migration 238 enforces. Retracting my earlier
suggestion that storefront would make the silo structural: it would not.

## 4. Are branches 472, 184, 516 outside the 2-hour window?

**No — and my earlier read was wrong twice over.** Those were **QXO's** rows. ABC had **no
row at all** for those numbers, which is precisely why the unscoped lateral reached for
QXO's. Five ABC branch numbers appear on real invoices with no `vendor_branches` row:

| ABC branch | inside a 2h isochrone? | invoices | value |
|---|---|---:|---:|
| 472 Lenexa, KS | **yes — Kansas City, MO** | 1 | −$422.14 |
| 184 Conley, GA | **yes — Atlanta (Jonesboro), GA** | 1 | $2,477.60 |
| 516 Doraville, GA | **yes — Atlanta (Jonesboro), GA** | 2 | $1,302.79 |
| 519 Smyrna, GA | **yes — Atlanta (Jonesboro), GA** | 2 | $1,446.51 |
| 036 Longview, TX | no — outside every boundary | 1 | $145.74 |

Fixed by **migration 239**: backfilled from the ABC branch master with office assignment
computed by `ST_Contains` against each office's stored isochrone. Not hand-assigned.

### The wider audit — every covered branch vs. its office's agreement

Every branch **already in** `vendor_branches` and inside a 2-hour boundary is assigned to an
office — 0 gaps across all three vendors (ABC 68, QXO 59, SRS 38). The gap is one level up:
**8 of 15 (office × vendor) pairs have covered branches and no agreement at all.**

| office | vendor | covered branches | agreements |
|---|---|---:|---:|
| Atlanta (Jonesboro), GA | ABC | 19 | **0** |
| Atlanta (Jonesboro), GA | QXO | 12 | **0** |
| Atlanta (Jonesboro), GA | SRS | 11 | **0** |
| Denver (Greenwood Village), CO | QXO | 14 | **0** |
| Kansas City, MO | QXO | 13 | **0** |
| Kansas City, MO | SRS | 3 | **0** |
| Richardson, TX | QXO | 15 | **0** |
| Wichita, KS | QXO | 5 | **0** |
| Denver | ABC | 16 | 3 |
| Denver | SRS | 10 | 1 |
| Kansas City, MO | ABC | 9 | 1 |
| Richardson, TX | ABC | 23 | 2 |
| Richardson, TX | SRS | 17 | 1 |
| Wichita, KS | ABC | 7 | 4 |
| Wichita, KS | SRS | 2 | 1 |

Two headlines:

- **QXO has zero agreements at every office** — 59 covered branches with no negotiated book.
- **Atlanta has zero agreements for any vendor** — 42 covered branches. $5,226.90 of ABC
  spend across 5 invoices already sits there and cannot be audited.

Also: the **Euless, TX** office has **0 branches assigned** to it at all.

The four newly-covered branches still price as no-price, and correctly so: Atlanta has no
agreement, and the Lenexa invoice's three items (`02MLVIA3HE`, `GGA2620TB`, `SGDE185TB`) are
simply not on the Kansas City agreement — an item-coverage gap, which is what the Agreement
Gaps queue exists to work.

## What to do next, in order

1. **Get an ABC agreement on file for Atlanta.** 19 covered branches, $5.2k already invoiced
   and un-auditable.
2. **Decide what QXO is.** 59 covered branches, 6 PDF-extracted invoices, no agreements, no
   branch FK. Either it is a real vendor to negotiate and wire up, or its branches should not
   be marked covered.
3. **Populate `vendor_branch_id` on QXO invoices**, or QXO can never price.
4. **Give SRS the same version-supersession rule as ABC**, so a superseded agreement cannot
   win on lowest price.
5. **Euless, TX has no branches** — confirm the office is real and in use.
6. Re-run this audit whenever a branch is added; the queries are in this doc's git history.
