---
name: slack-agents
description: >
  How the Open Brain agents post to Slack — the single source of truth for the
  per-agent bot identities, their app IDs and token env vars, the channel IDs,
  and the hard Slack config-token boundary. Triggers on "slack agent", "post as
  Alex/Maya/Casey/etc", "agent slack bot", "per-agent bot token", "xoxb",
  "slack config token", "which channel does <agent> post to", "add a slack bot",
  "slack bot 401/not posting", "service-warranty channel", "postSlackMessage",
  "openbrain bot". Read this BEFORE re-investigating how agents reach Slack —
  the answer is here. Full background: docs/12, docs/30; inbound-chat safety: docs/60.
---

# Slack agents — Command Center → Slack

The OB agents post to Slack in workspace **pe-command-center** (`team_id T0B8QEGPVQW`).
Each vertical agent has its **own** Slack app + bot user, so messages post under that
agent's identity. The canonical posting path is `postSlackMessage()` in
`app/command-center/src/lib/slack.server.ts`; identities live in `src/lib/slack-agents.ts`.

## The hard boundary (read this first — it cost a full investigation)

- A Slack **config token** (`xoxe.xoxp-…`, the App-Configuration token) can create/manage
  **apps** and read manifests — it **CANNOT read or mint bot tokens (`xoxb`)**.
- Config-token `apps.manifest.export` returns the manifest only; **duplicate apps are
  byte-identical to it**, so you cannot tell which duplicate is installed. The ONLY way to
  resolve a duplicate is to `auth.test` a pasted `xoxb` — its response returns the `app_id`.
- **Installing an app to the workspace is the one unavoidable human step** (api.slack.com →
  app → *Install to Workspace* → copy the **Bot User OAuth Token**). No headless path mints `xoxb`.
- **Adding a scope reinstalls the app** and can rotate the bot token — re-verify with `auth.test`
  after a scope change (check `x-oauth-scopes` response header for the new scopes).

## Per-agent identity registry

Tokens live ONLY in gitignored `config/.env` (local) and Coolify env (prod). Never echo a
token; verify with `auth.test` (prints identity, not the secret). Keys match `tokenEnvKey`
in `slack-agents.ts`.

| Agent | Canonical app | Bot user | Token env var |
|---|---|---|---|
| Alex Rivers (Pricing) | `A0BD4C9SUPP` | `alex_rivers` | `ALEX_RIVERS_BOT_TOKEN` |
| Casey Morgan (Vendor Comms) | `A0BD85UG23C` | `casey_morgan` | `CASEY_MORGAN_BOT_TOKEN` |
| Jordan Price (Finance) | `A0BE2EMAA8Y` | `jordan_price` | `JORDAN_PRICE_BOT_TOKEN` |
| Maya Chen (Accounting) | `A0BD0PAEU2E` | `maya_chen_accounting` | `MAYA_CHEN_BOT_TOKEN` |
| Lena Brooks (Marketing) | `A0BD1RH3FPD` | `lena_brooks` | `LENA_BROOKS_BOT_TOKEN` |
| Rowan Vale (Research) | `A0BD1RMHFBM` | `rowan_vale` | `ROWAN_VALE_BOT_TOKEN` |
| Sam Torres (QA) | `A0BD86ATVHQ` | `sam_torres` | `SAM_TORRES_BOT_TOKEN` |
| Ops Conductor | `A0BDG2CCCAJ` | `ops_conductor` | `OPS_CONDUCTOR_BOT_TOKEN` |
| **Shared fallback** | `A0BDVCB4ZGC` | `openbrain` (`U0BDA9DT4G7`) | `SLACK_BOT_TOKEN` |

`postSlackMessage({ agent: "alex", channel, text })` posts as that agent; if the agent's own
token is unset it transparently falls back to **@openbrain** (`result.postedAs` = `agent`|`fallback`).
Many duplicate apps exist in the workspace (3× Casey, 2× others) — the table above is the keeper;
delete the rest in the Slack UI (the registry's `canonicalAppId` is the record of truth).

## Channels

| Channel | ID | Use |
|---|---|---|
| #accounting-invoice-processing | `C0BDRFACQ4S` | invoice-audit deliverables |
| #accounting-vendor-intake | `C0BCUF29G1H` | invoice/AP intake, discrepancies |
| #accounting-credit-memos | `C0BD4EW4RU4` | credit-memo drafts |
| #accounting-product-catalog-review | `C0BCYNW98RL` | price agreements / catalog |
| #service-warranty-audit | `C0BE05YUQTW` | Service/Warranty transfers (docs/61) |

Conductor routing channels (`_schema.yaml`): `ob-agents-internal C0BD8U44HL3`,
`ob-ops-conductor C0BDF8QRF8A`, `ob-dev-internal C0BDJTVMRE0`, `ob-dev-conductor C0BDD623DQW`.
These are **private** — bots return `channel_not_found` until a human invites them.

## Cookbook

```bash
# Verify a bot token (identity only — never print the token)
set -a; . ./config/.env; set +a
curl -s -H "Authorization: Bearer $ALEX_RIVERS_BOT_TOKEN" https://slack.com/api/auth.test \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok'),d.get('user'),d.get('team'),d.get('error'))"

# Post: a bot can self-join a PUBLIC channel (conversations.join) then chat.postMessage.
# Private channels need a human invite. Keep noisy batches to ONE parent + threaded replies.
```

## Prod vs local

- Local dev reads `config/.env` directly — per-agent posting works once the token is set.
- The **deployed** app posts as an agent only when `<AGENT>_BOT_TOKEN` is in **Coolify env**
  AND a deploy has booted a fresh container with it (see the `coolify` skill).
- A token pasted into chat is **burned** — rotate it (api.slack.com → app → Bot token → Rotate).

## Two-way chat is NOT built (and is gated)

Agents only **post** today. Making an agent **chattable** (DMs/mentions) needs a persistent
events listener (Socket Mode / `@slack/bolt`) — a new always-on service — and must NOT go live
until the SOP-confinement / anti-poisoning defenses in **docs/60** exist. Inbound is where the
data-exfiltration risk lives; one-way posting is safe.
