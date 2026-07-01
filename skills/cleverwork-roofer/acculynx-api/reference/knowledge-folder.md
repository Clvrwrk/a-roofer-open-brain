# AccuLynx Knowledge Bundle (OKF) — pointer

The AccuLynx knowledge base is an **[Open Knowledge Format](../../../../docs/knowledge-base/OKF/SPEC.md)
bundle in the repo** — plain markdown + YAML frontmatter that agents and humans read
directly, version-controlled, no external service, no drift. (Not a Google Drive folder:
agents read the repo; a Drive copy would be a second source of truth to keep in sync.)

**Bundle root:** [`docs/knowledge-base/acculynx/`](../../../../docs/knowledge-base/acculynx/index.md)

## Index

| Concept | Covers |
|---|---|
| [overview](../../../../docs/knowledge-base/acculynx/overview.md) | WHY / WHAT / WHEN — core value, data surface, schedule |
| [accounts](../../../../docs/knowledge-base/acculynx/accounts.md) | WHO / WHERE — the 9 accounts + secret names (no values) |
| [ingestion/sync-pipeline](../../../../docs/knowledge-base/acculynx/ingestion/sync-pipeline.md) | HOW — pg_cron → pg_net → acculynx-sync |
| [ingestion/read-sweep](../../../../docs/knowledge-base/acculynx/ingestion/read-sweep.md) | HOW — sandbox capability sweep |
| [ingestion/write-sweep](../../../../docs/knowledge-base/acculynx/ingestion/write-sweep.md) | HOW — sandbox write red-team harness (Phase 4) |
| [ingestion/write-action](../../../../docs/knowledge-base/acculynx/ingestion/write-action.md) | HOW — human-gated enqueue → approve → execute → audit loop (Phase 5) |
| [ingestion/runbook](../../../../docs/knowledge-base/acculynx/ingestion/runbook.md) | HOW — ingestion recovery procedures |
| [api/auth-and-limits](../../../../docs/knowledge-base/acculynx/api/auth-and-limits.md) | per-account keys, 30/10 req/s |
| [api/read-capability](../../../../docs/knowledge-base/acculynx/api/read-capability.md) | 86 GETs → [docs/65](../../../../docs/65-acculynx-read-capability-matrix.md) |
| [api/write-capability](../../../../docs/knowledge-base/acculynx/api/write-capability.md) | writes → [docs/37](../../../../docs/37-acculynx-write-capability-matrix.md) |
| [data/jobs](../../../../docs/knowledge-base/acculynx/data/jobs.md), [data/tables](../../../../docs/knowledge-base/acculynx/data/tables.md) | WHERE — brain tables |
| [security/posture](../../../../docs/knowledge-base/acculynx/security/posture.md) | secrets, RLS, STRIDE attestation, and the untrusted-content boundary (data never instructions) |

## Source-of-truth tables (in the brain DB)

- `public.acculynx_accounts` — 9-account registry (migration 165)
- `public.acculynx_get_checklist` — 86 documented GETs (migration 167)
- `public.acculynx_api_catalog` / `public.acculynx_api_probe` — endpoint record + probe evidence
- Read matrix: [docs/65](../../../../docs/65-acculynx-read-capability-matrix.md) · Write matrix: [docs/37](../../../../docs/37-acculynx-write-capability-matrix.md)

> Browse interactively: the OKF repo's `visualize` subcommand renders any bundle as a
> self-contained HTML graph (`docs/knowledge-base/OKF/README.md`). A human-facing mirror
> (exec/staff) can be auto-generated from this bundle in a later phase — never hand-kept.
