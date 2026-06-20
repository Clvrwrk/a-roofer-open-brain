<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Latest handoff: `context/memory/2026-06-19.md` (Session 21:00).** Go-live alignment DONE + DEPLOYED (dev=main=live `acfeb11`): **open invoices = 172** from the ABC open/closed report — `abc_invoices.ar_status` is the source of truth, NOT the payment gate (was 227). Invoice Audit + Price Agreement Audit + Agreement Builder all read `v_invoice_lines_complete` (ABC API caps invoice lines at 10 — completed from report CSV; migs 123-127, docs/47-49). KPI cards scoped to open; 415 report-only invoices imported. Builder **Phase B DONE** (review checkbox + progress + confetti, mig 129). **OCR pipeline validated** (Unstructured.io, key in `.env`): vendor list → hi_res → match item# to catalog → review queue.
**NEXT (Chris approved, paused for handoff):** build vendor-agnostic **Global Price Agreement** — schema `global_catalog_item`/`vendor_item_xref`/`vendor_price`/`v_best_vendor_price` + seed ~150 canonical (53 freq-ordered families + top Class A), ABC = vendor #1 (docs/50). Also: backfill `terms` for the Monday-invoice filter; promote PA-16 to a live agreement; methodology → family-level.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev `cleverwork/price-agreement-audit` = origin/main = live (`acfeb11`). `git push origin HEAD:main` deploys; verify `curl https://cc.proexteriorsus.net/healthz`. **Local `main` is STALE — never use it.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **131**. Build: `cd app/command-center && npm run build`.
