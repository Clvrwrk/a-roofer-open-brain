# 106 — ABC matcher parity, expiry as an explicit choice, and the audit page that was never rendering

**Date:** 2026-08-24 · **Requested by:** Chris Hussey · **Migrations:** 268–271
**Linear:** PEC-231, PEC-238, PEC-239, PEC-240 (new), PEC-241 (new)
**Related:** docs/103 §2 (colour variants), docs/104, docs/105 (silo rules), docs/46 (UOM)

Chris ruled on three open decisions in one pass. Two of the three turned out to
rest on a premise the data does not support, and the third uncovered a finance
surface that has been rendering empty.

---

## 1 · PEC-231 — the ABC colour swap was not the like-for-like it was written up as

The ticket said: move ABC off its 0.45 trigram arm onto the colour-variant rule,
and the two vendors become genuinely uniform. Migration 261's note explained why
trigram was safe on ABC — the price list carries item numbers on 1,292 of 1,690
rows, so "the exact arm does the heavy lifting and trigram only mops up."

That is true of the price **list**. It is false of the invoice **lines**:

| winning arm | priced ABC lines |
|---|---:|
| exact item number | 1,230 |
| exact / prefix description | 39 |
| **trigram ≥ 0.45 only** | **961 (43%)** |

And the claims lean harder still — **$6,619 of $7,271 (91%)**, on 185 of 244
claim lines, came from trigram-only matches. Swapping the colour rule in
verbatim was measured at **2,230 → 1,403 priced lines** and **$7,271 → $1,376**.

### Why the colour key does not transfer

`vendor_desc_color_key` was tuned on SRS descriptions, which are pipe-delimited
and consistent. ABC writes free-text abbreviations:

| description | colour key |
|---|---|
| `Mal Vista AR 252 Storm Grey 3BDL/SQ` | `3BDL/SQ MAL VISTA` |
| `vista ar 252 3bdls sq` *(book row)* | `3BDLS SQ VISTA` |
| `Mal EZ Ridge XT 224 Mid Black 20LF` | `20LF EZ MAL MID RIDGE XT` |
| `malarkey 224 ez ridge xt 20lf` *(book)* | `20LF EZ MALARKEY RIDGE XT` |

`MAL` vs `MALARKEY`. `3BDL/SQ` vs `3BDLS SQ`. `MID` read as a product word. The
Malarkey Vista colour family — five colours priced off one colour-generic book
row — is precisely what the rule exists for, and on ABC's text it misses.

### The real failure mode: dimension blindness

The two worst false claims in the ABC audit are a **width**, not a colour:

| invoice line | matched to | variance | claim |
|---|---|---:|---:|
| `GAF 12" Cobra Snow Country 4' Adv` | `cobra 9 snow country 4` | **+129.3%** | **$412.08** |
| `GAF Cobra Rigid Vent 3 12" W/Nails` | `gaf cobra ridge vent 9 12 w nails` | +28.4% | $129.60 |

Trigram drops bare digits. So does the colour key, which strips them as noise.
Neither rule can tell 9″ from 12″. The $412.08 line was the largest single claim
in the ABC audit and the 129.28% that topped the board.

### What shipped (268, corrected by 271)

A four-rank fallback: exact item → exact/prefix description → colour-key
equality → trigram ≥ 0.45 **gated on the book row's numeric tokens being a
subset of the invoice line's**.

`{9,4} ⊄ {12,4}` kills the Cobra match. `{252,3} ⊆ {252,3}` keeps Vista.

Every removed claim was checked by hand and every one is a genuine mismatch:
`IPS Multi-Cap VC57` off `VC35`, `CT Winterguard Long 3X65 2SQ` off
`Short 3x32.5 1SQ`. Three borderline false negatives (~$65) go with them —
`2M/BX` vs `2000 box`, `24"` vs `24 x50` — and that is the correct side to err on.

**Measured live, before → after:**

| | before | after |
|---|---:|---:|
| priced ABC lines | 2,267 | 2,013 |
| claim value | $7,281.40 | $6,097.30 |
| claim lines | 247 | 205 |
| worst variance | **129.28%** | **58.84%** |
| lines won by the colour arm | 0 | 105 |

(−137 of the line drop is the supersession fix in §3, not the matcher.)

---

## 2 · PEC-239 — the generic-book duplicates were duplicates

Both item-carrying ABC rows in the generic `price_agreements` table have exact
twins in `abc_price_agreements` — same number, same dates, same item counts
(164 and 153). The other five carry nothing. So the "why do these exist" question
answered itself: duplicate ingest. Migration 269 sets `is_active = false` on all
seven (archive, never delete) and adds two standing checks to `silo_assertions()`,
which the nightly cron already logs:

- `invoice_in_both_mirrors` — must stay 0
- `abc_pricing_in_generic_book` — must stay 0

