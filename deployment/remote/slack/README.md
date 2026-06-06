# Pro Exteriors Slack App

This folder holds the first Slack app manifest and channel plan for the Pro Exteriors Open Brain.

Beginner setup procedure: [`docs/30-workos-slack-agent-setup-sop.md`](../../../docs/30-workos-slack-agent-setup-sop.md).

## v1 app strategy

Use one installed Slack app for v1:

- App name: `Pro Exteriors Open Brain`
- Bot display name: `ob-conductor`
- Manifest: `deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml`
- Runtime: Socket Mode from the Command Center container on Coolify for the first live pass. The container starts the Astro server and `runtime/slack-socket-runtime.mjs` together; split this into a separate `agent-runtime` resource once the queue workers are connected.

Slack CLI note: Pro Exteriors Slack currently reports that the workspace is not eligible for the next-generation Slack platform, so create/update this app through the classic Slack app manifest UI or App Manifest API instead of `slack login`.

The repo still uses logical agent handles such as `@ob-accounting`, `@ob-ops`, and `@ob-sales` in plans and artifacts. In v1, those are routed roles inside the one Slack app, not separate installed bot users. If Pro Exteriors later wants distinct Slack mentions for every vertical agent, create one Slack app per bot user and point each app at the same agent-app backend with an explicit `agent_role`.

## Required channels

Slack app manifests configure apps; they do not create workspace channels. Create these manually, then store the channel IDs in Coolify env.

| Channel | Visibility | Purpose |
| --- | --- | --- |
| `#accounting-credit-memos` | Private | Lucinda's review channel for one-invoice credit memo request packets, approval buttons, and follow-up status. |
| `#accounting-vendor-intake` | Private | Vendor portal batch intake: CSV exports, ZIP/PDF uploads, import status, extraction errors. |
| `#accounting-product-catalog-review` | Private | Product equivalency candidates, SKU match approvals, UOM conversion questions. |
| `#ob-conductor-digest` | Private | Daily/weekly cross-agent digest, escalations, stale approvals, and owner-visible status. |
| `#ob-agent-audit-log` | Private | Append-only copies of agent decisions, approvals, rejections, and manual overrides. |
| `#ob-qc-review` | Private | Repeated miss patterns, vendor pricing standard changes, and monthly process review. |

## Runtime env

Set these in Coolify or the deployment secret store, never in committed files.

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...      # app-level token with connections:write
SLACK_SIGNING_SECRET=...
SLACK_TEAM_ID=...
SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID=...
SLACK_ACCOUNTING_VENDOR_INTAKE_CHANNEL_ID=...
SLACK_ACCOUNTING_PRODUCT_CATALOG_REVIEW_CHANNEL_ID=...
SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID=...
SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID=...
SLACK_OB_QC_REVIEW_CHANNEL_ID=...
SLACK_LUCINDA_USER_ID=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OB_ACCESS_KEY_HISTORIAN=...
```

## First workflow channel routing

The first deployed runtime is deliberately read-only. It acknowledges `/pe-ob`, `/pe-credit`, `/pe-catalog`, `/pe-intake`, app mentions, DMs, and file-share events, but does not mutate Supabase or trigger write-side vendor workflows yet.

1. `#accounting-vendor-intake`: Lucinda or Chris drops the vendor batch export or invokes `/pe-intake`.
2. Agent app records a batch row in Supabase and posts extraction status back to intake.
3. Product match uncertainty is routed to `#accounting-product-catalog-review`.
4. Auditor-approved invoice discrepancies are routed to `#accounting-credit-memos`.
5. Lucinda approves, rejects, or requests changes in Slack.
6. The agent app writes the decision and next follow-up due date to Supabase.
7. Conductor posts stale follow-ups and recurring summaries to `#ob-conductor-digest`.
8. Every gate decision is copied to `#ob-agent-audit-log`.
