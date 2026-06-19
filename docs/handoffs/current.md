# Handoff — dashboard review reworks (territory map · invoice audit · price agreement audit · agreement builder)

**Date:** 2026-06-19 PM · **Branch:** `cleverwork/price-agreement-audit`. ✅ **PUSHED + DEPLOYED — dev = `origin/cleverwork/price-agreement-audit` = `origin/main` = live `cc.proexteriorsus.net` buildCommit, 100% aligned (verified via `/healthz`).** Local `main` (`a85202f`) is STALE/divergent — ignore it, reset to `origin/main` before ever using it. · **Full logs:** `context/memory/2026-06-19.md` (sessions through 12:00). · **Prior handoff:** `docs/handoffs/archive/2026-06-19-1035.md`.

## ▶ WHERE WE LEFT OFF
Chris reviewed four dashboards in turn and gave punch-lists. Three are **built, verified on dev, and committed (not pushed)**. The Agreement Builder is **Phase A done; Phase B (#6) held by Chris** for next session. Deploy decision (push → `origin/main`) is Chris's.

### Commit `fafa2c3` — Territory Map + Invoice Audit punch-list (7 items)
- **IA-1** branch/office now from each invoice's real selling branch (`abc_invoices.raw->'branch'`), not the ship-to price-agreement match (which wrongly collapsed every invoice to "152 Edmond OK"). Groups Wichita/Richardson/Denver/KC correctly.
- **IA-3** UOM variance fix: negotiated price (per-SQ) normalized into the line's ordered UOM via `raw->priceQty.priceConversionFactor`. `02TKTXTRB` was −59.6% ("saving") → really +21% overcharge. **Migration 117** (both invoice-audit views).
- **IA-2** PDFs: backfilled all 45 missing (560/560 now) via `integrations/bridges/abc-supply/backfill-invoice-pdfs.mjs`; on-demand fetch added in `pdf/[invoiceNumber].ts` (`lib/abc-invoice-pdf.server.ts`, source must be `portal_sync`). **Needs `ABC_SUPPLY_CLIENT_ID/_SECRET` in command-center Coolify env to fire in prod** (web tier had no ABC client before).
- **IA-4/5** Price List greys out when no list; Price List + Invoice as matching left-justified pills; "PDF"→"Invoice".
- **TM-1** logo spans rail width. **TM-2** popup/side-card show `[PA <number>] [Expired <date>]` (added `agreementOnFile` incl. lapsed agreements; all 5 verified agreements are expired).

### Commit `3d83b0e` — Price Agreement Audit rework
- `/abc-price-agreement-gaps` → **PE Office → Vendor/Branch → Item Category → Item** drill-down. KPIs: branch-coverage rate avg per office, Expired, Expiring ≤30d, + negotiated agreements / distinct priced items (per-distinct-agreement counts, not summed-per-branch). API price lists (`agreement_number LIKE 'API-%'`, 92 branches) flagged `API · non-negotiated` + filter. Request-renewal preserved.

### Commit `a947252` — Agreement Builder **Phase A**
- `/accounting/price-agreement/builder` rebuilt single-branch worksheet → **all-offices 6-level: PE Office → Vendor → Vendor/Branch → Category → Item → Variation**. Branch skeleton from `lib/agreement-builder-overview.ts`; per-branch catalog lazy-loads via `/api/price-agreement/branch-detail`.
- **Cost roll-up**: set price = proposed → branch negotiated → historical avg; projected = Σ set×(36mo qty); savings = historical − projected; rolls Branch→Vendor→Office. Per-branch volume from new view **`v_branch_item_spend`** (migration 118, real selling branch × item × 36mo).
- **Exports** download as `PA-<VENDOR>#<BRANCH>-<PA#>` (e.g. `PA-ABC#113-2036874-16.pdf/.csv`, via `&name=`). **Methodology** page `/accounting/price-agreement/methodology` (ABC classification) + "📘 ABC classes" button (toolbar + per-branch action bar). Per-branch Save/Draft-for-review/Issue-link kept.
- KPIs: 4 offices · 857 items · $937k 36mo spend · $951k projected · −$14k savings (negotiated prices net slightly above recent avg — a real signal to revisit in negotiation).

### ▶ OPEN — pick up here
1. **Agreement Builder Phase B (#6)** — per-family review checkbox + per-branch progress bar + confetti at 100% + Submit (→ draft-for-review into the comms gate). Needs an **additive `reviewed`/`reviewed_at` on `agreement_package_items`**. Confetti `<canvas id="iv-confetti">` already stubbed in `builder.astro`, unused.
2. **Communications Dashboard** (`docs/45`) — single source of truth / approval gate across renewals, credit memos, price-list requests, agreement drafts. Phase B's Submit feeds it. Design note only; develop with Chris.
3. **Invoice↔price-list match-lock** (`docs/43`, #3) — lock the first match; override only in Invoice Audit. Build with Price List Coverage.
4. **API non-negotiated labeling** (`docs/43`, #4) — extend the `API · non-negotiated` tag to order/invoice/estimate lines; warn when API price used in-drive-time.
5. Carried from AM (gated): Item-4 PDF auto-pull in the nightly sync (agent host); Metal/Tile/Siding categories (Chris decision); RLS on 7 tables (DB-health pass).

## ▶ DEV ↔ MAIN ALIGNMENT (deployed 2026-06-19 PM — 100%)
- Chris authorized the deploy. Pushed `cleverwork/price-agreement-audit` → `origin`, then `HEAD:main`; Coolify rebuilt and `/healthz` `buildCommit` flipped to the deployed commit (confirmed). dev = origin branch = `origin/main` = live, 0 commits apart.
- Local `main` (`a85202f`) is still STALE — only the local ref; ignore / reset to `origin/main`.
- Migrations **117 + 118** + the PDF backfill were already live on the shared prod DB; the UI is now deployed too, so the full session is live on cc.proexteriorsus.net.
- ⚠️ **For Phase B / on-demand PDF in prod:** add `ABC_SUPPLY_CLIENT_ID` / `ABC_SUPPLY_CLIENT_SECRET` to the command-center **Coolify env** (web tier has no ABC client yet).

## ▶ STANDING INSTRUCTIONS (Chris)
- **Vendor data = official API docs FIRST, then the `<vendor>-api` data-map skill.** Built: abc-supply-api, acculynx-api. TODO: EagleView/GAF/Roofr.
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external agent sends (v1)** — agents draft/notify; humans send.
- **All dashboards function the same** — `docs/40` (category sections, `.range()` pagination, scoped deep-links, both themes); the PE Office → Vendor/Branch → Category → Item shape is now standard across Invoice Audit, PA Audit, and Agreement Builder.

## ▶ PLAYBOOKS — read `docs/42` before touching ABC data
1. ABC ingestion mapping drift (flat vs nested keys → null columns; check `raw`, COALESCE from `raw`). 2. UOM: `effective_unit_price` = ext/qty; ALSO normalize the negotiated/agreement price by `raw->priceQty.priceConversionFactor` when UOMs differ (schema 117). 3. PostgREST 1000-row cap → paginate `.range()`. 4. Invoice branch/office derive from `raw->'branch'`, never ship-to.

## Environment / deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; canonical LIVE = `origin/main` (Coolify auto-builds main). `git push origin HEAD:main` deploys. Local dev `127.0.0.1:4321` (Local Operator). Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored through **118** (additive/idempotent, applied live). ABC sync runs on the Hetzner/Coolify host, not a sandbox. Build gate: `cd app/command-center && npm run build`.
