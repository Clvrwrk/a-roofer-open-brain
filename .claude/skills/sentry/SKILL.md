---
name: sentry
description: >
  Access and operate Sentry error monitoring for the Command Center — the
  single source of truth for the project/DSN, which token does what, how
  source maps upload, and how to read or change the Slack alert rules.
  Triggers on "sentry", "error monitoring", "session replay", "source maps",
  "sentry alert", "sentry slack alert", "sentry token", "SENTRY_AUTH_TOKEN",
  "an error on the site", "why isn't the alert firing", "sentry dsn".
  Use this BEFORE re-investigating how Sentry is wired — the answer is here.
---

# Sentry — Command Center error monitoring

Errors, performance traces, and masked session replay for **https://cc.proexteriorsus.net**
flow to Sentry. Wired 2026-06-20 for the alpha. Background in the daily log (2026-06-20).

## Where everything is

| Thing | Value |
|---|---|
| Org / project | `cleverwork` / `cc-proexteriorsus` (project id `4511599368798208`) |
| Dashboard | `https://cleverwork.sentry.io` |
| DSN (PUBLIC — safe in client bundles & source) | `https://64100fe85831a3ae8523eb6e810773af@o4511120856449024.ingest.us.sentry.io/4511599368798208` |
| Web app SDK | `@sentry/astro` — `app/command-center/astro.config.mjs` integration + `sentry.client.config.ts` + `sentry.server.config.ts` |
| Node runtimes SDK | `@sentry/node` — `app/command-center/runtime/sentry-instrument.mjs`, loaded via `node --import` (Slack runtime; nightly ABC sync) |
| Slack integration | id `443674` ("CleverWork", `mycleverwork.slack.com`); alert channel `#cc-proexteriors` (`C0BCUJV0MLY`) |
| Coolify env | `SENTRY_DSN`, `PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` (all `is_buildtime:true`) — see the `coolify` skill |

## Tokens — which one for what (the #1 gotcha)

Two different Sentry tokens exist; they are NOT interchangeable:

- **`SENTRY_AUTH_TOKEN`** — a `sntrys_…` **org auth token**, used by the Sentry Vite plugin to
  upload source maps at build time. It is **releases/source-maps scoped only** — it 403s on
  issues, alerts, and integrations. Lives in Coolify (build var) and can be created in the
  dashboard: *Settings → Auth Tokens*. Cannot be minted via API.
- **`SENTRY_PERSONAL_TOKEN`** — a personal user token in root `.env` with **full scopes**
  (incl. `alerts:write`, `org:integrations`, `project:releases`, `event:admin`). Use THIS for
  anything beyond source maps: creating/editing alert rules, reading issues, resolving issues,
  querying the Slack integration. Read it in-place into a shell var, never echo it.

All API calls: `Authorization: Bearer $TOK`, base `https://sentry.io/api/0`.

## Architecture notes

- **DSN is a public identifier, not a secret** — it ships in the client bundle by design. The
  config files use a literal-DSN fallback gated on production (`import.meta.env.PROD` /
  `NODE_ENV==='production'`), so prod telemetry works and local `astro dev` stays silent.
- **PII posture (CLAUDE.md rule 2):** `sendDefaultPii:false`; Session Replay masks all text +
  inputs and blocks media; the server `beforeSend` strips cookies + the Authorization header.
- **User context:** `src/middleware.ts` calls `Sentry.setUser({id,email})` + an `actor.type`
  tag from the resolved WorkOS actor, so each error names the affected account.
- **Source maps** upload during `astro build` only when `SENTRY_AUTH_TOKEN` reaches the Docker
  build as a build arg → that Coolify var must be `is_buildtime:true` (coolify skill). A build
  with the token creates a release on Sentry; no release = the token didn't reach the build.

## API cookbook (use `SENTRY_PERSONAL_TOKEN` unless noted)

```bash
TOK="$(readval SENTRY_PERSONAL_TOKEN .env)"   # readval helper: see the coolify skill

# Is Slack connected? (gives the integration id used in alert actions)
curl -s "https://sentry.io/api/0/organizations/cleverwork/integrations/?provider_key=slack" -H "Authorization: Bearer $TOK"

# List / create issue-alert rules for the project
curl -s "https://sentry.io/api/0/projects/cleverwork/cc-proexteriorsus/rules/" -H "Authorization: Bearer $TOK"
curl -s -X POST "https://sentry.io/api/0/projects/cleverwork/cc-proexteriorsus/rules/" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{
    "name":"New & regressed issues -> #cc-proexteriors",
    "actionMatch":"any","filterMatch":"all","frequency":30,
    "conditions":[
      {"id":"sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"},
      {"id":"sentry.rules.conditions.regression_event.RegressionEventCondition"}],
    "actions":[{"id":"sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
      "workspace":"443674","channel":"#cc-proexteriors"}]}'

# Resolve an issue
curl -s -X PUT "https://sentry.io/api/0/organizations/cleverwork/issues/<issue_id>/" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"status":"resolved"}'

# Releases (source-map check) — works with SENTRY_AUTH_TOKEN too
curl -s "https://sentry.io/api/0/projects/cleverwork/cc-proexteriorsus/releases/?per_page=5" -H "Authorization: Bearer $TOK"
```

## Verifying end-to-end

Send a test event from inside the app dir (so `@sentry/node` resolves), with a UNIQUE message
so Sentry treats it as a NEW issue (which is what the alert rule fires on):

```bash
cd app/command-center && cat > ._t.mjs <<'EOF'
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: "https://64100fe85831a3ae8523eb6e810773af@o4511120856449024.ingest.us.sentry.io/4511599368798208", environment: "production" });
Sentry.captureException(new Error("[TEST] pipeline check " + process.pid));
console.log("flushed:", await Sentry.flush(8000));
EOF
node ._t.mjs; rm -f ._t.mjs
```

Then confirm the Slack alert landed by reading `#cc-proexteriors` (`C0BCUJV0MLY`) via the Slack
MCP, and resolve the test issue afterward. The Sentry Slack app must be a member of the channel
to post.