Moved no number: nothing read those rows.

---

## 3 · PEC-238 — the dollars are historical, the condition is current

Chris's read was that a rolling one-week review window makes this moot. Half right:

| | lines | claims |
|---|---:|---:|
| priced by an agreement expired at the invoice date | 677 | $2,959.82 |
| …invoiced in the last 30 days | 20 | **$0.00** |
| …invoiced in the last 7 days | 5 | **$0.00** |

No live claim rests on an expired agreement. But of the 8 ABC invoices in the
last 7 days, **5 lines priced and all 5 came off `2036874-16`, expired
2026-06-30**. Zero priced off an in-date book.

| office | latest ABC book | expiry | in-date books |
|---|---|---|---:|
| Wichita, KS | 2036874-16 | 2026-07-31 | **0** |
| Richardson, TX | 2036874-2 | 2026-08-19 | **0** |
| Kansas City, MO | 2036874-20 | 2026-03-31 | **0** |
| Denver (Greenwood Village), CO | PA-90502-9AMTT6 / 2036874-9 | 2026-12-31 | 2 |

Three of four offices audit August invoices against a lapsed book. Renewing them
is a phone call, not a migration.

**All five recent lines price at 0.00% variance** — ABC is charging exactly the
expired book's prices. That is why migration 270 defaults `renewal_mode` to
`evergreen` and ships the enforcement gate **dormant**: enforcing expiry would
cost coverage and gain nothing. What the schema owed was the record of the
choice, not a new rule.

Shipped: `renewal_mode` (`evergreen` | `expires`) on both agreement tables,
the gate wired into all three ABC arms and the vendor arm, and
`priced_by_expired_agreement` on the audit line — a disclosure, NULL where the
line is unpriced or came from the vendor arm, which does not publish its
agreement id. **613 lines carry the flag today.**

### The supersession gap, found while measuring

The office arms correctly exclude a superseded version for a later invoice. The
legacy `abc_price_agreement_branch_matches` arm did not — it only asserted the
agreement appeared *somewhere* in the office's version list. That is how v3
(expired 2026-06-30) still priced August lines although v4 supersedes it: v4 does
not carry those items, so the fallback reached back a version. 137 lines were
reachable only that way, carrying $10.75 across 3 claim lines. Fixed in 270.

---

## 4 · The performance lesson, paid for in production

Migration 268's first predicate was a four-way OR:

```
exact desc OR prefix OR colour-key OR (trigram AND guard)
```

The prefix disjunct takes its pattern **from** the indexed column, so it is not
indexable, and **one non-indexable disjunct disqualifies the whole OR from a
BitmapOr**. The planner abandoned `idx_abc_pli_desc_trgm` and scanned every item
in the agreement: `select count(*) from v_invoice_audit_line` went from ~8.6s to
**19.9s**, and the Invoice Audit page stopped finishing inside 120s.

Second fault in the same migration: a GIN index on `num_tokens`. Containment over
1–3 element arrays is hopelessly unselective, and the planner preferred it to the
trigram index — 907 candidate rows per loop where trigram matches 18.

Migration 271 reduces the JOIN to two indexable disjuncts and drops the index.
The plan is now `BitmapAnd(agreement, BitmapOr(trgm, color_key))` and the scan is
**8.8s** — the colour arm resolving through an index rather than widening the
trigram candidate set.

Cost of the correction: **29 lines and $523.48 of claims**, all of them the
ungated prefix matches scoring under 0.45. Removing them is right — they were
never part of what PEC-231 approved, a bare book row prefixing a much longer
invoice line is the generic-meets-specific shape that produces indefensible
claims, and none were reviewed. Widening the matcher is a separate decision with
its own evidence.

> **Invariant.** A matcher change is not verified by its match counts. 268's
> numbers were right and its plan was wrong, and the plan is what the user
> experiences. **EXPLAIN the predicate before shipping a join over a large input.**

---

## 5 · PEC-241 / PEC-243 — the Invoice Audit surfaces were not rendering, and now do

Found while verifying §4. The page returns HTTP 200 with
`{"offices":[],"categories":[]}` and a "Supabase pending" badge, because:

```
[invoice-audit] summary load failed: canceling statement due to statement timeout
```

`authenticator` carries `statement_timeout = 8s`; `service_role` sets no override
and inherits it; the view costs 8.8s. `loadInvoiceAuditSummary` calls
`fetchAll(() => client.from("v_invoice_audit_line").select("*"))`, and PostgREST
paginates a view whose per-line `LATERAL … LIMIT 1` must be re-evaluated in full
for every page.

**This predates today.** A probe view reconstructing the pre-session ABC arm —
trigram-only, no colour arm, no guard, no gate, no supersession fix, no flag —
scans in **8.60s** against the current **8.84s**. Everything shipped today costs
**+0.24s, 2.8%**. The view was already over the ceiling.

