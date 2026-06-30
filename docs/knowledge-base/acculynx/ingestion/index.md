# Ingestion

How AccuLynx data gets into the brain, and how the API surface is mapped.

* [Sync Pipeline](sync-pipeline.md) - the live pull-based incremental sync (pg_cron → pg_net → Edge Function)
* [Read-Capability Sweep](read-sweep.md) - the sandbox-only endpoint-discovery harness
