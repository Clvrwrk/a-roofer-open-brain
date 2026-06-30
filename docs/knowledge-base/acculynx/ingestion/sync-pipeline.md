---
type: Pipeline
title: AccuLynx Sync Pipeline
description: The live pull-based incremental sync — pg_cron → pg_net → acculynx-sync Edge Function.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/functions
tags: [acculynx, ingestion, pg_cron, edge-function, watermark]
timestamp: 2026-06-30T00:00:00Z
---

The integration of record is **NOT** the repo's `integrations/bridges/acculynx`
webhook stub — it is a live Supabase Edge Function. Plan against this.

# Architecture

```
pg_cron (daily 08:15 UTC)
  → trigger_acculynx_sync('["users","jobs"]')   -- SQL fn
    → pg_net  (async HTTP POST)
      → acculynx-sync  (Deno Edge Function, v10)
        → AccuLynx API V2  (GET, incremental by ModifiedDate)
        → upsert acculynx_jobs + crm_pipeline
        → advance acculynx_sync_watermark
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

# Known gaps (2026-06-30)

- **Single-account only.** Uses one key (Kansas) — see [Account Registry](../accounts.md).
  Multi-location fan-out across all 8 production keys is Phase 2.
- **Only jobs + users sync.** Contacts/estimates/invoices/financials/insurance/
  milestone-history watermarks are null — Phase 2.
- **Cron observability gap.** `v_acculynx_cron_outcomes` shows historical runs as
  `pending` (pg_net responses unreconciled) — Phase 3 hardening fixes this and moves
  the schedule to hourly.

# Citations

[1] Edge Function `acculynx-sync` (v10), Supabase project `rnhmvcpsvtqjlffpsayu`
[2] [Account Registry](../accounts.md)
[3] [Read-Capability Sweep](read-sweep.md)
