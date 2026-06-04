# server/ — the internal brain MCP server

A Deno HTTP service deployed as a **MCP container on Hetzner**. It is the **internal** side of the brain (Historian + Capture): it exposes retrieval and write tools over the client's own brain. It reaches PostgREST as `service_role` using environment secrets only — no keys in the repo.

> **Security boundary (CONVENTIONS §4):** the **Researcher** (external web retrieval) is a *separate* MCP container with **no database credentials** and is never registered here. Keep the two apart. This is what stops a malicious web page from instructing an agent to exfiltrate the brain.

## Tools

| Tool | RPC | Notes |
| --- | --- | --- |
| `brain.remember` | `upsert_thought` | writes an atom; `evidence` by default, `instruction` needs human confirmation |
| `brain.recall` | `search_thoughts_text` | full-text recall over the client's own brain (internal-only) |
| `brain.property_history` | `property_history_for` | consent-gated, anonymized cross-client property history; logs every read |

## Run / deploy

```bash
# Local (reads .env)
cd server && deno task serve            # serves on :8000

# Type-check + tests (no network; uses a mock DB)
deno task check
deno task test

# Deploy as an MCP container on Hetzner
# Create a Coolify app for server/, set env in Coolify, then redeploy from the UI
# or trigger COOLIFY_BRAIN_MCP_DEPLOY_HOOK from .env.
```

## Calling it

```bash
curl -s "$BRAIN_MCP_URL" \
  -H "x-ob-access-key: $OB_ACCESS_KEY_HISTORIAN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"brain.recall","args":{"query":"drip edge","limit":5}}'
```

Request shapes accepted: convenience `{ "tool": "...", "args": {...} }` or MCP-ish `{ "method": "tools/call", "params": { "name": "...", "arguments": {...} } }`. `{"method":"tools/list"}` returns the tool catalog.

## Files

- `index.ts` — HTTP entry: access-key auth, method routing, env wiring.
- `functions/db.ts` — PostgREST client (service_role via env).
- `functions/tools.ts` — tool catalog + dispatch (pure, unit-testable).
- `tests/smoke_test.ts` — runs offline against a mock DB.
- `deno.json` — tasks + imports.
