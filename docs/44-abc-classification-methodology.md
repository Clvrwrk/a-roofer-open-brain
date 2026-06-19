# 44 — ABC Classification methodology (end-user README)

This is the plain-language explanation behind the "review class" you see on the Price
Agreement Builder and Negotiated Catalog. It will be surfaced in-app via a **methodology
button** next to "Issue link" (Agreement Builder review, point #5).

## What "ABC Classification" means

ABC classification is a standard **Pareto (80/20) inventory method**. Every item Pro
Exteriors buys is ranked by how much we actually spend on it, then bucketed:

- **Class A — the vital few.** The high-spend items that make up the large majority of
  dollars. Small number of SKUs, big share of spend. Negotiating these moves the needle.
- **Class B — the useful many.** Mid-spend items. Worth negotiating, but each one matters
  less than an A item.
- **Class C — the trivial many.** Low-spend long-tail items. Lots of SKUs, tiny share of
  spend. Generally not worth individual negotiation effort.

## How we compute it here

- **Basis:** trailing **36-month spend** per item (`spend_36mo`), from actual ABC invoice
  history, aggregated by `item_number`.
- **Ranking:** items sorted high→low by spend; cumulative spend share assigns the class.
- **Negotiable set = A + B**, which together are **~87% of 36-month spend** in roughly
  **~857 SKUs across ~454 families** — i.e. we negotiate the ~half of the catalog that
  drives ~all of the cost, and don't burn time on the C tail.
- Items are grouped into **families** (a base product) that expand to **variations**
  (color/size SKUs), so a negotiator works at the family level and only drills into
  variations when a specific SKU needs its own price.

## Why it matters for negotiation

- Focuses the agreement on the items where a price concession is actually material.
- Keeps the worksheet human-sized (hundreds, not thousands of lines).
- Makes coverage measurable: "are our A+B items under a current negotiated price at this
  branch?" is the question the Price Agreement Audit answers.

## Caveats

- Spend is historical; a new product can be under-classified until it has purchase history.
- Class is recomputed as invoice history grows — an item can move between B and C over time.
- A+B threshold (~87%) is a tunable policy, not a law; revisit if the catalog mix shifts.

_Source of the live numbers: `v_negotiable_items` (schema 109). This document is the
human-facing companion to that view._
