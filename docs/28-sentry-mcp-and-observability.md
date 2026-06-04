# Sentry MCP And Observability

Status: draft v0.1
Related: [`20-observability-and-incident-response.md`](20-observability-and-incident-response.md), [`27-hetzner-coolify-agent-host.md`](27-hetzner-coolify-agent-host.md)

## Sources Checked

- Sentry MCP: `https://mcp.sentry.dev/`
- Sentry MCP endpoint: `https://mcp.sentry.dev/mcp`
- Sentry CLI: `https://cli.sentry.dev/`
- Sentry CLI install command: `curl https://cli.sentry.dev/install -fsS | bash`

The Sentry MCP docs show Codex setup via:

```bash
codex mcp add sentry -- npx -y mcp-remote@latest https://mcp.sentry.dev/mcp
```

The MCP URL can be constrained:

- `https://mcp.sentry.dev/mcp/{org}`
- `https://mcp.sentry.dev/mcp/{org}/{project}`
- Add `?agent=1` to expose a single agent-style Sentry tool instead of many individual tools.

## Local Status

- Sentry CLI binary installed at `/Users/chussey/.local/bin/sentry`.
- Sandbox could not complete `sentry --version` because the CLI attempted to open local state outside the workspace.
- Sentry MCP is not yet registered in Codex MCP config.
- Current `.env` did not expose Sentry key names during the key-name-only check.

## Env Names

Add these to `.env` and Coolify env:

```bash
SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG_AUTH_TOKEN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_ENVIRONMENT=production
SENTRY_MCP_URL=https://mcp.sentry.dev/mcp
```

Use `SENTRY_AUTH_TOKEN` for personal CLI/API automation. Use `SENTRY_ORG_AUTH_TOKEN` only if the org token is distinct and needed for project/admin operations.

## Auth Options

Local machine:

```bash
sentry auth login
```

Token/non-interactive path:

```bash
export SENTRY_AUTH_TOKEN=...
sentry org list --json
```

Codex MCP path:

```bash
codex mcp add sentry -- npx -y mcp-remote@latest https://mcp.sentry.dev/mcp
codex mcp login sentry
```

For lower context and narrower access after org/project are known:

```bash
codex mcp add sentry -- npx -y mcp-remote@latest "https://mcp.sentry.dev/mcp/$SENTRY_ORG/$SENTRY_PROJECT?agent=1"
```

## Runtime Instrumentation Plan

1. Add Sentry SDK to `app/command-center`.
2. Set `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and release commit in Coolify.
3. Add server-side error capture for API routes and runtime jobs.
4. Add source-map upload/release step once build/deploy flow stabilizes.
5. Configure Hermes to query Sentry daily and post digest/incident summaries.
6. Add `/healthz` uptime monitor independent of the Hetzner host.

## Hermes Responsibilities

- Daily: summarize unresolved Sentry issues, new regressions, and deploy-adjacent errors.
- Incident: correlate Sentry issue + container health + uptime signal.
- Never: silently mutate production or mark incidents resolved without human confirmation.

## Open Questions

- Sentry org slug and project slug.
- Whether to use one Sentry project for all resources initially or separate projects for `command-center`, `agent-runtime`, and bridges.
- Whether Codex should use broad Sentry MCP first or project-constrained agent mode from day one.
