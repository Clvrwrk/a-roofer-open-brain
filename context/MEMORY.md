<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**origin/main `609fef6`.** Open-access DEPLOYED (`021b715`: `COMMAND_CENTER_OPEN_ACCESS` default-ON → every WorkOS human full access; docs/64). **docs/63 daily-invoice-processing** built 59/59, mig 164 prod, branch `contrib/cleverwork/daily-invoice-processing` — PUSHED, NOT deployed. **NEXT (human push branch→main):** 1a process-all, 2 Commercial auto-pay, 1b two CSVs (Register+Payment), 3 CM release-hold. **OPEN:** ROTATE Slack tokens; Q4 due-policy deferred; ABC catalog sync.

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Dashboards: one shape (docs/40) Office→Vendor/Branch→Category→Item.
- Deploys + self-permission = human (classifier blocks push/Coolify/self-grant). Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`; invoice branch/office from `raw->'branch'`. 4. **Structured source before OCR** — check vendor API/`raw` first (ship-to, Job `orderName`, CM `originalInvoiceReference` in `raw`); OCR only after (Unstructured `hi_res`+pg_trgm). 5. Credit-memo LINES in `v_invoice_lines_complete`, not `abc_invoice_lines` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`; TEMP `{OFFICE}-TEMP-{id}`. 7. **Concurrent agents (single-folder):** tree goes dirty mid-session → `git status` before commit; stage ONLY your files (never `-A`); never touch another stream's WIP. Push `<branch>`=safe; only `:main` deploys. 2 branches off 1 base can't both FF main → merge `origin/main` into laggard first (version.ts conflict → higher patch). 8. **Invoice-audit engine:** `disputed`/credit-flag line = `pendingLines` → held out of to-be-paid; register-ready = `workedLines===auditableLines` (all DECIDED); held↔CM via `normalizeInvoiceRef(raw->originalInvoiceReference)`.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys; branch from `origin/main`. Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **164**.
