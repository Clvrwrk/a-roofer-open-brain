---
name: coolify
description: >
  Access and operate the Coolify deploy host for the Command Center —
  the single source of truth for where Coolify lives, where its
  credentials are, and how to set env vars, redeploy, check status, and
  verify a deploy via the API. Triggers on "coolify", "coolify password",
  "coolify login", "deploy the command center", "redeploy", "set an env
  var on prod", "add ABC_SUPPLY (or any) env var to Coolify", "trigger a
  deploy", "is the deploy done", "webhook", "cc.proexteriorsus.net deploy".
  Use this BEFORE re-investigating Coolify access — the answer is here.
---

# Coolify — Command Center deploy host

The Command Center deploys to **https://cc.proexteriorsus.net** via Coolify. This skill is
the canonical access + ops reference so we never re-discover it. Full background:
`docs/27-hetzner-coolify-agent-host.md`.

## Where everything is

| Thing | Value |
|---|---|
| Coolify dashboard (public HTTPS) | `https://coolify.proexteriorsus.net` |
| Coolify admin (firewalled to admin IPs) | `http://5.78.124.10:8000` |
| API base | `https://coolify.proexteriorsus.net/api/v1` |
| App | `command-center`, **uuid `og0rmt02rff8qti9nlfk3nr7`**, deploys from `main`, fqdn `cc.proexteriorsus.net` |
| GitHub source | `Clvrwrk/a-roofer-open-brain`; push to `main` auto-deploys (webhook → Coolify builds `app/command-center/Dockerfile`) |

## Credentials — READ THIS FIRST

**The Coolify creds are in `.env.agent-passwords` (repo root), NOT root `.env`.** This is the
#1 thing that wastes time — root `.env` returns empty for `COOLIFY_PE_OPEN_BRAIN_API_KEY`.
Keys: `COOLIFY_PE_OPEN_BRAIN_API_KEY` (API bearer token), `COOLIFY_USER_EMAIL`,
`COOLIFY_PASSWORD` (dashboard login).

### Secret-handling rules (non-negotiable)
- **Never print a Coolify (or any) secret value into the chat transcript.** The auto-mode
  classifier blocks "scan a credential store → surface the secret" as a leak — correctly.
- If the user asks for the **password/login**: do NOT paste it. Point them to their own file
  (`.env.agent-passwords`) to read it themselves, AND offer to perform the operation via the
  API instead (below) so nobody handles the secret.
- To USE the key: read it **in-place into a shell variable, never echoed**. This is allowed
  (it's an ops action, not surfacing the secret). Helper:
  ```bash
  readval(){ grep -E "^#? *$1=" "$2" 2>/dev/null | head -1 | sed -E "s/^#? *[^=]+=//" | tr -d "\"'" | xargs; }
  KEY="$(readval COOLIFY_PE_OPEN_BRAIN_API_KEY .env.agent-passwords)"
  ```
- A **stage-2 classifier error** ("usually transient — retrying often succeeds") on an API
  call is transient — just retry the same command once.

## API cookbook

All calls: header `Authorization: Bearer $KEY`. `UUID=og0rmt02rff8qti9nlfk3nr7`,
`BASE=https://coolify.proexteriorsus.net/api/v1`.

```bash
# Auth check / app info
curl -s -H "Authorization: Bearer $KEY" "$BASE/applications/$UUID"          # → name, git_branch, fqdn

# List env vars (print KEY NAMES only; never dump values)
curl -s -H "Authorization: Bearer $KEY" "$BASE/applications/$UUID/envs"

# Create an env var — MINIMAL body only. Extra fields (is_literal, is_build_time, …) → HTTP 422.
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"key":"FOO","value":"<value>"}' "$BASE/applications/$UUID/envs"     # → {"uuid":...}
# Update an existing key: PATCH "$BASE/applications/$UUID/envs" with {"key","value"}.

# Redeploy (apply new env / ship a build)
curl -s -H "Authorization: Bearer $KEY" "$BASE/deploy?uuid=$UUID"            # → {deployments:[{deployment_uuid}]}

# Poll a deployment to completion
curl -s -H "Authorization: Bearer $KEY" "$BASE/deployments/<deployment_uuid>"  # status: in_progress → finished
```

### Set env var(s) + redeploy + verify — the standard play
1. Source `$KEY` from `.env.agent-passwords` (in-place), source any secret values from their
   real home (e.g. `ABC_SUPPLY_*` from root `.env`) — never echo.
2. `POST …/envs` with `{key,value}` per var; confirm by re-listing keys (names only).
3. `GET …/deploy?uuid=$UUID`; poll `…/deployments/<uuid>` until `finished`.
4. Verify: `curl -s https://cc.proexteriorsus.net/healthz` → expect `status:ok` + the right
   `buildCommit` (env-only changes don't change `buildCommit`; code deploys do).

## Deploying code (vs env)

- **Normal:** `git push origin main` → GitHub webhook → Coolify auto-builds. Then verify
  `/healthz` `buildCommit` matches your pushed short SHA. (Webhook id `643407023`; if pushes
  ever stop deploying, the webhook is the first suspect — see `docs/27`.)
- **Manual** (non-`main` ref, or webhook down): `GET …/deploy?uuid=$UUID` as above.
- Keep dev↔main aligned: this repo's deploy contract (CLAUDE.md rule 11) says `origin/main`
  is the only thing that deploys; converge feature branches into it and push.

## Healthz reference
`GET https://cc.proexteriorsus.net/healthz` → `{ status, buildCommit, supabaseConfigured,
workOsConfigured, liveSurfaceStatus, … }`. `buildCommit` = the deployed git SHA.
