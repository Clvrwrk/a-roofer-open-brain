# Ingestion

How AccuLynx data gets into the brain, and how the API surface is mapped.

* [Sync Pipeline](sync-pipeline.md) - the live pull-based incremental sync (pg_cron → pg_net → Edge Function)
* [Read-Capability Sweep](read-sweep.md) - the sandbox-only endpoint-discovery harness
* [Write-Sweep](write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Runbook](runbook.md) - ingestion recovery procedures
