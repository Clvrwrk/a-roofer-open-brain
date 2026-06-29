<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** `main`==origin/main `7b4ad8e`. On unpushed branches `contrib/cleverwork/service-warranty-transfer` + `…/session-learnings`: 8 Slack **per-agent bots** (registry `slack-agents.ts`; tokens in config/.env + Coolify env), **401 weekly-links fixed**, **S/W transfer Phase 1** (mig 162, docs/61 — 16 Commercial invoices routed out of Invoice Audit → #service-warranty-audit).
**NEXT (needs human push — deploys classifier-blocked):** push both branches→main (activates audit exclusion + loads Coolify agent tokens); then **Phase 2** = mirrored S/W surface + `morning_abc_sync` Commercial triage + invoice-OCR. ROTATE pasted Slack tokens.
**OPEN:** classifier blocks prod deploys/push, autonomous launch, payment-export → human.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent.**
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.
- **Deploys + self-permission = human in auto mode** (classifier blocks push/Coolify-deploy/settings self-grant). **Slack agents → `/slack-agents` skill.**

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips). 6. Credit-memo LINES live in `v_invoice_lines_complete`, NOT `abc_invoice_lines` (normal-only) — per-line views needing CMs must source it or CMs silently drop (mig 157). 7. Structured source before OCR — check vendor API/`raw` JSON before building OCR/parse; verify vs live DB (2026-06-29: Commercial ship-to was already in `abc_invoices.raw`).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds; confirm HEAD via `/healthz` buildCommit). `git push origin HEAD:main` deploys. **Local `main` drifts stale — always `git fetch` + branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **162**.
