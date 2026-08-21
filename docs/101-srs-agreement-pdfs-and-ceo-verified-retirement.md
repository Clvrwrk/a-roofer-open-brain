# 101 — SRS agreement PDFs stored, and the `ceo_verified` gate retired

**Date:** 2026-08-21 · **Decided by:** Chris Hussey · **Migrations:** 251, 252

Two things happened in one pass: the SRS price agreements finally have documents behind
them, and the approval gate that was flagging those documents got deleted.

---

## 1 · The four SRS documents are in the bucket

Chris supplied four PDFs from the PE accounting Dropbox. Three matched agreement rows on
`source_file` exactly; the fourth had no record at all.

| file | object in `agreements/` | agreement | bound |
|---|---|---|---|
| `Wichita_Quote0049828559.pdf` | `wichita-srs-quote0049828559-jun2026.pdf` | `3e7b261b…` quote 0049828559 | ✅ |
| `Englewood_co_Revised … Quote 06.01.26 mo (1).pdf` | `englewood-srs-quote0049345641-may2026.pdf` | `7246ed93…` quote 0049345641 | ✅ |
| `Richardson_MELESSA_PRICE_SHEET- LEVEL 4 (1).pdf` | `melissa-srs-level4-feb2026.pdf` | `df0bb65a…` SRS-MELISSA-L4 | ✅ |
| `Pro Exteriors Colorado Pricing 8-14.pdf` | `colorado-srs-pricelist-aug2026.pdf` | `9f2c4d10…` **new** (migration 251) | ✅ |

Naming follows the bucket's existing `<city>-<identifier>-<period>.pdf` convention, with
the vendor added because the seven pre-existing objects are all ABC.

Verified end to end, not just written: `/api/price-agreement/pdf/<id>` returns `302` to a
signed URL and the bytes that come back are **sha256-identical to the source file** for all
four. On `/accounting/credit-memos/0050033202-002` the evidence panel's "No agreement PDF
stored" is now **Open agreement PDF →**, serving 72,837 bytes of `application/pdf`.

### The Colorado sheet needed a record built (migration 251)

It carries no SRS letterhead — it is an Excel export — so provenance was established from
two independent signals: the PDF author is **Blake Wells**, the same `B WELLS` sales agent
named on both SRS quotes, and the catalog is built on **TOP SHIELD**, SRS's house brand.

- **Scope: office, not branch.** The sheet is titled "Colorado Pricing" with no branch code.
  Agreements resolve through a branch's `pricing_territory_office_id` — which is why invoice
  `0049707508-001` on `SBP-DENVER` prices off the `AMSDE`-bound Englewood quote. Anchoring
  the new record to `AMSDE` therefore covers all 10 covered SRS branches in the Denver
  (Greenwood Village), CO territory.
- **Supersession by date window, not by archiving.** The Englewood quote stays `is_active`
  — 11 re-audit lines cite it and it is the correct book for 2026-05-28 → 2026-06-27. The
  new record is open-ended from 2026-08-14. No Colorado SRS invoice has landed since that
  date, so **nothing re-priced retroactively**.
- **Items: 112 → 101.** 9 rows dropped as `$0.00`/`CALL` placeholders (loading those would
  fabricate discrepancies against a price the vendor never quoted); 2 exact duplicates
  collapsed after asserting identical price and UOM.

---

## 2 · ⚠ The description-only sheets do not price anything

**This is the finding that matters most, and it is pre-existing — not introduced here.**

The vendor price path matches on:

```sql
pai.raw_item_number = line.item_number
  OR pai.raw_description_normalized = lower(line.item_description)
```

That is **exact equality**. There is no trigram arm on the vendor side; the ABC side has
one (`similarity(...) >= 0.45`, migrations 201/217/233). Measured against real invoice
lines:

| agreement | items | item-number hits | exact-description hits |
|---|---:|---:|---:|
| SRS Englewood CO quote | 22 | **55** | 0 |
| SRS Wichita KS quote | 17 | **66** | 0 |
| SRS Melissa TX Level 4 | 97 | 0 | **0** |
| SRS Colorado price list (new) | 101 | 0 | **0** (expected) |

