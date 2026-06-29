<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** On `main` (==origin/main, deployed). **docs/59 Invoice Audit rebuild COMPLETE+LIVE** (Tasks 1–6 + Gate 7): cascade cols+dates ($0→100%), open+60d scope, Alex/Maya/human badges, per-invoice "Go back" reset, decision-detail CSV in Manage. **Alex first full trial DONE** (docs/57 §7–8): 17 dispositioned (6 held→Casey $563; 11 Processed batch 8cd6f354 $15.6k), **13 Slack → #accounting-invoice-processing** via new **Open Brain Command Center** app (bot @openbrain, ws T0B8QEGPVQW; token in config/.env gitignored). Fleet DORMANT (#9).
**NEXT:** (1) weekly Slack links 401 (gated API→Manage); (2) Coolify SLACK_BOT_TOKEN + wire `postSlackMessage()` into Alex comms (#9); (3) CM-Requested KPI=$0 (wrong source); (4) **ROTATE Slack config token** (pasted in chat).
**OPEN:** AI classifier-blocks prod payment-export + autonomous launch → human clicks. Concurrent DevTeam/SEO drops files — commit only your paths.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips). 6. Credit-memo LINES live in `v_invoice_lines_complete`, NOT `abc_invoice_lines` (normal-only) — per-line views needing CMs must source it or CMs silently drop (mig 157).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **161**. Build: `cd app/command-center && npm run build`.
