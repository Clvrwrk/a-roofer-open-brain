---
name: gohighlevel-rest-ops
description: Use for live GHL contact/opportunity operations, custom fields, and replay/backfill syncs from Stormwatch Supabase runs.
---

# GoHighLevel REST Ops

Use this skill when you need to execute or debug live GHL sync behavior in this repo.

## Preconditions

- Run from repo root: `/Users/chussey/Documents/a-roofers-open-brain`
- Load env: `set -a && source .env && set +a`
- Ensure mapped vars are present:
  - `GHL_API_KEY` (or map from `GHL_PIT_KEY` / `GHL_CW_SUB_ACCOUNT_PIT`)
  - `GHL_LOCATION_ID`
  - `GHL_PIPELINE_ID`
  - `GHL_PIPELINE_STAGE_ID`
  - `ZI_BEARER_TOKEN` (or map from `ZOOMINFO_BEARER_TOKEN`)

## Non-negotiable request headers

- `Authorization: Bearer <token>`
- `Version: 2021-07-28`
- `Accept: application/json`
- `Content-Type: application/json`
- `User-Agent: stormwatch-connector/1.0 (+https://proexteriorsus.com)`

Without a stable `User-Agent`, Cloudflare 1010 can block requests.

## Primary run modes

### 1) Full search/enrich/gate/sync run

```bash
python3 scripts/stormwatch/run_stormwatch_connectivity.py \
  --push-ghl \
  --max-companies 10 \
  --max-contacts-per-role 1
```

### 2) Replay an existing run to GHL (no ZoomInfo re-search)

```bash
python3 scripts/stormwatch/run_stormwatch_connectivity.py \
  --push-ghl \
  --replay-run-id <stormwatch_run_uuid>
```

Use replay when historical contacts exist in Supabase and you need to repair or backfill GHL fields.

## Field mapping rules

- Core contact fields:
  - `firstName`, `lastName`, `name`, `companyName`
  - `email`, `phone`
  - `address1`, `city`, `state`, `postalCode`, `country`
- Custom fields payload must be:
  - `customFields: [{ id: "...", value: "..." }]`

## Verification flow

1. Check Supabase run sync rows:
   - `stormwatch_ghl_sync` for `sync_status`, `ghl_contact_id`, `ghl_opportunity_id`.
2. Check live GHL by contact ID:
   - `GET /contacts/{id}` and verify `email`, `phone`, `customFields`.
3. Confirm opportunities exist in selected pipeline/stage.

## Failure patterns

- **Cloudflare 1010**: missing/blocked request signature; ensure custom user-agent.
- **No data in GHL but sync shows success**: inspect response payload and status code handling; do not treat fallback IDs as success when HTTP failed.
- **Replay boot failure on field-contract upsert**: load existing `stormwatch_ghl_custom_fields` instead of upserting partial `stormwatch_field_contract` rows.