The two **quotes** work because SRS quote PDFs carry item numbers (`TAM31005310`,
`MAL252WWPOKC`). The two **price sheets** are description-only, and SRS invoice descriptions
read like `3 BD/SQ IKO CAMBRIDGE CHARCOAL GRAY CLASS 3 IMPACT RESISTANT, 56 BD/PAL` — which
will never equal a price-sheet description like `IKO CAMBRIDGE AR 3 BD/SQ`.

So the **Melissa Level 4 sheet has been inert since 2026-02-16**: 97 negotiated prices
matching zero lines. The Colorado sheet is loaded in the same shape and will behave the same
way until its items carry item numbers.

**Standing exposure:** 155 SRS lines across 30 invoices — **$49,018.94** — sit in
`no_price`. These two sheets are exactly the book that should be resolving them.

Two ways to close it, neither done here:
1. **Map descriptions → SRS item numbers** from invoice history and backfill
   `raw_item_number`. Highest fidelity, but a real inference per row — colour variants share
   a description, so it needs review before it drives money.
2. **Give the vendor path a trigram arm**, mirroring the ABC side. Cheaper, but fuzzy
   matching on price is precisely what the `Item match` check warns about today.

---

## 3 · `ceo_verified` is retired as a gate (migration 252)

> "please remove the ceo_verified=true requirement, that was an old gate that needs to be
> deleted from all worksurfaces. once a price agreement is added it is approved and active."
> — Chris, 2026-08-21

This finishes a decision already half-made: **docs/82 §6 decision 3** (2026-08-05) ruled
`ceo_verified` a display badge and never a pricing gate, and `vendor-territories.ts` has
honoured that since. Three surfaces had not caught up:

| surface | was | now |
|---|---|---|
| `lib/credit-memo.ts` — Document type check | `warn`: "the cited document is a QUOTE and has not been accepted as a price agreement" | `pass`: names the quote as the price book on file — **and still says it is a quote** |
| `lib/abc-price-gaps.ts` | `unverified_agreement` gap reason, severity **blocked**, action "CEO-verify the referenced agreement" | reason code removed entirely, with the summary field and severity/action entries |
| `pages/api/price-agreement/review/promote.ts` | stamped every promoted agreement `ceo_verified: false` | `true` — adding an agreement **is** the approval |
| `pages/accounting/price-agreement/builder.astro` | green "CEO verified" pill | removed |

Data side: 10 rows said unverified (5 `abc_price_agreements`, 5 `price_agreements`) and were
the reason those warnings fired. All now read approved and active.

**docs/93 is unchanged and still enforced.** It governs what the panel *says* — never hide
that the cited document is a quote — not whether acceptance is required. The check still
prints "The document is a quote, not a signed agreement."

**Columns were not dropped.** `ceo_verified`, `ceo_verified_by` and `ceo_verified_at` stay:
hard rule 1 is additive-only, and the timestamps are real provenance about who accepted what
and when. The column simply stops being consulted.

---

## Verification

1. `curl -sL /api/price-agreement/pdf/<id> | shasum -a 256` — matches the source PDF for all
   four agreements.
2. `npm run build && npm test` — Complete, **309 passed**.
3. Rendered `/accounting/credit-memos/0050033202-002`: Document type reads as a quote,
   7 checks pass, zero gate language.
4. Rendered `/accounting/price-agreement/builder`: no "CEO verified" pill; other pills intact.
5. `select count(*) from price_agreements where ceo_verified is distinct from true;` → **0**
6. `select count(*) from price_agreement_items where agreement_id='9f2c4d10-…';` → **101**

## Follow-up owed

- **Close the $49,018.94 `no_price` gap** — decide between item-number backfill and a
  vendor-side trigram arm (§2). This is the real money on the table.
- The 9 `$0.00`/`CALL` Colorado items need prices from Blake Wells before they can be loaded.

---

