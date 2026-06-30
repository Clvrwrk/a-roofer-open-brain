<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**ACTIVE: AccuLynx commercialization** (`.planning/`, 7 phases, GSD). **Phase 1 DONE** (`c45f180`): 9-account registry + 86-GET checklist (migs 165-167), sandbox read-sweep fn, `docs/65` matrix, OKF bundle `docs/knowledge-base/acculynx/`; sandbox seeded 89 jobs/102 contacts. Writes proven (contact 200/job 201); **NO milestone-write**. **NEXT: /gsd-plan-phase 2.** Also open: Hermes scheduler.

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Dashboards: one shape (docs/40) Office→Vendor/Branch→Category→Item.
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main` & poll `/healthz` (self-grant still blocked). Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`; invoice branch/office from `raw->'branch'`. 4. **Structured source before OCR** — check vendor API/`raw` first; truncated-invoice lines come from `abc_csv` not OCR (`lines_complete_source`; 0 short). 5. Credit-memo LINES in `v_invoice_lines_complete`, not `abc_invoice_lines` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`; TEMP `{OFFICE}-TEMP-{id}`. 7. **Concurrent agents (single-folder):** tree goes dirty mid-session → `git status` before commit; stage ONLY your files (never `-A`); never touch another stream's WIP. 2 branches off 1 base can't both FF `main` → merge `origin/main` into laggard first (version.ts conflict → higher patch). 8. **Invoice-audit engine:** `disputed`/credit-flag line = `pendingLines` → held out of to-be-paid; register-ready = `workedLines===auditableLines` (all DECIDED); held↔CM via `normalizeInvoiceRef(raw->originalInvoiceReference)`.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys; branch from `origin/main`. Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **167**. **Two hosts:** Coolify/CC `5.78.124.10` (`hetzner_office`); AGENT/Hermes `5.78.146.161` (`a_roofers_open_brain_ed25519`).
