<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** Branch `contrib/cleverwork/headless-agent-scheduler` → `origin/main` this wrapup. Agent fleet verified **DORMANT + under-provisioned** (29 crons paused, no host scheduler). **Headless Hermes proven**: `docker run` baked Kasm img + mounted profile → `hermes cron tick` (img tag in docs/56); Alex ran a full autonomous loop. **Alex now OPERATIONAL** after `scripts/provision-agent-env.sh` filled empty ABC auth URL/scopes + `SUPABASE_SERVICE_TOKEN` (ABC OAuth 200 + Supabase 200). Design: `docs/56` (scheduler) + `docs/57` (Alex SOPs).
**NEXT:** Alex weekly/monthly/quarterly/annual SOPs (weekly owns Tier-2 2hr freshness + 0-3% digest); then build backlog (agreement ingestion+schema, gap-tracking work items, host systemd scheduler, dashboard recording helper); provision Jordan/Sam profiles (no `.env`).
**OPEN:** **Guardrail**: AI cannot launch `--yolo` agent on prod (classifier blocks even w/ permission rule) — host timer runs agents, first validation human-run. Fleet `.env` audit + root-cause `deploy-agent.py`. `open-engine/` untracked (Chris). Stormwatch deploy PAUSED.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **153**. Build: `cd app/command-center && npm run build`.
