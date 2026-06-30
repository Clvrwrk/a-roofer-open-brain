---
type: Reference
title: AccuLynx Read Capability
description: The 86 documented GET operations and their live sandbox verdicts.
resource: https://apidocs.acculynx.com/reference
tags: [acculynx, api, read, get, capability-matrix]
timestamp: 2026-06-30T00:00:00Z
---

The AccuLynx API V2 surface is **124 operations: 86 GET / 19 POST / 15 PUT / 4 DELETE**.
This concept covers the 86 GETs (reads). The authoritative, per-endpoint matrix with
real response shapes lives at **[docs/65](../../../65-acculynx-read-capability-matrix.md)**,
generated from the sandbox [read sweep](../ingestion/read-sweep.md) and reconciled
against `acculynx_get_checklist`.

# Tiers (seed dependency)

| Tier | Count | Meaning |
|---|---|---|
| A | 25 | ID-free (no path param) — probe first; several seed Tier B |
| B | 44 | single `{id}` path param — seeded from a Tier-A list |
| C | 17 | two+ `{id}` params — seeded from Tier B |

# Pagination split (a real quirk)

- `recordStartIndex` (21 ops): `/jobs`, `/users`, `/supplements`, most
  `/company-settings/*`, `/jobs/{id}/history`, …
- `pageStartIndex` (10 ops): `/contacts`, `/estimates`, `/jobs/{id}/invoices`,
  `/subscriptions`, `/topics`, …
- Select per-endpoint — never assume one global param.

# Structural notes

- **Write-only paths have no read GET:** job messages and contact logs are POST-only
  (no read path) — see [Write Capability](write-capability.md).
- **Supplements** are company-level (`GET /supplements?jobId=`), not nested under a job.
- **Reports** (5 ops) need a `scheduledReportId` with no list endpoint → `unprobeable`
  without a human-supplied id.
- **Webhooks** (3 ops) are on the webhooks base URL and may be account-tier gated.
- Milestone history path is `/jobs/{jobId}/milestone-history`; the `?milestones=`
  filter on `/jobs` is case-sensitive.

# Citations

[1] [Read-capability matrix (docs/65)](../../../65-acculynx-read-capability-matrix.md)
[2] [openapi-index.json](../../../../skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json)
[3] [Read sweep harness](../ingestion/read-sweep.md)
