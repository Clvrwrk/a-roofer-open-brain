<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**7/7: Exec pipeline `/executive/pipeline` overhauled LIVE `3c58de4`** (log 7/7): 969 dup csv_initial rows removed; windowing on `acculynx_job_milestone_history` (updated_at retired); **"Sold"=CLOSE DATE**; users sync per-account (42→400); AccuLynx links→`my.acculynx.com/jobs/{id}`; trailing-7 & Monies-Collected history-only.
**7/6 invoice (docs/67) scheduler on Hetzner; Cowork abc-nightly-sync DISABLED; 295 lead-stage csv dups removed. OPEN (Chris): 3b automate daily disposition pass=DECISION (system-actor rec); 3c widen ticks→7 agents (Hetzner host, staged).**

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Production first-tries gated: prove in sandbox, then a small account subset, then full fan-out (human-approved scope step each widening).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST silent truncation (docs/42 pb 3+9-11): "exactly 1000"=cap→paginate `.range()`; big `.in()`→URL 400→scope/chunk; bulk-upsert column-UNION nulls omitted keys→partition. 4. **Structured source before OCR** — check vendor API/`raw` first. 5. Credit-memo LINES in `v_invoice_lines_complete` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`. 7. **Concurrent/worktree agents:** `git status` before commit; stage ONLY your files (never `-A`); worktree isolation can fork a STALE base → verify merge-base. 8. **AccuLynx watermark:** live col is `resource_type`; PK must be composite `(account_key,resource_type)` (mig 171) else 2nd account's watermark silently fails.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys CC app; Edge Functions deploy direct via `supabase functions deploy` (NOT Coolify). Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **215**. **Hosts (2026-08-06):** AGENT=`PE-US-AGENTS` `178.156.203.23` (root, `~/.ssh/hetzner_office`; old 5.78.146.161 dead); dev=`PE.CC.DEV` `178.105.220.14`. Creds in 1Password (`op` CLI, CW_Master).
