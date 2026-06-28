---
type: application-plan
title: Applying Open Engine, Open Skills, and OKF to a-roofers-open-brain
description: Roadmap for using the researched frameworks to improve repo operations, Command Center security, Supabase performance, prompt-injection resistance, auth hardening, reliability, and p95 speed.
resource: /docs/knowledge-base/
tags:
  - open-engine
  - open-skills
  - okf
  - command-center
  - supabase
  - security
timestamp: "2026-06-28"
---

# Applying Open Engine, Open Skills, and OKF

## Executive Thesis

Use Open Engine as the coordination layer, Open Skills as the reusable execution layer, and OKF as the durable knowledge layer.

For a-roofers-open-brain, the winning pattern is:

- Open Engine coordinates multi-agent work in Linear with statuses, standing issues, a status ledger, and receipts.
- Open Skills turns repeated work into governed, reusable procedures.
- OKF keeps framework knowledge, local decisions, security models, and operating playbooks in a portable markdown knowledge base that agents can read without guessing.

## Repo And Dev-Engine Improvements

1. Make `docs/knowledge-base/` the canonical OKF-style context area for researched frameworks and operating models.
2. Promote the dev-engine from a documented manual loop to a tested runner:
   - fetch Linear tasks;
   - run standing preflight;
   - verify local engine version;
   - respect holds and blockers;
   - claim one eligible task;
   - leave receipts automatically.
3. Register repo-native skills in PEC-3:
   - standing preflight;
   - status ledger update;
   - Command Center page QA;
   - endpoint auth matrix review;
   - Supabase performance triage;
   - prompt-injection review;
   - release-day smoke check.
4. Add version drift checks for every runtime skill file under `agents/dev-engine/`.
5. Add boundary checks for doc 58 rules so dev agents do not silently take operations-plane work.
6. Require every production-affecting dev-engine task to leave: source inputs, files changed, commands run, checks passed, and explicit remaining risk.

## Command Center Improvements

The current architecture already has strong foundations: Astro SSR, WorkOS edge auth/RBAC, service-role-only server paths, Sentry instrumentation, and separation between internal Historian and external Researcher retrieval.

Recommended next steps:

- Maintain an endpoint auth matrix for every route in `app/command-center/src`.
- Re-check role and tenant authorization server-side for every write, import, export, and privileged read.
- Keep service-role keys out of browser paths and agent-readable public content.
- Audit public prefixes in middleware after every new route.
- Add route-specific CSRF/origin checks for browser-submitted forms and keep machine endpoints explicitly allowlisted.
- Treat `security.checkOrigin: false` as a debt item that must be offset by endpoint-level method, content-type, token, and origin validation.
- Ensure service worker caching never stores sensitive actor-specific payloads across auth boundaries.

## Supabase Growth And Performance

As data grows, do not rely on bigger instances alone. Make slow paths explicit and observable.

Priority actions:

- Turn known slow rollups into materialized views or cache tables, starting with invoice summaries, estimate audit paths, and payload-heavy price-list/review/vendor-region views.
- Use `EXPLAIN ANALYZE` and `pg_stat_statements` for every repeated slow query.
- Add RLS-aware indexes that match actual policy predicates and query filters.
- Partition high-volume append-only tables such as action logs, audit logs, webhook logs, and agent run logs.
- Add retention and archive rules before tables become operationally painful.
- Use connection pooling and avoid serverless connection storms.
- Add read replicas only after query and cache discipline are in place.
- Build cache invalidation into imports, sync jobs, and privileged writes.
- For vector search, choose HNSW or IVFFlat indexes deliberately and track recall/latency tradeoffs.
- Use Supabase branches, Ghost/Dolt-style labs, and restore drills for schema or RLS changes before production.

## Prompt-Injection Hardening

The most important rule is to keep untrusted content as data, never instructions.

Controls:

- Preserve the Historian/Researcher split: internal-only retrieval and external-only retrieval stay separate.
- Wrap external content in explicit trust-boundary tags and escape closing tags.
- Give agents instruction hierarchy in system/developer/local policy, not in fetched web pages, customer files, email, Slack messages, or scraped content.
- Add canary tests for prompt injection in web pages, documents, webhooks, Slack messages, and customer uploads.
- Require allowlisted tools for external-content workflows.
- Strip or quarantine instructions inside external artifacts before summarization or tool use.
- Require human approval before external content can trigger writes, sends, deploys, deletions, key changes, billing actions, or permission changes.
- Record provenance for every generated answer that uses external or customer-provided content.

## Auth And Secrets Hardening

Controls:

- WorkOS RBAC remains the primary auth boundary for human app access.
- Agent service tokens should be scoped, hashed at rest, rotatable, and separately auditable.
- Magic-link and machine-token flows need entropy, expiry, single-use or replay controls, and rate limits.
- Privileged actions should create immutable audit events with actor, tenant, route, object, and reason.
- Webhooks should validate signatures before parsing trusted fields.
- Sentry must continue scrubbing PII and secrets.
- Any key that has appeared in chat, logs, or untrusted output should be rotated on a defined schedule.

## Reliability And Uptime

Six nines is about 31.5 seconds of downtime per year. The current documented topology cannot honestly promise that while the app depends on a single-region/single-node style deployment path.

Practical target ladder:

| Stage | Target | Requirements |
| --- | --- | --- |
| Current hardening | 99.5-99.9% | External uptime checks, backups, restore drill, deploy smoke tests, alerting, runbooks. |
| Production discipline | 99.9-99.95% | Blue-green deploys, staging parity, rollback automation, DB migration gates, incident drills. |
| HA architecture | 99.99%+ | Stateless app nodes, load balancer, managed database HA, queues, read replicas, cache layer. |
| Six nines | 99.9999% | Multi-region active-active design, global failover, automated RPO/RTO validation, chaos testing, formal on-call, error budgets. |

The right near-term goal is honest SLO discipline: define the user journeys that matter, measure them, set error budgets, and automate recovery before promising extreme uptime.

## Sub-500ms Speed

Use the existing warm navigation target of p95 under 500ms for authenticated Command Center actions.

Priority actions:

- Keep p95 warm-route performance gates in CI or release smoke checks.
- Add server timing to identify DB, auth, render, external API, and serialization costs separately.
- Materialize cold Supabase rollups.
- Split large API payloads and lazy-load secondary panels.
- Cache stable reference data with explicit invalidation.
- Put payload budgets on high-traffic pages.
- Avoid blocking page render on external APIs.
- Track slow query regressions by route, tenant, and actor type.

## First 90 Days

1. Fix dev-engine version drift and missing status ledger coverage.
2. Add an automated standing preflight script and Linear runner smoke test.
3. Register the first five local skills in PEC-3 with scope and receipts.
4. Build an endpoint auth matrix and route-specific CSRF/origin checklist.
5. Add prompt-injection regression tests for external content paths.
6. Pick the top three slow Supabase paths and materialize or cache them.
7. Add release-day smoke checks for auth, p95 warm actions, Sentry, and restore readiness.
8. Convert each completed improvement into OKF concepts and local skills so future agents inherit the operating knowledge.

## Citations

- Open Engine: https://unlock-ai.natebjones.com/open-engine
- Open Skills: https://unlock-ai.natebjones.com/open-skills
- Open Knowledge Format blog: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
- OKF v0.1 spec: https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md

