# Agent Onboarding Automation Assessment — v2
# Human-in-the-Loop Reduction Plan

> **Status:** v2.0 — incorporates GHL CLI capability review
> **Date:** 2026-06-25
> **Impact:** Reduces human tasks per agent onboarding from ~8 → ~2 (one-time setup → ~0)

---

## TL;DR

Every platform used in agent onboarding has an automatable API path.
After a **single one-time setup** (4 human tasks, ~25 min total), all future agent onboardings run with **zero human steps** as a script:

```bash
./scripts/onboard-agent.sh maya-chen
```

---

## Full task inventory — current vs automated

| Phase | Task | Human effort | API / automation path | Status |
|---|---|---|---|---|
| 2 | Read OpenRouter/API keys for agent | Manual lookup | Parse `Agent Credentials.xlsx` | ✅ Already doable |
| 3 | Create Kasm user account | Browser admin UI | Kasm REST `POST /api/v2/user` | 🟠 Need Kasm admin API key |
| 3 | Set Kasm password = GW password | DB script | Script exists, fully automated | ✅ Done |
| 3 | Launch Kasm desktop session | Browser UI | Kasm REST `POST /api/v2/kasm` | 🟠 Same Kasm API key |
| 4 | WorkOS password vault transfer | Manual | WorkOS Mgmt API + local vault file | 🟡 Low effort |
| 5a | Create Google Service Account | Cloud Console browser | `gcloud` CLI — headless | 🟠 One-time `gcloud auth login` |
| 5b | Disable/re-enable org policy | Console browser | `gcloud org-policies reset` | 🟠 Same `gcloud` auth |
| 5c | Enable Gmail/Drive/Sheets APIs | Console browser | `gcloud services enable` | 🟠 Same `gcloud` auth |
| 5d | Configure domain-wide delegation | Workspace Admin browser | Google Admin SDK REST API | 🔴 Needs admin OAuth (doable) |
| 7 | Create Slack app | api.slack.com browser | Slack Manifest API `apps.manifest.create` | 🟠 One-time config token |
| 7 | Install Slack app to workspace | Browser OAuth | Internal apps install via config token | 🟠 Same config token |
| 7 | Invite bot to channels | `/invite` in Slack UI | `channels:join` scope → self-join | ✅ Add scope to template |
| 8 | Add service token to Coolify | Coolify dashboard | Coolify REST `PATCH /api/v1/applications/{uuid}/envs` | ✅ `COOLIFY_PE_OPEN_BRAIN_API_KEY` works |
| 10 | Configure GHL intake webhook/workflow | GHL dashboard browser | **GHL CLI internal API** — creates full workflows | ✅ GHL CLI is installed and works |

---

## One-time human setup (do once, never repeat)

These 4 tasks remove ALL future human steps. Total time: ~25 minutes.

---

### Setup 1 — Kasm Admin API Key (~5 min)

1. Open `https://desktops.proexteriorsus.net` → log in as admin
2. Navigate to **Admin panel → Access Management → API Configs**
3. Click **Generate API Key**
4. Copy the **API Key** and **API Key Secret**
5. Add to `.env`:
   ```bash
   KASM_API_BASE=https://desktops.proexteriorsus.net
   KASM_API_KEY=<key>
   KASM_API_KEY_SECRET=<secret>
   ```

**What this unlocks:** Creating Kasm users, launching persistent desktop sessions, managing sessions — all without touching the admin UI.

---

### Setup 2 — Slack App Configuration Token (~5 min)

1. Go to `https://api.slack.com/apps`
2. Click any existing app (or create a throwaway one for this purpose)
3. Scroll to **Basic Information → App-Level Tokens** → **Generate Token and Scopes**
4. Token name: `hermes-manifest-config`
5. Add scopes: `apps.manifest:read`, `apps.manifest:write`
6. Click **Generate** → copy the token (starts with `xoxe.xoxp-...`)
7. Add to `.env`:
   ```bash
   SLACK_APP_CONFIG_TOKEN=<xoxe.xoxp-...>
   SLACK_TEAM_ID=T0B8QEGPVQW
   ```

**What this unlocks:** Creating new Slack apps from a manifest, updating scopes, retrieving credentials — all headlessly. Every future agent gets a Slack bot in seconds.

---

### Setup 3 — gcloud one-time auth (~5 min)

```bash
# 1. Install gcloud if not present (one-time, macOS)
brew install --cask google-cloud-sdk

# 2. Authenticate (opens browser ONCE — then token-based forever)
gcloud auth login
gcloud auth application-default login

# 3. Set the Pro Exteriors project
gcloud config set project custom-frame-500419-s3

# 4. Get the org ID
gcloud organizations list --format="value(name)"

# 5. Add to .env:
# GOOGLE_CLOUD_PROJECT=custom-frame-500419-s3
# GOOGLE_CLOUD_ORG_ID=<org_id from above>
```

