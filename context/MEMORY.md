<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**ACTIVE: AccuLynx commercialization** (`.planning/`, 7 phases, GSD). **Phase 2 PARTIAL** (`f4ce1f1`): acculynx-sync v19 + migs 168-171 live; serial multi-account fan-out PROVEN on prod, zero cross-account bleed; KC+Wichita jobs(166/1284)+contacts ingesting; reconciliation view computes. SC1~met, SC2-4 partial (backfill is cron-paced). Edge secrets: sandbox+KC+Wichita only. **NEXT: /gsd-plan-phase 3** (Cron Hardening) — owns P2 carry-forward: finish backfill, jobs `last_api_count=1` bug, 8 legacy NULL rows, 6-acct expansion, pg_net reconcile. Also: Hermes scheduler.

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Production first-tries gated: prove in sandbox, then a small account subset, then full fan-out (human-approved scope step each widening).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. **Structured source before OCR** — check vendor API/`raw` first. 5. Credit-memo LINES in `v_invoice_lines_complete` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`. 7. **Concurrent/worktree agents:** `git status` before commit; stage ONLY your files (never `-A`); CC worktree isolation can fork a STALE base → verify merge-base; file-level checkout if base mismatch. 8. **AccuLynx watermark:** live col is `resource_type`; PK must be composite `(account_key,resource_type)` (mig 171) else 2nd account's watermark silently fails.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys CC app; Edge Functions deploy direct via `supabase functions deploy` (NOT Coolify). Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **171**. **Two hosts:** Coolify/CC `5.78.124.10` (`hetzner_office`); AGENT/Hermes `5.78.146.161` (`a_roofers_open_brain_ed25519`).
