<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/19 (live b2f602f):** mig **232** (phantom $59.6K row quarantined; ABC total $2,197,424.94), PEC-216 done (13.5s→2.9s, 3.77MB→309KB), PEC-217 11 dead files cut, **Layer 2 sweep Hetzner 06:00CT**, **Orgo desktop `pe-site-qa` 725ce9d6 + walker**. CM re-audit **unanimous 3/3**: $4,738→**$4,654**, drafts NOT sent. **NEXT: human WorkOS sign-in at orgo.ai/desktops/073ff51e** then run walker. **PEC-220: Maya's Orgo desktop GONE — runtime down, ORGO_*_IDs stale.** Quarantine = pattern for bad ingest. Never trust URL alone for auth walls.


## Standing instructions (Chris)
- **Silo doctrine: price agreement = (vendor, PE office). No pricing join crosses either; unknown office ⇒ No-Price; fail closed. Every money table keys (vendor_slug, invoice_number).**
- **A fix isn't fixed until verified through the LIVE call path.**
- Vendor data = official API docs FIRST; verify vs LIVE DB, not migration files.
- Zero external sends (v1); prod first-tries gated (sandbox → subset → fan-out).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.
- **All app/code/Linear-issue Slack traffic → `#pe-cc-dev-team`** (Chris 2026-08-07; incl. future fix-approval gates).

## Playbooks (docs/42 + PEC-184)
1. UOM: compare in pricing UOM `price_per_uom` via `v_item_uom_map` (docs/46). 2. PostgREST truncation: "exactly 1000"=cap→paginate; chunk `.in()`; partition upserts. 3. Structured source before OCR; vision extraction must tie to printed totals server-side. 4. ABC mapping drift → COALESCE from `raw`. 5. Worktree agents: stage ONLY your files; verify merge-base. 6. AccuLynx watermark PK `(account_key,resource_type)` (mig 171). 7. Rotating OAuth tokens: persist successor on rotation; diagnose via fingerprints (`op read | shasum`), never values. 8. After host rebuilds ALL stored ids go stale (Coolify uuid, ORGO_*_ID) — re-verify, never trust.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Edge Functions via `supabase functions deploy`. Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **223**. Hosts: AGENT=`PE-US-AGENTS` `178.156.203.23` (`~/.ssh/hetzner_office`); dev=`PE.CC.DEV` `178.105.220.14`. Dev server port **4399**. 1P (op, CW_Master): **`QBO - PROD TOKENS`**, **`coolify.proexteriorsus.net - Root API`**. Linear: PE-CC-DevTeam.