**What this unlocks:** Creating service accounts, downloading keys, enabling APIs, disabling/re-enabling the org policy — all headlessly. Service account creation for every future agent takes 10 seconds.

---

### Setup 4 — GHL Firebase token (one-time, renew ~monthly)

The GHL CLI already has a Chrome extension that grabs this token. It's installed at:
`/Volumes/M4 Application SSD/AI Consulting Research/GHL - Claude CLI/chrome-extension/`

1. In Chrome → `chrome://extensions/` → Enable Developer Mode
2. Click **Load unpacked** → select the `chrome-extension/` folder
3. Open `app.gohighlevel.com` while logged in
4. Click the extension icon → **Grab Refresh Token** → Copy
5. Add to `.env`:
   ```bash
   GHL_FIREBASE_REFRESH_TOKEN=<refresh_token>
   ```

This token lasts ~months and auto-refreshes in the CLI. When it expires, repeat steps 3-5 (< 1 min).

**What this unlocks:** Creating GHL workflows from code — intake automations, webhook triggers, email sequences, anything the GHL UI can do.

---

## The automation script: `scripts/onboard-agent.py`

After the one-time setup, onboarding a new agent is:

```bash
# From repo root
python scripts/onboard-agent.py maya-chen

# Or for any agent:
python scripts/onboard-agent.py alex-rivers
python scripts/onboard-agent.py casey-morgan
```

### What the script does in sequence

```
1. Read agent identity + credentials from Agent Credentials.xlsx
   └── email, GW password, OpenRouter key, Slack tokens, etc.

2. Verify prerequisites
   ├── SSH to pe-ob-agents — check Hermes version, Kasm image
   ├── Command Center /healthz — must be green
   └── All required env vars present (fail fast with clear error)

3. Kasm setup (Kasm REST API)
   ├── Check if user exists: GET /api/v2/users
   ├── Create if not: POST /api/v2/user
   ├── Set password = GW password (DB update via SSH)
   └── Request desktop session: POST /api/v2/kasm (image_id = 2c589484-...)

4. Agent host files (SSH)
   ├── mkdir -p /opt/openbrain/agents/<agent-id>/
   ├── Write .hermes/.env (from credentials + repo-root .env)
   ├── Write SOUL.md (from agent persona docs + template)
   ├── Write config.yaml
   └── chown -R 1000:1000 /mnt/kasm_profiles/<email>/

5. Google Service Account (gcloud CLI)
   ├── Check if SA exists: gcloud iam service-accounts list
   ├── Enable APIs: gcloud services enable gmail.googleapis.com drive.googleapis.com sheets.googleapis.com
   ├── Temporarily disable org policy
   ├── Create SA + download key: gcloud iam service-accounts keys create
   ├── Re-enable org policy
   └── SCP key to agent host: /opt/openbrain/agents/<id>/google-service-account.json

6. (Optional) Domain-wide delegation
   └── Skip if SA + delegation already configured (it's shared across all agents)

7. Slack bot (Slack Manifest API)
   ├── POST apps.manifest.create with agent-specific manifest
   ├── Extract app_id, bot_user_id, credentials
   ├── channels.join for all 3 accounting channels (channels:join scope)
   └── chat.postMessage: "{Agent} online" to #accounting-vendor-intake

8. Supabase service token (Coolify REST API)
   ├── Generate: openssl rand -hex 32
   ├── PATCH /api/v1/applications/{cc_uuid}/envs — update AGENT_SERVICE_TOKENS
   ├── POST /api/v1/deploy?uuid={cc_uuid} — trigger redeploy
   └── Wait for /healthz to show new buildCommit

9. GHL intake workflow (GHL CLI)
   ├── Check if workflow exists: ghl --json workflows list | grep <agent-name>
   ├── If not: build intake webhook workflow via internal API
   │   └── Trigger: inbound_webhook (fires when email arrives)
   │       Action: custom_webhook → POST to cc.proexteriorsus.net/api/agent/intake
   └── Verify webhook endpoint responds

10. E2E validation
    ├── Send test email to agent's alias addresses
    ├── Verify Gmail API receives it (in:anywhere)
    ├── POST /api/agent/intake via service token
    ├── Verify dashboard_work_items row created
    └── Verify Slack notification posted

11. Report
    ├── Post onboarding summary to #ob-agent-audit-log
    └── Write docs/handoffs/<agent>-onboarding-complete.md
```

---

## API specifications for the new automation

### Kasm REST API

