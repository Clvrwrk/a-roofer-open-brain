<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Full handoff: `docs/handoffs/current.md`.** 2026-06-19: Chris's 6-item Invoice-Audit walkthrough + segmentation + a client-blocking speed fix + credit memos (Item 1) are ALL done & deployed (commit `dffc50d`; dev=main aligned). **Open (all gated):** Item 4 PDF auto-pull (code only — runs on the agent host, not this sandbox); Metal/Tile/Siding categories (Chris decision); RLS on 7 tables (DB-health pass).

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then the `<vendor>-api` data-map skill.** Built: abc-supply-api, acculynx-api. TODO: EagleView/GAF/Roofr.
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (pair builds/audits with an adversarial verifier).
- **Zero external agent sends (v1):** agents draft/notify internally; humans send. ("Mark sent" only logs a human sent it.)
- **All dashboards function the same** — follow `docs/40` (category sections, `.range()` pagination, scoped deep-links, both themes).

## Repeating-issue playbooks (`docs/42`) — read before touching ABC data
1. ABC ingestion mapping drift (flat vs nested keys → null columns; check `raw` first, COALESCE from raw). 2. UOM: use `effective_unit_price`=ext/qty, never raw `unit_price` (per-pack on bundles). 3. PostgREST 1000-row cap → paginate `.range()`.

## Command Center — LIVE (all on `main`, design-system)
Home territory map · **Invoice Audit** (effective-price variance, un-audited At Risk, category sections) · **Order Audit** (lazy lines, 0.45s) · **Estimate Audit** (persisted edits) · **Credit Memos** (`/accounting/audit/credit-memos`: received CM↔original match + Approve/Reject; requested-CM tracker) · Price Agreement Audit + Agreement Builder · Price List Coverage · Price Foundation · branch price list. **Segmentation:** `roof_system_category` (12) + `classify_roof_system()` + overrides.

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** = dev `cleverwork/price-agreement-audit`. `git push origin main` auto-deploys (Coolify). Verify `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. Local dev `127.0.0.1:4321` (Local Operator). Supabase `rnhmvcpsvtqjlffpsayu`. Schemas mirrored thru **116**. ABC sync `mirror-backfill.mjs --env=production` (real host). Build: `cd app/command-center && npm run build`.
