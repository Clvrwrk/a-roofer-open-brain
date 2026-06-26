# GHL CLI Capability Baseline (Imported Pattern)

This repo now carries the same operational pattern used in the external `GHL - Claude CLI` workspace, adapted for `a-roofers-open-brain`.

## Scope and parity

- **API host**: `https://services.leadconnectorhq.com`
- **Primary version**: `2021-07-28` (endpoint overrides allowed when required)
- **Auth modes**:
  - `GHL_API_KEY` / PIT for single sub-account flows
  - agency OAuth pattern for multi-location rollups
- **Core surfaces**: contacts, opportunities/pipelines, calendars, workflows (read), conversations, payments, forms, social, locations/custom fields

## Critical runtime lessons (must keep)

1. **Explicit User-Agent on every request**
   - Cloudflare 1010 can block default Python `urllib` signatures.
   - Always send a stable UA, e.g. `stormwatch-connector/1.0 (+https://proexteriorsus.com)`.

2. **Never assume env var names are universal**
   - This repo now supports fallback mapping:
     - `ZI_BEARER_TOKEN` or `ZOOMINFO_BEARER_TOKEN`
     - `GHL_API_KEY` or `GHL_PIT_KEY` or `GHL_CW_SUB_ACCOUNT_PIT`

3. **Custom field payload format**
   - Contact updates use:
   - `customFields: [{ id: "<fieldId>", value: "<string>" }]`
   - Avoid `field_value`; it is not accepted by the current GHL v2 contact payload.

4. **Replay path for backfills**
   - Existing runs can be re-pushed with:
   - `python3 scripts/stormwatch/run_stormwatch_connectivity.py --push-ghl --replay-run-id <run_uuid>`
   - This allows fixing historical sync defects without re-running ZoomInfo search/enrich.

## Stormwatch-specific contract

- Gate before push:
  - `mandatory_email_ok = true`
  - `mandatory_phone_ok = true`
  - `mandatory_office_address_ok = true`
- Persist identity links:
  - `zoominfo_contact_id`
  - `zoominfo_company_id`
  - `supabase_contact_row_id`
  - `ghl_contact_id`
  - `ghl_opportunity_id`
- Persist field map IDs in:
  - `stormwatch_ghl_custom_fields`
  - `stormwatch_field_contract`

## Stormwatch lead packaging support

- Replay and backfill now support full package propagation:
  - `python3 scripts/stormwatch/run_stormwatch_connectivity.py --push-ghl --replay-run-id <run_uuid>`
- Packaged surfaces synced:
  - contact core (`email`, `phone`, address)
  - ranking (`priority_tier`, `lead_score_total`, `why_now`)
  - office label (`office_display_name = [company]-[street]`)
  - checklist/property summary custom field payloads
  - first summary note (contact notes endpoint)
- Opportunity name is updated to include office context + priority score:
  - `[company]-[street] - Stormwatch <Role> | <Tier>:<Score>`
- Visit action payload support:
  - `first_visit_task_summary`
  - `first_visit_task_payload`
  - stored on `stormwatch_zoominfo_contacts` and mirrored in `stormwatch_ghl_sync`

## Storm Alert orchestration command

- Event-driven pipeline entrypoint:
  - `python3 scripts/stormwatch/run_storm_alert_pipeline.py --event-file <hail_event.json> --property-seed-file <property_seed.json> [--push-ghl]`
- What this command executes:
  1. writes `stormwatch_storm_events` trigger row (SLA clock start)
  2. runs property discovery staging (`stormwatch_property_research`)
  3. canonicalizes owner/manager/maintenance companies (`stormwatch_company_resolution`)
  4. launches `run_stormwatch_connectivity.py` with seeded company feed
  5. runs `sync_stormwatch_property_object.py` for property-object mapping
- SLA telemetry surfaces:
  - `stormwatch_storm_event_runs` (stage-level elapsed)
  - `stormwatch_zoominfo_runs.elapsed_seconds` + `sla_status`

## Verification checklist

1. Confirm `stormwatch_ghl_sync.sync_status` and `synced_at` for target run.
2. Validate live GHL contacts by ID:
   - `email`, `phone`, and `customFields` count populated.
3. Confirm opportunity IDs exist for synced contacts.
4. Confirm first summary note sync status:
   - `stormwatch_ghl_sync.first_summary_note_status = synced` for accepted leads.
5. Confirm visit-task payload is present for accepted leads:
   - `stormwatch_zoominfo_contacts.first_visit_task_payload IS NOT NULL`
6. Confirm rejection rows exist only for mandatory-field failures.

## Multi-property account recommendation

For commercial operators where one superintendent can manage multiple roofs, add a dedicated GHL custom object for `property` and relate it to contact/opportunity records:

- Why:
  - captures 1-to-many property potential cleanly
  - allows account-level and contact-level portfolio scoring
  - avoids flattening multiple properties into contact text fields
- Recommended score extension:
  - add `portfolio_potential_score` based on count of active properties and estimated roof area
  - compute `multi_property_multiplier` when `managed_property_count > 1`
  - roll this into opportunity priority for routing/response ordering

## Recommended next hardening

- Add endpoint-specific version map (like external CLI client) so mixed-version surfaces remain stable.
- Add transient retry/backoff for GHL 429/5xx.
- Add per-contact structured error taxonomy (`contact_failed`, `opportunity_failed`, `blocked_by_cf`, `auth_failed`) in `stormwatch_ghl_sync`.
- Promote direct opportunity↔business mapping automatically when association definitions are available; fallback to contact association remains enabled.
