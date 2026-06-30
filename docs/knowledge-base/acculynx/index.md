---
okf_version: "0.1"
---

# AccuLynx Knowledge Bundle

The agent-facing knowledge base for the Pro Exteriors AccuLynx integration — the
who / what / how / why / where / when of the roofer brain's primary PM data source.
Authored as an [Open Knowledge Format](../OKF/SPEC.md) bundle: plain markdown +
YAML frontmatter, read directly by agents and humans, version-controlled, no drift.

# Start here

* [Overview](overview.md) - why this exists, what it covers, when it runs (the WHY / WHAT / WHEN)
* [Account Registry](accounts.md) - the 9 AccuLynx accounts and their keys (the WHO / WHERE)

# Ingestion (the HOW)

* [Ingestion](ingestion/) - how AccuLynx data gets into the brain
  * [Sync Pipeline](ingestion/sync-pipeline.md) - pg_cron → pg_net → acculynx-sync Edge Function
  * [Read-Capability Sweep](ingestion/read-sweep.md) - the sandbox endpoint-discovery harness

# API surface

* [API](api/) - the AccuLynx REST API V2 surface
  * [Auth & Rate Limits](api/auth-and-limits.md) - per-account keys, 30/10 req/s
  * [Read Capability](api/read-capability.md) - the 86 documented GETs and what they return
  * [Write Capability](api/write-capability.md) - what can be written back (and what can't)

# Data (the WHERE, in the brain)

* [Data](data/) - where AccuLynx data lands in the brain DB
  * [Jobs & Pipeline](data/jobs.md) - acculynx_jobs and crm_pipeline
  * [Brain Tables](data/tables.md) - every acculynx_* table and view
