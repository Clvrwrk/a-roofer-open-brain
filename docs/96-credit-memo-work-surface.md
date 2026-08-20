# 96 — Credit-memo work surface + original-invoice matching protocol (2026-08-19)

`/accounting/audit/credit-memos` was a flat sortable table — the only accounting surface
that did not use the **PE Office → Vendor Branch → Invoice** nesting every other work
surface uses. It also could not answer the first question a human asks of a credit memo:
*what invoice is this crediting, and what job does the money belong to?*

Rebuilt on that nesting, with three documents on every row.

## The matching protocol (migration 236)

Only **73 of 261** ABC credit memos (28%) carry `original_invoice_reference`, so the old
`v_credit_memo_audit` reported `no_reference` for the other 188. The printed memo shows an
"Orig. Inv. Number" (e.g. `71807238`) — but that is an ABC-internal id in a different
number space from our `invoice_number`, and it is **not in the API payload**. Rather than
reach for OCR, the structured fields we already hold get us there (structured source
before OCR — CLAUDE.md working style).

Signals evaluated over all 261 memos:

| signal | coverage | verdict |
|---|---|---|
| `originalInvoiceReference` | 73 | explicit, exact |
| `orderNumber` | 157 | **useless** — a memo's `orderNumber` is its own invoice root, not the original's. 0 matches. Do not re-try this. |
| `purchaseOrderNumber` | 249 | the job key — "Customer PO#" on the printed memo |
| `ship_to_number` | 261 | the ABC account/branch |
| line-item overlap | — | corroborates a PO match |

Four tiers, strongest first, each carrying its **own confidence** so a weak guess is never
displayed as a confirmed match (trust-tier discipline, hard rule 4):

| tier | confidence | memos | rule |
|---|---|---:|---|
| `reference` | exact | 73 | memo's reference root → invoice root |
| `po_item` | confident | 82 | same PO + same ship-to + ≥1 shared item, dated on/before the memo |
| `po_only` | probable | 42 | same PO + same ship-to, no shared item |
| `shipto_item` | weak | 57 | same ship-to + ≥1 shared item within 60 days |
| `none` | none | 7 | nothing resolved |

**254 of 261 matched (97%), up from 73 (28%).**

### The 7 that do not match — correctly

They are not protocol failures; they are memos that do not credit a single invoice:

- `2010410580-001` ($5,000) and `2010584261-001` ($3,800) — round-number rebate/settlement
  credits with no PO at all.
- `2008532673-001` ($761.06, PO "GAF Credit") — a manufacturer credit, not a return.
- `2008368426-001` ($10,928.36, PO "MC-51,52,53") — spans three jobs.
- `2009500674-001` ($168.05, PO "kc-1").
- `2001064636-001` and `2001072294-001` — April 2025 CSV-history memos whose originals
  predate our invoice ingest. `2001064636-001` is the one in the sample PDF: its
  "Orig. Inv. Number 71807238" is not in our data at all.

Forcing a match on any of these would be worse than showing "none resolved".

## The work surface

Server-rendered nested `<details>` — 261 memos is a small set, so the nesting costs no
client bundle. Same visual language as the Invoice Audit (office cards, branch panels,
mini stat columns, chevrons).

**PE Office → Vendor Branch → Credit Memo.** Six offices, 22 branches, $204,674 credited.

Every memo row carries the three documents:

1. **Memo PDF** — `/api/invoice-audit/pdf/<memo>`. All 261 memos have a stored PDF.
2. **Original invoice** — a link into the Invoice Audit *and* a direct link to the
   original's PDF, so the two documents open side by side.
