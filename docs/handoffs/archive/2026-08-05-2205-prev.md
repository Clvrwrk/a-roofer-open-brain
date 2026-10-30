# Project Handoff — JT Sync Sentinel (a-roofers-open-brain)
**Project:** JobTread ⇄ Supabase 24/7 alignment agent (JT Sync Sentinel) + MCP fleet health
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (branch `main`)
**Production URL:** https://cc.proexteriorsus.net · JobTread org Pro Exteriors `22PazeRM5FCH` · Supabase `rnhmvcpsvtqjlffpsayu`
**Date:** 2026-08-05 07:26
**Agent:** Claude Code (Fable 5)
**Reason:** User-requested full handoff + wrapup + Linear documentation

> Prior handoff (QXO+SRS vendors / host rebuild, 2026-08-04) archived at `docs/handoffs/archive/2026-08-05-0726.md`.

---

## Accomplished This Session

### 1. JobTread connection fully mapped
- The `integrations/bridges/jobtread/` tree = a **one-time AccuLynx→JobTread outbound migration** (2026-07-28, 34,433 writes, 0 failed) via the Pave API — NOT a sync. Supabase is SoT; JT is the agent action plane (r4 scorecard 28/40 vs 20/40).
- **Convex is unrelated to JobTread**: it backs the external Decision Cockpit (`~/Projects/PE-CC-Executive`, project `cockpit-proexteriors`, chandler.proexteriorsus.net) mirroring QBO only. Convex stays `defer` for the brain (docs/70 §11.4).
- JT objects have **no `updatedAt`** → delta polling impossible; fingerprint sweeps + webhooks are the only alignment mechanisms.

### 2. JT Sync Sentinel built, deployed, first run green (A3 approved; docs/80)
- Schema 196 applied to prod: `jt_mirror.{sync_runs, sync_watermarks, conflict_review, webhook_events, daily_logs}` + `content_hash`/`first_seen_at` on all echo tables.
- `integrations/bridges/jobtread/sync-sentinel/`: `pave-client.mjs` (≤4 req/s), `sentinel.mjs` (sweep + drift + gated outbound staging + Slack), `executor.mjs` (**the B3 driver finally committed** — plays `status='approved'` pending_write rows only), `supabase-sql.mjs` (Mgmt-API throttle/backoff).
- First full run (run 3, OK): 7,899 accounts / 6,561 locations / 6,575 jobs / 213 docs / 6,467 daily logs / 4,887 cost items baselined. Findings: **48 AccuLynx jobs missing from JT** (`sot_only` queue), 12 JT-born cost codes, JT sample records flagged `jt_only`.
- Live-run bug fixes: Supabase Mgmt API 429 (1.2s throttle + backoff + 250-row flushes), Pave 413 (jobs page size 25), stale-run cleanup.
- **Timer live on US host `178.156.203.23`**: `openbrain-jt-sentinel.timer`, daily **10:00 America/Los_Angeles** (next fire 17:00 UTC today).
- Deploy verified: `main` pushed (`b4aff9a`), Coolify `buildCommit` flipped.

### 3. Conflict policy (APPROVED by Chris)
Operational fields (milestones, daily logs, documents, tasks) flow **JT → Supabase**; identity/catalog/pricing flow **Supabase → JT** via human-gated `pending_write`; disagreements land in `jt_mirror.conflict_review`, never auto-overwritten.

### 4. JT webhook/workflow review (docs/80)
Pave `createWebhook` is self-serve, 43 event types, **zero registered today**, no signing secret → Phase 2 receiver = secret-in-URL + re-read-from-Pave into `jt_mirror.webhook_events`. Native JT Workflows are API-visible (`workflows`, `workflowRuns`); Zapier rejected. Bonus: JT grant keys expire after ~3 months of inactivity — the daily sentinel keeps the key alive.

### 5. MCP fleet test (36 servers)
31 pass. Fixed: **Excalidraw** (started canvas server on :3000 — non-persistent). Diagnosed 4 credential failures (site-copy-writer exa/tavily/firecrawl + local dataforseo): they expand `${EXA_API_KEY}`-style vars absent from the app launch env; **all values already in master.env** (`DATAFORSEO_LOGIN` needs mapping to `DATAFORSEO_USERNAME`). Classifier blocked agent-side secret copy — Chris has the one-command fix (writes them into `~/.claude/settings.json` `env`); takes effect next session. Bindings discovered: Slack MCP = **HWAOS workspace** (not pe-command-center); Notion MCP = **ZEA Main** workspace.

