# Agent Task Cadence And Cron Model

Status: draft v0.1  
Owner: Chris / Cleverwork  
Related: `docs/15-prd-agent-platform.md`, `docs/17-frontend-command-center-spec.md`, `agents/horizontal/maintenance/ROLE.md`

## Purpose

The app needs one operating model for human-in-the-loop work: department first, cadence second, agent run third. This makes the UI easy for humans and keeps agent autonomy bounded.

## Department Taxonomy

| Department | Primary agent | Examples |
| --- | --- | --- |
| Accounting | `@ob-accounting` | AR/AP, invoice gates, supplements, job costing, draws, closeout. |
| Operations | `@ob-ops` | Schedule, crews, subs, materials, permits, daily logs, safety. |
| Sales | `@ob-sales` | Leads, storm canvassing, estimates, claims, proposals, follow-up. |
| Marketing | `@ob-marketing` | Reviews, photos, content, EEAT, schema, badges. |
| Executive | `@ob-exec` | KPIs, capacity, hiring, strategy, dashboards. |
| System | horizontal agents | Capture, Historian, Researcher, Conductor, Auditor, QC, Innovator, Maintenance. |

## Cadence Taxonomy

| Cadence | Meaning |
| --- | --- |
| Daily | Work expected every business day or every night. |
| Weekly | Work tied to week close, planning, reconciliation, or recurring review. |
| Monthly | Month-close, reporting, audits, content plans, standardization. |
| Quarterly | Strategic review, cold archive, process improvement, capacity planning. |
| Annual | Licensing, insurance, tax, vendor renewal, DR test, strategy reset. |
| Ad hoc | Event-driven work from Slack, email, webhook, upload, or human request. |

## Work Definition

Every recurring task should be represented as a work definition before it becomes a cron job.

| Field | Purpose |
| --- | --- |
| `id` | Stable kebab-case identifier. |
| `department` | One of the department keys. |
| `agent` | Owning agent handle or horizontal agent name. |
| `cadence` | Daily, weekly, monthly, quarterly, annual, or ad hoc. |
| `cron` | Time schedule in local timezone. Empty for event-driven work. |
| `timezone` | Defaults to client timezone. |
| `input_contract` | Required data before the task can run. |
| `output_contract` | Artifact, atom, dashboard update, Slack digest, or approval request. |
| `approval_required` | None, before external action, before write, or always. |
| `auditor_required` | Whether Auditor must pass the output before a human sees it. |
| `retry_policy` | Backoff, max attempts, and escalation path. |
| `lock_key` | Prevents duplicate runs. |

## Run States

```text
scheduled -> queued -> running -> needs_review -> approved -> done
                              \-> blocked
                              \-> failed
                              \-> rejected
```

External or irreversible actions require a human approval state before execution. Agents may prepare drafts, recommendations, and internal evidence without approval when their charter allows it.

## Cron Defaults

| Cadence | Default window | Notes |
| --- | --- | --- |
| Daily system hygiene | 00:30-01:30 local | Front desk inventory, Capture checks, Maintenance Sort. |
| Daily sales/ops planning | 06:00-07:30 local | Hot leads, schedule risk, crew/material readiness. |
| Daily close | 16:00-18:00 local | Daily logs, photos, missed follow-up, work queue roll-forward. |
| Weekly planning | Monday 06:00 local | Week-ahead capacity and sales pipeline. |
| Weekly hygiene | Sunday 02:30-04:00 local | Maintenance Set in Order/Shine and workspace checks. |
| Monthly close | 1st business day 03:00 local | Accounting, reporting, schema/EEAT standardization. |
| Quarterly sustain | First day of quarter 04:00 local | Archive, embedding review, QC/PDCA sample. |
| Annual review | January first business week | Licenses, insurance, vendor contracts, DR test, strategy reset. |

## UI Implications

The Command Center should make the work matrix visible:

- Left rail: departments.
- Top tabs or segmented control: cadence.
- Main table: task, owner, next run, status, approval state, evidence, action.
- Right panel: selected run detail, agent reasoning, audit trail, and approve/reject controls.
- Agent Monitoring: Hermes hygiene digest, queue depth, last run, next run, Sentry health.

The app should open to the work surface, not a landing page.

## Runtime Guardrails

- Cron lives in the `agent-runtime` container, not in the browser.
- Every scheduled run writes a run record before doing work.
- Every run uses an idempotency key and lock.
- Failed runs escalate through Conductor and Sentry.
- Human approvals record actor, timestamp, source, and before/after payload.
- Researcher remains external-only; Historian remains internal-only.
- Maintenance can propose move/sort actions, but no cron job moves files without an approved manifest.
