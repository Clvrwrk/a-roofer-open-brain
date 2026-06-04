# Customization Guide

> This guide covers customization beyond the config file. For the common case — changing company name, toggling integrations, adjusting jurisdictions — `config/roofer.config.yaml` is the only file you need. Everything in this guide is for the operator who needs to go further.

---

## What the Config File Already Controls

Before going deeper, confirm the config file does not already cover what you need. `config/roofer.config.yaml` controls:

- Company identity, service area, license number
- Jurisdictions and building codes (seeds `regulatory_snapshot` table)
- Manufacturer certifications (seeds warranty tracking)
- Which agents are enabled and their skill packs
- Which bridges/integrations are active
- Cross-client consent defaults
- Deployment profile (remote vs. local)
- Model tiers (reasoning / workhorse / capture / embeddings)

If your customization is on this list, stop here and edit the config.

---

## Adding a New Skill

New skills follow the Six Sigma A3 governance gate described in `proposals/_a3-template.md`. The process is:

### Step 1 — Confirm the A3 gate applies

Two categories are exempt from the 10x ROI gate (see `docs/03-philosophy.md`):
- Mission-grade infrastructure (debrief pipeline, era-stamping, property model, EEAT flywheel)
- High-error-cost tasks where avoided-error cost carries the math

Everything else requires an A3. If your skill is a new capability (a new estimating workflow, a new insurance claim skill, a new marketing function), it needs an A3.

### Step 2 — Draft the A3

Copy `proposals/_a3-template.md` to `proposals/YYYY-MM-DD-<skill-name>.md`. Fill in all eight sections. Key requirements:

- **The baseline must be measured from brain atoms, not estimated.** If Conductor has been logging manual work patterns, those atoms are your baseline. If this is a new engagement without data yet, note it and document a 30-day measurement period.
- **The ROI calculation must include agent operating cost** (token costs + infrastructure share), not just time savings.
- **Trust tier of the output must be declared.** Inference-tier outputs (model-generated conclusions) cannot auto-promote to instruction tier without human confirmation — state this in the A3 risks section.

### Step 3 — Get approval

Submit the A3 to Chris (tag in the Cleverwork Slack channel). Chris and the account manager review. Approved A3s are added to `proposals/_backlog.md` with a target build date. Killed or deferred A3s are archived in `proposals/` — not deleted.

### Step 4 — Build the skill

Once approved, create the skill folder under `skills/cleverwork-roofer/<skill-name>/`. Every skill folder must contain:

- `SKILL.md` — frontmatter (`name`, `description`, `when_to_use`, `inputs`, `outputs`, `trust_tier_of_output`, `bound_agents`, `provenance`) followed by the prompt/instructions. Use the template at `skills/_template/SKILL.md`.
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "license": "MIT", "bound_agents": [], "a3_ref": "proposals/YYYY-MM-DD-<skill-name>.md" }`.

Do not copy prompt text verbatim from OB1, InfraNodus, or Dynamous materials. Write Cleverwork-original prompts. If you are adapting a concept from one of those sources, cite it in `metadata.json` under `provenance` and re-express in your own words.

### Step 5 — Pilot before promoting

Deploy to one client's brain first. Observe for two weeks. After two weeks:
- If Auditor pass rate on the skill's outputs meets the target in the A3: promote to template default.
- If Auditor pass rate is 20%+ below target: return to the A3 for root cause analysis before promoting.

Update `docs/05-model-matrix.md` with the new skill's model tier assignment.

---

## Adding a Bridge (New Integration)

To connect a new PM tool, accounting system, photo service, or data source, create a new bridge adapter.

### Template

Copy `integrations/bridges/_template/` to `integrations/bridges/<source-name>/`. The template directory contains:
- `README.md` — document the source system, the tier (1–4 per the adapter taxonomy in `docs/00-architecture-brief.md` §3.2), data mapped to atom schema, and how to test.
- `index.ts` (or `index.py`) — the adapter code.
- `schema-map.json` — explicit mapping of source-system fields to atom schema fields.
- `sample-payload.json` — an anonymized sample payload from the source system.

### Requirements

Every bridge adapter must:

1. **Resolve property_id.** Look up or create the property record from the address or parcel ID in the source system. Atoms without a `property_id` lose their most valuable attribute.
2. **Set trust_tier.** Default is `evidence`. Use `instruction` only for human-confirmed facts (approved invoices, signed change orders). Never use `instruction` for auto-generated source data.
3. **Set model_card.** `{ "provider": "bridge", "model_name": "<adapter-name>", "model_version": "<adapter-version>" }`.
4. **Set era_of_practice where applicable.** For historical imports, set the era. For current operational data, `null` is acceptable.
5. **Validate webhook signatures.** If the source system signs payloads, validate the signature before processing. See the AccuLynx bridge (`integrations/bridges/acculynx/`) for the pattern.
6. **Wrap external content in trust boundaries.** Any free-text content from the source system that passes into an agent prompt must use the trust-boundary wrap function. See `server/lib/trust-boundary.ts`.
7. **Write integration tests.** Include a `test/` folder with tests against the sample payload. The bridge is not complete without tests.

### Register the bridge

1. Add the integration toggle to `config/roofer.config.example.yaml` under `integrations:`.
2. Add the API key to `config/.env.example`.
3. Update `docs/01-onboard-a-roofer.md` with any setup steps specific to the new integration.
4. Create a Coolify app for the bridge, add its deploy hook to `.env`, and either trigger the hook from `scripts/new-client.sh` or redeploy from the Coolify UI.

---

## Adding a Jurisdiction and Regulatory Snapshot

When a client expands into a new city or county:

1. Add the jurisdiction to `config/roofer.config.yaml`:
   ```yaml
   jurisdictions:
     - name: "Round Rock, TX"
       ahj: "Round Rock Building Inspection"
       building_code: "IRC-2021"
       wind_zone: "Vult 115 mph"
   ```
2. Run `scripts/sync-jurisdictions.sh` — this reads the config and creates or updates the `jurisdiction` and `regulatory_snapshot` rows in the database. It is idempotent.
3. If you have detailed amendment information for the jurisdiction (specific local departures from the base IRC), add it to the `notes` field in the config. These notes become atoms in the brain tagged with `source_type = "regulatory"` and `trust_tier = "instruction"`.

When a code cycle changes (e.g. the jurisdiction adopts IRC-2024):

1. Do not change the existing `regulatory_snapshot` row — that row reflects the code that was in effect when past atoms were captured, and those atoms must remain accurate to their era.
2. Add a new row with the updated code version and its effective date. Run `scripts/sync-jurisdictions.sh` to create it.
3. Atoms captured after the effective date will reference the new snapshot automatically via the Capture agent's jurisdiction lookup.

---

## Enabling a Dormant Agent or Skill

Some agents and skills ship disabled to keep the first-deployment footprint small. To enable one:

1. In `config/roofer.config.yaml`, change the agent's `enabled` flag to `true` and confirm the skill pack is correct.
2. If the agent requires an additional bridge or API key, add the key name to `config/.env.example`, store the real value in the relevant Coolify app env / vault, and keep only local provisioning values in `.env`.
3. Re-run `scripts/new-client.sh` or trigger the specific Coolify deploy hook. If schema is already current, the SQL files are idempotent.
4. If the agent has a Slack handle, invite it to the relevant channels: `/invite @ob-<role>`.
5. Run `scripts/verify-deployment.sh` to confirm the newly enabled agent is responding.

**Example — enabling `@ob-accounting`:**

```yaml
# config/roofer.config.yaml
agents:
  vertical:
    accounting: { enabled: true, skills: [invoicing, ar-aging, job-costing, change-orders, insurance-supplements] }
