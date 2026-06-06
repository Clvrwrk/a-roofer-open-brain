# WorkOS And Slack Agent Setup SOP

Status: draft v0.1  
Owner: Maintenance / Conductor  
Production origin: `https://cc.proexteriorsus.net`  
Related: [`25-workos-agent-auth-md-integration.md`](25-workos-agent-auth-md-integration.md), [`29-connection-and-access-checklist.md`](29-connection-and-access-checklist.md), [`../deployment/remote/slack/README.md`](../deployment/remote/slack/README.md), [`../deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml`](../deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml)

## Purpose

This SOP sets up:

1. WorkOS as the human login and ownership gate for the Command Center.
2. Slack as the human-in-the-loop communication surface for Open Brain agents.
3. Manifests and environment names so future agents can reproduce the setup without guessing.

The first production pass should stay simple: one Slack app, one Slack bot user, logical routing to the Open Brain agent roles, and WorkOS protecting human access to the Command Center.

## Current Project State

- Command Center production origin is `https://cc.proexteriorsus.net`.
- `/healthz` is healthy and currently reports `agentAuthIssuer: "https://cc.proexteriorsus.net"`.
- WorkOS is not fully enabled yet. `COMMAND_CENTER_AUTH_MODE=disabled` is still appropriate until the login/callback/session routes are implemented and verified.
- Agent auth discovery already exists at `/auth.md`, `/.well-known/oauth-protected-resource`, and `/.well-known/oauth-authorization-server`.
- Real agent registration, token minting, token revocation, and Security Event Token handling are not implemented yet; the reserved POST routes intentionally return `not_implemented`.
- Slack v1 strategy is one installed Slack app named `Pro Exteriors Open Brain` with bot display name `ob-conductor`.
- Logical agent handles such as `@ob-accounting`, `@ob-ops`, `@ob-sales`, `@ob-marketing`, and `@ob-exec` are routing labels inside the app for now, not separate Slack bot users.

## Safety Rules

- Do not paste WorkOS, Slack, Supabase, or Coolify secrets into chat.
- Put local secrets in repo-root `.env`.
- Put production secrets in Coolify app/resource environment variables.
- Keep `config/.env.example` as names and placeholders only.
- Use least privilege first, especially for Slack scopes.
- Keep Slack outbound actions approval-gated until the receiving workflow has audit logging and rollback behavior.
- Do not enable agent-auth token minting until signing keys, trusted issuers, replay protection, token persistence, and human ownership binding are implemented.

## Access Grant Priority

Use this order when giving Codex access.

| System | Priority 1: CLI | Priority 2: MCP | Priority 3: API / Token |
| --- | --- | --- | --- |
| WorkOS | Best path. Install/authenticate the WorkOS CLI or allow Codex to install it, then Codex can run `WORKOS_MODE=agent workos doctor --json --skip-ai` and resource commands. | Useful later for securing Open Brain MCP endpoints through AuthKit/Connect. It is not the same as giving Codex WorkOS dashboard-admin access. | Put `WORKOS_API_KEY` and related env values in `.env` and Coolify env. Codex can script SDK/REST work, but this is more sensitive than a short-lived CLI session. |
| Slack | Best path for app manifest work. Install/authenticate Slack CLI, or provide a temporary app configuration token so Codex can validate/create/update the manifest. | Useful after the app exists for reading/searching Slack, drafting/sending messages, and managing canvases through an MCP-compatible client. It does not replace app configuration/admin access. | Provide a short-lived Slack app configuration token for manifest APIs, then runtime tokens after app install: bot token, app-level token, signing secret. |

Local check as of this SOP: `workos` and `slack` are not installed on this machine.

## Required Environment Names

Add these to repo-root `.env` for local verification and to Coolify env for production. Do not commit values.

