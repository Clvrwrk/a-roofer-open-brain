# 105 — Price-agreement silo rules for the invoice audit

**Date:** 2026-08-22 · **Requested by:** Chris Hussey · **Status:** contract
**Related:** docs/46 (UOM), docs/81 §4 (SRS evergreen), migrations 201/205/208/209/217/233/261/264
**Source of truth in code:** `v_invoice_audit_line`

This is the contract for *which negotiated price is allowed to be compared
against which invoice line*. It governs money: everything downstream — variance,
`at_risk`, credit-memo claims sent to a vendor — inherits whatever this decides.

Read alongside [`docs/46`](46-uom-pricing-normalization.md), which governs the
*units* the comparison happens in. This document governs the *pairing*.

---

## 0 · Shape of the thing

`v_invoice_audit_line` is a `UNION ALL` of two arms that never mix:

| arm | invoices | prices | fallback matcher |
|---|---|---|---|
| **ABC** | `abc_invoices` → `v_invoice_lines_complete` | `abc_price_list_items` | trigram `similarity ≥ 0.45` |
| **Vendor** | `vendor_invoices` / `vendor_invoice_lines` | `price_agreement_items` | colour-key equality |

Each arm resolves a single winning price via `LEFT JOIN LATERAL … LIMIT 1`.
Four gates decide *eligibility*; a precedence ladder then decides *which of the
eligible wins*.

---

## 1 · Vendor silo — migration 208

**Branch numbers collide across vendors.** QXO uses numeric branch numbers that
overlap ABC's (113, 249, 304, 412). Once those branches became covered
(migration 207), a branch→agreement join on branch number alone could attribute
an ABC agreement to a non-ABC branch.

> **Rule.** Never join pricing to a branch by bare branch number. Every such
> join must also assert the vendor.

- ABC arms: `JOIN vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'`
- Vendor arm: `pa.vendor_id = vi.vendor_id`

**Consequence, verified 2026-08-22:** an SRS book price *cannot* be attributed
to an ABC invoice audit. Three independent guarantees — the ABC arm contains no
reference to the generic `price_agreements` / `price_agreement_items` at all;
every row of `mv_office_agreement_versions` resolves to `abc_price_agreements`;
and the vendor arm asserts the vendor explicitly. All **2,267** priced ABC lines
resolve to an ABC agreement, zero exceptions.

---

## 2 · Office silo — migrations 205, 217

> Chris, 2026-08-06: *"price agreements are office specific and can't be shared
> amongst PE offices due to regional pricing structures."*

The office is resolved from the **invoice's own branch** — never from ship-to
text, never from the agreement:

```
invoice → vendor_branch_id → vendor_branches.pricing_territory_office_id
```

and that branch must be `pricing_status = 'covered'` with a non-null territory.

- **ABC arm:** `v_invoice_pricing_office` → `mv_office_agreement_versions`, joined
  `ON oav.office_id = io.office_id`
- **Vendor arm:** `vb2.pricing_territory_office_id = vb.pricing_territory_office_id`
  where `vb` is the invoice's branch and `vb2` the agreement's
- **Legacy ship-to fallback:** survives *only* for same-office matches, and must
  additionally prove the agreement is in the invoice's own office set

**What it cost before migration 217 existed**, measured in prod on 2026-08-06:
188 invoice lines priced by an out-of-office agreement, 94 flagged as
overcharges, **65 claim rows across 46 approved credit-memo requests —
$3,212.04 of erroneous claims.** The fuzzy ship-to matcher had attached every
agreement in the `2036874-x` national-account family to every ship-to in the
family at confidence 80, so Denver's `-9`, Kansas City's `-20` and Wichita's
`-16` were pricing each other's invoices.

---

## 3 · Time silo

Two separate conditions, both live:

**Effective date.** `effective_date <= invoice_date`. A NULL effective date
passes. This is what kept the whole SRS Colorado book off every Colorado
invoice until migration 267 — see docs/104 §4 and PEC-237.

**Version supersession.** Among agreements sharing `(office_id,
agreement_number)`, take the one with the **greatest** `effective_date` that is
still `<= invoice_date`, implemented as a `NOT EXISTS` for any later in-date
version. You always price against the version current **on the invoice date**,
not the newest on file.

### ⚠ `expiry_date` is not enforced anywhere

The string `expiry` appears **nowhere** in `v_invoice_audit_line`. Both arms
gate on `is_active` and `effective_date` only.

| arm | priced lines | priced by an agreement expired as of the invoice date | claims from those |
|---|---:|---:|---:|
| ABC | 2,267 | **677 (30%)** | **$2,959.82** |
| Vendor | 99 | 29 | $0.00 |

