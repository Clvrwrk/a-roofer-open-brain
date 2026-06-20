<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + `context/memory/2026-06-20.md`.** **Global Price Agreement BUILT + DEPLOYED** (dev=main=`39a14c9`); EXTENDED the existing vendor-agnostic catalog, didn't rebuild. Live: per-branch **API price seed** (606 products × 150 priceable branches; ABC only prices branches our Ship-To accounts hold, ~546 need account-expansion; `v_branch_item_api_price`, migs 134-135) → **"API Price" column on ALL 5 line dashboards**, branch-tied; **PA Audit** scoped to 99 GPA items + KPIs + purple PDF pill (mig 136); **invoice-date price lock** (mig 137; open at-risk $4,437→$3,341); **version-comparison** (mig 138: accept 0-3/review 3-6/critical >6%); **description-match + `/accounting/price-agreement/review`** for family-level PDFs (mig 139); **image chip** (mig 141). Migs 132-141 on prod.
**OPEN:** Chris visual-verify the image chip; review→promote Denver/Dallas in the review surface; **price crons** (monthly-15th + 30-day, agent host); **Accounting Slack** for >6% criticals (`slack_queued` flagged); ABC account-expansion request (~546 branches).

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev `cleverwork/price-agreement-audit` = origin/main = live (`39a14c9`). `git push origin HEAD:main` deploys; verify `curl https://cc.proexteriorsus.net/healthz`. **Local `main` is STALE — never use it.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **141**. Build: `cd app/command-center && npm run build`.
