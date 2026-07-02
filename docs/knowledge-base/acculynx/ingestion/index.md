# Ingestion

How AccuLynx data gets into the brain, and how the API surface is mapped.

* [Sync Pipeline](sync-pipeline.md) - the live pull-based incremental sync (pg_cron → pg_net → Edge Function); capture-first, crm_pipeline written on the multiAccount hourly cron for all 8 accounts
* [Read-Capability Sweep](read-sweep.md) - the sandbox-only endpoint-discovery harness
* [Write-Sweep](write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Webhooks](webhooks.md) - the change-driven trigger layer (D-17): live wichita-only prod canary subscription proven end-to-end; remaining 7 accounts pending human green-light (Phase 7)
* [Runbook](runbook.md) - ingestion recovery procedures
