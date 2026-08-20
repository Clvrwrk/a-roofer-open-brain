# 99 — Rank coverage gaps by dollars, not by branch count

**Date:** 2026-08-20 · **Migrations:** 250, 251, 252, 253 · **Ticket:** PEC-221

## The problem

`v_office_vendor_inheritance` already knows which (office × vendor) pairs hold no price
agreement — `priced_items = 0` — and the Agreement Builder renders that as a gap count.
But the count treats every gap alike, and they are not alike.

```
9 coverage gaps          <-- what the dashboard said
   |
   +-- 6 with ZERO invoices ever      $0        territory-only, nothing to chase
   +-- 3 with real purchasing        $28,362    money leaving un-audited today
```

Ranking by branch count actively misleads: Atlanta × ABC has **19** branches in the ring and
$5,226.90 of spend, while Denver × SRS has **7** branches and **$17,437.63**. The biggest
branch count was the smallest exposure.

This also corrects the priority recorded on 2026-08-19, which named Atlanta × ABC as the next
agreement to chase. Denver × SRS is 3.3× larger and was not on that list at all.

## Live exposure at time of writing

| Office × vendor | Invoices | Un-audited spend |
|---|---:|---:|
| Denver (Greenwood Village), CO × SRS Distribution | 4 | $17,437.63 |
| Wichita, KS × QXO | 2 | $5,697.47 |
| Atlanta (Jonesboro), GA × ABC Supply Co. | 5 | $5,226.90 |
| Richardson, TX × QXO | 1 | −$3,723.59 (net credit) |
| *five other pairs* | 0 | $0.00 |

Plus **$26,848.33 across 24 invoices** on branches with **no pricing territory** — outside
the audit entirely, and previously invisible in any surface.

## Migration 245 — the two views