```bash
# WorkOS
COMMAND_CENTER_AUTH_MODE=disabled
WORKOS_API_KEY=__set_me__
WORKOS_CLIENT_ID=__set_me__
WORKOS_REDIRECT_URI=https://cc.proexteriorsus.net/auth/callback
WORKOS_COOKIE_PASSWORD=__set_me__ # 32+ chars

# Agent auth discovery / future agent registration
COMMAND_CENTER_PUBLIC_URL=https://cc.proexteriorsus.net
AGENT_AUTH_ISSUER=https://cc.proexteriorsus.net
AGENT_AUTH_SIGNING_KEY=__future__
AGENT_AUTH_TRUSTED_ISSUERS=__future__

# Slack manifest/admin setup
SLACK_APP_CONFIG_TOKEN=__temporary_do_not_commit__
SLACK_TEAM_ID=__set_me__
SLACK_APP_ID=__set_after_create__

# Slack runtime
SLACK_BOT_TOKEN=xoxb-__set_me__
SLACK_APP_TOKEN=xapp-__set_me__
SLACK_SIGNING_SECRET=__set_me__

# Slack channel routing
SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID=__set_me__
SLACK_ACCOUNTING_VENDOR_INTAKE_CHANNEL_ID=__set_me__
SLACK_ACCOUNTING_PRODUCT_CATALOG_REVIEW_CHANNEL_ID=__set_me__
SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID=__set_me__
SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID=__set_me__
SLACK_OB_QC_REVIEW_CHANNEL_ID=__set_me__
SLACK_LUCINDA_USER_ID=__set_me__
```

Switch `COMMAND_CENTER_AUTH_MODE=workos` only after the WorkOS callback/session implementation passes verification.

## WorkOS SOP

### A. Beginner Manual Setup

1. Open the WorkOS dashboard in your browser.
2. Confirm you are in the intended environment, preferably Production only when ready to protect the live Command Center.
3. Find the WorkOS API key and Client ID for the environment.
4. Configure the allowed redirect URI:

   ```text
   https://cc.proexteriorsus.net/auth/callback
   ```

5. Configure the sign-in endpoint:

   ```text
   https://cc.proexteriorsus.net/auth/login
   ```

6. Configure the homepage/sign-out return location:

   ```text
   https://cc.proexteriorsus.net/
   ```

7. Generate a cookie password of at least 32 characters and store it as `WORKOS_COOKIE_PASSWORD`.
8. Add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, and `WORKOS_COOKIE_PASSWORD` to Coolify env for the Command Center app.
9. Keep `COMMAND_CENTER_AUTH_MODE=disabled` until code support is complete.
10. Redeploy the Command Center after env changes.

### B. CLI Setup Path

Use this path when Codex or a developer can operate the WorkOS CLI.

1. Install the WorkOS CLI from the official WorkOS docs, or run the `npx workos@latest` flow in a host shell.
2. Authenticate:

   ```bash
   workos auth login
   ```

3. Confirm the active environment:

   ```bash
   workos env list
   ```

4. Add the production redirect:

   ```bash
   workos config redirect add https://cc.proexteriorsus.net/auth/callback
   ```

5. Add the production homepage:

   ```bash
   workos config homepage-url set https://cc.proexteriorsus.net
   ```

6. Run diagnostics from an agent session:

   ```bash
   WORKOS_MODE=agent workos doctor --json --skip-ai
   ```

7. Save the JSON result to a local ignored scratch file if needed. Do not paste secrets into chat.

### C. Suggested Human Roles And Permissions

Start with these WorkOS permission slugs. Keep them coarse until the UI has more route-level controls.

```yaml
permissions:
  - slug: command-center.read
    name: Read Command Center
  - slug: command-center.admin
    name: Administer Command Center
  - slug: agent.approve
    name: Approve Agent Actions
  - slug: agent.audit.read
    name: Read Agent Audit Log
  - slug: invoice.approve
    name: Approve Invoice Actions
  - slug: pricing.verify
    name: Verify Pricing Guardrails

roles:
  - slug: owner
    name: Owner
    permissions:
      - command-center.read
      - command-center.admin
      - agent.approve
      - agent.audit.read
      - invoice.approve
      - pricing.verify
  - slug: operator
    name: Operator
    permissions:
      - command-center.read
      - agent.approve
      - invoice.approve
      - pricing.verify
  - slug: auditor
    name: Auditor
    permissions:
      - command-center.read
      - agent.audit.read
  - slug: viewer
    name: Viewer
    permissions:
      - command-center.read
```

If the CLI supports the desired resource commands in `workos --help --json`, provision these via CLI or `workos seed --file=<seed-file>`. If the CLI does not support a specific operation, use the dashboard or WorkOS API instead.