## Addendum — 2026-08-21: five SRS documents ingested, and the gap made concrete

Chris supplied five SRS PDFs. They went in through a new `--pdf` arm on the **existing**
`integrations/bridges/ingest-vendor-invoice-csv.mjs`, reusing the same
`upsertInvoice`/`replaceLines`/`upsertUomEvidence` writers so there is one contract, not two.

| document | type | branch → office | lines | total |
|---|---|---|---:|---:|
| `0050577193-001` | invoice | DJWIC → Wichita, KS | 17 | $4,492.54 |
| `0050634181-001` | invoice | SSMEL → Richardson, TX | 15 | $6,911.92 |
| `0050692264-001` | **credit** | SSMEL → Richardson, TX | 1 | −$379.43 |
| `0050471744-001` | invoice | DJWIC → Wichita, KS | 13 | $4,486.26 |
| `0050708886-001` | invoice | SSCOP → Richardson, TX | 1 | $91.47 |

**Reconciliation gate.** A parsed PDF is only written if the vendor's own printed arithmetic
reproduces: parsed lines must sum to the printed `SUB-TOTAL`, and `SUB-TOTAL + delivery +
freight + restock + tax` must equal the printed `BALANCE`. All five reconcile to the cent.
The gate earned itself immediately — SRS prints a 0.01 converted qty as `.01 /BD`
(`0050471744-001`, item `TOP4X4X8SFTER`), and the first regex required a digit before the
decimal, so it silently dropped that line and the invoice missed SUB-TOTAL by exactly its
$0.89. Without the gate that becomes an understated invoice nobody ever notices.

**Migration 253 — branch aliases.** Migration 243 made branch resolution fail *closed*:
`branch_key → vendor_branch_id` runs only through `vendor_branch_alias`, and there were
**zero SRS alias rows** — the 28 SRS invoices already on file had been resolved by the
one-off backfills in 240/242, not by the trigger. The next SRS invoice would have landed
with no branch, no office and no price, silently. Seeded `DJWIC, SSMEL, SSCOP, AMDEN,
SHCOL`, vendor-scoped, pointing at the same branch rows their predecessors already use.
`SSCOP` (Coppell, TX) is a new code, first seen on `0050708886-001`.

### What the batch proves about §2

| office | priced lines | unpriced lines | unpriced value |
|---|---:|---:|---:|
| Wichita, KS (quote — has item numbers) | 8 | 22 | $7,449.04 |
| Richardson, TX (Melissa sheet — description-only) | **0** | 16 | $6,119.11 |

The Wichita lines that *did* price came back at **zero variance** — SRS billed the quote
correctly. Richardson priced **nothing at all**, because its only book is the inert Melissa
Level 4 sheet. This is §2 happening in real time, not a hypothetical.

**Live SRS totals after this batch: 73 priced lines / $16,990.55 against 216 unpriced /
$63,642.53.** Only 21% of SRS line value can be checked against an agreement. (The earlier
§2 figure of 155 lines / $49,018.94 came from the `invoice_line_reaudit` snapshot of
2026-08-05; this one is the live view including the new documents. Both are correct for what
they measure.)

### Two items for a human

1. **`0050708886-001` PO reads `tx-4555`** and matches no AccuLynx job. `TX-455`
   (Debra Moore) exists and is referenced by the other two documents in this same batch, so
   `tx-4555` is plausibly a typo — but that is an inference about which job $91.47 of
   material belongs to, so it was **left unmatched** rather than guessed.
2. **`0050471744-001` PO reads `216 SOUTH MADISO`** — the PDF truncates PO NUMBER at 16
   characters. Here it is an address rather than a job code, so nothing was lost, but the
   truncation is real: **prefer the portal CSV when it is available**, because PO NUMBER is
   the AccuLynx job key. Ingested rows carry `raw.po_number_may_be_truncated`.

3 of 5 matched AccuLynx jobs on the PO token (`KS-209` → Rojelio Moreno; `TX-455-2` → Debra
Moore, both invoice and credit).