3. **Job (Customer PO#)** — deep-links to `my.acculynx.com/jobs/<id>` when an AccuLynx job
   id is on file, otherwise renders the job number as text rather than a dead href, with
   the PO always shown underneath. **241 of 261 memos deep-link** after migration 237
   (below); 254 carry a job label.

The job resolves from the memo's own AccuLynx match, falling back to the **matched original
invoice's** — a memo with no PO of its own still lands on the job once its original is
known. The row says which (`job via original invoice`).

Toolbar is deliberately three controls — search, office, match confidence (with a
"Needs review" option that selects probable + weak + none). Filtering auto-opens the
branches holding hits.

## Performance note

The first cut joined `v_invoice_audit_invoice` to pick up office/branch. That view
recomputes the entire pricing CTE, so the join cost **2.9s** and discarded 292,581 rows in
the join filter. Resolving office/branch inline from `abc_invoices` + `vendor_branches`
(the same expression that view uses) brings it to **651ms**, and the two agree on all 261
memos — 0 office mismatches, 0 branch mismatches. The remaining cost is tier 4's
item-overlap semi-join; it buys 57 matches and only runs for memos the first three tiers
missed.

## Also in this pass

**SRS Englewood / S Denver quote `0049345641` elevated** (migration 235), by the same
mechanism as the Wichita quote (migration 234) — `ceo_verified` on the agreement record,
never a rule hard-coded per vendor. Chris's framing: *we are working to get the vendor to
sign off on the price agreements we build*, so a branch quote is the operative price book
until a countersigned agreement replaces it. Each document is accepted individually and
the panel keeps showing that the document is a quote.

## Open follow-ups

1. Write docs/93 back to prod (unchanged from docs/95 — the two withdrawals and the penny
   adjustment are still not in `credit_memo_requests`).
2. Fix the SRS re-audit writer so `discrepancy` rows carry office + agreement.
3. Decide repair-or-retire on `credit_memo_amount`.
4. ~~AccuLynx job-id coverage is thin~~ — **fixed the same day, migration 237.** See below.

## AccuLynx job linking fixed (migration 237)

Only **185 of 1,089** ABC invoices (17%) resolved an `acculynx_job_id`, so most surfaces
could show a job *number* but had no id to link, and executive job-cost attribution
dropped most invoice cost on the floor. Two causes, both in the join key:

1. **The invoice side normalised the whole label.** AccuLynx names a job `KS-79: Mark
   McCall` (norm `KS79`), but the ABC `order_name` is often `KS-79 Mark McCall` with no
   colon, normalising to `KS79MARKMCCALL` — matching nothing.
2. **The view only ever read `order_name`.** The job is very often in
   `purchase_order_number` instead — "Customer PO#" on the printed invoice *is* the job
   key (`KS-160-1`, `ks158`, `CO-354-1`). That field was never consulted. This was the
   bulk of the loss.

Fix: keep the exact match as tier 1 unchanged, then fall back to a canonical **job token**
— the leading `<2 letters><digits>`, e.g. `KS-160-1` → `KS160` (the trailing `-1` is the
material sequence, not part of the job). Tier 2 takes the token from `order_name`, tier 3
from `purchase_order_number`. New `link_method` column reports which tier fired.

**The token is collision-free**: all 883 non-temp prefixed AccuLynx jobs produce 883
distinct tokens, so a token match resolves to exactly one job or none. Verified before
applying.

| | before | after |
|---|---:|---:|
| ABC invoices linked | 185 (17%) | **863 (79%)** |
| Credit memos deep-linkable | 73 | **241 of 261** |
| Memos carrying a job label | 154 | **254** |

Tier 1 is provably untouched: the `link_method='job_name'` fingerprint after the migration
(`md5 7508797978d4ae5f9aec66485757c9ca`, 185 rows) is identical to the pre-migration
fingerprint over all matched rows. Nothing that linked before links differently now.

### Why 13 memos still have a job label and no link

Because they are not jobs. `DFW Account`, `Denver Co Account`, `Commercial`,
`Texas Motor Speedway` (POs `CARE CENTER`, `CAFE PVC`), and two whose PO is a street
address (`869 east rim rd`, `1599 S MACON ST`). These are account-level and commercial
purchases with no AccuLynx job to point at. "All 154 deep-link" was not achievable; 241 of
261 is the real ceiling until those purchases are booked against jobs.

### Blast radius, stated

`executive-pipeline.ts` attributes invoice cost to jobs through this view filtered on
`matched = true`. Going from 185 to 863 matched invoices **moves job-cost and margin
numbers on the executive dashboard**. That is the correction working — cost that was
previously unattributed now lands on its job — but it is a visible change to those
figures, not a silent one.

### Reviewed edge cases

Six links cross a state boundary between the job prefix and the branch. Five are
legitimate (material bought at a branch outside the job's state; `TX-427` is an
office-prefixed job physically in Norman, OK, where its branch is). One links two invoices
to `KS-1: Kansas Temp File`, a catch-all job file — the PO literally reads `KS-1`, so the
link is what the data says. Left as-is rather than special-casing two rows.