```python
import json, urllib.request, os

KASM_BASE = os.getenv("KASM_API_BASE", "https://desktops.proexteriorsus.net")

def kasm_request(path, payload):
    """All Kasm API calls are POST with api_key_secret in the body."""
    req = urllib.request.Request(
        f"{KASM_BASE}/api/v2/{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def kasm_admin_call(path, data=None):
    payload = {
        "api_key": os.getenv("KASM_API_KEY"),
        "api_key_secret": os.getenv("KASM_API_KEY_SECRET"),
        **(data or {}),
    }
    return kasm_request(path, payload)

# Create user
def create_kasm_user(email, password, first_name, last_name):
    return kasm_admin_call("user", {
        "target_user": {
            "username": email,
            "password": password,
            "first_name": first_name,
            "last_name": last_name,
            "locked": False,
            "disabled": False,
        }
    })

# Request a desktop session
def request_kasm_session(user_id, image_id="2c589484-3521-41fc-bec6-ac785ae87dd7"):
    return kasm_admin_call("kasm", {
        "user_id": user_id,
        "image_id": image_id,
        "enable_sharing": False,
    })
```

### Slack Manifest API

```python
import json, urllib.request, os

def slack_config_call(method, payload):
    req = urllib.request.Request(
        f"https://slack.com/api/{method}",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {os.getenv('SLACK_APP_CONFIG_TOKEN')}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    if not data.get("ok"):
        raise RuntimeError(f"Slack API error: {data.get('error')} — {data}")
    return data

def create_slack_app(agent_name, agent_role):
    """Create a new Slack app for an agent via the Manifest API."""
    manifest = {
        "display_information": {
            "name": f"{agent_name} ({agent_role})",
            "description": f"Open Brain agent: {agent_role}",
            "background_color": "#11133f",
        },
        "features": {
            "bot_user": {
                "display_name": agent_name,
                "always_online": True,
            }
        },
        "oauth_config": {
            "scopes": {
                "bot": [
                    "chat:write",
                    "channels:read",
                    "channels:history",
                    "channels:join",   # self-join without manual invite
                    "files:read",
                    "files:write",
                    "app_mentions:read",
                ]
            }
        },
        "settings": {
            "event_subscriptions": {
                "bot_events": ["message.channels", "app_mention"]
            },
            "socket_mode_enabled": True,
            "org_deploy_enabled": False,
            "token_rotation_enabled": False,
            "interactivity": {"is_enabled": False},
        },
    }
    result = slack_config_call("apps.manifest.create", {
        "manifest": manifest,
        "team_id": os.getenv("SLACK_TEAM_ID", "T0B8QEGPVQW"),
    })
    # result contains: app_id, credentials{client_id, client_secret, verification_token, signing_secret}
    # Note: bot_token (xoxb-) requires workspace install — see next function
    return result

def get_slack_oauth_token(app_id):
    """After manifest create, install the app to the workspace and get tokens."""
    # For internal workspace apps, oauth.v2.access with the app's credentials
    # This requires the app's client_id + client_secret + a redirect
    # Alternative: use the app's install URL from apps.manifest.create response
    # For now: log the install URL for Chris to click once
    pass
```

**Note on Slack bot token acquisition:** The `apps.manifest.create` endpoint creates the app and returns credentials, but getting the `xoxb-` bot token still requires one OAuth install step. This can be done:
1. Programmatically if the app is "internal" and you have admin OAuth scope  
2. Via a 1-click URL the script generates and outputs for Chris to click

The script will generate the install URL. Chris clicks it once per new agent. This reduces the task from "build an app from scratch in the browser" to "click this URL."

### Coolify REST API

Already working. Confirmed endpoints:

```bash
COOLIFY_BASE="http://5.78.124.10:8000"
CC_UUID="og0rmt02rff8qti9nlfk3nr7"

# List current env vars
curl -s -H "Authorization: Bearer *** "$COOLIFY_BASE/api/v1/applications/$CC_UUID/envs"

# Upsert a single env var
curl -s -X POST \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"key":"AGENT_SERVICE_TOKENS","value":"ob-accounting:tok1,ob-ops:tok2","is_preview":false}' \
  "$COOLIFY_BASE/api/v1/applications/$CC_UUID/envs"

# Trigger redeploy
curl -s -H "Authorization: Bearer *** \
  "$COOLIFY_BASE/api/v1/deploy?uuid=$CC_UUID"
```

### GHL CLI — workflow creation

The GHL CLI (`/Volumes/M4 Application SSD/AI Consulting Research/GHL - Claude CLI`) is already installed and has the internal API access needed to **create workflows from code**.

