<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Latest handoff: `context/memory/2026-06-19.md`.** 2026-06-19: **UOM/pricing fix DONE + DEPLOYED** — all dashboards compare in ABC pricing UOM via `abc_invoice_lines.price_per_uom` + `v_item_uom_map` (migs 119–122, docs/46); live on `origin/main` `6b9cabb` = cc.proexteriorsus.net buildCommit (dev↔main↔live 100%). Added **`/workos-agent-auth`** skill — agents reach the live site via `/api/*` bearer token; WorkOS `auth.md` OAuth discovery is live but minting `not_implemented`. **Skill + memory commits are LOCAL on `cleverwork/price-agreement-audit`, NOT pushed** (Chris's call). Next: Builder **Phase B (#6)** review checkboxes+progress+confetti+Submit (needs `reviewed` col on agreement_package_items). Gated/next: Comms Dashboard (`docs/45`), match-lock (`docs/43`), audit-view agreement date matching, ship-to `…-21` no-agreement gap, finish WorkOS Path-B token minting.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external agent sends (v1):** agents draft; humans send.
- **Dashboards share one shape** — `docs/40` (category sections, `.range()` pagination, scoped deep-links, both themes); PE Office→Vendor/Branch→Category→Item.

## Repeating-issue playbooks (`docs/42`)
1. ABC mapping drift (flat vs nested → null cols; COALESCE from `raw`). 2. UOM/pricing: compare in ABC pricing UOM — canonical = `abc_invoice_lines.price_per_uom` (=ext/priceQty.value); align orders via `v_item_uom_map`; flag uom_mismatch (schemas 119-122, docs/46; SUPERSEDES the 117 conv-factor patch). 3. PostgREST 1000-row cap → paginate `.range()`. 4. Invoice branch/office come from `raw->'branch'`, not ship-to.

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** (Coolify auto-builds main). Dev branch `cleverwork/price-agreement-audit` (in sync with `origin/main`, deployed). `git push origin HEAD:main` deploys; verify `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. **Local `main` is STALE (≠ origin/main) — reset to origin/main before using it.** Local dev `127.0.0.1:4321`. Supabase `rnhmvcpsvtqjlffpsayu`. Schemas mirrored thru **122**. Build: `cd app/command-center && npm run build`.
