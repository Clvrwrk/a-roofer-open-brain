# Adapter Contract — Field-Mapping Skeleton

Copy this file to each adapter directory and complete every table.
Every column in the "Brain Field" column that is listed as Required in `_template/README.md`
must have a mapping. Leave "Source Field" blank and note "N/A — not provided" if the source
system genuinely does not supply a value for a required brain field.

---

## Source System: `<ADAPTER NAME>`

**API version documented against:** `<version>`
**Adapter version:** `1.0.0`
**Last reviewed:** YYYY-MM-DD

---

## Object 1: `<Source Object Name>` → `public.job` + atom

| Source Field | Brain Table | Brain Field | Transform / Notes |
|-------------|-------------|-------------|-------------------|
| | `public.job` | `external_ref` | |
| | `public.job` | `source_system` | Hard-coded to adapter slug |
| | `public.job` | `title` | |
| | `public.job` | `job_phase` | See milestone map below |
| | `public.job` | `contract_amount` | |
| | `public.job` | `opened_at` | Convert to UTC |
| | `public.job` | `closed_at` | Set when `job_phase = "closed"` |
| | `public.job` | `property_id` | Resolved via address lookup |
| | `public.job` | `metadata` | Carry all source IDs not in schema columns |
| | `public.thoughts` | `content` | Sentence describing the job |
| | `public.thoughts` | `trust_tier` | `"evidence"` |
| | `public.thoughts` | `model_card` | `{provider:"bridge", model_name:"<slug>", ...}` |
| | `public.thoughts` | `content_fingerprint` | SHA-256 per template SOP |
| | `public.thoughts` | `property_id` | Same as job.property_id |
| | `public.thoughts` | `job_id` | Resolved job row id |

---

## Object 2: `<Source Object Name>` → `public.property`

| Source Field | Brain Table | Brain Field | Transform / Notes |
|-------------|-------------|-------------|-------------------|
| | `public.property` | `address_line1` | |
| | `public.property` | `city` | |
| | `public.property` | `state` | |
| | `public.property` | `postal_code` | |
| | `public.property` | `parcel_id` | If available |
| | `public.property` | `roof_type` | Map from work type if available |

---

## Milestone → job_phase Mapping

| Source Milestone / Status | `public.job.job_phase` | Notes |
|--------------------------|------------------------|-------|
| | `lead` | |
| | `estimate` | |
| | `won` | |
| | `in_progress` | |
| | `punch` | |
| | `closed` | Triggers debrief |
| | `warranty` | Triggers debrief if not already done |
| | `lost` | |

---

## Object 3 (add as needed): `<Source Object Name>` → atom

| Source Field | Brain Table | Brain Field | Transform / Notes |
|-------------|-------------|-------------|-------------------|

---

## Known Omissions

List any source fields that exist in the API but are intentionally not mapped, with the reason.

| Source Field | Reason Not Mapped |
|-------------|-------------------|