```python
import sys
sys.path.insert(0, "/Volumes/M4 Application SSD/AI Consulting Research/GHL - Claude CLI")

from cli_anything.gohighlevel.utils.ghl_internal_client import TokenManager, InternalGHLClient
from cli_anything.gohighlevel.utils.workflow_builder import WorkflowBuilder

# Create Maya's intake webhook workflow
def create_maya_intake_workflow(location_id, intake_url):
    client = InternalGHLClient(TokenManager(), location_id)
    builder = WorkflowBuilder(client, location_id)
    
    # Trigger: inbound_webhook (fires when email arrives via GHL)
    # Action: custom_webhook → POST to /api/agent/intake
    workflow = builder.create_workflow(
        name="Maya Chen — Invoice Intake Webhook",
        trigger={"type": "contact_tag", "tag": "maya-intake-trigger"},  # or inbound_webhook
        steps=[
            {
                "type": "custom_webhook",
                "name": "Notify Maya intake API",
                "attributes": {
                    "url": intake_url,
                    "method": "POST",
                    "headers": [{"key": "Content-Type", "value": "application/json"}],
                    "body": '{"source":"ghl","locationId":"{{location.id}}","contactId":"{{contact.id}}"}',
                }
            }
        ]
    )
    return workflow
```

### gcloud CLI (headless)

```bash
PROJECT="custom-frame-500419-s3"
SA_NAME="openbrain-agent-service"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
ORG_ID=$(gcloud organizations list --format="value(name)" | sed 's/organizations\///')

# Enable APIs (idempotent)
gcloud services enable gmail.googleapis.com drive.googleapis.com sheets.googleapis.com \
  --project=$PROJECT --quiet

# Temporarily lift the org policy
gcloud org-policies reset constraints/iam.disableServiceAccountKeyCreation \
  --organization=$ORG_ID

# Create SA if not exists
gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT 2>/dev/null || \
gcloud iam service-accounts create $SA_NAME \
  --project=$PROJECT \
  --display-name="Open Brain Agent Service Account" --quiet

# Download JSON key (to /tmp — never to git)
gcloud iam service-accounts keys create /tmp/google-service-account.json \
  --iam-account=$SA_EMAIL --project=$PROJECT

# SCP to agent host
scp -i ~/.ssh/a_roofers_open_brain_ed25519 \
  /tmp/google-service-account.json \
  root@5.78.146.161:/opt/openbrain/agents/google-service-account.json
rm /tmp/google-service-account.json

# Re-enable org policy
gcloud resource-manager org-policies enable-enforce \
  constraints/iam.disableServiceAccountKeyCreation --organization=$ORG_ID
```

---

## What permanently stays human (and why)

| Task | Why it permanently stays human |
|---|---|
| Slack bot OAuth install (click one URL) | OAuth install requires a human to grant workspace permissions — this is a security boundary by design. The script generates the URL and outputs it. |
| First `gcloud auth login` (one-time) | Google requires a human to consent to delegated access once. After that: token-based forever. |
| GHL Firebase token renewal (~monthly) | Firebase session token, ~1 min to refresh via Chrome extension |
| Review onboarding summary before agent goes live | This is intentional: a human confirms the agent is ready, checks audit log, and announces the agent to the team. |

**New average human effort per agent:** ~1 min (Slack install URL click) + read the summary.

---

## `.env` additions needed

Add these to `config/.env.example` and to the Coolify agent host env:

```bash
# Kasm Workspaces admin API (for headless user/session creation)
KASM_API_BASE=https://desktops.proexteriorsus.net
KASM_API_KEY=__set_me__
KASM_API_KEY_SECRET=__set_me__

# Slack app configuration token (for headless app creation via Manifest API)
# Generate: api.slack.com → any app → Basic Info → App-Level Tokens → Generate
# Required scopes: apps.manifest:read, apps.manifest:write
SLACK_APP_CONFIG_TOKEN=__set_me__   # xoxe.xoxp-...

# Google Cloud project info (for headless SA + API management)
GOOGLE_CLOUD_PROJECT=custom-frame-500419-s3
GOOGLE_CLOUD_ORG_ID=__set_me__   # gcloud organizations list --format="value(name)"

# GHL internal API (Firebase token for workflow creation)
# Get via: chrome-extension in GHL - Claude CLI / Grab Refresh Token
GHL_FIREBASE_REFRESH_TOKEN=__set_me__
GHL_FIREBASE_TOKEN=__set_me__   # optional: short-lived JWT if refresh unavailable
```

---

## Implementation priority

| Priority | Item | Effort | Unlocks |
|---|---|---|---|
| **P0 — do first** | Kasm API key setup | 5 min | Headless desktop creation for Alex, Casey, Lena, Rowan, Sam |
| **P0 — do first** | Slack config token setup | 5 min | Headless Slack bot creation for all future agents |
| **P1** | Build `scripts/onboard-agent.py` | 2-3 hrs | Full automated onboarding pipeline |
| **P1** | gcloud one-time auth | 5 min | Headless SA creation |
| **P2** | GHL Firebase token in .env | 1 min | Headless workflow creation |
| **P3** | Google DWD via Admin SDK | Research needed | Full end-to-end (currently DWD is shared — low urgency) |