- `v_office_vendor_spend` — invoice count + spend per (office × vendor), resolved **only**
  through `vendor_branch_id` (migration 244's contract). Join it to
  `v_office_vendor_inheritance` on `(office_id, vendor_id)`.
- `v_unresolved_branch_spend` — spend that reaches no pricing office, split by cause.
  Fail-closed is correct, but it must stay *visible*, or money silently leaves the audit.

A useful result from the second view: `no_branch_resolved` returns **zero rows**. Every
invoice in the system resolves a branch — migration 243's ingest-time resolution is holding
at 100%. All the unresolved money is `branch_has_no_office`, a territory question, not an
identity one.

## Migration 250 — the address was never missing

The single largest un-audited bucket was ABC branch **176**: 11 invoices, **$19,356.94**, on
a branch row with no city and no state. It could never geocode, so it could never land in a
territory ring, so it could never be priced.

Per CONVENTIONS *structured source before OCR*, the address was already in
`abc_invoices.raw->'branch'`:

| Branch | Recovered from raw | Note |
|---|---|---|
| 176 | Webster, TX — 333 Tristar Dr | Houston area |
| 183 | Nolanville, TX | Killeen area |
| 305 | Sherman, TX — 2325 N Travis St | **~60 mi from the Richardson office** |

Branch 305 may well sit *inside* Richardson's drive-time ring; it reads `out_of_boundary`
today only because it had no coordinates to test. No invoice parser was needed to learn this.

**Trap worth remembering:** the payload is not uniformly rich. 10 of branch 176's 11 invoices
carry only `{"name":"176A","number":"176"}`; exactly **one** carries the full address. Taking
the newest invoice recovers nothing — the migration picks the **richest** payload per branch
(longest `addressLine1`).

7 of 23 city-less branches were recoverable this way; the other 16 have no address in any
payload and stay `no_address` — honestly unknown rather than guessed.

### Why this stops at geocoding

Migration 250 fills facts (`city`, `state`, `address`) and flips those rows to
`geocode_status = 'pending'`. It deliberately does **not** set
`pricing_territory_office_id`: territory is a human decision
(`vendor_branches.territory_decided_by`), and geocoding has to run first regardless.

Next action: `node scripts/geocode-vendor-branches.mjs` (needs `GOOGLE_MAPS_SERVER_KEY`),
then review whether 305 lands in Richardson's ring.

## A note on branch-number collisions

Both 176 and 305 exist **twice** in `vendor_branches` — 176 is Webster TX *and* Ogden UT;
305 is Sherman TX *and* Harrisburg PA. This is precisely the collision that text-based branch
matching resolved wrongly before migration 244. The FK path handles it correctly: the
invoices attach to the right row, and enriching one row cannot corrupt the other.

## Command Center

`price-agreement-coverage.ts` now carries `invoiceCount` / `spend` per vendor and
`gapsWithSpend` / `unauditedSpend` / `unresolvedSpend` in totals. The gap pill reads
*"No agreement — $17,437 un-audited (4 inv)"* where there is spend, and the muted
*"No agreement — no spend yet"* where there is not.

`gapExposure()` is exported as a pure function and unit-tested (5 cases, including the credit
memo that nets rather than adds).

---

## Addendum — reconciling with migration 245, and what it uncovered

Migration 245 (`office_closure_and_agreement_status`) landed from a parallel session two
minutes before this work, and answers the other half of the question. Parallel sessions then
also claimed **246** (`settle-received-credit-memo-lines`), so this work was renumbered to
**250–253**; main is canonical and a feature branch yields. The applied labels in the DB still
read `245_…`/`246_…`/`248_…`/`249_…`, which is cosmetic — Supabase keys migrations by
**timestamp**, and 250–253 were all applied (10:57–11:11 UTC) *before* the file numbered 246
existed. Applied order is unchanged.

- **245 says WHY** a pair has no agreement — `no_book | pending | not_pursued | unrecorded`
- **246 says HOW MUCH** it costs — `invoice_count`, `spend`

Neither alone supports a decision. Chris ruled **QXO `no_book` at all five offices** on
2026-08-20: QXO lines price as no-price *by design*. Ranked on dollars alone, Wichita × QXO
($5,697.47) reads as work to chase — it is not. **Migration 252** joins the two so the
surface can never make that mistake.

### Migration 253 — the gate was asking the wrong question

248's `needs_ruling` keyed off `live_agreements = 0` — *does the paperwork exist*. That is
wrong, and it hid the single largest un-triaged exposure in the system:

> **Denver × SRS has a live, in-territory, 22-item agreement — and prices nothing.
> $17,437.63 audits as no-price.**

249 re-gates on `priced_items` — *can this pair actually be audited* — which is the question
that matters. The queue is now two rows: Denver × SRS ($17,437.63, `unrecorded`) and
Atlanta × ABC ($5,226.90, `pending`).

### Root cause: the last text-based branch match

`v_office_vendor_branch` still resolves agreements by branch-number **text**:

```sql
JOIN vendor_branches vb ON vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)
LEFT JOIN v_vendor_agreement_current ag
       ON ag.vendor_id  = vb.vendor_id
      AND ag.branch_key = NULLIF(regexp_replace(vb.branch_number,'^0+',''),'')
```

This is the last survivor of the text matching migration 244 removed from the pricing and
display paths, and it needs **both** halves to line up: the branch must be geocoded to appear
in the ring at all, *and* the agreement's `branch_key` must equal that geocoded row's
`branch_number`.

SRS South Denver exists as **two rows for one physical branch**:

| Row | Address | Geocoded | Holds agreement |
|---|---|---|---|
| `AMSDE` | none | ✗ (pending) | ✓ the 22-item book |
| `SBP-SOUTHDENVER` | 4393 S. Santa Fe Drive | ✓ 6.1 mi | ✗ |

Different numbers, so the join never meets.

### The latent risk is bigger than the one office

`v_agreement_unreachable` (migration 253) shows **all three live numbered SRS agreements —
136 items — are unreachable**, each held by an ungeocoded row with an obvious twin:

| Agreement | Items | Held by | Likely canonical |
|---|---:|---|---|
| SRS-MELISSA-L4 | 97 | `SSMEL` | `SBP-MELISSA` |
| 0049345641 | 22 | `AMSDE` | `SBP-SOUTHDENVER` |
| 0049828559 | 17 | `DJWIC` | `SBP-WICHITA` |

Richardson and Wichita still price **only because archived duplicate agreement rows**
(`[ARCHIVED 2026-08-05: duplicate of the numbered agreement row]`) happen to reach the ring.
Denver is not a special case — it is the one where that accidental crutch is missing. **If
those archived rows were ever tidied up, Richardson and Wichita SRS would silently stop
pricing too: 114 further items.**

**Trap for whoever fixes this:** `v_office_vendor_branch.agreement_id` is a mixed-type text
column — ABC agreements appear as legacy **integer** ids (`'105'`, `'8'`), SRS as uuids.
Casting either direction throws `invalid input syntax for type uuid: "105"`. Compare as text
against both `price_agreements.id` and `price_agreements.legacy_id`.

### Deliberately not fixed here

Repointing the agreement join to `vendor_branch_id` is pricing-affecting and earns the same
equivalence proof migration 244 ran before switching (FK == text on every row, 0
disagreements, fingerprint unchanged). Merging the duplicate branch rows is a branch-identity
decision for a human — `vendor_branch_alias` (migration 240) already encodes that boundary:
a guess cannot become a fact. 249 only makes the failure visible.
