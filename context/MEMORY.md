<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + latest daily log.** **Global Price Agreement** shipped (migs 132-142; per-branch API price on all 5 line dashboards, PA Audit, invoice-date lock, version-comparison, description-match review surface, image chip — detail in archived handoff). Latest: **open-invoice API-price gap fill** (mig 142 promoted 68 catalog items; priced lines 990→1080; 41 left are ABC "call for pricing"/charges). **Observability LIVE**: Sentry (errors + masked replay + user id/email) on cc.proexteriorsus.net → Slack `#cc-proexteriors`; CodeRabbit advisory + error-handling rules. See `/sentry` + `/coolify` skills.
**OPEN:** rotate the Sentry `sntrys_` build token (chat-exposed) → update Coolify; activate nightly-sync Sentry on agent host (`npm i @sentry/node`); [GPA] image-chip visual-verify · Denver/Dallas promote · price crons (agent host, cycle 2026-07) · Accounting Slack >6% · ABC account-expansion (~546 branches); **ABC FULL prod-sync owed — must run on agent host, Cowork sandbox 45s/PID-kill caps block it (06-21/22 logs)**.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **142**. Build: `cd app/command-center && npm run build`.
