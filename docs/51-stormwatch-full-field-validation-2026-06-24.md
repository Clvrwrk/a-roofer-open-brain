# Stormwatch Full-Field Contract Validation (2026-06-24)

## Scope

Validation for the Stormwatch full-field contract hardening pass:

- additive schema migration applied
- field contract table populated
- GHL custom fields bootstrapped and persisted
- latest production run measured for mandatory-field compliance

## Migration / schema status

- Applied migration: `stormwatch_full_field_contract_148`
- New table: `public.stormwatch_zoominfo_rejections`
- New table: `public.stormwatch_field_contract`
- New table: `public.stormwatch_ghl_custom_fields`
- `public.stormwatch_zoominfo_contacts` extended with enriched payload + mandatory normalized fields
- `public.stormwatch_ghl_sync` extended with mapping/identity ledger fields

## Contract + custom field status

- Active contract mappings: `9`
- Persisted GHL custom fields (contact object, target location): `11`
- Contract rows linked to GHL custom field IDs: complete for all contract rows that target GHL custom fields.

## Latest run compliance snapshot

Run ID: `a5561a69-47dd-4123-8557-76a51fd7c832`

- Total contacts: `10`
- With phone: `0`
- With email: `0`
- With office address: `0`
- Passing all mandatory gates: `0`
- Rejected count (new rejection table): `0`
- Sync rows: `10`
- Synced: `9`
- Failed: `0`

## Interpretation

The latest historical run predates the new Search -> Enrich -> Gate flow, so mandatory normalized fields are empty for that run. This confirms why prior output did not satisfy the full-field contract.

## Next run verification target

On the next execution of the upgraded runner, success criteria are:

- `with_phone = total_contacts`
- `with_email = total_contacts`
- `with_office_address = total_contacts`
- `passing_all_mandatory = total_contacts`
- non-zero rows in `stormwatch_zoominfo_rejections` only when enrich/gate rejects records with explicit reasons
- `stormwatch_ghl_sync.identity_payload` populated for all synced records
