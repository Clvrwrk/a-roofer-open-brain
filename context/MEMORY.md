<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**ACTIVE: AccuLynx commercialization** (`.planning/`, 7 phases, GSD). **Phases 1–4 COMPLETE.** P4 (write red-team, REQ-06): migs **182/183** live; **`acculynx-write-sweep`** Edge fn deployed (hard sandbox gate; NOT Coolify); 38/38 write endpoints verdicted from live sandbox = 12 writable/5 write-only/2 fragile/2 read-shaped/17 blocked-by-dep/0 unsupported; matrix regenerated (docs/37 + write-capability.md); SECURED 10/10. Quirk: **jobCategory.id is Int32** (not GUID) else job POST 404s+cascades. **NEXT: /gsd-plan-phase 5** (Read/Write Action Layer, REQ-08) — human-gated write wrappers on the write matrix. Also open: Hermes scheduler.

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
