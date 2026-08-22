# 104 — PEC-226: what the review queue was actually worth, and the OEM reference that settled it

**Date:** 2026-08-22 · **Requested by:** Chris Hussey · **Migrations:** 264–266
**Related:** docs/103 §2 (colour variants), docs/46 (UOM), PEC-226/231/232

The task was "rule on the 24 held candidates, strongest evidence first." The
ranking turned out to be wrong, and two of the three questions the handoff
called human-only were answerable from the manufacturers.

---

## 1 · The queue was ranked by every office's money (migration 264)

Migration 256 built candidate evidence like this:

```sql
from vendor_invoice_lines vil
...
group by vil.vendor_id, vil.item_number
```

No branch. No office. The pairing then joins on `vendor_id` alone. So
`evidence_amount` — the column `v_price_agreement_item_review` sorts by — is
every SRS office's purchases of that item, pooled.

Across all 500 pending candidates:

| | vendor-wide | own office |
|---|---:|---:|
| total | **$304,869.76** | **$31,721.37** |

**358 of 500 candidates are worth exactly $0 to their own office.**

The three top-ranked rows were the clearest case:

| candidate | shown | branch that actually bought it | own office |
|---|---:|---|---:|
| `IKOCAWWN` on the **Texas** sheet | $14,382.67 | DJWIC — Wichita, KS | **$0** |
| `IKOCADBKN` on the **Texas** sheet | $10,794.67 | DJWIC — Wichita, KS | **$0** |
| `IKOCACHGN` on the **Colorado** sheet | $6,320.67 | DJWIC — Wichita, KS | **$0** |

Kansas has its own active agreement (`0049828559`) binding `IKOCACHGN` at
**$92.00/SQ**, and Kansas was invoiced exactly $92.00/SQ. That spend is
governed, not unpriced.

Nothing was corrupted by this: binding `raw_item_number` is an identity
statement, and the audit office-constrains independently (205/208/217). The
defect is narrower and still serious — **a human was being asked to rule on a
number that did not describe what approving the row would do.**

Migration 264 adds `own_office_amount` / `own_office_lines` / `office_id`,
ranks the review on them, and keeps `evidence_amount` and the difference
(`other_office_amount`) visible beside them rather than silently redefining a
column someone has already read.

> **Trap worth keeping.** The first cut of `stamp_candidate_office_evidence()`
> put the evidence lookup in a `LEFT JOIN` and then constrained it in `WHERE`.
> For a candidate with no purchases at its own office the joined row is
> all-NULL, the predicate is false, and the row was skipped — leaving a NULL,
> which this schema reads as *office unknown*. Only 148 of 500 stamped. A known
> zero and an unknown must not collapse into the same value.

## 2 · The discriminator is not "does it say impact resistant" (migration 265)

Two candidates had identical shape and opposite answers:

| sheet row | proposed item | invoice text | verdict |
|---|---|---|---|
| `IKO CAMBRIDGE AR` | `IKOCAWWN` | `… \| CLASS 3 IMPACT RESISTANT` | **same product** |
| `TAMKO HIP AND RIDGE IR` | `TAMHRARRBK` | `… \| LINE 2, CLASS 3` | **different product** |

- **IKO** ships Class 3 impact resistance *and* algae resistance as standard
  across the whole Cambridge line, with **no separate Cambridge IR SKU**. The
  invoice is spelling out attributes the sheet leaves implicit.
- **TAMKO** ships Hip & Ridge and Hip & Ridge **IR** as distinct products, IR
  being UL 2218 Class 4. `TAMHRARRBK`'s own invoice says Class 3, so it is the
  non-IR item and an IR sheet row must not bind to it.

So the question is never *does the description mention impact resistance* but
**is that rating standard to the line, or does it name a separate SKU?** That
fact lives with the manufacturer. `oem_product_reference` records it in
`impact_is_line_standard`, with 47 lines seeded across IKO, TAMKO, GAF, Owens
Corning, CertainTeed, Atlas, Malarkey and Lomanco.

Every row carries `source_url`, `retrieved_at` and `era_of_practice`. Trust
tier is `evidence` until a human confirms it — enforced by a CHECK, not by
convention. Where an OEM page does not state a class the column is **NULL and
the note says so**; a guess recorded as fact is worse than a gap.

