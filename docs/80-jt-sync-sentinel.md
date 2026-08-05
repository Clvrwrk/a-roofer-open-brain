# 80 — JT Sync Sentinel: 24/7 JobTread ⇄ Supabase alignment

**Status:** built + first run 2026-08-05 · **A3:** [`proposals/2026-08-05-jt-sync-sentinel.md`](../proposals/2026-08-05-jt-sync-sentinel.md) (approved)
**Predecessor:** the 2026-07-28 AccuLynx→JobTread migration ([handoff](handoffs/archive/2026-07-30-0006.md), `integrations/bridges/jobtread/mirror/`)
**Schema:** `schemas/cleverwork-roofer/196-jt-sync-sentinel.sql` (applied 2026-08-05)

```
        10:00 America/Los_Angeles daily (US agent host 178.156.203.23)
                                │
                 scripts/jt-sync-sentinel.sh
                                │
        sync-sentinel/sentinel.mjs  (READ-ONLY vs JobTread)
        ┌───────────────┬────────────────┬─────────────────┐
        │ 1 inbound     │ 2 drift        │ 3 outbound      │
        │ sweep JT →    │ jt_only /      │ stage SOT deltas│
        │ jt_mirror.*   │ sot_only /     │ → pending_write │
        │ (fingerprint- │ milestone      │ (staged, human  │
        │  gated upsert)│ → conflict_    │  approves)      │
        │               │   review       │                 │
        └───────────────┴────────────────┴─────────────────┘
                                │
              jt_mirror.sync_runs + Slack #ob-agents-internal
                                │
        sync-sentinel/executor.mjs plays status='approved' rows only
        (committed port of the B3 driver — closed-job dance, $ref
         resolution, ≤4 req/s, checkpoint-per-write, 10-failure halt)
```

## Why this shape

JobTread objects expose **no `updatedAt`** (only `createdAt`; jobs add `lineItemsUpdatedAt`), so "changed since X" polling is impossible — change detection is sha256 fingerprints over full sweeps, with webhooks as the future fast path. Supabase is the SOT (decision 2026-07-28); JobTread is the agent action plane (r4 scorecard 28/40 vs AccuLynx 20/40).

## Conflict policy (approved 2026-08-05)

| Data class | Owner / direction | Mechanism |
|---|---|---|
| Operational: milestones, daily logs, documents, tasks | JobTread → Supabase | sentinel sweep upserts echo tables |
| Identity, catalog, pricing | Supabase → JobTread | `pending_write` staged → human approves → executor |
| Disagreements | neither auto-wins | `jt_mirror.conflict_review` queue (`jt_only` / `sot_only` / `conflict`) |

## Components

| Path | Role |
|---|---|
| `integrations/bridges/jobtread/sync-sentinel/pave-client.mjs` | Rate-limited Pave client (grant key via `JT_SUPABASE_MIRROR_GRANT_KEY`), org-connection pager, webhook/workflow listers |
| `integrations/bridges/jobtread/sync-sentinel/sentinel.mjs` | Daily sweep + drift + optional `--stage-outbound` + run ledger + Slack |
| `integrations/bridges/jobtread/sync-sentinel/executor.mjs` | Plays **approved** `pending_write` rows; the B3 algorithm, finally committed |
| `scripts/jt-sync-sentinel.sh` | Host wrapper (master.env + repo .env, logs to `~/.jt-sentinel/logs/`) |
| `deployment/remote/systemd/openbrain-jt-sentinel.{service,timer}` | Daily 10:00 America/Los_Angeles on the US host |

New tables (all `jt_mirror`, schema 196): `sync_runs`, `sync_watermarks`, `conflict_review`, `webhook_events` (Phase 2 landing zone), `daily_logs` echo; `content_hash`/`first_seen_at` added to every echo table; `jobs.custom_field_values` + `jobs.closed_on` for milestone drift.

## Runbook

```bash
# Smoke (auth + webhook inventory)
bash scripts/jt-sync-sentinel.sh smoke

# Manual daily run
bash scripts/jt-sync-sentinel.sh

# Review drift
# select * from jt_mirror.conflict_review where status='open' order by detected_at desc;
# select * from jt_mirror.sync_runs order by id desc limit 5;

# Approve outbound work, then execute
# update jt_mirror.pending_write set status='approved', approved_by='<you>', approved_at=now() where id in (...);
node integrations/bridges/jobtread/sync-sentinel/executor.mjs --dry-run
node integrations/bridges/jobtread/sync-sentinel/executor.mjs
```

Timer install (US host, as root):

```bash
cp /opt/openbrain/a-roofers-open-brain/deployment/remote/systemd/openbrain-jt-sentinel.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now openbrain-jt-sentinel.timer
systemctl list-timers openbrain-jt-sentinel.timer --no-pager
```

## JobTread webhook & workflow options (reviewed 2026-08-05)

**API webhooks (chosen for Phase 2).** Fully self-serve via Pave: `createWebhook {organizationId, url, eventTypes[≤43]}`, `updateWebhook`, `deleteWebhook`; org-level `webhooks` connection lists them (with a per-hook `error` field). **Zero webhooks are registered today.** The 43 event types cover created/updated/deleted for: account, contact, comment, dailyLog, document (+documentSent, documentPayment, documentRecipient), file, formSubmission, job, location, payment, task, timeEntry. The webhook object carries **no signing secret**, so the receiver pattern is: unguessable secret in the URL path + treat payloads as untrusted hints — on receipt, **re-read the entity from Pave** and process through the same upsert path as the sweep. Receiver target: a Command Center route writing `jt_mirror.webhook_events` (table already created).

**Native JT Workflows (in-app automation, Sept 2025 feature).** Trigger on job/stage/field changes with filters, branching, unlimited actions; the API exposes `workflows`, `workflowRuns`, and runtime-queryable `workflowTriggerTypes`/`workflowActionTypes` on the organization. Right tool for *in-JobTread* ops automation (notify PM on stage change, spawn task templates); not a sync backbone — it can't write to Supabase. The sentinel lists registered workflows (`listWorkflows`) for visibility so in-app automation never surprises the mirror.

**Zapier.** Official JobTread Zapier app exists (triggers + actions). Redundant for us — Pave + webhooks are strictly more capable and stay inside the guardrails. Not adopted.

Sources: Pave introspection (`mirror/pave-schema.json`, no-auth `{"query":{"schema":{}}}`), [JobTread workflows feature page](https://www.jobtread.com/features/workflows), [workflow automations release note](https://www.jobtread.com/product-updates/2025-09-22-workflow-automations), [Open API page](https://www.jobtread.com/integrations/open-api), [Zapier integration listing](https://zapier.com/apps/jobtread/integrations).

## Security notes

- The `SUPABASE_MIRROR` grant key surfaced in a 2026-07-28 terminal transcript. **Rotation is scheduled immediately after this build** (JT Settings → Integrations → API → Grants → regenerate; update `JT_SUPABASE_MIRROR_GRANT_KEY` in `~/.config/cleverwork/master.env` on the mac-mini and the US host).
- Sentinel is read-only against JobTread; the only JT-write path remains `pending_write` → human approval → executor (seat rule, no deletes, `notify` never true — all inherited from B3).
- Convex (`cockpit-proexteriors`, Decision Cockpit) is **not** part of this pipeline: it mirrors QBO only; Supabase remains the single SOT for JobTread alignment (docs/70 §11.4 defer stands).
