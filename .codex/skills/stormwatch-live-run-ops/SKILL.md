# Stormwatch Live Run Ops

Use this skill before any `--push-ghl` Stormwatch execution.

## Purpose

Prevent repeated runtime failures seen in prior runs:

- Duplicate storm event IDs (`external_event_id` unique collisions)
- Missing schema columns after additive migrations
- Contract-table partial upsert regressions
- Zero-created GHL records caused by mandatory-gate attrition
- Confusion around available GHL association directions

## Required Workflow

1. **Run preflight**
   - `python3 scripts/stormwatch/stormwatch_preflight.py --event-id <new_event_id>`
   - If non-zero exit: fix checks first; do not run live push.

2. **Check likely gate attrition**
   - Query latest rejection reasons.
   - If dominant reason is `missing_office_address`, either:
     - enrich upstream seed payload with complete office address fields, or
     - run non-push simulation first to verify accepted contact count.

3. **Execute simulation mode**
   - Non-push run:
     - `python3 scripts/stormwatch/run_storm_alert_pipeline.py --event-file ... --property-seed-file ...`
   - Confirm expected accepted contacts > 0 before live push.

4. **Execute live push**
   - `python3 scripts/stormwatch/run_storm_alert_pipeline.py --event-file ... --property-seed-file ... --push-ghl`

5. **Return exact IDs**
   - Query `stormwatch_ghl_sync` and `stormwatch_ghl_property_object_map` by `run_id`.
   - Return:
     - `ghl_contact_id`
     - `ghl_opportunity_id`
     - `business_record_id`

## Output Contract

When reporting a run:

- Include `storm_event_id`, `stormwatch_run_id`
- Include counts: searched/enriched/rejected/synced
- Include explicit ID list (or explicit `none`)
- Include top rejection reason if synced = 0

## Never Skip

- User-Agent on external API requests
- Live DB verification (not migration-only assumptions)
- Unique `event_id` per live run
- Preflight before `--push-ghl`