This is **not simply a bug.** Both SRS quotes are deliberately evergreen — their
own `notes` say so, citing docs/81 §4 — so ignoring their expiry is correct
behaviour that merely isn't expressed in the schema. For ABC it is unexamined.
The fix is to make the choice explicit per agreement (`evergreen` vs `expires`),
not to switch enforcement on globally, which would break SRS on purpose.

Tracked as **PEC-238**.

---

## 4 · UOM silo — docs/46

`negotiated_price` is emitted **only** when
`negotiated_uom IS NOT DISTINCT FROM price_uom`. On a mismatch it returns
**NULL** and sets `uom_mismatch = true`.

> **Rule.** The audit never converts across units. It refuses.

So `variance_pct` and `variance_ext` are never computed across UOMs. The
canonical invoiced price is `price_per_uom`
(`extendedPriceAmount ÷ priceQty.value`). Never compare on `quantity`, `uom`,
`unit_price`, `effective_unit_price`, or `pricePerUnitAmount`.

Where a sheet genuinely prices in a different unit from the invoice, record
`order_uom` + `uom_conversion_factor` on the agreement item rather than
loosening this gate — e.g. Malarkey Vista, sheet in BD, invoice in SQ,
manufacturer-stated 3 BD/SQ (migration 266).

---

## 5 · Precedence inside the silos

Once all four gates pass, one row wins:

| | ABC arm | Vendor arm |
|---|---|---|
| 1 | `pri` — office-scoped arms (1) before legacy ship-to fallback (2) | — |
| 2 | UOM agreement, descending | UOM agreement, descending |
| 3 | `match_rank`: 1 exact item number · 2 exact/prefix description · 3 trigram ≥ 0.45 | 1 exact item number · 2 exact description · 3 colour-key equality |
| 4 | `unit_price` ascending | `negotiated_price` ascending |

**The fuzzy arm is always a fallback.** With `LIMIT 1`, a colour-variant or
trigram price is used only when no exact match exists in the office's governing
book. This is the whole reason the colour rule was safe to install where ABC's
trigram rule was not — see docs/103 §2.

**Rank 4 picks the *lowest* price.** When two in-silo books both carry an item,
the audit challenges against the cheaper one, which maximises computed variance.

> **Rule.** Before adding or backdating an agreement into an office that already
> has one, simulate the change and diff which lines move. Confirm no line is
> re-homed off an existing agreement onto a cheaper one.

That check is why migration 267 was safe: six Colorado lines moved unpriced →
priced, and none were taken from the Englewood quote.

### Latent hazard: ABC in the generic book

ABC Supply owns **7 rows in the generic `price_agreements` table**, two of them
carrying **317 items** between them. They are inert only because
`vendor_invoices` holds no ABC data and there is zero invoice-number overlap
with `abc_invoices`. If ABC invoices are ever mirrored into `vendor_invoices`,
ABC becomes audited by both arms at once, against two different books with two
different fallback matchers. Tracked as **PEC-239**.

---

## 6 · The review queue inherits the office silo — migration 264

The PEC-226 candidate queue proposes bindings **vendor-wide** (a sheet row may
legitimately name a product the office has not bought yet), but it must be
*ranked and justified* office-scoped.

- `own_office_amount` — invoiced dollars behind the proposed item number **at
  this agreement's own office**. This is what approving the row makes auditable.
- `evidence_amount` — the vendor-wide pool. Context only.
- `other_office_amount` — the difference, disclosed rather than inferred.

Across the 500 pending candidates on 2026-08-22 those differed by roughly ten
times: **$304,869.76 vendor-wide against $31,721.37 own-office**, with 358 of
500 worth exactly $0 to their own office.

> **Rule.** An aggregate that crosses a silo is a reporting bug even when the
> write path is safe. The join was correct; the number the human read was not.

`NULL` in these columns means *the agreement has no branch, so the office is
unknown* — it does **not** mean zero. Collapsing those two cost 352 of 500 rows
on the first pass of migration 264.

---

## 7 · Two rules that pair with the silos

- **Credit memos never enter the standard price audit.** They reconcile against
  the original invoice / CM request, never against an agreement.
- **Returns invert the sign.** A negative `extended_price` line still prices,
  and its variance reads as a claim. **Every claim query filters
  `extended_price > 0`.** This has produced a wrong number twice: the Texas
  Cambridge line and the 2026-07-09 Colorado Vista line are both returns.

---

## 8 · Checklist before changing anything that affects pairing

1. Does the join assert the **vendor**? (208)
2. Does it assert the **office**, resolved from the *invoice's* branch? (217)
3. Does it respect `effective_date` **and** version supersession?
4. Does it leave the **UOM** gate intact — refuse rather than convert? (docs/46)
5. If it adds a book to an office that already has one, has the **lowest-price
   tie-break** been simulated?
6. Does any aggregate you are showing a human cross a silo?
7. Are **returns** excluded from anything presented as a claim?
