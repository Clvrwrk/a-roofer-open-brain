---
type: Pipeline
title: AccuLynx Sync Pipeline
description: The live pull-based incremental sync — pg_cron → pg_net → acculynx-sync Edge Function.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/functions
tags: [acculynx, ingestion, pg_cron, edge-function, watermark]
timestamp: 2026-07-01T00:00:00Z
---

The integration of record is **NOT** the repo's `integrations/bridges/acculynx`
webhook stub — it is a live Supabase Edge Function. Plan against this.

# Architecture

```
pg_cron (hourly, 0 * * * *)
  → trigger_acculynx_sync('{"multiAccount":true}')   -- SQL fn, fans out over acculynx_accounts
    → pg_net  (async HTTP POST)  ── dispatch logged to acculynx_cron_dispatch
      → acculynx-sync  (Deno Edge Function, v19)
        → AccuLynx API V2  (GET, incremental by ModifiedDate; per-account key from Deno.env)
        → upsert acculynx_jobs + crm_pipeline (+ contacts/estimates/… per resource)
        → advance acculynx_sync_watermark  (composite PK: account_key, resource_type)

pg_cron (*/10)  → reconcile_acculynx_cron_outcomes()  -- copies pg_net results into the owned table
pg_cron (*/15)  → check_acculynx_alerts()             -- fires Slack/Sentry on failure/staleness
```

# How it paces (rate-limit safety)

- Incremental: `dateFilterType=ModifiedDate`, `startDate = watermark.last_modified_date`,
  `sortBy=ModifiedDate Ascending`. Today's run pulled only the modified delta.
- Small pages: `pageSize=25` (jobs, `pageStartIndex`), `50` (users).
- HTTP 429 → retry with `Retry-After` + exponential backoff (3 retries).
- 120s runtime budget; the watermark advances **per page**, so a crash resumes cleanly.
- Every raw response is archived to `acculynx_raw`.

See [Auth & Rate Limits](../api/auth-and-limits.md) for the 30/10 req/s limits.

# Where it lands

[`acculynx_jobs`](../data/jobs.md) (flat mirror, `id` = AccuLynx GUID = permanent key)
and `crm_pipeline` (normalized: milestone, market, `data_source='api_sync'`). See
[Brain Tables](../data/tables.md).

# Resolved in Phase 3 (2026-07-01)

- **Hourly, multi-account.** The daily 08:15 single-key run was cut over to an
  hourly `0 * * * *` run that fans out over the `acculynx_accounts` registry
  (`multiAccount:true`) — see [Account Registry](../accounts.md). Each account's
  key is resolved at runtime from `Deno.env` (name only), never shared module-level.
- **Cron observability fixed (no more perpetual `pending`).** Every dispatch is
  logged to the owned `acculynx_cron_dispatch` table; `reconcile_acculynx_cron_outcomes()`
  (`*/10`) copies each pg_net response out of the transient `net._http_response`
  (6h TTL) well inside the window, so `v_acculynx_cron_outcomes` reflects real
  `success`/`failure` instead of stuck `pending`.
- **Alerting.** `check_acculynx_alerts()` (`*/15`) posts to Slack (#ob-ops-conductor)
  and Sentry on failed dispatch, stale watermark, over-tolerance reconciliation
  delta, or unreconciled pg_net — secret-safe (redaction guard; names only).
- **Deny-by-default + trust invariants.** RLS revokes `anon`/`authenticated` on all
  `acculynx_*` tables (service_role only); `account_key NOT NULL` + `trust_tier`
  default `evidence` on the ingested tables; `acculynx_raw` is immutable. Rot-guard
  views monitor duplicates/orphans/null-provenance/stale-tail.

Recovery procedures for each of these live in the
[Recovery Runbook](runbook.md).

# Still open (later phases)

- **Resource breadth.** Not every resource watermark is fed for every account yet;
  full backfill to tolerance is cron-paced (carry-forward from Phase 2).
- **Agent-side untrusted-content enforcement.** Free-text is *labeled* untrusted
  (evidence tier) now; the read-time agent that must honor "data never
  instructions" is REQ-09 (its own phase).

# Citations

[1] Edge Function `acculynx-sync` (v19), Supabase project `rnhmvcpsvtqjlffpsayu`
[2] [Account Registry](../accounts.md)
[3] [Read-Capability Sweep](read-sweep.md)
[4] [Recovery Runbook](runbook.md); migrations 172–180 (`schemas/cleverwork-roofer/`)
[5] [Security Posture](../security/posture.md)
