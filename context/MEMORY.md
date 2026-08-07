<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/6-7 marathon (PEC-183/184/185, docs/86-87):** office silo mig 217 ($3,212 bad claims retracted); QBO sync restored + token-rotation persistence; payment memos → 133 paid_verified (docs/86); CM receipt reconcile (mig 220); SRS live in audit ($2,879.55 at risk, migs 221-222); money tables re-keyed (vendor_slug, invoice_number) mig 223; **nightly `silo_assertions()` = 0**. NEXT: PEC-185 deferred hardening. Handoff: docs/handoffs/current.md.

## Standing instructions (Chris)
- **Silo doctrine: price agreement = (vendor, PE office). No pricing join crosses either; unknown office ⇒ No-Price; fail closed. Every money table keys (vendor_slug, invoice_number).**
- **A fix isn't fixed until verified through the LIVE call path** (mig-222 landed in dead code; PEC-184 #1).
- Vendor data = official API docs FIRST; verify vs LIVE DB, not migration files.
- Zero external sends (v1); prod first-tries gated (sandbox → subset → fan-out).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.

## Playbooks (docs/42 + PEC-184)
1. UOM: compare in pricing UOM `price_per_uom` via `v_item_uom_map` (docs/46). 2. PostgREST truncation: "exactly 1000"=cap→paginate; chunk `.in()`; partition upserts. 3. Structured source before OCR; vision extraction must tie to printed totals server-side. 4. ABC mapping drift → COALESCE from `raw`. 5. Worktree agents: stage ONLY your files; verify merge-base. 6. AccuLynx watermark PK `(account_key,resource_type)` (mig 171). 7. Rotating OAuth tokens: persist successor on rotation; diagnose via fingerprints (`op read | shasum`), never values. 8. After host rebuilds, grep repo for stale uuid/IP (Coolify app uuid is now `lu5txzhyoza7uuz0scwpobv7`).

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Edge Functions via `supabase functions deploy`. Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **223**. Hosts: AGENT=`PE-US-AGENTS` `178.156.203.23` (`~/.ssh/hetzner_office`); dev=`PE.CC.DEV` `178.105.220.14`. Dev server port **4399**. 1P (op, CW_Master): **`QBO - PROD TOKENS`**, **`coolify.proexteriorsus.net - Root API`**. Linear: PE-CC-DevTeam.
