<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**main @ `3667d6d`** (local; **ahead of origin/main** — human push deploys). Merged S/W Audit Phase 1+2 (`?audit=service_warranty`, mig 162) + **PE job/PO naming** (mig 163 applied prod; Invoice/Order Audit pills). ABC invoices **995** (latest 2026-06-27). Office-isochrone price seed: 674 items / 11,323 obs. **NEXT:** push main + Coolify redeploy; re-apply view hotfix (`po_mismatch` without AccuLynx match — auto-review blocked); ABC webhooks receiver. **OPEN:** ROTATE pasted Slack tokens. Full ABC catalog sync owed (non-sandbox runner). Deploys/push = human.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent.**
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.
- **Deploys + self-permission = human in auto mode** (classifier blocks push/Coolify-deploy/settings self-grant). **Slack agents → `/slack-agents` skill.**

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips). 6. Credit-memo LINES live in `v_invoice_lines_complete`, NOT `abc_invoice_lines` (normal-only) — per-line views needing CMs must source it or CMs silently drop (mig 157). 7. Structured source before OCR — check vendor API/`raw` JSON before building OCR/parse; verify vs live DB (2026-06-29: Commercial ship-to was already in `abc_invoices.raw`). 8. **PE ABC naming (internal):** Job `orderName` authoritative `{OFFICE}-{num}: {Client}` (unpadded); PO derived `{OFFICE}-{num}-{seq}`; pre-approval `{OFFICE}-TEMP-{shortId}`. ABC PO write only at order create (20 char); no orderName on Place Order API.

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds; confirm HEAD via `/healthz` buildCommit). `git push origin HEAD:main` deploys. **Local `main` drifts stale — always `git fetch` + branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **163**.
