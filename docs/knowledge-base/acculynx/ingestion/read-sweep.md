---
type: Pipeline
title: AccuLynx Read-Capability Sweep
description: The sandbox-only harness that probes every documented GET to map real API behavior.
tags: [acculynx, ingestion, sandbox, capability, probe]
timestamp: 2026-06-30T00:00:00Z
---

A sandbox-only Edge Function (`acculynx-read-sweep`) that systematically calls every
documented AccuLynx GET against the **sandbox** account and records the real response
shape, status, and quirks. It replaced 198 rows of prior exploratory guessing with a
deterministic, spec-driven sweep.

# How it works

1. Loads the 86-GET checklist from `acculynx_get_checklist` (tier A/B/C, pagination
   param, path params, probeability).
2. **Hard sandbox gate:** `assertSandbox()` throws unless the resolved secret is
   `PE_CC_SANDBOX_ACCULYNX_API_KEY` — no production account can be probed (Chris's
   "no first-tries in production" mandate, enforced in code).
3. HATEOAS list→detail walk: Tier A (ID-free) seeds IDs for Tier B/C.
4. Paces ≤8 req/s, redacts homeowner PII before storing shapes, tags every row
   `source_account_key='sandbox'`.
5. Writes one `acculynx_api_probe` row per checklist op + best-effort
   `acculynx_api_catalog` upsert.

# Verdict vocabulary

`200` works · `empty` (200, zero items) · `204` no content · `4xx` error ·
`tier_gated` (webhook endpoint gated by account tier) · `unprobeable` (no seed id in
the sandbox, or Reports with no list endpoint).

# Result (first sweep, 2026-06-30)

86 probe rows for 86 ops; 52× 200; sandbox is sparse (1 job / 1 contact / 1
supplement), so deep chains recorded `unprobeable`/`empty`. The full per-endpoint
result is the [Read Capability](../api/read-capability.md) matrix. Idempotent —
re-running appends a fresh batch; Phase 4 write-seeding can deepen coverage.

# Citations

[1] Edge Function `acculynx-read-sweep`, `supabase/functions/acculynx-read-sweep/`
[2] [Read Capability matrix](../api/read-capability.md)
[3] reconciliation `scripts/acculynx-read-sweep-reconcile.sql`
