# 42 — Invoice Audit Data Integrity (fixes + repeating-issue playbook)

Round following the 2026-06-19 human walkthrough of the invoice audit. Captures the
Phase-1 accuracy fixes, their root causes, and — most importantly — the **two recurring
failure patterns** so we can recognize and prevent them next time.

## The two repeating patterns (read this first)

### Pattern A — ABC ingestion mapping drift (silent null columns)
ABC's API nests fields differently per resource, and our mapper has twice been written
against flat keys that don't exist, so columns persist as **null while `raw` holds every
value**. The audit views then read the null columns and surface broken/blank lines.

| Resource | Correct nested keys | Mapper | When found / fixed |
|---|---|---|---|
| Orders | `orderedQty.value/.uom`, `unitPrice.value`, `amount` | `orderLineRows()` | 2026-06-18 (commit a542082, schema 108) |
| Invoices | `shippedQty.value/.uom` (or `priceQty`), `pricePerUnitAmount`, `extendedPriceAmount` | `invoiceLineRows()` | 2026-06-19 (this round, schema 113) |

**Prevention now in place:**
1. `invoiceLineRows()` reads the nested keys, flat keys kept only as fallbacks.
2. The audit views (`v_invoice_audit_line`, `v_invoice_audit_invoice`) COALESCE
   qty/uom/extended **from `raw`** — so a future mapper drift can't blank out the audit.
3. Post-sync guard in `syncInvoices()` logs a WARNING if any line persists with null
   qty/price while `raw` carries them (the canary for the next drift).
4. `v_invoice_audit_line.is_auditable` = (qty + extended resolvable). The loader only
   counts auditable lines as "to audit", so a price-less line can never be queued.

**If it recurs:** check `raw` for the real shape first (`select raw from abc_invoice_lines
where ... `), update the mapper's nested keys, then backfill from raw (idempotent UPDATE,
mirror schema 108/113). Never null-out — always COALESCE from `raw`.

### Pattern B — Unit-of-measure (UOM) normalization
`abc_invoice_lines.unit_price` is **per-pack** for bundled SKUs (e.g. shingles at 3 BD/SQ)
while `quantity` is in the invoice UOM (SQ). Comparing raw `unit_price` to a per-SQ
negotiated price overstates the invoice price by the pack factor — item `02MLHLXABB`
showed **$387/SQ** when the true price is **$129/SQ** (387 = 129 × 3).

**Rule:** the only correct per-UOM invoice price is the **effective** price =
`extended_price / quantity` (the generated `effective_unit_price` column). The audit views
now compute and display effective price everywhere; never compare raw `unit_price`.
Signature of an affected line: `unit_price` is an exact integer multiple (×3/×4/×5) of
`extended/qty`. 213 lines / ~46 items carried it before the fix.

## Phase-1 changes in this round

| Item | Change | Files |
|---|---|---|
| 6 | Parser fix + backfill 171 null lines + raw-fallback guard + post-sync canary + `is_auditable` | `mirror-backfill.mjs`, `schemas/.../113-invoice-line-price-backfill.sql`, `schemas/.../99-invoice-audit-views.sql`, `app/.../lib/invoice-audit.ts` |
| 3 | Audit views use `effective_unit_price` for display + variance (fixes all ×N items) | `schemas/.../99-invoice-audit-views.sql` |
| 2 | `at_risk` counts only **un-audited** overcharge (a `passed` audit, incl. backfill, clears exposure); new `credit_memo_amount` (audited + `credit-flag`/`credit-noflag`) → "Credit Memo Requested" KPI | `schemas/.../99-invoice-audit-views.sql`, `app/.../lib/invoice-audit.ts`, `app/.../accounting/invoice-audit.astro` |
| 5 | Branch page: name + address, agreement pill shows agreement **number** not internal id, list scoped to the agreement active on the invoice's date | `app/.../lib/branch-price-list.ts`, `app/.../accounting/price-list/branch.astro` |

## Verified impact (live prod `rnhmvcpsvtqjlffpsayu`)

"$ At Risk" decomposition — the headline was ~99% a UOM artifact:

| Basis | Amount |
|---|---|
| Old (raw `unit_price`, all lines) | **$877,486** |
| Correct effective price, all lines | **$11,538** (Item 3 removed ~$866K of fake exposure) |
| Correct price, **un-audited only** (live `at_risk`) | **$6,213** (Item 2 removed already-audited lines) |

- `02MLHLXABB` on invoice `2010333391-001`: now $129.00/SQ vs $147.17 negotiated → −12.35% (under price), was a false +163% overcharge.
- `0150080011` on `2011032379-001`: backfilled to 2 BX @ $49.95, `is_auditable=true`.
- All 171 null lines backfilled; `still_null = 0`.
- Branch 1272 page: address "1425 Vernon St, Kansas City, MO 64116-4424", pill "2036874-16", scoped to the 2026-06-03 active agreement.

### Note for review
When two agreements are concurrently active on the invoice date, the branch scoping (and
the audit's negotiated-price `neg` CTE) pick the **highest-confidence match**. If a
different tiebreak is wanted (e.g. most-specific or lowest price), adjust both together.

## Deferred to Phase 2
Credit-memo tracking (Item 1), daily invoice-PDF auto-pull (Item 4), and the roof-system
segmentation taxonomy (9 categories incl. Labor + Service Fees). RLS on 7 exposed tables
to be handled in the upcoming DB-health pass.
