# Removed surfaces — 2026-08-19 (PEC-217)

Deleted per Chris's instruction to remove orphaned and dead pages, with the
reasoning recorded here so any of it can be revived deliberately.

**How to revive anything below:** every file is intact in git history. The last
commit that still contains all of them is **`5bbb178`**.

```bash
git show /Users/chussey/Documents/a-roofers-open-brain/5bbb178pp/command-center/src/<path>          # read a deleted file
git checkout 5bbb178 -- app/command-center/src/<path>   # restore it
```

## Removed — Price Foundation surface (fully orphaned)

| File | Why removed |
|---|---|
| `pages/data-quality/index.astro` | Redirect whose only target was the page below |
| `pages/data-quality/price-foundation/index.astro` | Not in nav; **zero** inbound links anywhere in the app |
| `pages/data-quality/price-foundation/queues.astro` | Reachable only from the index above |
| `pages/api/data-quality/price-foundation/review.ts` | Served only those two pages |
| `lib/price-foundation.ts` | Sole consumer was that surface |
| `scripts/price-foundation-overview.ts` | Sole consumer was that surface |
| `scripts/price-foundation-queues.ts` | Sole consumer was that surface |

The entire `/data-quality/*` tree was referenced by exactly one thing: a
**commented-out** line in `lib/nav.ts`. Nothing linked to it, so no user could
reach it without typing the URL.

## Removed — Negotiated Catalog

| File | Why removed |
|---|---|
| `pages/accounting/price-list/catalog.astro` | Not in nav; only inbound refs were a commented nav line and the dead module below |
| `lib/negotiated-catalog.ts` | Only consumer was that page |

Note: this page was *honest* — it read live top-200-by-spend and rendered a real
empty state. It was removed for being unreachable, not for being wrong. If the
negotiated catalog is wanted again, restore both files and re-list it in nav.

## Removed — Vendor Regions

| File | Why removed |
|---|---|
| `pages/accounting/vendor-regions.astro` | **Duplicate surface** — 19 lines that rendered the same `<VendorTerritoryMap>` component already shown on the home route `/` |

This one was *not* strictly orphaned: it was linked from a "Price List Coverage"
row inside the territory map itself, which meant the map linked to a page showing
the same map. Removing it required three companion edits:

- `components/accounting/VendorTerritoryMap.astro` — dropped the self-referential link row
- `layouts/AppShell.astro` — dropped it from the client cache list
- `pages/sw.js.ts` — dropped it from the service-worker precache **and bumped
  `VERSION` to `cc-page-cache-v20260819a`**, which is required so already-installed
  service workers evict the stale entry instead of serving a 404 from cache

## Removed — fabricated sample data

| File | Why removed |
|---|---|
| `lib/price-list.ts` | Contained **10 invented SKUs** with fake unit costs/quantities and **8 fake branches** (`0412 Wichita W`, `0418 Wichita NE`…) that match no real ABC branch. Header admitted "Sample data for now." |

It rendered nowhere — only its two *types* were imported (`import type`, erased at
compile time) — but it was a live landmine: wiring `buildPriceListPayload` into any
page would have published invented prices as real. Its consumer
(`negotiated-catalog.ts`) was removed in the same pass.

## Removed — dead "sample" status

`lib/estimate-audit.ts` declared `status: "live" | "sample" | "unconfigured"`, and
`pages/operations/estimate-audit.astro` rendered a **"Sample data"** runtime label
for it. Nothing ever assigned `"sample"`, so the label was unreachable — but it
meant a surface could in principle announce itself as sample data. Both the union
member and the label branch are gone; the page is now live-or-pending only.

## Deliberately KEPT

These look like deletion candidates but earn their place:

| Kept | Why |
|---|---|
| `pages/accounting/index.astro`, `pages/executive/index.astro` | Department landing redirects — deleting them 404s the department nav |
| `pages/abc-price-agreement-gaps.astro`, `pages/accounting/price-list/review.astro`, `pages/vendor-territories.astro` | 301 stubs for **retired** surfaces whose targets are still alive. They exist precisely to keep old bookmarks and deep links working; deleting them would *create* the broken links this audit exists to prevent |
| `pages/auth/denied.astro`, `pages/submit-agreement/[token].astro` | Intentionally shell-less and documented — a pre-auth error page and a public token-gated vendor page |
| `lib/audit-queues.ts`, `styles/audit-queue.css` | Shared with `AuditQueue.astro` and the credit-memo audit page |

## Verification

- `npx vitest run` — **309 passed**
- `npm run build` — clean
- Link graph re-validated after deletion: **45/45 internal links resolve, 0 dangling**
- No surviving references to any removed module