### D. Required Code Work Before Enabling WorkOS

The app currently has placeholders only. Before setting `COMMAND_CENTER_AUTH_MODE=workos` in production, implement:

1. `GET /auth/login`: generate a WorkOS AuthKit authorization URL server-side and redirect the user.
2. `GET /auth/callback`: exchange the `code` for a WorkOS user/session.
3. Session sealing: store the sealed session cookie using `WORKOS_COOKIE_PASSWORD`.
4. `POST /auth/logout`: clear the cookie and redirect to the configured sign-out return.
5. Route protection: redirect unauthenticated users to `/auth/login`.
6. Role checks: gate sensitive views/actions by WorkOS role/permission.
7. Audit log: write login, logout, approval, rejection, and manual override events to Supabase.

### E. WorkOS Verification

1. `https://cc.proexteriorsus.net/healthz` should return `workOsConfigured: true` once `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` are present.
2. Visiting `/auth/login` should redirect to AuthKit.
3. After login, `/auth/callback` should seal the session and return to `/`.
4. Closing and reopening the browser should keep the session alive until expiration.
5. Logout should clear the session.
6. An unauthenticated private route should redirect to login.
7. A user without the right permission should see an explicit access-denied state, not a broken page.

## WorkOS MCP / Agent Auth Notes

WorkOS AuthKit can secure MCP servers by issuing tokens and letting MCP clients discover protected-resource metadata. For Open Brain, that maps to future internal MCP endpoints, not to the current Slack app install.

Before enabling real agent auth:

1. Add service signing keys.
2. Publish JWKS if external parties need to verify service-signed assertions.
3. Add a trusted agent-provider issuer list and JWKS cache.
4. Add `jti` replay protection.
5. Add claim-token and OTP persistence with short TTLs.
6. Bind each claimed agent identity to a WorkOS-backed human owner.
7. Validate Security Event Token pushes at `/agent/event/notify`.
8. Store agent registrations and revocations in Supabase.

## Slack SOP

### A. Beginner Manual Setup

1. Open Slack's app creation page in your browser.
2. Choose **Create New App**.
3. Choose **From an app manifest**.
4. Select the Pro Exteriors workspace.
5. Paste the contents of:

   ```text
   deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml
   ```

6. Review the generated app summary.
7. Create the app.
8. Install the app to the workspace.
9. Copy the Bot User OAuth Token into secret storage as `SLACK_BOT_TOKEN`.
10. Copy the Signing Secret into secret storage as `SLACK_SIGNING_SECRET`.
11. Confirm Socket Mode is enabled.
12. Generate an app-level token with `connections:write` and store it as `SLACK_APP_TOKEN`.
13. Create these private channels if they do not exist:

   ```text
   #accounting-credit-memos
   #accounting-vendor-intake
   #accounting-product-catalog-review
   #ob-conductor-digest
   #ob-agent-audit-log
   #ob-qc-review
   ```

14. Invite `ob-conductor` to each channel.
15. Copy each channel ID and store it in the matching `SLACK_*_CHANNEL_ID` env var.
16. Copy Lucinda's Slack user ID and store it as `SLACK_LUCINDA_USER_ID`.
17. Add all runtime Slack env vars to the agent runtime/Coolify resource.
18. Redeploy or restart the agent runtime after env changes.

### B. CLI / Manifest API Setup Path

Use this path when Codex or a developer can operate the Slack CLI or App Manifest APIs.

1. Install and authenticate the Slack CLI from Slack's official CLI docs, or generate a temporary Slack app configuration token.
2. Verify the exact CLI flags before running manifest operations:

   ```bash
   slack api apps.manifest.create --help
   slack manifest validate --help
   ```

3. Validate the repo manifest before creating or updating the app.
4. Create the app from the manifest with `apps.manifest.create`, or update an existing app with `apps.manifest.update`.
5. Save the returned app ID and signing secret to secret storage.
6. Install the app to the workspace and capture runtime tokens.
7. Rotate or revoke the temporary configuration token after setup.

### C. Slack Runtime Architecture

```text
Slack slash command / mention / file event
  -> Slack Socket Mode connection
  -> agent-runtime
  -> Conductor router
  -> role-specific agent task packet
  -> Supabase work queue and audit rows
  -> human approval in Slack when required
  -> final Slack response / digest / follow-up
```

