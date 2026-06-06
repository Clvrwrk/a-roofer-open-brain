# Command Center Agent Access

The Command Center has three access paths:

| Actor type | Entry point | Purpose |
| --- | --- | --- |
| Human | WorkOS browser session | Approve, reject, request evidence, and review audit packets. |
| Named agent | WorkOS browser session from an Orgo desktop | Use the visual UI when the task involves files, browser state, dashboards, or a portal. |
| Service agent | Bearer token against `/api/agent/*` | Pull queue work, attach evidence, request more evidence, and resume after approval without a browser. |

The design rule is simple: **the UI is the human cockpit, not the agents' only doorway.** Every agent-run workflow needs a machine path so expired desktop sessions do not block the work.

## API Routes

- `GET /api/agent/session`: returns the resolved actor, permissions, named-agent roster, service-agent roster, and desktop map.
- `GET /api/agent/work-queue`: returns queue items filtered to the actor's departments and permissions.
- `POST /api/agent/work-queue/:workId/decision`: accepts `approve`, `reject`, `needs_more_evidence`, or `resume_agent` when the actor has permission.

Humans can approve/reject. Named agents and service agents can request evidence and resume approved work, but they cannot approve their own external sends or write-side actions.

## Environment

```text
COMMAND_CENTER_AUTH_MODE=workos
COMMAND_CENTER_HUMAN_ADMIN_EMAILS=admin@cc.proexteriorsus.net
AGENT_SERVICE_TOKENS=ob-accounting:...,ob-ops:...,ob-sales:...
```

`AGENT_SERVICE_TOKENS` is a phase-1 bridge. Prefer vault-backed per-agent tokens or hashed `AGENT_SERVICE_TOKEN_SHA256_<AGENT_ID>` values once the runtime moves past the walking skeleton.

## Desktop-Enabled Named Agents

- Maya Chen: `maya.chen@cc.proexteriorsus.net`
- Alex Rivers: `alex.rivers@cc.proexteriorsus.net`
- Casey Morgan: `casey.morgan@cc.proexteriorsus.net`
- Rowan Vale: `rowan.vale@cc.proexteriorsus.net`
- Lena Brooks: `lena.brooks@cc.proexteriorsus.net`

Workspace-only named agents:

- Jordan Price: `jordan.price@cc.proexteriorsus.net`
- Sam Torres: `sam.torres@cc.proexteriorsus.net`

## Human Gate Policy

Humans approve:

- external email sends
- public publishing
- payment, banking, or QuickBooks write actions
- destructive file/database changes
- new paid accounts, subscriptions, or permission escalations
- customer/job PII exposure

Agents may prepare packets, draft messages, attach evidence, and resume after approval.
