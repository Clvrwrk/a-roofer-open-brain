<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/7 PM (PEC-186/187/188):** job-walk cursor-wrap fix (mirror had frozen Jul 2 — sync walkers must WRAP); Maya gate LIVE (migs 224-225, maya-gate.mjs 15-min timer on host): auto-diagnose accounting intakes → propose in #pe-cc-dev-team → Chris `APPROVE PEC-xxx` (allowlist U0B8SGJJZLJ, plan-hash, fail closed) → whitelisted mirror_refresh only; + ticket-opened requester notices. AWAITING: Chris `APPROVE PEC-186` (gate live test). NEXT: PEC-185 deferred hardening. Handoff: docs/handoffs/current.md.

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
