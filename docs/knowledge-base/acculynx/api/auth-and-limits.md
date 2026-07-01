---
type: Reference
title: AccuLynx Auth & Rate Limits
description: Per-account Bearer keys, base URLs, and the 30/10 req/s rate limits.
resource: https://apidocs.acculynx.com/docs/rate-limits
tags: [acculynx, api, auth, rate-limits]
timestamp: 2026-06-30T00:00:00Z
---

# Authentication

- Static Bearer key per request: `Authorization: Bearer {ACCULYNX_API_KEY}`.
- **Per-account:** each location/program has its own key — see [Account Registry](../accounts.md).
- Keys are created in AccuLynx → Account Settings → API; stored as Supabase Edge secrets.

# Base URLs

| Surface | Base URL |
|---|---|
| API V2 | `https://api.acculynx.com/api/v2` |
| Webhooks V2 | `https://api.acculynx.com/webhooks/v2` |

# Rate limits

- **30 requests/sec per IP**, **10 requests/sec per API key** (HTTP 429 on breach).
- Per-key means the 8 production accounts give ~8× aggregate headroom, but each key
  must be paced independently.
- On 429: back off with jitter (honor `Retry-After` when present; it is not always
  sent — treat absence as a fixed initial backoff). Retry idempotent reads only.
- Ban duration on abuse is "30s to a few minutes" — pace conservatively (the
  [read sweep](../ingestion/read-sweep.md) uses ≤8 req/s on a single key).

# Backfill guidance

Page by date windows (`dateFilterType=ModifiedDate`) rather than sweeping >100k
records from one listing query. Both `/jobs` and `/contacts`/`/estimates` paginate by
`pageStartIndex` (verified live 2026-07-01) — but the UNIT differs: `/jobs` treats it as
a **record offset** (advance by items-per-page), while `/contacts`/`/estimates` treat it
as a **page number** (advance by 1). `recordStartIndex` is ignored by `/jobs`. Full
table in [Read Capability](read-capability.md#pagination-split-a-real-quirk).

# Citations

[1] [AccuLynx Authentication](https://apidocs.acculynx.com/docs/authentication)
[2] [AccuLynx Rate Limits](https://apidocs.acculynx.com/docs/rate-limits)
