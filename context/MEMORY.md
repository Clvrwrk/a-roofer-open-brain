<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Full handoff: `docs/handoffs/current.md`.** 2026-06-19 PM: three dashboard reworks done on branch `cleverwork/price-agreement-audit` — `fafa2c3` territory-map + invoice-audit punch-list (branch/office from `raw->branch`, UOM fix, 45 PDFs backfilled + on-demand), `3d83b0e` Price Agreement Audit → Office/Branch/Category/Item, `a947252` Agreement Builder **Phase A** → 6-level Office/Vendor/Branch/Category/Item/Variation + cost roll-up. **Branch is 3 commits AHEAD of `origin/main` — NOT pushed/deployed.** Next: **Phase B (#6)** builder review checkboxes + progress + confetti + Submit (needs a `reviewed` col on agreement_package_items). Gated: Comms Dashboard (`docs/45`), invoice↔price-list match-lock (`docs/43`), API-nonnegotiated labels on orders/invoices, Item-4 PDF auto-pull, Metal/Tile/Siding cats, RLS 7 tables.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external agent sends (v1):** agents draft; humans send.
- **Dashboards share one shape** — `docs/40` (category sections, `.range()` pagination, scoped deep-links, both themes); PE Office→Vendor/Branch→Category→Item.

## Repeating-issue playbooks (`docs/42`)
1. ABC mapping drift (flat vs nested → null cols; COALESCE from `raw`). 2. UOM: effective price = ext/qty; ALSO normalize negotiated price by `raw->priceQty.priceConversionFactor` when UOMs differ (schema 117). 3. PostgREST 1000-row cap → paginate `.range()`. 4. Invoice branch/office come from `raw->'branch'`, not ship-to.

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** (Coolify auto-builds main). Dev branch `cleverwork/price-agreement-audit` (now 3 ahead of main, unpushed). `git push origin main` deploys; verify `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. **Local `main` is STALE (≠ origin/main) — reset to origin/main before using it.** Local dev `127.0.0.1:4321`. Supabase `rnhmvcpsvtqjlffpsayu`. Schemas mirrored thru **118**. Build: `cd app/command-center && npm run build`.