Other named IR siblings the table now carries, each one a future trap:
GAF Timberline HDZ → **AS II** · Owens Corning Duration → **STORM / FLEX** ·
CertainTeed Landmark → **ClimateFlex** · CertainTeed Presidential Shake →
**Presidential Shake IR**.

## 3 · The rulings (migration 266) — 21 approved, 3 rejected

| sheet row | item | ruling | basis |
|---|---|---|---|
| IKO CAMBRIDGE AR ×6 colours ×2 sheets | `IKOCA*` | approve 12 | Class 3 + AR standard line-wide, no IR SKU |
| MALARKEY VISTA AR ×2 | `MALVIARIRSBOK3` | approve | Vista is Class 4 line-wide; the `IR` in the code restates it |
| MALARKEY RIDGEFLEX SG ×2 | `MALHRARSB` | approve | 30 ft 11 in/bundle = the sheet's "31 LF/BD" |
| TAMKO HIP AND RIDGE ×2 | `TAMHRARRBK` | approve | the non-IR Class 3 item |
| **TAMKO HIP AND RIDGE IR ×2** | `TAMHRARRBK` | **reject** | IR is TAMKO's separate Class 4 product |
| STEP FLASHING 4"×4"×8" | `METFSP448BR` | approve | code `448` = the dimension; $85.00 = sheet exactly |
| **STEP FLASHING 8"×8"** | `METFSP448BR` | **reject** | different size |
| TOP SHIELD PRO4SWN | `TOPTSPRO4SWN` | approve | Lomanco PRO4SWN under private label |
| TOP SHIELD BRV34 | `TOPTSBRV34` | approve | Lomanco BRV34; PC and EA are one selling unit |

`raw_item_number` holds one value, so IKO Cambridge became **six rows per
sheet**. Each parent is bound to the colour that office actually buys (Texas →
Dual Brown, Colorado → Earthtone Cedar) rather than left NULL — a NULL parent
stays eligible for the generator and re-queues the same six proposals forever.

**PC ≡ EA** is externally corroborated: the same Lomanco MPN `BRV34` is sold by
one distributor as `UOM: PC` and by another in the `EA` sell unit.

## 4 · What actually prices now — and the date wall

The Texas binding works: `IKOCACHGN` at SSMEL, 2.33 SQ invoiced at $130.00
against the $112.00 sheet — a new **+$41.94** claim. The office silo held
throughout: none of the Texas or Colorado bindings touched the Kansas lines,
which continue to price at $92.00 off Kansas's own book.

**Colorado's three bindings produce nothing, and not because they are wrong.**
`v_invoice_audit_line` gates on `pa.effective_date <= vi.invoice_date`. The
Colorado price list is effective **2026-08-14**; every Colorado SRS invoice
predates it:

| invoice | date | item | invoiced | sheet |
|---|---|---|---:|---:|
| 0049707508-001 | 2026-06-18 | `MALVIARIRSBOK3` | $202.00/SQ | $135.00/SQ |
| 0049707508-001 | 2026-06-18 | `MALHRARSB` | $134.00/BD | $84.50/BD |
| 0050180764-001 | 2026-07-15 | `METFSP448BR` | $85.00/BD | $85.00/BD |

**11 Colorado lines / $12,681.75** now carry a binding that cannot be applied
because the agreement post-dates the invoice. That is correct behaviour — you
cannot challenge a June invoice against an August price book — but it means the
approved Malarkey Vista claim (~$2,814) does not fire.

**Open decision for Chris.** Either the 2026-08-14 list is a *re-issue of
pricing already standing* in June, in which case `effective_date` should be
backdated to when that pricing actually took effect and the claims light up; or
it is genuinely new pricing, in which case the June–July Colorado spend stays
unpriceable and the bindings simply govern from 14 August forward. This is a
question for Blake Wells / the SRS rep, not one to infer.

## 5 · Invariants earned here

- **An aggregate that crosses the silo is a reporting bug even when the write
  path is safe.** The join was correct; the number a human read was not.
- **A known zero and an unknown are different values.** Collapsing them cost
  352 of 500 rows on the first pass.
- **Product identity is the manufacturer's fact, not ours.** Where the OEM is
  silent, record silence.
- **The product name is not the rating.** Atlas *Pinnacle Impact* is Class 3.
