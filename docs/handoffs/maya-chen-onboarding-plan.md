# Maya Chen — Agent Onboarding Plan

> **Agent:** Maya Chen — Document Intake & Extraction Specialist
> **Maps to:** `@ob-accounting` + Capture
> **Runtime:** Hermes on Hetzner agent host (`agents.proexteriorsus.net`) + Kasm desktop (`pe-maya-chen`) for visual/human-assist
> **Scope:** Full end-to-end — intake → classify → extract → DB writes → Slack notifications → escalation
> **Date:** 2026-06-23

---

## Current State (confirmed with Chris)

| Component | Status |
|---|---|
| Google Workspace account (`maya.chen@cc.proexteriorsus.net`) | ✅ Created |
| WorkOS user (`maya.chen@cc.proexteriorsus.net`) | ✅ Created (06-09), ❌ Never logged in |
| WorkOS password | In `.env.agent-passwords` (needs vault transfer) |
| Kasm desktop (`pe-maya-chen`) | ❌ Not launched |
| Hermes on agent host | ❌ Not configured for Maya |
| AgentMail (`ob-accounting@agentmail.proexteriorsus.net`) | ✅ Configured in roster, ❌ Needs verification |
| Slack bot user | ❌ Not created (Maya gets her own bot, not just logical routing) |
| Supabase service token (`ob-accounting`) | ❌ Not created |
| ABC Supply API | ✅ Working (sandbox or production ready) |
| GHL invoice intake webhook | ❌ Not configured |
| Google Service Account | ✅ Created + verified (domain-wide delegation active) |
| OpenRouter API key | ✅ Chris has it ready |

---

## Credential & Access Requirements

### What I (the agent) need in Maya's `.hermes/.env` on the agent host

```bash
# ═══ Provider ═══
OPENROUTER_API_KEY=<Chris provides>          # Maya's own key (billing isolation)

# ═══ Supabase (service token path — no service-role key on Maya's profile) ═══
SUPABASE_URL=https://rnhmvcpsvtqjlffpsayu.supabase.co
SUPABASE_SERVICE_TOKEN=<generated>           # ob-accounting bearer token for /api/agent/* 
SUPABASE_ANON_KEY=<from existing .env>       # read-only fallback

# ═══ Command Center ═══
COMMAND_CENTER_PUBLIC_URL=https://cc.proexteriorsus.net

# ═══ Google Workspace (Service Account impersonation) ═══
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/opt/openbrain/agents/maya-chen/google-service-account.json
GOOGLE_IMPERSONATE_AS=maya.chen@cc.proexteriorsus.net
GOOGLE_INVOICE_INBOX=maya.chen@cc.proexteriorsus.net    # Maya's own inbox is the intake address

# ═══ ABC Supply API ═══
ABC_SUPPLY_ENV=production                     # or sandbox
ABC_SUPPLY_CLIENT_ID=<from existing .env>
ABC_SUPPLY_CLIENT_SECRET=<from existing .env>
ABC_SUPPLY_API_BASE_URL=<from existing .env>
ABC_SUPPLY_AUTH_BASE_URL=<from existing .env>
ABC_SUPPLY_SCOPES=location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read

# ═══ Slack (Maya's own bot) ═══
SLACK_BOT_TOKEN=xoxb-<Chris provides after app creation>
SLACK_APP_TOKEN=xapp-<Chris provides after app creation>
SLACK_SIGNING_SECRET=<Chris provides after app creation>
SLACK_ACCOUNTING_VENDOR_INTAKE_CHANNEL_ID=<from existing or new>
SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID=<from existing or new>
SLACK_ACCOUNTING_PRODUCT_CATALOG_REVIEW_CHANNEL_ID=<from existing or new>
SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID=<from existing or new>
SLACK_LUCINDA_USER_ID=<from existing .env>

# ═══ AgentMail ═══
AGENTMAIL_API_KEY=<from existing .env>
AGENTMAIL_DOMAIN=agentmail.proexteriorsus.net
AGENTMAIL_WEBHOOK_URL=https://cc.proexteriorsus.net/api/agentmail/webhook
AGENTMAIL_WEBHOOK_SECRETS=<from existing .env>

# ═══ GHL (invoice intake webhook) ═══
GHL_API_KEY=<from existing .env>
GHL_LOCATION_ID=<from existing .env>
GHL_WEBHOOK_SECRET=<from existing .env>

# ═══ Sentry (observability) ═══
SENTRY_DSN=<from existing .env>
SENTRY_ENVIRONMENT=production
SENTRY_ORG=cleverwork
SENTRY_PROJECT=cc-proexteriorsus

# ═══ WorkOS (for browser login on Kasm) ═══
WORKOS_CLIENT_ID=<from existing .env>
# Maya's WorkOS password is in the desktop vault, not in .env

# ═══ Agent identity ═══
AGENT_ID=maya-chen
AGENT_ROLE=document-intake
AGENT_DEPARTMENTS=accounting,system
AGENT_OPENBRAIN_MAPS_TO=ob-accounting,Capture
```

