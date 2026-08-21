<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/21: PEC-226 (Urgent)** — vendor price path matches on **EXACT** item-no/desc equality; no trigram arm (ABC has 0.45). SRS quotes carry item numbers → work; the 2 **price sheets are desc-only → ZERO matches** (Melissa L4 inert since 2/16: 97 prices, 0 hits). Live SRS **216 unpriced / $63,642.53**; **Richardson 0-for-28**. Decide: backfill `raw_item_number` (rec., needs review — colour variants share a desc) **or** vendor trigram arm (cheap, weakens claims). 9 Colorado `$0.00` items need Blake Wells prices.
**Open:** Orgo QA desktop `PE Site QA` 3480fa38 (proj `PE-open-brain`); run `node scripts/qa-agent-auth.mjs login`. WorkOS IDs in 1P stale; live `client_01KTF450…`.

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
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Supabase `rnhmvcpsvtqjlffpsayu`, schemas thru **255**. Dev port **4399**. Hetzner AGENT `178.156.203.23` (`~/.ssh/hetzner_office`). Linear PE-CC-DevTeam. **Full service map + Orgo/WorkOS ids: `docs/handoffs/current.md`.**
