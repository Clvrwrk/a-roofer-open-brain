# Stormwatch ZoomInfo -> Supabase -> GHL Field Contract

Stormwatch uses a canonical field contract so every accepted contact can round-trip identity across systems while keeping ZoomInfo read-only.

## Mandatory acceptance gates

- At least one phone (`phone`, `mobilePhone`, `directPhoneAlt`, `mobilePhoneAlt`)
- At least one email (`email`, `emailAlt`)
- Office address from company location (`companyStreet`, `companyCity`, `companyState`, `companyZipCode`)

Contacts that fail any gate are written to `public.stormwatch_zoominfo_rejections` with `rejection_reason`.

## Canonical mapping keys

The authoritative contract is stored in `public.stormwatch_field_contract` with `mapping_version = v2_full_contract`.

- `zoominfo_contact_id`
- `zoominfo_company_id`
- `zoominfo_company_name`
- `zoominfo_job_title`
- `zoominfo_management_level`
- `zoominfo_primary_email`
- `zoominfo_primary_phone`
- `zoominfo_office_address`
- `stormwatch_office_display_name`
- `stormwatch_priority_tier`
- `stormwatch_lead_score_total`
- `stormwatch_why_now`
- `stormwatch_first_touch_channel`
- `stormwatch_first_touch_cta`
- `stormwatch_visit_task_summary`
- `stormwatch_property_summary`
- `stormwatch_checklist_status`
- `stormwatch_company_office_phone`
- `stormwatch_company_office_email`
- `stormwatch_company_website`
- `stormwatch_office_website`
- `supabase_contact_row_id`

## Storm Alert orchestration contract (v1)

Storm-triggered runs now persist event-level telemetry and staging lineage before ZoomInfo enrichment:

- `stormwatch_storm_events`
  - authoritative start-clock from HailRecon (`alert_received_at`)
  - event geometry (`storm_center_lat`, `storm_center_lng`, `radius_miles`)
  - status progression (`received`, `running`, `ae_ready`)
- `stormwatch_storm_event_runs`
  - stage-by-stage telemetry (`property_discovery`, `company_resolution`, `zoominfo_enrichment_and_ghl_sync`, `property_object_mapping`)
  - `stage_started_at`, `stage_finished_at`, `elapsed_seconds`, `detail`
- `stormwatch_property_research`
  - 50-mile bounded property candidates from Apify/Reonomy/seed sources
  - owner/manager/maintenance extraction with provenance payload
- `stormwatch_company_resolution`
  - canonicalized company entities by role (`owner`, `manager`, `maintenance`)
  - dedup identity + confidence + source lineage

## Lead packaging contract (v1)

Every accepted lead now gets a deterministic package before GHL sync:

- **Property section**
  - `property_section` JSON
  - normalized fields (`property_street`, `property_city`, `property_state`, `property_zip`, `property_country`)
  - management fields (`property_management_company`, `property_management_email`, `property_management_phone`)
- **Lead ranking section**
  - `lead_score_total`, `lead_score_fit`, `lead_score_intent`, `lead_score_readiness`
  - `lead_score_routing`, `lead_score_completeness`, `lead_score_risk_penalty`
  - `priority_tier` (`P1`, `P2`, `P3`)
  - `why_now`, `lead_score_reason`
- **Standardized checklist**
  - `lead_checklist` JSON
  - `lead_checklist_version`
- **First summary note**
  - `first_summary_note_md`
  - `first_summary_note_payload`
  - `first_summary_note_generated_at`
- **First in-person visit task payload**
  - `first_visit_task_summary`
  - `first_visit_task_payload`
  - `first_visit_task_generated_at`
- **Office naming convention**
  - `office_display_name = [company_name]-[street address]` (or city/state fallback)
  - `office_key` for deterministic office identity
  - canonical `company_name` remains unchanged

## Identity linkage

- Source IDs are stored in `public.stormwatch_zoominfo_contacts`:
  - `zoominfo_contact_id`
  - `zoominfo_company_id`
  - `id` (Supabase row UUID)
- Sync linkage is stored in `public.stormwatch_ghl_sync`:
  - `zoominfo_contact_id`
  - `supabase_contact_row_id`
  - `ghl_contact_id`
  - `ghl_opportunity_id`
  - `mapping_version`
  - `identity_payload`

## GHL custom field bootstrap

The runner tracks custom field metadata in `public.stormwatch_ghl_custom_fields` so future runs use deterministic field IDs/keys by location and object.

## GHL sync packaging guarantees

- Contact payload includes normalized core fields (`email`, `phone`, address) and mapped custom fields.
- Opportunity naming uses office display label plus priority score suffix when available:
  - `[company]-[street] - Stormwatch <Role> | <Tier>:<Score>`
- First summary note is written to the contact note surface and tracked in:
  - `stormwatch_ghl_sync.first_summary_note_status`
  - `stormwatch_ghl_sync.first_summary_note_synced_at`
- Visit-task recommendation payload is persisted for downstream task automation in:
  - `stormwatch_ghl_sync.first_visit_task_status`
  - `stormwatch_ghl_sync.first_visit_task_payload`
