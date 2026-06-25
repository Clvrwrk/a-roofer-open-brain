# Handoff — Agent onboarding automation complete · deploy-agent skill ready · 7 agent profiles validated

## ⚠️ Stormwatch Pause Notice (still active)

Stormwatch/property-layer implementation is intentionally paused. Do not deploy Stormwatch pipeline changes until Reonomy partnership terms are finalized and the property layer is validated end-to-end with production-grade data quality checks.

---

## 2026-06-25 Session — Agent Automation & Profile System

**Branch:** `main` · **HEAD:** `76f79a5` · **CC live:** `https://cc.proexteriorsus.net`

### ✅ What shipped (live + committed)

#### Agent Onboarding Automation — All 4 One-Time Setups Complete
All future agent deployments run with zero human steps after these setups:

1. **Kasm API key** — `KASM_API_KEY` + `KASM_API_KEY_SECRET` in `.env`. Path is `/api/admin/` (NOT `/api/v2/`). Key requires DB permission grant (`permission_id=200`, Administrators group) after creation.
2. **Slack config token** — `SLACK_APP_CONFIG_TOKEN` (xoxe.xoxp-) + `SLACK_APP_CONFIG_REFRESH_TOKEN` (xoxe-1-). Account-level token from `api.slack.com/authentication/config-tokens` (NOT app-level xapp- token).
3. **gcloud auth** — `gcloud auth login` + `gcloud auth application-default login` (BOTH required). Project `custom-frame-500419-s3`, org `686389385048`. Org policy `iam.disableServiceAccountKeyCreation` is permanently lifted.
4. **GHL Firebase token** — `GHL_FIREBASE_REFRESH_TOKEN` (546 chars). Via Chrome extension in `GHL - Claude CLI/chrome-extension/`. Firebase API key baked into source, not env — must extract via Path().read_text().

**Verify**: `python3 ~/.hermes/skills/autonomous-ai-agents/open-brain-agent-onboarding/scripts/verify-automation-setups.py` → 4/4 ✅

#### Agent Profile System (commit `76f79a5`)
- `agents/profiles/_schema.yaml` — 58 fields, 44 required, 10 validation rules
- 7 agent profiles: maya-chen, alex-rivers, casey-morgan, jordan-price, sam-torres, rowan-vale, lena-brooks — all 7/7 valid
- `~/.hermes/skills/autonomous-ai-agents/agent-profile-builder/scripts/validate-all-profiles.py` — 7/7 ✅

#### New Skills Built (all in `~/.hermes/skills/autonomous-ai-agents/`)
| Skill | Purpose |
|---|---|
| `agent-profile-builder` | Create/validate agent profile YAMLs against schema |
| `deploy-agent` | 14-phase fully automated agent deployment |
| `credential-handling-patterns` | Token safety, length verification, write_file pitfall, safe merge |
| `kasm-workspaces` | Kasm API, Caddy config, session debugging, all pitfalls |
| `slack-agent-bot` | Slack Manifest API, token types, channel setup |
| `abc-supply-api` | Correct auth URL, endpoint patterns, pagination params |
| `ghl-workflow-builder` | GHL internal API, dual .env loading, Firebase key extraction |

#### Maya Chen — Phases 1-11 + 13 Complete
- Kasm desktop live, Hermes v0.16.0 running
- Google SA verified (Gmail 14 labels, Drive accessible)
- AgentMail `ob-accounting@agentmail.proexteriorsus.net` verified
- Slack bot A0BD0PAEU2E posting to 3 channels
- Service token `ob-accounting` verified, 225 work items accessible
- ABC Supply API verified (production, pageNumber+itemsPerPage params)
- `POST /api/agent/intake` live (commit `eb95d67`)
- E2E validated: alias routing → Gmail → Slack → dashboard work item

### ▶ Open items / next session start

1. **Run verify + validate scripts first** (confirm 4/4 and 7/7 still passing)
2. **Build `scripts/deploy-agent.py`** — the actual execution script (deploy-agent skill written, script not yet built)
3. **`deploy-agent alex-rivers`** — first automated deployment
4. **Maya Phase 12 (cron)** — always-on Gmail polling loop
5. **Maya Phase 14 (guardrails)** — final verification pass
6. **`SLACK_ADMIN_BOT_TOKEN`** — one-time admin OAuth grant for zero-click Slack app installs (last remaining human step; without it Phase 7 logs the install URL but still completes)

### Critical invariants (never break)
- `command_center.approval_decide: false` on ALL agents — schema-enforced
- `google_workspace.external_send_authorized: false` on ALL agents — schema-enforced
- GW emails use `@cc.proexteriorsus.net` (NOT `@proexteriorsus.com`) — schema-enforced
- Rowan Vale: `network_policy: external-only`, NO Supabase token — schema-enforced

### Key files
- `agents/profiles/` — canonical agent profiles
- `~/.hermes/skills/autonomous-ai-agents/` — all deployment skills
- `config/.env.example` — detailed WHERE/pitfall comments for all automation credentials
- `/root/hermes-dashboard-credentials.txt` on agent host — Kasm admin password

---

## Previous session context (2026-06-20/22) — still open

- **Rotate `sntrys_` Sentry build token** (was pasted in chat)
- **Activate nightly-sync Sentry** on Hetzner agent host
- **41 "call for pricing" ABC items** — need ABC quote conversation
- Carried: image chip visual-verify · Denver/Dallas promotion · price crons · Accounting Slack criticals · ABC account-expansion

**Full prior context:** `context/memory/2026-06-20.md`, `context/memory/2026-06-22.md`, `context/memory/2026-06-25.md`
