<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/19 eve:** Orgo **QA desktop** `PE Site QA` 3480fa38/inst `dac62bd2` in proj **`PE-open-brain`**; deps `/home/orgo/pe-qa`. **QA agent** `site-qa@agentmail.proexteriorsus.net` + WorkOS user 01M0EAPF; Magic-Auth code lands in AgentMail, API-readable → passwordless. **NEXT: `node scripts/qa-agent-auth.mjs login`** (classifier blocks me), then WorkOS sign-in on desktop, then run walker. **I was WRONG twice** (Maya healthy; walker called gated pages 200-OK) — both from one bad read: `/api/workspaces` returns 0 while projects exist. **All 3 WorkOS client IDs in 1P are stale** — live `client_01KTF450…`. AgentMail can't serve `cc.*`. **Parallel session commits here.**


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
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Supabase `rnhmvcpsvtqjlffpsayu`, schemas thru **232**. Dev port **4399**. Hetzner AGENT `178.156.203.23` (`~/.ssh/hetzner_office`). Linear PE-CC-DevTeam. **Full service map + Orgo/WorkOS ids: `docs/handoffs/current.md`.**
