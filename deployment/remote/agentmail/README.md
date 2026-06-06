# Pro Exteriors AgentMail

This folder records the AgentMail inbox and webhook setup for the Pro Exteriors Open Brain.

## Runtime

- Domain: `agentmail.proexteriorsus.net`
- Webhook receiver: `https://cc.proexteriorsus.net/api/agentmail/webhook`
- Code route: `app/command-center/src/pages/api/agentmail/webhook.ts`
- Roster source: `app/command-center/src/lib/agentmail.ts`

## Agent inbox naming

Vertical agents use the same `ob-*` names as their Slack handles. Horizontal agents also use `ob-*`, except Maintenance, whose production persona is Hermes and whose go-live spec calls for `hermes@<domain>`.

The AgentMail account is currently capped at ten inboxes. The enabled set is:

- Five vertical client-facing agents: Accounting, Operations, Sales, Marketing, Executive.
- Five email-useful horizontal agents: Capture, Researcher, Conductor, Innovator, Hermes/Maintenance.

The omitted agents are intentional until volume proves otherwise:

- Historian: internal-only retrieval boundary.
- Auditor: gates work through dashboard and Slack review queues.
- Quality Control: standards review can route through Conductor.

## Secret env

Set these in Coolify or a vault, never in committed files.

```text
AGENTMAIL_API_KEY=am_us_...
AGENTMAIL_DOMAIN=agentmail.proexteriorsus.net
AGENTMAIL_WEBHOOK_URL=https://cc.proexteriorsus.net/api/agentmail/webhook
AGENTMAIL_WEBHOOK_SECRETS=whsec_...,whsec_...
```

`AGENTMAIL_WEBHOOK_SECRETS` is comma-separated because the first setup can split the thirteen inboxes across multiple scoped webhook endpoints while the command center exposes one receiver.

## Guardrails

- Webhook requests must include valid Svix headers and match a configured signing secret.
- The receiver logs only event type and redacted identifiers. It does not log email subjects, bodies, recipients, sender addresses, or attachments.
- Outbound email sends stay approval-gated until the agent runtime has explicit human-in-the-loop templates.
