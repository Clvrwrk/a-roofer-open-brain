---
type: Reference
title: AccuLynx Brain Tables
description: Every acculynx_* table and view in the brain, grouped by purpose.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/editor
tags: [acculynx, schema, tables, supabase]
timestamp: 2026-06-30T00:00:00Z
---

All in Supabase project `rnhmvcpsvtqjlffpsayu`, schema `public`. RLS enabled
(service-role writes).

# Core records

| Table | Purpose | Fed? |
|---|---|---|
| [`acculynx_jobs`](jobs.md) | Flat job/lead mirror; `id` = permanent GUID | ✅ jobs |
| `crm_pipeline` | Normalized pipeline (the consumer table) | ✅ |
| `acculynx_users` | User roster (for crew/rep resolution) | ✅ |
| `acculynx_lead_sources` | Lead-source dimension | ✅ |
| `acculynx_contacts` / `acculynx_job_contacts` | Contacts + job links | ⏳ Phase 2 |
| `acculynx_contact_emails` / `acculynx_contact_phones` | Contact channels | ⏳ |
| `acculynx_estimates` | Estimates | ⏳ |
| `acculynx_invoices` / `acculynx_invoice_lines` | AR invoices (PE→customer) | ⏳ |
| `acculynx_job_financials` | Job financials | ⏳ |
| `acculynx_job_insurance` / `acculynx_insurance_carriers` | Insurance claims/carriers | ⏳ |
| `acculynx_job_milestone_history` | Milestone timeline | ⏳ |

# Account & sync control

| Table | Purpose |
|---|---|
| [`acculynx_accounts`](../accounts.md) | The 9-account registry (env-name-only) — Phase 1 |
| `acculynx_sync_watermark` | Per-resource incremental watermark (`last_modified_date`) |
| `acculynx_sync_cursor` | Cursor state for paged syncs |
| `acculynx_fetch_queue` | Deferred detail-fetch queue |
| `acculynx_raw` | Raw API response archive (replay/debug) |

# API discovery

| Table | Purpose |
|---|---|
| `acculynx_get_checklist` | 86 documented GETs (tier, pagination, probeability) — Phase 1 |
| `acculynx_api_catalog` | Per-endpoint canonical record |
| `acculynx_api_probe` | Per-call probe evidence (shapes, status, `source_account_key`) |

# Views & cross-links

| View | Purpose |
|---|---|
| `v_acculynx_cron_outcomes` | Cron run outcomes (pg_net reconciliation — Phase 3 fix) |
| `v_invoice_acculynx_match` | ABC invoice ↔ AcuLynx job match |
| `v_order_acculynx_match` | ABC order ↔ AcuLynx job match |
| `estimate_acculynx_handoffs` | Estimate → AccuLynx handoff packets |

# Citations

[1] [Sync Pipeline](../ingestion/sync-pipeline.md)
[2] [Account Registry](../accounts.md)
