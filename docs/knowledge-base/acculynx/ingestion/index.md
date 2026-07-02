# Ingestion

How AccuLynx data gets into the brain, and how the API surface is mapped.

* [Sync Pipeline](sync-pipeline.md) - the live pull-based incremental sync (pg_cron → pg_net → Edge Function); capture-first, crm_pipeline written on the multiAccount hourly cron for all 8 accounts
* [Read-Capability Sweep](read-sweep.md) - the sandbox-only endpoint-discovery harness
* [Write-Sweep](write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Webhooks](webhooks.md) - the change-driven trigger layer (D-17): 8/8 accounts subscribed (2026-07-02); a post-rollout multi-subscription auth fix is deployed but live re-verification for the 7 new subscriptions is pending (blocked by sandbox `.env` access this session) (Phase 7)
* [Runbook](runbook.md) - ingestion recovery procedures
