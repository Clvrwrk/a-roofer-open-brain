<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** On `contrib/cleverwork/invoice-audit-sop-presentation` (==`origin/main`). **Alex 5 daily SOPs validated vs prod → `docs/57` v3** (morning_abc_sync: OPEN+unpaid+≥60d, benchmark cascade agreement→API→recent same item/branch, per-invoice gross $25 floor, all-unmatched→Jordan). **`docs/59` APPROVED** = Invoice Audit UI rebuild (Alex/Maya attribution by actor, date+`Show all` filter, Org-Inv credit-memo column, per-invoice Go-back). **Task 1 done**: `v_invoice_audit_line_cascade` (mig 154, applied prod, RT-1 passed). Fleet still DORMANT (crons paused, no host scheduler); Alex OPERATIONAL (docs/56).
**NEXT:** docs/59 Task 2 (open+60d scope in `invoice-audit.ts`) → UI Tasks 3–6 (preview-verified) → RT-2 (go-back) → RT-3 → deploy. Then Alex weekly/monthly SOPs; v3 host scheduler (#9).
**OPEN:** **Guardrail**: AI cannot launch autonomous agent on prod (classifier-blocked) — host timer runs it, first run human-kicked. Audit matching NOT broken (low coverage = history-vs-recent artifact). Open Engine = DevTeam plane (`docs/58` v1.0.1). Stormwatch deploy PAUSED.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **154**. Build: `cd app/command-center && npm run build`.
