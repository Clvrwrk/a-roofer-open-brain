<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**ACTIVE: AccuLynx commercialization** (`.planning/`, 7 phases, GSD). **Phases 1–4 COMPLETE; Phase 5 (Read/Write Action Layer, REQ-08) IN PROGRESS — Waves 1–2 done, Wave 3 gated.** Branch **`contrib/cleverwork/read-write-action-layer`** (pushed; NOT merged — main auto-deploys via Coolify): built `acculynx-write-action` Edge fn (dryRun==execute, D-09 assertTarget, idempotency), applied migs **184/185** (pending-write + audit log), wired the Command Center (enqueue, dashboard surface RQ-1, decision.ts barrier#2 + edge invoke on approve, Slack notify). **NEXT: `/gsd-execute-phase 5 --wave 3`** — deploy → sandbox-prove 3 lanes → set PROD_WRITE_APPROVER_EMAILS → FIRST live PROD payment (blocking-human) → converge→main.

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
- Zero external sends (v1): agents draft; humans send.
- Production first-tries gated: prove in sandbox, then a small account subset, then full fan-out (human-approved scope step each widening).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM `price_per_uom`; align via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. **Structured source before OCR** — check vendor API/`raw` first. 5. Credit-memo LINES in `v_invoice_lines_complete` (mig 157). 6. **PE ABC naming:** Job `orderName`=`{OFFICE}-{num}: {Client}`; PO `{OFFICE}-{num}-{seq}`. 7. **Concurrent/worktree agents:** `git status` before commit; stage ONLY your files (never `-A`); worktree isolation can fork a STALE base → verify merge-base. 8. **AccuLynx watermark:** live col is `resource_type`; PK must be composite `(account_key,resource_type)` (mig 171) else 2nd account's watermark silently fails.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; HEAD via `/healthz`). `git push origin HEAD:main` deploys CC app; Edge Functions deploy direct via `supabase functions deploy` (NOT Coolify). Supabase `rnhmvcpsvtqjlffpsayu`; schemas thru **185**. **Two hosts:** Coolify/CC `5.78.124.10` (`hetzner_office`); AGENT/Hermes `5.78.146.161`.
