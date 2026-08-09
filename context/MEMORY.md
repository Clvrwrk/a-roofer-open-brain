<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/9 (PEC-189..192):** Cleanup done (1,033 ABC No-Price approved as Chris; 47 CMs $1,920.42 sent; 15 QXO auto-approved). Multi-vendor CM pill live (cm-vendor-roster.ts seam, docs/88). QB bank CSV live (/accounting/qb-bank-export, mig 226; CM-TBD lines = arrives-QA). SRS parity: audit epic **PEC-191** — fixed migs 227/227b (vendor-scoped reset) + endpoint scoping + srs run restamp; NEXT: G1 SRS claim gen, G2/G3 add-line ctx (matview risk), G4 reconcile — read docs/89 first. PEC-185→epic. AWAITING `APPROVE PEC-186`.


## Standing instructions (Chris)
- **Silo doctrine: price agreement = (vendor, PE office). No pricing join crosses either; unknown office ⇒ No-Price; fail closed. Every money table keys (vendor_slug, invoice_number).**
- **A fix isn't fixed until verified through the LIVE call path** (mig-222 landed in dead code; PEC-184 #1).
- Vendor data = official API docs FIRST; verify vs LIVE DB, not migration files.
- Zero external sends (v1); prod first-tries gated (sandbox → subset → fan-out).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.
- **All app/code/Linear-issue Slack traffic → `#pe-cc-dev-team`** (Chris 2026-08-07; incl. future fix-approval gates).

## Playbooks (docs/42 + PEC-184)
1. UOM: compare in pricing UOM `price_per_uom` via `v_item_uom_map` (docs/46). 2. PostgREST truncation: "exactly 1000"=cap→paginate; chunk `.in()`; partition upserts. 3. Structured source before OCR; vision extraction must tie to printed totals server-side. 4. ABC mapping drift → COALESCE from `raw`. 5. Worktree agents: stage ONLY your files; verify merge-base. 6. AccuLynx watermark PK `(account_key,resource_type)` (mig 171). 7. Rotating OAuth tokens: persist successor on rotation; diagnose via fingerprints (`op read | shasum`), never values. 8. After host rebuilds, grep repo for stale uuid/IP (Coolify app uuid is now `lu5txzhyoza7uuz0scwpobv7`).

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Edge Functions via `supabase functions deploy`. Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **223**. Hosts: AGENT=`PE-US-AGENTS` `178.156.203.23` (`~/.ssh/hetzner_office`); dev=`PE.CC.DEV` `178.105.220.14`. Dev server port **4399**. 1P (op, CW_Master): **`QBO - PROD TOKENS`**, **`coolify.proexteriorsus.net - Root API`**. Linear: PE-CC-DevTeam.
