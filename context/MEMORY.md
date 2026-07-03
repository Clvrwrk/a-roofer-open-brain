<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**AccuLynx v1.0: 7/7 COMPLETE; dashboard iterated 3 live rounds (MTD-default windows + AR exception, rep rules, aligned bars, "Pipeline Review" nav) — live 310b984+; fleet 6,451/6,451 rows, 99.1% reps; webhooks 8/8; sync v45.** **OPEN: (a) gh token EXPIRED — human: `gh auth login -h github.com` (GitHub MCP push_files fallback works meanwhile); (b) confirm interpretation: open stages window by OWN stage dates; (c) `/gsd-complete-milestone` when ready.** Deferred: Phase 5 prod payment; ob-acculynx Slack provisioning (Slack project).

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Production first-tries gated: prove in sandbox, then a small account subset, then full fan-out (human-approved scope step each widening).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST silent truncation (docs/42 pb 3+9-11): "exactly 1000"=cap→paginate `.range()`; big `.in()`→URL 400→scope/chunk; bulk-upsert column-UNION nulls omitted keys→partition. 4. **Structured source before OCR** — check vendor API/`raw` first. 5. Credit-memo LINES in `v_invoice_lines_complete` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`. 7. **Concurrent/worktree agents:** `git status` before commit; stage ONLY your files (never `-A`); worktree isolation can fork a STALE base → verify merge-base. 8. **AccuLynx watermark:** live col is `resource_type`; PK must be composite `(account_key,resource_type)` (mig 171) else 2nd account's watermark silently fails.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys CC app; Edge Functions deploy direct via `supabase functions deploy` (NOT Coolify). Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **185**. **Two hosts:** Coolify/CC `5.78.124.10` (`hetzner_office`); AGENT/Hermes `5.78.146.161`.
