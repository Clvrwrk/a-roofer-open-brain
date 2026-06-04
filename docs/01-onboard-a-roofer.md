# Onboarding a Roofer — Step-by-Step Deployment Guide

> **Target:** a Cleverwork operator provisioning a fresh brain for a new roofing client.
> **Time:** under 60 minutes on a clean setup. Closer to 30 once you've done it once.
> **Outcome:** an isolated Supabase brain, all schema migrations applied, Slack bots registered, AccuLynx webhook wired, and a passing `verify-deployment.sh` run.

---

## Prerequisites

Collect these before you start. Provisioning stalls if any are missing.

| Item | Where to get it | Notes |
| --- | --- | --- |
| Supabase account (free or Pro) | [supabase.com](https://supabase.com) | One project per client; you'll create a new one in Step 3 |
| Supabase CLI installed | `brew install supabase/tap/supabase` or see [docs](https://supabase.com/docs/guides/cli) | v1.200+ |
| Coolify apps created | Coolify dashboard | `brain-mcp`, `researcher`, enabled bridge apps, and dashboard app |
| Coolify deploy hooks | Coolify app → Webhooks | Add to `.env`; use a deploy-scoped token if the hook requires auth |
| Slack workspace | client's own workspace is best; test workspace acceptable | You need workspace-admin rights to install apps |
| AccuLynx API key | AccuLynx → Settings → API (under developer options) | Required; this is the primary PM bridge |
| AccuLynx webhook secret | same settings page; set your own random string | You'll register the endpoint URL in Step 8 |
| `yq`, `psql`, Deno | local package manager | `new-client.sh` reads YAML, applies SQL, and runs smoke checks |
| Node 20+ | `node --version` | For dashboard builds if dashboard assets are present |
| `git` | standard | |

Optional (enable per `roofer.config.yaml` once basics are running):

- CompanyCam API key
- EagleView API key
- QuickBooks credentials
- Granola or Fireflies API key (meeting capture / debrief transcription)

---

## Step 1 — Clone the repo

```bash
git clone <this-repo-url> <client-slug>-brain
cd <client-slug>-brain
```

Replace `<client-slug>` with a short identifier for the client (e.g. `apex-roofing`). This becomes the directory you work from for every provisioning task.

---

## Step 2 — Copy and fill the config files

```bash
cp config/roofer.config.example.yaml config/roofer.config.yaml
cp config/.env.example .env
```

Open both files in your editor. Work through them in this order:

### `config/roofer.config.yaml` — the keys that matter most

**Company block** — Fill `company.name`, `company.dba`, `company.license_no`, `company.phone`, `company.website`, and `company.service_area`. These seed the regulatory lookups and the consent onboarding copy the client will see.

**Jurisdictions** — Add every city or county the client pulls permits in. Each entry needs `name`, `ahj` (the authority having jurisdiction), `building_code` (e.g. `IRC-2021 + local amendments`), and `wind_zone`. These seed the `regulatory_snapshot` table that era-stamps every atom captured in that jurisdiction. Wrong code version here means wrong era stamps for years; spend 5 minutes getting this right.

**Manufacturers** — List every certification the client holds (GAF Master Elite, Owens Corning Platinum Preferred, CertainTeed SELECT ShingleMaster). These enable the warranty-registration tracking and EEAT cert-badge features. Leaving this empty does not break anything but wastes a key differentiator.

**Agents** — For a first deployment, leave the defaults: `ops` and `sales` enabled, others disabled. Add agents through the A3 gate as the engagement matures. The infrastructure horizontal agents (`capture`, `historian`, `conductor`, `auditor`) are always on regardless of this config.

**Integrations** — Keep `gohighlevel.enabled: true` if the client uses GHL for front-of-funnel CRM. Set `acculynx.enabled: true` and `acculynx.webhook: true` for production PM. Toggle `companycam.enabled: true` only if the client uses CompanyCam. Leave everything else disabled for the first deployment.

**Consent** — Discuss `consent.cross_client_default` with the client during onboarding. The default is `opt_in`. If the client wants to start conservative, set `opt_out` — they can change it later. This choice lives in the config and can be updated any time; it takes effect on the next brain sync.

**Deployment** — Leave `profile: remote`. Fill `runtime.*_url` after the Coolify apps exist. Fill in `remote.region` if you have a preference (default `us-west`). The `supabase_project_ref` field can stay blank until the Supabase project exists.

**Model tiers** — Leave the defaults for now. See [`docs/05-model-matrix.md`](05-model-matrix.md) for the full matrix and how to tune.

### `.env` — secrets

Fill in every key for the integrations you enabled. The file has clear labels. For keys you are not using yet, leave them as `__set_me__` — the scripts only validate the keys for enabled integrations.

**Never commit `.env` to git.** It is in `.gitignore` already. Keep your real `.env` in a password manager. Production runtime secrets live in Coolify app env or a vault; `.env` is only the local provisioning inventory.

---

## Step 3 — Provision the brain (`scripts/new-client.sh`)

```bash
./scripts/new-client.sh
```

This script does the following in order:

1. **Reads `config/roofer.config.yaml`** and validates required fields.
2. **Creates or links a dedicated Supabase project.** If `supabase_project_ref` is filled, it links to that project. If blank, it creates a project and asks you to copy the new ref into the config.
3. **Applies all schema migrations** in the order defined in `schemas/README.md` (see Step 4 for the manual override).
4. **Triggers configured Coolify deploy hooks** for `brain-mcp`, `researcher`, and enabled bridge containers.
5. **Checks the runtime env inventory** and reminds you which secrets must live in Coolify.
6. **Lists enabled Slack bots and bridges** so you can complete the manual OAuth/webhook steps.
7. **Deploys the dashboard if enabled.** If dashboard assets are missing, the script fails loudly instead of pretending a dashboard exists.

If the script fails partway through, re-running it is safe — every step is idempotent.

**Prerequisites for this script:**
- `SUPABASE_ORG_ID` in `.env` if the script will create a project.
- `SUPABASE_DB_URL` in `.env` so `psql` can apply migrations.
- `COOLIFY_*_DEPLOY_HOOK` values in `.env` if you want the script to trigger deployments. If hooks are blank, create/deploy the apps manually in Coolify.

---

## Step 4 — Apply schema (manual override / verification)

The `new-client.sh` script applies migrations automatically. If you need to apply manually, or if you want to verify the state, follow the order from `schemas/README.md`:

```bash
# First: the OB1 spine (vendored; do not edit)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/ob1-base/00-core-thoughts.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/ob1-base/enhanced-thoughts.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/ob1-base/provenance-chains.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/ob1-base/typed-reasoning-edges.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/ob1-base/agent-memory.sql

# Then: the Cleverwork roofer extensions
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/10-property-jurisdiction.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/20-client-job-crew.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/30-insurance-warranty.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/40-atom-extensions.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/50-consent-access-log.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f schemas/cleverwork-roofer/60-tighten-grants.sql
```

Order matters. The roofer extensions add foreign keys that depend on tables the OB1 spine creates. Every file is idempotent — safe to re-push if you are unsure of the current state.

After pushing, verify RLS:

```bash
psql "$SUPABASE_DB_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

Every table should show `rowsecurity = true`. If any are `false`, see [TROUBLESHOOTING.md — RLS permission denied](TROUBLESHOOTING.md).

---

## Step 5 — Register Slack app

The v1 Slack setup uses one primary app per client brain, with logical agent routing inside the app. For Pro Exteriors the manifest lives at `deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml`.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**.
2. Select the client's workspace.
3. Paste the contents of the client manifest.
4. Review OAuth scopes (the manifest sets these for you; do not reduce them or the bots will be missing permissions).
5. Click **Install to Workspace** → authorize.
6. Copy the **Bot User OAuth Token** (`xoxb-...`) → paste into `.env` as `SLACK_BOT_TOKEN`.
7. Copy the **Signing Secret** from Basic Information → paste into `.env` as `SLACK_SIGNING_SECRET`.
8. If using Socket Mode (recommended for the first deployment), copy the **App-Level Token** (`xapp-...`) → paste as `SLACK_APP_TOKEN`.

Slack manifests define a single bot user. In v1 that bot is `@ob-conductor`; the vertical handles (`@ob-ops`, `@ob-sales`, `@ob-accounting`, `@ob-marketing`, `@ob-exec`) are logical routing labels inside the app and in review packets. If a client later needs distinct mentionable bot users for each vertical agent, create one Slack app per bot user and point each app at the same agent backend with a fixed `agent_role`.

After registration, create the client channels in the channel plan and invite `@ob-conductor` to the channels it needs:

```
/invite @ob-conductor
```

Store the resulting channel IDs in Coolify env; do not rely on channel names at runtime.

---

## Step 6 — Store runtime secrets in Coolify / vault

The `.env` file on your laptop is fine for initial setup, but production secrets belong in Coolify app env or a password-manager-backed vault, not on a developer machine.

Set `brain-mcp` env to include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OB_ACCESS_KEY_HISTORIAN`, embeddings keys, Slack keys if that app posts to Slack, and any enabled bridge keys it directly needs.

Set `researcher` env separately. It must have only external-retrieval keys and `OB_ACCESS_KEY_RESEARCHER`; never give it `SUPABASE_SERVICE_ROLE_KEY`.

Set the dashboard env to `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` only. Never give the dashboard the service-role key.

Once secrets are set in Coolify/vault, remove them from your local `.env` or leave only placeholders.

---

## Step 7 — Wire the AccuLynx webhook

AccuLynx fires a webhook when job status changes (including the `closed` event that triggers the post-op debrief). Wire it to the MCP container receiver:

1. In AccuLynx → Settings → API → Webhooks, click **Add Webhook**.
2. Set the **Endpoint URL** to your bridge container URL from `.env`: `$ACCULYNX_BRIDGE_URL`.
3. Set the **Secret** to the value you set for `ACCULYNX_WEBHOOK_SECRET` in your vault / Coolify bridge env.
4. Select events: **Job Status Changed**, **Job Closed**, **Job Created** at minimum.
5. Save. AccuLynx will send a test ping; the MCP container will validate the signature and return `200`.

Verify by checking the `acculynx-bridge` Coolify logs.

You should see the test event logged with `event_type: webhook_ping, status: acknowledged`.

If the webhook is not firing, see [TROUBLESHOOTING.md — AccuLynx webhook not firing](TROUBLESHOOTING.md).

---

## Step 8 — Run verify-deployment.sh

```bash
./scripts/verify-deployment.sh
```

This smoke test checks:

- Required local env names are present.
- `.env` is not tracked by git and no obvious secret-shaped strings are in tracked files.
- Required schema tables exist with RLS enabled, if `psql` and `SUPABASE_DB_URL` are available.
- The Deno server smoke tests pass, if Deno is installed.
- `BRAIN_MCP_URL` responds to `tools/list`, if configured.
- `DASHBOARD_URL` returns `200`, if configured.

A passing run prints:

```
== summary: 12 passed, 0 warnings, 0 failed ==
go-live gate: CLEAR
```

If anything fails, the script prints the failing check and points to the relevant TROUBLESHOOTING section.

---

## Step 9 — First debrief dry run

Before handing the client their first live debrief, run a dry run internally to confirm the full debrief-to-atom pipeline works end to end.

1. In AccuLynx, create a test job and move it to `Closed`.
2. Confirm the webhook fires: check the `acculynx-bridge` Coolify logs for a `job.closed` event.
3. Confirm Conductor receives the event and sends a debrief-scheduling message to Slack.
4. Run a simulated debrief using the script in [`docs/02-debrief-script.md`](02-debrief-script.md) — you and another Cleverwork team member play the roles of PM and client.
5. After the simulated debrief, confirm atoms appear in Supabase: `SELECT count(*) FROM public.thoughts WHERE job_id = '<test-job-id>';` — should return > 0 within a few minutes of Capture processing the transcript.
6. Delete the test job and its atoms before handing off to the client.

---

## Pre-launch Checklist

Work through this before the client's first real job hits the brain.

### Configuration
- [ ] `config/roofer.config.yaml` — company name, license, service area filled
- [ ] Jurisdictions populated with correct building codes and wind zones
- [ ] Manufacturer certifications listed
- [ ] Enabled agents match the Phase 1 scope (ops + sales at minimum)
- [ ] `consent.cross_client_default` discussed and confirmed with client
- [ ] `.env` — all enabled-integration keys filled with real values

### Infrastructure
- [ ] Supabase project created and `supabase_project_ref` in config
- [ ] All 11 schema migrations applied in order (5 OB1 + 6 roofer)
- [ ] `SELECT rowsecurity = true` for all `public.*` tables
- [ ] Runtime secrets stored in Coolify app env / vault (not only on laptop)
- [ ] `brain-mcp`, `researcher`, and enabled bridge containers deployed and responding
- [ ] Coolify dashboard deployed and returning `200`

### Integrations
- [ ] Slack bots registered and invited to working channels
- [ ] `@ob-ops` and `@ob-sales` respond to test mentions
- [ ] AccuLynx webhook wired and receiving events
- [ ] AccuLynx bridge `job.closed` event confirmed end-to-end

### Quality gates
- [ ] `verify-deployment.sh` passes all checks
- [ ] First debrief dry run completed
- [ ] Client onboarding checklist delivered (consent explanation, Slack handles, debrief cadence)
- [ ] Backup encryption key set and first backup verified restorable

---

## What comes next

Once the brain is live, the first month is about building the capture rhythm:

- Every closed AccuLynx job triggers a debrief. Run every one.
- After 3–4 debriefs, Conductor will have enough patterns to start a useful daily digest.
- After 30 days, schedule the first Kaizen review (`scripts/kaizen-review.sh`) to check atom quality and volume.
- Any new skill proposals from Innovator go through the A3 gate in `proposals/`. See [`docs/CUSTOMIZATION.md`](CUSTOMIZATION.md).

For troubleshooting anything, start at [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
