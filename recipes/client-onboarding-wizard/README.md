# Recipe: Client Onboarding Wizard

> **Purpose:** Bring a new roofing client onto the brain in under one hour. This is the operational expression of Phase 0's onboarding-in-an-hour promise. Every step maps to an existing script, config file, or manual action. The Cleverwork AM runs this checklist alongside the new client.

- **Trigger:** New client engagement signed (Cleverwork internal signal — AM marks client as `provisioning` in Cleverwork's internal tracker).
- **Duration target:** Under 1 hour elapsed, under 30 minutes of AM active time (the rest is provisioning wait time).
- **Participants:** Cleverwork Account Manager (required), Client owner or operations lead (required for Steps 6 and 8 only).
- **Primary agents:** Conductor (post-setup).
- **Script:** `scripts/new-client.sh` automates Steps 1–4.

---

## Pre-flight checklist (AM completes before the session)

- [ ] Client has provided: company name, Slack workspace invite, AccuLynx API credentials (or JobTread / StartInfinity), CompanyCam API key, QuickBooks connection (if Phase 2).
- [ ] `config/roofer.config.yaml` template copied and filled for this client. Fields required for onboarding: `company.name`, `company.phone`, `company.website`, `service_area.zip_codes`, `jurisdictions` (at least one), `manufacturer_preference`, `integrations.acculynx.enabled`, `slack.workspace_id`.
- [ ] `.env` file created for this client from `config/.env.example`. API keys entered. File confirmed not committed to version control.
- [ ] Cleverwork's Supabase organization admin credentials available.

---

## Step 1 — Provision Supabase project

**Who:** AM runs `scripts/new-client.sh provision-supabase`.

**What it does:**
1. Creates a new Supabase project in the Cleverwork organization. Project name: `ob-[client-slug]` (e.g. `ob-acme-roofing`).
2. Applies the OB1 base schema migrations from `schemas/ob1-base/` in order.
3. Applies the Cleverwork roofer extension migrations from `schemas/cleverwork-roofer/` in order.
4. Verifies all tables created: `public.thoughts`, `public.property`, `public.jurisdiction`, `public.regulatory_snapshot`, `public.job`, `public.insurance_claim`, `public.manufacturer_warranty`, `public.atom_access_log`.
5. Outputs the project URL and service-role key (written to the client's `.env` file automatically).

**Verification:** `scripts/verify-deployment.sh supabase` returns green.

**Expected elapsed time:** 3–5 minutes.

---

## Step 2 — Deploy MCP containers (MCP server)

**Who:** AM runs `scripts/new-client.sh deploy-MCP containers`.

**What it does:**
1. Deploys the Cleverwork roofer MCP MCP containers to the new Supabase project.
2. Functions deployed: `mcp-thoughts` (atom CRUD), `mcp-property` (property graph), `mcp-job` (job lifecycle), `mcp-consent` (consent flag management), `mcp-debrief` (debrief trigger and routing).
3. Sets MCP container environment variables from the client's `.env` file.
4. Runs a smoke test: POST a test atom, retrieve it, verify embedding returned, delete it.

**Verification:** `scripts/verify-deployment.sh MCP containers` returns green.

**Expected elapsed time:** 3–5 minutes.

---

## Step 3 — Deploy dashboard

**Who:** AM runs `scripts/new-client.sh deploy-dashboard`.

**What it does:**
1. Forks the OB1 dashboard-pro template and configures it for the new client using `config/roofer.config.yaml` values.
2. Deploys to Coolify under the Cleverwork team account. URL: `[client-slug].brain.cleverwork.io` (or client's custom domain if provided).
3. Verifies dashboard loads and can authenticate with the Supabase project.

**Verification:** AM opens the dashboard URL in a browser. Login succeeds. Atom count shows 0 (expected — brain is empty). No console errors.

**Expected elapsed time:** 5–8 minutes.

---

## Step 4 — Register Slack bots

**Who:** AM runs `scripts/new-client.sh register-slack-bots`.

**What it does:**
1. Registers five vertical agent Slack app bots in the client's workspace via OAuth (requires the client to have invited the Cleverwork Slack app to their workspace before this step).
2. Bots registered: `@ob-accounting`, `@ob-ops`, `@ob-sales`, `@ob-marketing`, `@ob-exec`.
3. Registers Conductor as the routing bot (non-mentionable by clients; internal routing only).
4. Sets bot display names, descriptions, and the initial greeting message posted to `#general`.
5. Configures the `internal_ops_channel` from `config/roofer.config.yaml` as the Conductor posting channel.

**Manual step:** The client owner must approve the OAuth connection in their Slack workspace during this step. AM walks them through it (takes ~2 minutes).

**Verification:** AM mentions `@ob-ops` in the client's Slack. Conductor responds with the onboarding confirmation message: "Open Brain is live for [Company Name]. [Date]. Brain is empty and ready for your first debrief."

**Expected elapsed time:** 4–6 minutes (including client OAuth approval).

---

## Step 5 — Connect PM tool bridge (first bridge)

**Who:** AM runs `scripts/new-client.sh connect-bridge [bridge-name]`.

Available bridge names: `acculynx`, `jobtread`, `startinfinity`.

**What it does:**
1. Deploys the configured PM tool MCP container adapter.
2. Registers the `job.closed`, `job.created`, and `job.updated` webhook endpoints in the PM tool.
3. Fires a test event (creates a synthetic test job, closes it, verifies the `job.closed` webhook arrives at the MCP container).
4. Verifies Conductor receives the test event and would schedule a debrief.

**Verification:** `scripts/verify-deployment.sh bridge-[name]` returns green. Test atom written to brain from synthetic job.

**Expected elapsed time:** 5–8 minutes.

---

## Step 6 — Client walkthrough and consent capture

**Who:** AM and client owner (required). 20 minutes.

**Topics covered:**

1. **Brain orientation (5 min).** AM opens the dashboard. Shows: the atom count (now shows 1 from the test event), the property graph (empty — explains what it will look like after first job), the agent roster, how to mention `@ob-ops` in Slack.

2. **Recording consent (5 min).** AM walks the client through the debrief recording consent form (DocuSign or equivalent). This is the single consent capture that covers all future debrief recordings. Client signs. AM uploads the signed document to the client's brain as a `consent_record` atom (`trust_tier = "instruction"`, `cold_archive_status = "live"`).

3. **Cross-client property sharing (5 min).** AM explains the cross-client opt-in (verbatim from `docs/00-architecture-brief.md` §2.3 onboarding checkbox wording). Client selects opt-in or opt-out. Preference recorded in `config/roofer.config.yaml → consent.cross_client_default`. If opt-in: AM explains what gets shared and what never gets shared.

4. **EEAT flywheel consent (5 min).** AM explains that Marketing will propose content drafts from closed job debriefs; client reviews and approves (or skips) each one. AM designates the client's Slack approver for one-click approval messages (recorded in `config/roofer.config.yaml → marketing.approver_slack_user_id`).

---

## Step 7 — Seed jurisdictions and config

**Who:** AM.

1. AM confirms `config/roofer.config.yaml → jurisdictions` contains at least the client's primary operating jurisdiction with: `base_code`, `local_amendments`, `permit_required_for_reroof`.
2. If multiple jurisdictions: add all active ones. Researcher will auto-update local amendments when code-adoption news fires.
3. AM runs `scripts/new-client.sh seed-jurisdictions`. Creates the `regulatory_snapshot` rows for all configured jurisdictions.
4. AM verifies the dashboard's jurisdiction panel shows the seeded entries.

**Expected elapsed time:** 3–5 minutes.

---

## Step 8 — First live test: post debrief from an existing closed job

**Who:** AM and client PM/foreman (5–10 minutes to set up, debrief itself is 20–30 min and scheduled separately).

1. AM identifies the most recently closed job in AccuLynx.
2. AM manually triggers the `job.closed` event for that job via the Conductor Slack command: `/conductor debrief-now [job-id]`.
3. Conductor schedules the first debrief and posts the invite to the PM and foreman.
4. AM confirms the invite arrived and the prep checklist was posted.

Note: the first debrief does not happen during onboarding. It is scheduled for within 5 business days. The onboarding step simply confirms the trigger works end-to-end.

---

## Step 9 — Verification and sign-off

AM runs the full deployment verification: `scripts/verify-deployment.sh all`.

**Green criteria:**
- [ ] Supabase: all required tables present; embeddings endpoint responding.
- [ ] MCP containers: all 5 MCP functions deployed; smoke test passes.
- [ ] Dashboard: loads, authenticates, displays atom count.
- [ ] Slack bots: all 5 vertical agents registered; Conductor responds to test mention.
- [ ] PM bridge: webhook registered; test event received.
- [ ] Consent record: signed document stored as atom.
- [ ] Jurisdictions: at least 1 regulatory snapshot seeded.
- [ ] First debrief: scheduled within 5 business days.

AM posts the verification green screenshot to the `#cleverwork-internal` channel with a note: "Client [name] live. Brain provisioned. First debrief [date]."

---

## What Conductor does automatically from day 1

After onboarding completes, Conductor is live and runs autonomously:

- Daily digest posted each morning at `config.conductor.daily_digest_time` (default: 07:00 local).
- Routing: any `@ob-*` mention in Slack is routed to the appropriate agent.
- Escalation: any event requiring a human decision within 4 hours is flagged to the AM.
- Debrief scheduling: `job.closed` webhooks are processed automatically.

The client's team does not need to do anything special. They work in Slack and AccuLynx as they always have. The brain listens.

---

## Onboarding time target

| Step | Expected time |
|---|---|
| Steps 1–5 (automated) | 20–30 min |
| Step 6 (client walkthrough) | 20 min |
| Steps 7–9 (config + verify) | 15 min |
| **Total** | **~1 hour** |

---

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-05-29 | v1 | Initial SOP. 9 steps, under-1-hour target, pre-flight checklist, verification criteria. |