### What Chris needs to do (human-only steps)

1. **Google Service Account setup** (see Phase 5)
2. **Slack bot creation** for Maya (see Phase 7)
3. **GHL webhook configuration** for `invoices@` inbox (see Phase 10)
4. **Move WorkOS password** from `.env.agent-passwords` to the agent desktop vault
5. **Provide OpenRouter API key** for Maya
6. **Coolify env update** — add `ob-accounting` service token to `AGENT_SERVICE_TOKENS`

### What I need Chris to provide (tokens/keys only)

| Item | When needed | How to provide |
|---|---|---|
| OpenRouter API key (Maya's own) | Phase 11 | Put in `.env` on agent host or tell me the path |
| Google Service Account JSON key file | Phase 5/11 | Chris creates in Google Cloud, places at agent host path or provides download |
| Slack bot tokens (xoxb-, xapp-, signing secret) | Phase 7 | Chris creates Slack app, puts tokens in `.env` |
| GHL API key + location ID + webhook secret | Phase 10 | Already in repo-root `.env`? If not, add to agent host `.env` |
| ABC Supply credentials | Phase 9 | Already in repo-root `.env`; copy to Maya's `.hermes/.env` |
| Supabase URL + anon key | Phase 8 | Already in repo-root `.env` |
| AgentMail API key + webhook secrets | Phase 6 | Already in repo-root `.env` |
| WorkOS password for Maya | Phase 4 | In `.env.agent-passwords` — Chris moves to vault, I use it from Kasm browser |
| SSH access to agent host | Phase 2 | Key at `~/.ssh/a_roofers_open_brain_ed25519` — ✅ confirmed ready |

---

## Phase-by-Phase Execution Plan

### Phase 1 — Pre-flight checks (AGENT)

**What:** Verify all infrastructure is reachable before starting.

| Step | Action | Who |
|---|---|---|
| 1.1 | SSH to `agents.proexteriorsus.net` (5.78.146.161) and verify access | AGENT |
| 1.2 | Check if Hermes is installed on the agent host (`hermes --version`) | AGENT |
| 1.3 | Check if Kasm is running and the custom image exists (`docker images \| grep openbrain`) | AGENT |
| 1.4 | Verify Command Center is reachable (`curl https://cc.proexteriorsus.net/healthz`) | AGENT |
| 1.5 | Verify Supabase is reachable (REST API ping) | AGENT |
| 1.6 | Check existing agent host directory structure (`/opt/openbrain/agents/` or similar) | AGENT |
| 1.7 | Check what Alex's setup looks like for reference (his `.hermes/.env` structure, SOUL.md) | AGENT |

**Output:** Go/no-go assessment for each infrastructure component.

---

### Phase 2 — Agent host directory & Hermes setup (AGENT)

**What:** Create Maya's directory structure on the Hetzner agent host and configure her Hermes instance.

| Step | Action | Who |
|---|---|---|
| 2.1 | Create Maya's agent directory: `/opt/openbrain/agents/maya-chen/` | AGENT |
| 2.2 | Create Maya's Hermes profile directory: `/opt/openbrain/agents/maya-chen/.hermes/` | AGENT |
| 2.3 | Create `.hermes/.env` with all credentials (from the template above) | AGENT + CHRIS (keys) |
| 2.4 | Create `.hermes/SOUL.md` — Maya's persona, role, guardrails (see Phase 11) | AGENT |
| 2.5 | Create `.hermes/config.yaml` — model tier (workhorse/standard), tools, skills | AGENT |
| 2.6 | Set permissions: `chmod 600 .hermes/.env` | AGENT |
| 2.7 | Verify Hermes loads Maya's profile: `hermes --profile /opt/openbrain/agents/maya-chen/.hermes status` | AGENT |
| 2.8 | Verify OpenRouter connectivity from Maya's profile | AGENT |

**Human needed:** Chris provides OpenRouter API key and Google Service Account JSON path.

---

### Phase 3 — Launch Maya's Kasm desktop (AGENT + HUMAN)

**What:** Launch the persistent Kasm Chrome desktop for Maya from the custom Hermes-baked image.

| Step | Action | Who |
|---|---|---|
| 3.1 | Access Kasm admin at `https://desktops.proexteriorsus.net` | AGENT or HUMAN |
| 3.2 | Create a new Kasm workspace/session for Maya using image `openbrain-hermes-chrome:1.18.0-20260606` | AGENT or HUMAN |
| 3.3 | Set persistent profile volume: `/mnt/kasm_profiles/maya.chen@cc.proexteriorsus.net/2c589484-3521-41fc-bec6-ac785ae87dd7` | AGENT or HUMAN |
| 3.4 | Name the desktop: `pe-maya-chen` | AGENT or HUMAN |
| 3.5 | Verify the desktop launches and Chrome opens with the Hermes-ready image | AGENT |
| 3.6 | Verify Hermes is available in the desktop: `hermes --version` in terminal | AGENT |
| 3.7 | Install Maya's `.hermes/.env` and `SOUL.md` in the Kasm persistent profile | AGENT |
| 3.8 | Set up bookmarks: ABC portal, vendor invoice export pages, Drive invoice folders, Command Center ingestion queue | AGENT |
| 3.9 | Configure Chrome: persistent downloads folder, PDF viewer, default save location inside mounted workspace volume | AGENT |

**Human needed:** If Kasm admin requires browser-based session creation, Chris may need to do this step. I can guide through it.

**Pitfall from handoff:** Kasm aggressive image pruning — ensure the custom image is registered in the Kasm image table BEFORE launching (already done per 06-06 handoff, but verify).

---

### Phase 4 — WorkOS login verification (AGENT + HUMAN)

**What:** Maya logs into the Command Center via WorkOS from her Kasm desktop.

| Step | Action | Who |
|---|---|---|
| 4.1 | Open Chrome on Maya's Kasm desktop | AGENT |
| 4.2 | Navigate to `https://cc.proexteriorsus.net` | AGENT |
| 4.3 | Verify redirect to `/auth/login` → WorkOS AuthKit | AGENT |
| 4.4 | Log in as `maya.chen@cc.proexteriorsus.net` with the generated password | AGENT (password from vault) |
| 4.5 | Verify the identity chip shows "Maya Chen" with correct role | AGENT |
| 4.6 | Verify Maya has NO `approval.decide` permission (can't approve external sends) | AGENT |
| 4.7 | Verify Maya can see the accounting work queue and ingestion queue | AGENT |
| 4.8 | Verify session persists across page navigation | AGENT |

**Human needed:** Chris must have moved the WorkOS password to the vault (from `.env.agent-passwords`). The 06-09 daily log confirms the password was generated and the E2E test passed (authenticateWithPassword as maya.chen → sealed session → `/api/agent/session` returned correct named_agent actor).

---

### Phase 5 — Google Service Account + Workspace access (HUMAN + AGENT)

**What:** Set up Google Service Account with domain-wide delegation for programmatic Gmail/Drive access. Chris sets up the Google Cloud side; I configure Maya's Hermes to use it.

**Chris does:**

| Step | Action | Who |
|---|---|---|
| 5.1 | Go to Google Cloud Console → create or select the Pro Exteriors project | HUMAN |
| 5.2 | Create a Service Account (e.g. `openbrain-agent-service@pro-exteriors-gcp.iam.gserviceaccount.com`) | HUMAN |
| 5.3 | Enable domain-wide delegation for the service account | HUMAN |
| 5.4 | In Google Workspace Admin Console → Security → API Controls → Domain-wide Delegation → Add the service account client ID with these scopes: | HUMAN |

Required OAuth scopes for domain-wide delegation:
```
https://www.googleapis.com/auth/gmail.readonly          # read invoices@ inbox
https://www.googleapis.com/auth/gmail.modify            # mark messages read, apply labels
https://www.googleapis.com/auth/gmail.send              # draft emails (draft-only, no send without approval)
https://www.googleapis.com/auth/drive.readonly          # read Drive invoice folders
https://www.googleapis.com/auth/drive.file              # read/create files created by the service
https://www.googleapis.com/auth/spreadsheets.readonly   # read pricing spreadsheets if needed
```

| Step | Action | Who |
|---|---|---|
| 5.5 | Download the Service Account JSON key file | HUMAN |
| 5.6 | Place the JSON key at `/opt/openbrain/agents/maya-chen/google-service-account.json` on the agent host (or provide path) | HUMAN or AGENT |
| 5.7 | `chmod 600 google-service-account.json` | AGENT |

**I do:**

| Step | Action | Who |
|---|---|---|
| 5.8 | Verify the service account can impersonate `maya.chen@proexteriorsus.com` and access Gmail API | AGENT |
| 5.9 | Verify the service account can access `invoices@proexteriorsus.com` shared inbox | AGENT |
| 5.10 | Verify Drive API access (list invoice folders) | AGENT |
| 5.11 | Configure Maya's Hermes with the Google Workspace skill/tool for automated inbox polling | AGENT |
| 5.12 | On Maya's Kasm desktop: log into Google as `maya.chen@proexteriorsus.com` in Chrome for visual access | AGENT |
| 5.13 | Verify delegated access to `invoices@proexteriorsus.com` shared inbox via browser | AGENT |

**Human needed:** Google Cloud Console setup (steps 5.1–5.6). Everything else I can do.

---

### Phase 6 — AgentMail verification (AGENT)

**What:** Verify the `ob-accounting@agentmail.proexteriorsus.net` inbox is working and webhooks reach the Command Center.

| Step | Action | Who |
|---|---|---|
| 6.1 | Verify AgentMail API key is valid (GET inbox list via AgentMail API) | AGENT |
| 6.2 | Verify `ob-accounting@agentmail.proexteriorsus.net` inbox exists | AGENT |
| 6.3 | Send a test email to `ob-accounting@agentmail.proexteriorsus.net` | AGENT |
| 6.4 | Verify the webhook fires to `https://cc.proexteriorsus.net/api/agentmail/webhook` | AGENT |
| 6.5 | Verify the webhook receiver logs the event (check Command Center logs) | AGENT |
| 6.6 | Verify Svix signature validation passes | AGENT |
| 6.7 | Configure Maya's Hermes to poll/process AgentMail inbound messages | AGENT |

**Human needed:** None. AgentMail is already configured in the roster and the webhook receiver exists in the Command Center code.

---

### Phase 7 — Slack bot setup (HUMAN + AGENT)

**What:** Create Maya's own Slack bot user (separate from the ob-conductor app) so she's independently mentionable in Slack.

**Chris does:**

| Step | Action | Who |
|---|---|---|
| 7.1 | Go to https://api.slack.com/apps → Create New App → From scratch | HUMAN |
| 7.2 | App name: `Maya Chen (Accounting)` or `OB Accounting` | HUMAN |
| 7.3 | Select the Pro Exteriors workspace | HUMAN |
| 7.4 | Enable Socket Mode | HUMAN |
| 7.5 | Generate an App-Level Token with `connections:write` scope | HUMAN |
| 7.6 | Add Bot Token Scopes: `chat:write`, `channels:read`, `channels:history`, `files:read`, `files:write`, `incoming-webhook` | HUMAN |
| 7.7 | Add Event Subscriptions: `message.channels`, `app_mention` | HUMAN |
| 7.8 | Install the app to the workspace | HUMAN |
| 7.9 | Copy Bot User OAuth Token (`xoxb-...`) | HUMAN |
| 7.10 | Copy Signing Secret | HUMAN |
| 7.11 | Copy App-Level Token (`xapp-...`) | HUMAN |
| 7.12 | Put all three tokens in Maya's `.hermes/.env` (or agent host `.env`) | HUMAN or AGENT |

**I do:**

| Step | Action | Who |
|---|---|---|
| 7.13 | Create Slack channels if they don't exist: `#accounting-vendor-intake`, `#accounting-credit-memos`, `#accounting-product-catalog-review` | AGENT (via Slack API if token available) |
| 7.14 | Invite Maya's bot to each channel | AGENT or HUMAN |
| 7.15 | Verify Maya's bot can post to `#accounting-vendor-intake` | AGENT |
| 7.16 | Verify Maya's bot responds to `@` mentions | AGENT |
| 7.17 | Configure Hermes Slack skill for Maya — message formatting, channel routing, digest posting | AGENT |
| 7.18 | Store channel IDs in Maya's `.hermes/.env` | AGENT |

**Human needed:** Slack app creation (steps 7.1–7.11). This requires browser access to api.slack.com and workspace admin rights. I can guide through it or use the Slack API if Chris provides a config token.

---

### Phase 8 — Supabase service token (AGENT + HUMAN)

**What:** Generate a service token for `ob-accounting` and configure it in Coolify so Maya can write invoice data programmatically.

| Step | Action | Who |
|---|---|---|
| 8.1 | Generate a secure random token: `openssl rand -hex 32` | AGENT |
| 8.2 | Add to Coolify env: `AGENT_SERVICE_TOKENS=ob-accounting:<token>` (append to existing or create new entry) | HUMAN (Coolify dashboard) or AGENT (if Coolify API access) |
| 8.3 | Add the token to Maya's `.hermes/.env` as `SUPABASE_SERVICE_TOKEN` | AGENT |
| 8.4 | Verify the token works: `curl -H "Authorization: Bearer <token>" https://cc.proexteriorsus.net/api/agent/session` | AGENT |
| 8.5 | Verify the returned actor is `ob-accounting` service agent with correct permissions | AGENT |
| 8.6 | Verify Maya can write to invoice tables via the API | AGENT |
| 8.7 | Verify Maya can pull work queue items via `GET /api/agent/work-queue` | AGENT |

**Human needed:** Coolify env update (step 8.2). Alternatively, I can update Coolify via CLI/API if Chris grants access.

**Alternative:** Use hashed tokens: `AGENT_SERVICE_TOKEN_SHA256_OB_ACCOUNTING=<sha256 hash>` — more secure, avoids plaintext token in Coolify env.

---

### Phase 9 — ABC Supply API access verification (AGENT)

**What:** Verify Maya can access the ABC Supply API for product catalog, pricing, invoice, and order data.

| Step | Action | Who |
|---|---|---|
| 9.1 | Copy ABC Supply credentials to Maya's `.hermes/.env` | AGENT |
| 9.2 | Verify token exchange works (authenticate with ABC Supply API) | AGENT |
| 9.3 | Test product catalog read (GET products) | AGENT |
| 9.4 | Test pricing read (GET pricing for a known item) | AGENT |
| 9.5 | Test invoice read (GET invoices) | AGENT |
| 9.6 | Test order read (GET orders) | AGENT |
| 9.7 | Verify the ABC Supply bridge script (`integrations/bridges/abc-supply/`) is accessible from Maya's profile | AGENT |

**Human needed:** None. ABC Supply API is confirmed working.

---

### Phase 10 — GHL invoice intake configuration (HUMAN + AGENT)

**What:** Configure GoHighLevel to fire a webhook when an email with a PDF attachment arrives at `invoices@proexteriorsus.com`, triggering Maya's intake pipeline.

**Chris does:**

| Step | Action | Who |
|---|---|---|
| 10.1 | In GHL, create or verify the `invoices@proexteriorsus.com` inbox/email address | HUMAN |
| 10.2 | Create a GHL workflow: trigger = inbound email with attachment to `invoices@` | HUMAN |
| 10.3 | Configure the webhook action: POST to Maya's intake endpoint (TBD based on architecture) | HUMAN + AGENT |
| 10.4 | Set the webhook secret | HUMAN |

**I do:**

| Step | Action | Who |
|---|---|---|
| 10.5 | Build the intake webhook receiver endpoint (or verify existing Command Center endpoint works) | AGENT |
| 10.6 | Configure Maya's Hermes to process incoming GHL webhook payloads | AGENT |
| 10.7 | Test the full flow: send a test email with PDF to `invoices@proexteriorsus.com` → GHL webhook → Maya processes | AGENT |
| 10.8 | Verify Maya downloads the PDF, classifies it, and extracts structured data | AGENT |

**Human needed:** GHL workflow configuration (steps 10.1–10.4). This requires browser access to the GHL dashboard. I can guide through it.

**Open question:** Does Maya's intake endpoint live on the Command Center (`/api/agentmail/webhook` already exists) or does it need a new endpoint? The AgentMail webhook receiver already handles inbound email events. If GHL fires a separate webhook, we may need a new receiver. Alternatively, route `invoices@` through AgentMail instead of GHL.

---

### Phase 11 — Hermes Agent configuration & SOUL.md (AGENT)

**What:** Configure Maya's full Hermes Agent profile with persona, skills, tools, and guardrails.

| Step | Action | Who |
|---|---|---|
| 11.1 | Write Maya's `SOUL.md` — persona, identity, role, guardrails, escalation rules | AGENT |
| 11.2 | Write Maya's `config.yaml` — model tier (workhorse/standard), enabled tools, skills | AGENT |
| 11.3 | Install/configure Google Workspace skill for Hermes (Gmail polling, Drive access) | AGENT |
| 11.4 | Install/configure Slack skill for Hermes (channel posting, mention response) | AGENT |
| 11.5 | Install/configure ABC Supply bridge skill for Hermes | AGENT |
| 11.6 | Install/configure Supabase/Command Center API skill for Hermes | AGENT |
| 11.7 | Install/configure OCR skill (Unstructured `hi_res` for scanned PDFs) | AGENT |
| 11.8 | Install/configure document classification skill (invoice/order/price-list/credit-memo/statement/unknown) | AGENT |
| 11.9 | Install/configure extraction skill (structured JSON output, UOM normalization, SKU normalization) | AGENT |
| 11.10 | Install/configure AgentMail skill for Hermes | AGENT |
| 11.11 | Configure agent-browser tool for vendor portal downloads | AGENT |
| 11.12 | Verify all skills load and tools are accessible from Maya's Hermes profile | AGENT |

**Maya's SOUL.md should encode:**
- Identity: Maya Chen, Document Intake & Extraction Specialist
- Maps to: @ob-accounting + Capture
- Core mission: Be the front door for supplier documents
- Operating voice: Methodical, precise, structured. Never editorializes.
- Guardrails: No external sends, no guessing (flag ambiguity), draft orders URGENT priority
- Escalation triggers: unreadable/malformed/password-protected docs, portal permission requests, unexpected PII
- Approval gates: All DB writes go through Command Center API with service token; no `approval.decide`
- Tools available: Gmail API, Drive API, ABC Supply API, Slack, AgentMail, Command Center API, OCR, browser

---

### Phase 12 — Cron jobs & routines (AGENT)

**What:** Set up Maya's always-on intake cadence and health check routines.

| Step | Action | Who |
|---|---|---|
| 12.1 | Create a systemd service or cron job for Maya's always-on inbox watcher | AGENT |
| 12.2 | Configure Gmail API polling (every 60 seconds for new messages in `invoices@` inbox) | AGENT |
| 12.3 | Configure AgentMail polling (every 60 seconds for inbound messages to `ob-accounting@`) | AGENT |
| 12.4 | Create a daily health check cron (08:00 local): verify Gmail API, AgentMail, Slack, Supabase, ABC API all reachable | AGENT |
| 12.5 | Create a daily status report: post to `#accounting-vendor-intake` with yesterday's intake summary | AGENT |
| 12.6 | Create a weekly digest: post to `#ob-conductor-digest` with weekly intake stats (documents processed, classifications, extractions, escalations) | AGENT |
| 12.7 | Configure Sentry error capture for Maya's Hermes instance | AGENT |
| 12.8 | Configure auto-restart on failure (systemd Restart=on-failure) | AGENT |

**Cron schedule summary:**

| Job | Schedule | Purpose |
|---|---|---|
| Gmail inbox poll | Every 60s (continuous) | Watch for new invoice emails with PDFs |
| AgentMail inbox poll | Every 60s (continuous) | Watch for inbound messages to ob-accounting@ |
| GHL webhook listener | Event-triggered (always-on) | Receive GHL webhook for inbound PDF emails |
| Daily health check | 08:00 local | Verify all services reachable |
| Daily intake summary | 17:00 local | Post to #accounting-vendor-intake |
| Weekly digest | Friday 16:00 local | Post to #ob-conductor-digest |

---

### Phase 13 — End-to-end validation (AGENT + HUMAN)

**What:** Test the complete intake-to-escalation pipeline with real documents.

| Step | Action | Who |
|---|---|---|
| 13.1 | Send a test invoice email with PDF to `invoices@proexteriorsus.com` | AGENT |
| 13.2 | Verify Maya detects the email (Gmail API poll or GHL webhook) | AGENT |
| 13.3 | Verify Maya downloads the PDF attachment | AGENT |
| 13.4 | Verify Maya classifies the document (invoice/order/price-list/credit-memo/statement/unknown) | AGENT |
| 13.5 | Verify Maya extracts structured data (metadata + line items as JSON) | AGENT |
| 13.6 | Verify UOM normalization (3 BD = 1 SQ, etc.) | AGENT |
| 13.7 | Verify SKU normalization against the product catalog | AGENT |
| 13.8 | Verify extracted data is written to Supabase invoice tables | AGENT |
| 13.9 | Verify Maya posts a notification to `#accounting-vendor-intake` in Slack | AGENT |
| 13.10 | Verify Maya creates a work queue item in the Command Center | AGENT |
| 13.11 | Send a test email with an unreadable/malformed PDF | AGENT |
| 13.12 | Verify Maya flags it for human review and posts to Slack | AGENT |
| 13.13 | Send a test draft order email | AGENT |
| 13.14 | Verify Maya gives it URGENT priority and processes immediately | AGENT |
| 13.15 | Verify Maya cannot approve external sends (guardrail check) | AGENT |
| 13.16 | Verify Sentry captures a deliberate test error | AGENT |
| 13.17 | Final verification: Maya's Kasm desktop is accessible and she can log in via WorkOS | AGENT |

**Human needed:** Review the test results. Chris may want to watch the validation run.

---

### Phase 14 — Guardrails & monitoring (AGENT)

**What:** Verify all guardrails are in place and monitoring is active.

| Step | Action | Who |
|---|---|---|
| 14.1 | Verify Maya cannot send external emails (no `approval.decide`) | AGENT |
| 14.2 | Verify Maya cannot approve work queue items (only request more evidence + resume) | AGENT |
| 14.3 | Verify Maya's ABC Supply access is read-only (no write scopes) | AGENT |
| 14.4 | Verify Maya's Supabase writes go through the API (not direct DB access) | AGENT |
| 14.5 | Verify Maya's Google Workspace access is scoped (gmail.readonly + gmail.modify + gmail.send for drafts only) | AGENT |
| 14.6 | Verify Sentry is capturing errors from Maya's Hermes instance | AGENT |
| 14.7 | Verify Maya's escalation path works: ambiguous document → Slack flag → human review queue | AGENT |
| 14.8 | Verify Maya's audit trail: every action logged to Command Center + `#ob-agent-audit-log` | AGENT |
| 14.9 | Document Maya's operational runbook (on-call procedures, restart steps, log locations) | AGENT |
| 14.10 | Update `docs/handoffs/current.md` with Maya's onboarding status | AGENT |
| 14.11 | Update `context/MEMORY.md` with Maya's operational state | AGENT |
| 14.12 | Update the Command Center agent desktop status (account created, MFA complete, recovery owner, bookmarks installed, SOP accepted, last human review) | AGENT |

---

## Execution Order & Dependencies

```
Phase 1 (Pre-flight)
  ↓
Phase 2 (Agent host setup) ← needs: OpenRouter key, Google SA key path
  ↓
Phase 3 (Kasm desktop launch) ← needs: Kasm admin access
  ↓
Phase 4 (WorkOS login) ← needs: WorkOS password from vault
  ↓
Phase 5 (Google Workspace) ← needs: Google Service Account (Chris)
  ↓                     ↓
Phase 6 (AgentMail)    Phase 7 (Slack bot) ← needs: Slack app creation (Chris)
  ↓                     ↓
Phase 8 (Supabase token) ← needs: Coolify env update (Chris or AGENT)
  ↓
Phase 9 (ABC Supply API) ← no new dependencies
  ↓
Phase 10 (GHL intake) ← needs: GHL workflow config (Chris)
  ↓
Phase 11 (Hermes config + SOUL.md) ← needs: all credentials in place
  ↓
Phase 12 (Cron & routines) ← needs: Hermes configured
  ↓
Phase 13 (E2E validation) ← needs: everything working
  ↓
Phase 14 (Guardrails & monitoring) ← final checks
```

## What I Can Do Right Now (no human waiting needed)

1. ✅ SSH to the agent host and verify infrastructure (Phase 1)
2. ✅ Create Maya's directory structure (Phase 2.1–2.2)
3. ✅ Write Maya's SOUL.md and config.yaml (Phase 2.4–2.5, Phase 11.1–11.2)
4. ✅ Verify AgentMail inbox (Phase 6)
5. ✅ Verify ABC Supply API access (Phase 9)
6. ✅ Verify Command Center health and API (Phase 1.4)
7. ✅ Check Alex's existing setup for reference patterns (Phase 1.7)

## What Blocks Me (needs Chris)

1. 🔒 OpenRouter API key for Maya → blocks Phase 2.3, Phase 11
2. 🔒 Google Service Account JSON key → blocks Phase 5, Phase 11.3
3. 🔒 Slack app creation → blocks Phase 7, Phase 11.4
4. 🔒 Coolify env update (service token) → blocks Phase 8
5. 🔒 GHL webhook configuration → blocks Phase 10
6. 🔒 WorkOS password moved to vault → blocks Phase 4
7. 🔒 Kasm desktop launch (may need browser admin) → blocks Phase 3