## Git State
- **Branch:** `main` == `origin/main` after this wrap-up's push
- **Key commits:** `908ced9` sentinel feat · `6f45bb7` v1.2 fixes · `b4aff9a` merge (deployed) · wrap-up commit (analytics stragglers + handoff + daily log)
- Contrib branch `contrib/cleverwork/jt-sync-sentinel` merged + pushed.

## Task Cut Off
None — clean boundary.

## Next Task — Start Here

**Task:** JT key rotation + sentinel verification (PEC-144), then Phase 2.
1. **Chris (human):** rotate the `SUPABASE_MIRROR` grant key (JT Settings → Integrations → API → Grants) → update `JT_SUPABASE_MIRROR_GRANT_KEY` in `~/.config/cleverwork/master.env` (mac-mini) **and** `/opt/openbrain/a-roofers-open-brain/.env` (US host). Until then the 10:00 PT timer fails with an explicit missing-key log, then self-heals.
2. Verify: `ssh -i ~/.ssh/a_roofers_open_brain_ed25519 root@178.156.203.23 'bash /opt/openbrain/a-roofers-open-brain/scripts/jt-sync-sentinel.sh smoke'` then `select * from jt_mirror.sync_runs order by id desc limit 3;`
3. Review drift: `select * from jt_mirror.conflict_review where status='open';` — decide on the 48 unmirrored AccuLynx jobs (approve Phase 3 staging or dismiss).
4. Then: PEC-145 webhook receiver (Command Center route → `jt_mirror.webhook_events`).

**Prompt to use:** "Read docs/handoffs/current.md. Verify the JT grant key was rotated and the sentinel timer ran green, then start PEC-145 (webhook receiver)."

## Decisions Made This Session
- Conflict policy per above (approved).
- Sentinel cron runs **without** `--stage-outbound` until the first conflict-queue review.
- Webhooks (Phase 2) over polling; Zapier rejected; JT native Workflows = ops-only, not sync.
- 1Password unnecessary for MCP fixes — keys were already in master.env; classifier-blocked secret copying stays a human action.

## Blockers Requiring Human Action
1. **Rotate JT grant key + add to US host** (PEC-144) — sentinel timer waits on it.
2. **Run the settings-env command** (in session transcript) + restart to activate the 4 fixed MCP servers; Linear MCP also activates next session (OAuth done).
3. Optional: install Xcode for the iOS simulator MCP; make Excalidraw canvas persistent.

## Verification Commands
1. `systemctl list-timers openbrain-jt-sentinel.timer` on 178.156.203.23 — next fire 10:00 PT.
2. `select id,status,entities,drift from jt_mirror.sync_runs order by id desc limit 3;` — run 3 = ok with full entity stats.
3. `python3 integrations/bridges/jobtread/mirror/checks/r3b_exec_check.py` — still PASS (migration intact).
4. `curl -s https://cc.proexteriorsus.net/healthz | jq -r .buildCommit` — `b4aff9a…` or later.

## Linear Accounting
- **Project:** [SESSION 2026-08-04 · QXO+SRS vendors, host rebuild, price inheritance](https://linear.app/cleverwork/project/session-2026-08-04-qxosrs-vendors-host-rebuild-price-inheritance-95be5c5e76e0) — continued per Chris, new milestone added.
- **Milestone:** JT Sync Sentinel (JobTread ⇄ Supabase alignment)
- **Done:** PEC-142 (build + first run) · PEC-143 (US-host timer deploy)
- **Todo:** PEC-144 (key rotation, human) · PEC-145 (Phase 2 webhooks) · PEC-146 (Phase 3 outbound compiler)
- Access note: Linear MCP unauthenticated in this session; all Linear writes went through the `LINEAR_API_KEY` GraphQL fallback (per 2026-08-04 precedent).

## Service / deployment map (unchanged from 2026-08-04 except:)
| Service | Detail |
|---------|--------|
| JT Sync Sentinel | `openbrain-jt-sentinel.timer` on US host `178.156.203.23`, 10:00 America/Los_Angeles daily |
| JobTread | org `22PazeRM5FCH`, grant `SUPABASE_MIRROR` (`JT_SUPABASE_MIRROR_GRANT_KEY`), Pave API |
| Supabase | `rnhmvcpsvtqjlffpsayu` — schemas through **196** |
