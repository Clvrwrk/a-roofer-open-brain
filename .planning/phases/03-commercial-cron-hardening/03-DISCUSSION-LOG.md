# Phase 3: Commercial Cron Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 03-commercial-cron-hardening
**Areas discussed:** Cron cadence & pacing, Alerting channels & triggers, Tolerance & 6-account gate, Trust/provenance guardrails, Security review scope

---

## Pre-discussion — scope of the user-added area

User added a fifth area in their own words: "Preventing agent poisoning, agent scope drift, context rot." Clarified as **ingestion-layer guardrails so the data can't poison/drift/rot the brain that agents later consume** — NOT the AccuLynx Agent's own runtime behavior (that stays in REQ-09, noted deferred). User confirmed this reading.

---

## Cron cadence & pacing

| Option | Description | Selected |
|--------|-------------|----------|
| Single hourly + backfill slice | One hourly cron, one edge invocation: incremental for all wired accounts serially, then a bounded backfill slice. Drains over runs. | ✓ |
| Split: hourly + fast drain | Hourly incremental + separate frequent backfill-drain cron that self-retires. | |
| Per-account staggered crons | One schedule per account, time-offset. | |

**User's choice:** Single hourly + backfill slice.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep serial (one invocation, all accounts) | One invocation loops accounts serially under 110s, resumes next run. | ✓ |
| One invocation per account | N parallel pg_net POSTs, one per account. | |

**User's choice:** Keep serial (one invocation, all accounts).
**Notes:** Matches proven v19 behavior; safest against the shared 30 req/s IP limit.

---

## Alerting channels & triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Both Slack + Sentry | Sentry structured capture + Slack human-readable alert. | ✓ |
| Slack only | Human alerts only. | |
| Sentry only | Structured capture only. | |

**User's choice:** Both Slack + Sentry.

**Triggers (multi-select) — all four selected:** failed run (non-200/exception), stale watermark, reconciliation delta over tolerance, pg_net response unreconciled.

| Staleness window | Selected |
|--------|----------|
| 3 hours | ✓ |
| 2 hours | |
| 6 hours | |

**User's choice:** 3-hour staleness window.

---

## Tolerance & 6-account gate

| Tolerance | Selected |
|--------|----------|
| ≤ 2% | ✓ |
| ≤ 5% | |
| ≤ 1% | |

**User's choice:** delta_pct ≤ 2%.

| Expansion gate | Selected |
|--------|----------|
| KC+Wichita within tolerance, then human OK | ✓ |
| KC+Wichita tolerance for N stable runs | |
| Human OK now, expand in parallel | |

**User's choice:** KC+Wichita within tolerance on all resources (+ jobs api_count fixed), then explicit human OK.

| Rollout | Selected |
|--------|----------|
| Canary then batch | ✓ |
| All 6 at once | |
| One at a time | |

**User's choice:** Canary then batch (1 first, then remaining 5).

---

## Trust/provenance guardrails

| Untrusted free-text handling | Selected |
|--------|----------|
| Tag & segregate, don't mutate | ✓ |
| Sanitize at ingestion | |
| Defer to REQ-09 agent | |

**User's choice:** Tag & segregate (evidence tier, never instruction; boundary documented for REQ-09).

| Provenance enforcement | Selected |
|--------|----------|
| Enforce as invariants | ✓ |
| Convention + monitoring | |

**User's choice:** Enforce as DB invariants (NOT NULL provenance, evidence default, immutable raw); verified in security review.

**Rot guards (multi-select) — all four selected:** duplicate detection, orphan detection, NULL-provenance sweep, stale-tail detection.

---

## Security review scope

| Method | Selected |
|--------|----------|
| /gsd-secure-phase + security doc | ✓ |
| Security checklist doc only | |
| Both + external red-team | |

**User's choice:** Run /gsd-secure-phase + write a security posture doc.

| RLS posture | Selected |
|--------|----------|
| RLS on, deny-by-default | ✓ |
| RLS on, service-role only | |
| You decide during review | |

**User's choice:** RLS on, deny-by-default.

| Runbook | Selected |
|--------|----------|
| Comprehensive, in the KB | ✓ |
| Minimal recovery notes | |

**User's choice:** Comprehensive recovery runbook at docs/knowledge-base/acculynx/ingestion/runbook.md.

---

## Claude's Discretion

- pg_net → response reconciliation mechanism (join `net._http_response`, retention/cleanup, follow-up cron vs view rewrite).
- Backfill slice size + resource priority order within D-02.
- Slack channel + alert message format (per /slack-agents).
- Schema/constraint mechanics for provenance invariants + rot guards (checks vs triggers vs monitoring views).
- Sentry capture wiring specifics (per /sentry).

## Deferred Ideas

- AccuLynx Agent runtime injection/scope-drift defenses — REQ-09 (its own phase, needs approved A3).
- Production write paths / write wrappers — REQ-06, REQ-08.
- Executive Sales Pipeline dashboard — REQ-10.
