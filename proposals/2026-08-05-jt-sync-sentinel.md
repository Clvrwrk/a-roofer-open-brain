# A3: JT Sync Sentinel — 24/7 JobTread ⇄ Supabase alignment

Proposed by: Chris
Date: 2026-08-05
Status: approved (verbal approval in session, 2026-08-05; this A3 records it)
Affected clients: pro-exteriors (template-wide pattern once proven)
A3 file: proposals/2026-08-05-jt-sync-sentinel.md

---

## 1. The problem (measured)

- **Task being performed today:** nothing — and that is the problem. The 2026-07-28 AccuLynx→JobTread migration (34,433 writes, 0 failed) produced a frozen snapshot. No process keeps JobTread and the Supabase SOT aligned afterward.
- **Frequency of drift:** continuous. Eight days after the migration, the first sentinel dry-run already found **48 new AccuLynx jobs absent from JobTread**, **12 cost codes born in JobTread with no SOT record**, and 7 jobs whose AccuLynx milestone changed after staging (`v_recon_jobs_by_milestone`).
- **Time per occurrence:** a manual re-reconciliation of the mirror is a multi-hour Ringer-swarm-scale effort (the original run consumed a full session across 9 rounds).
- **Error rate:** without sync, 100% of post-7/28 operational activity is invisible to whichever system didn't originate it.
- **Cost of error:** agents act on the JobTread "action plane" (scorecard verdict, r4) against stale data; humans quote/schedule from a SOT that no longer matches field reality. A single missed job ≈ hours of duplicated intake; a stale milestone breaks any automation keyed on job stage.
- **Total monthly human cost:** conservatively 4–8 h/month of manual reconciliation to keep the mirror usable at all, plus unquantified error exposure on every agent action against stale mirror data.

## 2. Root cause (5 Whys)

1. Why does drift accumulate? — The migration was scoped as a one-time backfill; incremental sync was explicitly deferred ("optional next step," handoff 2026-07-28).
2. Why was it deferred? — The evaluation goal (agent-friendliness scorecard) was met without it.
3. Why can't existing tools cover it? — JobTread objects expose no `updatedAt` (only `createdAt`/`lineItemsUpdatedAt`), so no simple "changed since" poll exists; AccuLynx and JT know nothing of each other.
4. Why hasn't it been a priority? — The JT org wasn't yet the action plane; it is now (r4 verdict 28/40 vs 20/40).
5. Why now? — Drift is measurable and growing (48 jobs in 8 days), and agent workflows are about to write against JobTread.

## 3. Proposed solution

- **Which agent receives this skill:** ops (Conductor-adjacent infrastructure; reports to `#ob-agents-internal`).
- **What it does:** A daily scheduled sentinel (10:00 America/Los_Angeles, US agent host `178.156.203.23`) that (1) sweeps every JobTread entity via the Pave API, sha256-fingerprints each node, and upserts changes into the `jt_mirror` echo tables; (2) detects drift three ways — JT-native records with no crosswalk, SOT records never mirrored, milestone drift via the r4 recon views — writing field-level disagreements to `jt_mirror.conflict_review`; (3) optionally stages outbound work into the existing `jt_mirror.pending_write` queue (status `staged`, human-approved before `executor.mjs` plays it); (4) writes a `jt_mirror.sync_runs` ledger row and posts a summary to Slack.
- **Primitive it builds on:** the r2 `jt_mirror` pipeline (crosswalk / pending_write / write_action_log, schema.sql) and the B3 executor algorithm (`manifests/b3-execute.json`), now committed as reusable code (`sync-sentinel/executor.mjs`) instead of a lost `/tmp` script.
- **Integration required:** JobTread Pave API (existing `SUPABASE_MIRROR` grant; **key rotation scheduled post-build** — it surfaced in a 7/28 transcript). Phase 2 adds a JT webhook receiver (43 event types, `createWebhook` self-serve; zero registered today).
- **Trust tier of output:** evidence (mirror rows + drift findings). Nothing is promoted to instruction; nothing external is sent.

**Conflict policy (approved 2026-08-05):** operational fields (milestones, daily logs, documents, tasks) flow JobTread → Supabase; identity/catalog/pricing flow Supabase → JobTread through the human-gated queue; disagreements land in `conflict_review` and are never auto-overwritten.

## 4. The new state (projected)

- **Time per occurrence post-skill:** 0 human minutes on alignment; ~5 min/week reviewing the conflict queue and approving staged outbound rows.
- **Error rate post-skill:** drift detected within 24 h, structurally; near-real-time once Phase 2 webhooks land.
- **Cost of agent operation per occurrence:** ~$0 tokens (deterministic script); ~300 Pave requests/day at ≤4 req/s; negligible Supabase load.
- **Required human review:** Yes — approving `pending_write` rows before execution (the gate that keeps JobTread writes auditable) and dispositioning `conflict_review` items.

## 5. The math

Human cost avoided ≥ 4 h/month reconciliation + error exposure on every stale-data agent action, vs. ~zero marginal run cost on the existing host. ROI is effectively the entire value of the JT action plane remaining trustworthy — the 10x gate is met by inspection; without sync the 34,433-write investment decays to unusable.

## 6. Rollout

1. **Phase 1 (this session):** schema 196; sentinel + executor committed; first real run; systemd timer on US host. Outbound staging behind `--stage-outbound` (off in cron until first conflict-queue review).
2. **Phase 2:** register JT webhooks (secret-in-URL + re-read-on-receipt pattern) into a Command Center receiver route writing `jt_mirror.webhook_events`; sentinel drains the queue — sub-minute inbound freshness.
3. **Phase 3:** outbound payload compiler (createJob/createDailyLog family) so approved SOT deltas flow to JT without a manual compile step; auto-approve whitelist decided only after ≥2 weeks of clean conflict-queue history.
4. **Prerequisite before Phase 2:** rotate the `SUPABASE_MIRROR` grant key (human, JT Settings → Integrations → API → Grants) and update `JT_SUPABASE_MIRROR_GRANT_KEY` in master.env.

## 7. Rollback

Disable the systemd timer; the sentinel is read-only against JobTread, so rollback is inert. Staged rows can be bulk-`skipped`. All schema is additive (rule 1) and stays.
