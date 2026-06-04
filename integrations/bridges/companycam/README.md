# CompanyCam Bridge

CompanyCam is the job-site photography platform used by the majority of professional roofing crews.
Its primary value in the brain is twofold: it is the best source of **EEAT evidence atoms** (before/
after documentation of real work on real roofs), and it is the primary **insurance claim evidence
trail** (storm damage photos, adjuster walkthrough photos, completed scope documentation).

Priority: 2 of 5 in the roofer shortlist.

---

## Authentication

CompanyCam uses OAuth 2.0 or a static API key depending on plan tier.

- Header: `Authorization: Bearer {COMPANYCAM_API_KEY}` or `Authorization: Bearer {access_token}`
- Secret storage: `.env` → `COMPANYCAM_API_KEY`
- API docs: https://docs.companycam.com/

---

## Ingested Objects

### Projects

A CompanyCam "project" corresponds to a roofing job site. The project has an address that must be
resolved to a `public.property` row. Projects map to the job relationship via address matching;
if AccuLynx is also enabled, the bridge attempts to cross-reference by matching address to
an existing `public.job` row.

### Photos

Photos are the primary output of this bridge. Each photo becomes one `public.thoughts` atom with:

- `metadata.source_url` — the CompanyCam-hosted photo URL (not downloaded into the brain)
- `metadata.photo_tags` — user-applied tags from CompanyCam
- `metadata.captured_at` — the photo's EXIF timestamp if available, otherwise upload timestamp
- `eeat_signal` — set based on tag classification (see mapping.md)
- `soft_or_hard = "hard"` for damage/scope documentation; `"soft"` for crew + homeowner narrative photos

### Photo Tags and EEAT Classification

CompanyCam allows custom tags. The bridge reads the company's tag list and maps known patterns
to EEAT signal types. See `mapping.md` for the full tag → EEAT value table.

The highest-value EEAT configuration is a **before/after pair** on the same project with date
ordering — storm damage before + completed install after. The bridge detects these pairs by matching
project + date sequence and marks the pair atom with `eeat_signal.value = 0.90`.

### Comments

Photo comments in CompanyCam frequently contain the same high-value soft atoms as AccuLynx messages:
field observations, crew notes, "remember for next time" language. These are harvested as soft atoms
with the same classification logic as AccuLynx messages.

---

## Property and Job Resolution

1. CompanyCam project address → `public.property` lookup via the standard address resolution SOP.
2. If AccuLynx bridge is also enabled, attempt to match the resolved `property_id` to an open
   `public.job` row by `(property_id, job_phase NOT IN ("closed","warranty","lost"))`. If a match
   is found, associate the photo atoms with that `job_id`.
3. If no job match, `job_id = null`. The photo atom is still useful as a property-level record
   (the before/after EEAT value does not require a job FK).

---

## Webhook vs. Pull

CompanyCam supports webhooks for photo upload events. Subscribe to the `photo.created` event.
The adapter also runs a scheduled pull to catch photos uploaded when the webhook was inactive.

---

## Insurance Claim Evidence Flag

When a photo is tagged with damage-related tags (configurable via
`roofer.config.yaml → integrations.companycam.damage_tags`) and the associated job has an open
`public.insurance_claim` row, the adapter sets:

```json
{
  "metadata": {
    "insurance_claim_evidence": true,
    "claim_id": "<uuid>"
  }
}
```

This allows `@ob-sales` to quickly pull all claim evidence photos when preparing a supplement package.

---

## Known Constraints

- Photos are not stored in the brain — only URLs. If CompanyCam deletes a photo, the atom's
  `source_link_broken` field will be set to `true` by Maintenance on its next HEAD-check cycle.
- EXIF geolocation on photos is an EEAT signal amplifier (proves the work was done at the stated
  address) but must not be exposed in external-published atoms without explicit consent.
- Video support follows the same atom pattern as photos; EEAT signal defaults are lower (`value: 0.65`)
  unless the video is a walkthrough narrative.