The Conductor is the visible Slack front desk. The role-specific agents are logical owners of the work:

| Slack surface | Primary owner | Purpose |
| --- | --- | --- |
| `/pe-ob` | Conductor | General routing, recall, status, escalation |
| `/pe-credit` | Accounting + Auditor | Vendor invoice credit memo workflows |
| `/pe-catalog` | Operations + Accounting | Product catalog and equivalency review |
| `/pe-intake` | Capture + Accounting | Vendor invoice/pricing document intake |
| `#ob-conductor-digest` | Conductor | Daily/weekly digest and stale approvals |
| `#ob-agent-audit-log` | Auditor | Append-only action and decision copies |
| `#ob-qc-review` | Quality Control | Repeated misses, standards, trust-tier review |

### D. Slack Verification

1. The Slack app is installed in the Pro Exteriors workspace.
2. `ob-conductor` appears as the bot user.
3. `ob-conductor` is invited to every required private channel.
4. The app has a valid `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_SIGNING_SECRET` in runtime env.
5. Socket Mode connects from the agent runtime without requiring a public Slack request URL.
6. `/pe-ob status` creates a Conductor task packet.
7. Mentioning `@ob-conductor` in an allowed channel creates a Conductor task packet.
8. Uploading a vendor file in `#accounting-vendor-intake` creates an intake packet.
9. A human approval action writes an audit copy to `#ob-agent-audit-log`.
10. A failure posts a clear, non-secret error to `#ob-conductor-digest`.

## First Implementation Order

1. Confirm `https://cc.proexteriorsus.net/healthz` is healthy.
2. Grant CLI access or put temporary setup tokens in `.env`.
3. Install/authenticate WorkOS CLI and Slack CLI, or approve API-token fallback.
4. Configure WorkOS redirect, sign-in endpoint, homepage, and initial roles.
5. Implement WorkOS login/callback/session routes in `app/command-center`.
6. Verify WorkOS locally, then in production.
7. Switch `COMMAND_CENTER_AUTH_MODE=workos`.
8. Validate the Slack manifest.
9. Create or update the Slack app from the manifest.
10. Install the app, capture runtime tokens, and add them to Coolify env.
11. Deploy the first agent runtime Socket Mode listener.
12. Test `/pe-ob status`, `@ob-conductor`, and vendor-intake file routing.
13. Keep outbound actions propose-only until audit rows and human approvals are confirmed.

## What To Ask Chris For

Ask for one of these access bundles.

### Preferred: CLI Bundle

- Permission to install WorkOS CLI and Slack CLI if missing.
- Chris runs `workos auth login` in the host shell or allows Codex to run it with browser/manual-code flow.
- Chris runs `slack login` in the host shell or provides a Slack CLI auth path.
- A short note naming the correct WorkOS environment and Slack workspace.

### Acceptable: Temporary Setup Token Bundle

Put these in repo-root `.env`, not chat:

```bash
WORKOS_API_KEY=...
WORKOS_CLIENT_ID=...
WORKOS_COOKIE_PASSWORD=...
SLACK_APP_CONFIG_TOKEN=...
SLACK_TEAM_ID=...
```

Then, after Slack app install, add:

```bash
SLACK_BOT_TOKEN=...
SLACK_APP_TOKEN=...
SLACK_SIGNING_SECRET=...
```

### MCP Bundle

Use MCP for ongoing Slack work once connected, especially reading channels, drafting/sending approved messages, and managing canvases. MCP is not enough by itself for initial Slack app creation or WorkOS dashboard configuration unless a provider-specific admin MCP is explicitly available and authenticated.

## Done Criteria

- WorkOS env is present in Coolify.
- Command Center has real WorkOS login/callback/logout/session code.
- `COMMAND_CENTER_AUTH_MODE=workos` is enabled only after verification.
- Slack app is created from the tracked manifest.
- Slack runtime tokens are in Coolify env.
- Required Slack channels exist and contain the `ob-conductor` bot.
- First Socket Mode event reaches the agent runtime.
- First human approval writes to Supabase and mirrors to the audit Slack channel.
- Temporary setup tokens are revoked or rotated.