```

Then in `.env`:
```
QUICKBOOKS_CLIENT_ID=<value>
QUICKBOOKS_CLIENT_SECRET=<value>
QUICKBOOKS_REFRESH_TOKEN=<value>
```

Then store those three keys in the accounting/brain app env in Coolify, redeploy the affected container, and run `scripts/verify-deployment.sh`.

---

## Changing Model Tiers

To change the model tier for all agents in a category:

1. Edit `model_tiers` in `config/roofer.config.yaml`:
   ```yaml
   model_tiers:
     workhorse: "standard"   # change to "fast" to reduce cost, or "frontier" to improve quality
   ```
2. Redeploy the affected containers from Coolify or their configured deploy hooks.
3. Update `docs/05-model-matrix.md` to reflect the change.
4. Run `scripts/verify-deployment.sh` to confirm the new tier is reachable.

**Practical guidance:**

- Downgrading `workhorse` from `standard` to `fast` (Haiku-class) reduces cost by roughly 10–15x per token. It is appropriate for clients in the early capture phase (mostly atomization and daily digests). It is not appropriate for clients running active insurance-claim supplement negotiations where output quality directly affects revenue.
- Upgrading `capture` from `fast` to `standard` improves atomization quality on complex debrief transcripts where the fast model misclassifies nuanced soft atoms. The cost increase is usually worth it for clients with high debrief volume.
- Changing `embeddings` requires re-embedding all atoms. See the re-embedding note in `docs/05-model-matrix.md`.

---

## White-Labeling the Dashboard

The Coolify dashboard is an Astro application under `deployment/remote/dashboard/`. It is intended as an internal Cleverwork operator view — it is not client-facing in the current architecture. If you want to add a client-facing view:

1. Create a new page in `deployment/remote/dashboard/src/pages/client/`.
2. The page should use only `PUBLIC_SUPABASE_ANON_KEY` and the read-only RLS policies. Do not expose any write paths or admin views to clients.
3. Add client authentication using the chosen auth layer from `docs/08-stack-and-topology.md`.
4. Update `config/roofer.config.yaml` under `deployment.dashboard` if the client-facing dashboard should be enabled.

For company branding (logo, colors):

1. Edit the dashboard's global CSS/theme file — it should use CSS variables that cascade throughout the dashboard.
2. Drop the client's logo into `deployment/remote/dashboard/public/logo.svg`.
3. Redeploy from Coolify or trigger `COOLIFY_DASHBOARD_DEPLOY_HOOK`.

---

## Adjusting Consent Defaults

Consent defaults are in `config/roofer.config.yaml` under `consent:`. They can be changed at any time; the change takes effect on the next brain sync (next time Capture or Conductor reads the config).

```yaml
consent:
  cross_client_default: "opt_in"        # change to "opt_out" to default new atoms to private
  trade_restriction: ["roofing"]         # trades this client never shares with (same-trade competitors)
  publishable_external_default: false    # true would auto-publish EEAT atoms without per-atom approval
```

**Important:** changing `cross_client_default` affects new atoms going forward. Existing atoms retain the `consent_flags` they were written with. To backfill the new default to existing atoms, run:

```bash
./scripts/sync-consent-defaults.sh   # updates all atoms with null consent_flags to the current default
```

This script does not overwrite atoms where `consent_flags` were explicitly set at atomization time — it only fills in the nulls.

**`publishable_external_default` should remain `false` in almost all cases.** Setting it to `true` would allow Marketing to propose external publication of EEAT atoms without the per-atom client-approval step. The per-atom approval (the one-click Slack message) is not a bureaucratic step — it is the legal and reputational guard that ensures a client never has content published under their name without reviewing it. Change this only if the client has explicitly consented to auto-publication and you have that consent documented.