The expand row failed the same way, reported separately by Chris and filed as
PEC-243: `GET /api/invoice-audit/invoice?invoiceNumber=…` returned **500** in
8.68s with `detail_failed`. Filtering by invoice number does not help — the
equality is not pushed into the LATERAL, and `v_invoice_audit_line_cascade` is
worse still: its plan materialises all 6,982 audit rows to join the 15 detail
rows asked for (`Rows Removed by Join Filter: 104,715`).

### The fix — migrations 272 and 273

Chris: *"if it's slow we need to find an alternative solution then just failing
to render."*

`mv_invoice_audit_line`, refreshed CONCURRENTLY on the existing 15-minute
`refresh-office-pricing-matviews` cron, placed **after** the two matviews it
reads so it is never derived from inputs newer than itself. Unique index on
`line_id`, plus `invoice_number` for the expand path. Migration 273 repoints
`v_invoice_audit_line_cascade` and `v_no_price_repeats`; the app's **8**
PostgREST call sites moved with them.

| | before | after |
|---|---:|---:|
| `GET /accounting/invoice-audit` | 44.6s, **empty** | **0.18s** |
| initial payload | 30 bytes | **1,129,210 bytes** |
| status badge | Supabase pending | **Supabase live** |
| offices / categories | 0 / 0 | **14 / 13** |
| `GET /api/invoice-audit/invoice?…` | **500** in 8.68s | **200** in 0.97s |
| `select count(*)` on the audit line | 8,844ms | **1.2ms** |

The 8s ceiling is untouched. Raising `statement_timeout` was available and
rejected: it lets a slow query hold a connection for 30s instead of failing at
8, which is a worse failure mode than the one it hides.

`v_invoice_audit_line` remains the definition of record. `silo_assertions()`
still reads it under pg_cron, where there is no ceiling, so the nightly
invariants test the live derivation rather than a snapshot of it.

**The trade now being carried:** the audit line is up to 15 minutes stale. Safe
for what it holds — derived pricing only; audit state lives in
`invoice_line_audit` and is read separately, so a human action never looks
un-applied. But a price-agreement change does not reach the audit until the next
tick, which matters as the price-list builder lands. Force it with
`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line;`.

> **Invariant.** A finance surface that silently shows zeros is worse than one
> that errors. `data.status !== "live"` is rendered as a small badge; it should
> be impossible to miss. Still true, still unfixed — the badge is the only thing
> that said this page was empty, and nobody read it.

> **Invariant.** Never read a per-row-LATERAL view through PostgREST. The 8s
> `statement_timeout` on `authenticator` is inherited by `service_role`, so the
> service key buys no relief. Materialise, and read the matview.

---

## 6 · Also filed

- **PEC-240** — the 9 Colorado SRS items printing `$0.00` / `CALL` were
  deliberately never loaded (a `$0.00` book price makes every line read as a 100%
  overcharge). Correct call, but the consequence is silent: those items are
  absent from the book, so a Colorado line for one reads as *unpriced* and is
  indistinguishable from something PE never negotiated. Needs real prices from
  Blake Wells.

## 7 · Verification

```sql
select count(*) from v_invoice_audit_line a
  join abc_invoices i on i.invoice_number = a.invoice_number
 where a.negotiated_price is not null;                        -- 2,013
select round(sum(variance_ext),2) from v_invoice_audit_line a
  join abc_invoices i on i.invoice_number = a.invoice_number
 where quantity > 0 and variance_ext > 0;                     -- 6,097.30
select max(variance_pct) from v_invoice_audit_line a
  join abc_invoices i on i.invoice_number = a.invoice_number
 where quantity > 0;                                          -- 58.84
select count(*) from v_invoice_audit_line
 where priced_by_expired_agreement;                           -- 613
select * from silo_assertions();                              -- 0 rows
```

`npm run build` complete · `npm test` **309 passed**.

---

## 8 · Chris's ruling on price-list lifetime (2026-08-24)

> "All price list remain in effect until a new price list is generated."

`expiry_date` is documentary. A book governs its office until a **newer list
supersedes it**. Migration 270 already implements exactly this — `renewal_mode`
defaults to `evergreen` and the gate fires only on `expires`, which nothing is —
so the ruling confirms the shipped default rather than changing it.

Consequence for the price-list builder work landing this week: **supersession is
per agreement version, not per item.** A newer list for the same
`(office_id, agreement_number)` retires the older one wholesale, including for
items the new list does not carry — those go unpriced rather than keeping their
old price. Diff coverage before saving. Per-item carry-forward would be a
doctrine change and needs its own decision.

Recorded in `docs/105` §6b and propagated to `CONVENTIONS.md` §10b, `AGENTS.md`
and `.cursor/rules/agent-conventions.mdc`.
