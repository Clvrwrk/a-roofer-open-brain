<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** On `contrib/cleverwork/invoice-audit-sop-presentation` (4 ahead of `origin/main`). **`docs/59` Invoice Audit rebuild: Tasks 2–4 DONE** (open+60d actionable scope; cascade Most-Recent/Org-Inv column+badge; date+`Show all` filter) — preview-verified, committed, NOT merged (deploy=Gate 7). **mig 157** fixed the cascade credit-memo gap. `docs/57` v3 dailies validated; Alex OPERATIONAL (docs/56); fleet DORMANT (no host scheduler).
**NEXT:** docs/59 Task 5 (Alex/Maya attribution) → Task 6 (Go-back + RT-2) → Gate 7 (RT-3 + merge→main + deploy).
**OPEN:** ⚠ Concurrent DevTeam/SEO session drops uncommitted files in the shared tree — commit only your task's paths. **Guardrail**: AI can't launch autonomous agent on prod (classifier-blocked); host timer runs it, first run human-kicked. Audit matching NOT broken (low coverage = history-vs-recent). Open Engine = DevTeam plane (`docs/58`). Stormwatch PAUSED.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips). 6. Credit-memo LINES live in `v_invoice_lines_complete`, NOT `abc_invoice_lines` (normal-only) — per-line views needing CMs must source it or CMs silently drop (mig 157).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **157**. Build: `cd app/command-center && npm run build`.
