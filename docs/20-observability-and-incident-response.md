# Observability & Incident Response

Status: draft v0.1
Related: [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md), [`deployment/remote/DEPLOYMENT-RUNBOOK.md`](../deployment/remote/DEPLOYMENT-RUNBOOK.md), [`standards/platform/v1.md`](../standards/platform/v1.md)

How the platform is watched and how a 2-person team responds when something breaks. Principle: **agents detect and report; humans decide on anything irreversible.** Hermes monitors and routes — it does not silently self-heal production.

---

## 1. Signals

| Signal | Source | Where it goes |
| --- | --- | --- |
| App / agent errors + performance | **Sentry** (`SENTRY_DSN` on every resource) | Sentry → Hermes → Slack |
| Container health | Coolify health checks per resource | Coolify auto-restart; repeated failures → alert |
| Total outage (host down) | **External uptime pinger** (independent of the host) hitting `/healthz` | direct page to a human |
| Brain hygiene | Hermes daily/weekly 5S | Slack digest + Agent Monitoring view |
| Gate/audit anomalies | DB (e.g. invoice paid without approval — should be impossible) | flagged in audit review |
| Backup restorability | Hermes quarterly restore test | pass/fail to Slack + brain |

The external pinger is deliberately off-box: if the CPX41 is down, on-box monitoring can't tell you.

## 2. Alert routing

Sentry + health → **Hermes** correlates and posts a status line to Slack and the Agent Monitoring view. Routine noise is summarized in the daily digest. A genuine incident escalates to a human immediately (Slack mention + AgentMail). Hermes proposes likely cause + the relevant runbook section; it does not restart prod or mutate data on its own.

## 3. Severity & response targets (see SLA)

| Sev | Definition | Ack | Action |
| --- | --- | --- | --- |
| **S1** | Platform down / data at risk / gate bypassable | ≤ 15 min | all-hands; follow rebuild/mitigation runbook |
| **S2** | Degraded (a tab/endpoint/agent down, app up) | ≤ 1 h | mitigate same day |
| **S3** | Minor / cosmetic / single stale artifact | next business day | batch with maintenance |

## 4. Incident runbook

1. **Detect** — Sentry/pinger/Hermes raises it.
2. **Triage** — confirm severity + blast radius; is data or the gate affected?
3. **Mitigate** — restart resource (Coolify), roll back to prior commit, or, for host loss, execute the **rebuild** (runbook §8). Never bypass the pricing gate or delete data to "fix" an incident.
4. **Communicate** — status in Slack; if customer/vendor-facing, a human owns external comms.
5. **Verify** — health green, gate intact, audit log consistent.
6. **Post-incident** — short write-up: what/why/fix/prevention; **recorded to the One Brain** (atom, `evidence`) so the next incident is cheaper. Repeated patterns (3×/90d) → QC DMAIC.

## 5. On-call reality (2-person team)

The platform is built to **degrade safely, not require a night shift**: Coolify auto-restarts transient failures; the gate fails *closed* (blocks payment) rather than open; backups + a documented rebuild bound the worst case. Humans are paged only for S1/S2. As the agent team grows, Conductor takes first-line triage and only escalates true human decisions.

## 6. What "healthy" looks like

`/healthz` 200 on command-center; `tools/list` 200 on both MCP containers; agent-runtime heartbeat fresh; Sentry error rate within baseline; last backup < 24 h; Hermes hygiene digest green; uptime ≥ the SLA target.
