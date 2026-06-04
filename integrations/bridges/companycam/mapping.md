# CompanyCam → Brain Schema Field Mapping

**API version documented against:** CompanyCam REST API v2
**Adapter version:** 1.0.0
**Last reviewed:** 2026-05-29

---

## 1. Project → `public.property` + optional `public.job` linkage

| CompanyCam Field | Brain Table | Brain Field | Transform |
|-----------------|-------------|-------------|-----------|
| `project.address.street_address_1` | `public.property` | `address_line1` | Normalize |
| `project.address.street_address_2` | `public.property` | `address_line2` | Optional |
| `project.address.city` | `public.property` | `city` | |
| `project.address.state` | `public.property` | `state` | 2-char code |
| `project.address.postal_code` | `public.property` | `postal_code` | |
| `project.id` | `metadata.external_id` | | Carried in every photo atom |
| Cross-reference | `public.job` | `job_id` | Match by `(property_id, open job_phase)` if AccuLynx bridge active |

---

## 2. Photo → `public.thoughts` atom

| CompanyCam Field | Brain Field | Transform / Notes |
|-----------------|-------------|------------------|
| `photo.id` | `metadata.external_id` | CompanyCam photo UUID |
| `photo.uri` (processed) | `metadata.source_url` | HTTPS URL; not downloaded |
| `photo.uris.original` | `metadata.source_url_original` | Full-resolution URL |
| `photo.captured_at` | `original_capture_date` | DATE portion; prefer EXIF over upload timestamp |
| `photo.tags[]` | `metadata.photo_tags` | Array of tag strings |
| `photo.creator.name` | `metadata.captured_by` | Crew member who uploaded |
| `project.id` | `metadata.project_id` | CompanyCam project reference |
| Derived | `content` | See content templates below |
| Derived | `eeat_signal` | See EEAT mapping below |
| Derived | `soft_or_hard` | See classification below |
| `"evidence"` | `trust_tier` | All photos are evidence tier |
| `"bridge"` | `model_card.provider` | |
| `"companycam-bridge"` | `model_card.model_name` | |
| SHA-256 of `companycam:{photo.id}:photo_record:{captured_at}` | `content_fingerprint` | Idempotent upsert key |

### Content Templates by Photo Stage

| Tag Category | content Template |
|-------------|-----------------|
| Before / Pre-storm | `"Before photo at {address}: {tag list}. Captured {date} by {creator}."` |
| Storm damage | `"Storm damage documentation at {address}: {tag list}. Captured {date}."` |
| In-progress | `"In-progress photo at {address}: {tag list}. Captured {date}."` |
| After / Post-install | `"Completed installation photo at {address}: {tag list}. Captured {date}."` |
| Adjuster / Inspection | `"Adjuster inspection photo at {address}. Captured {date}."` |
| Permit | `"Permit/inspection pass documentation at {address}. Date: {date}."` |
| Other | `"Job site photo at {address}: {tag list}. Captured {date}."` |

---

## 3. EEAT Signal Mapping

The EEAT signal on a photo atom is determined by tag content. Tags are case-insensitive; partial
matches are used for flexibility. Override tag names in `roofer.config.yaml → integrations.companycam.tag_map`.

| Tag Pattern | `eeat_signal.type` | `eeat_signal.value` | `publishable_with_consent` |
|------------|-------------------|---------------------|---------------------------|
| "before", "pre-storm", "pre-loss" | Experience | 0.80 | true |
| "after", "complete", "finished", "post-install" | Experience | 0.85 | true |
| "before" + "after" pair on same project | Experience | 0.90 | true |
| "damage", "storm", "hail", "wind" | Experience + Authoritativeness | 0.85 | true |
| "adjuster", "inspection", "adjuster walkthrough" | Authoritativeness | 0.80 | false (claim-sensitive) |
| "permit", "passed", "final inspection", "co" | Trustworthiness | 0.90 | true |
| "detail", "flashing", "valley", "penetration" | Expertise | 0.75 | true |
| "team", "crew", "install day" | Experience | 0.65 | false (crew consent required) |
| "material delivery", "delivery" | Experience | 0.55 | false |
| Unrecognized / no tag | (none) | null | false |

**Before/After pair detection:** The adapter identifies pairs by finding two photos on the same
project where one matches a "before" pattern and one matches an "after" pattern, with the after
photo having a later `captured_at` date. The pair is annotated in both atoms:
`metadata.eeat_pair_id = "<before_photo_id>:<after_photo_id>"`.

---

## 4. soft_or_hard Classification

| Photo context | `soft_or_hard` |
|---------------|----------------|
| Damage, scope, materials, permit, measurement | `"hard"` |
| Crew interaction, homeowner in frame (with consent), team photo | `"soft"` |
| Adjuster meeting documentation | `"hard"` |
| Before/after narrative (EEAT content) | `"hard"` (technical) with `eeat_signal` set |

---

## 5. Insurance Claim Evidence Flag

When a photo's project matches a property with an open `public.insurance_claim`, the adapter sets:

| Brain Field | Value |
|-------------|-------|
| `metadata.insurance_claim_evidence` | `true` |
| `metadata.claim_id` | UUID of the matching `public.insurance_claim` row |

This flag enables `@ob-sales` to pull the complete photo evidence set for supplement negotiations
without searching by tag or date range.

---

## 6. Comments → atoms

CompanyCam photo comments are treated as soft atoms when they contain narrative content.

| CompanyCam Field | Brain Field | Transform |
|-----------------|-------------|-----------|
| `comment.content` | `content` | Full comment text |
| `comment.created_at` | `original_capture_date` | DATE |
| `comment.creator.name` | `metadata.author` | |
| `photo.id` | `metadata.parent_photo_id` | Links comment to the photo it annotates |
| Derived | `soft_or_hard` | Comments about scope → `"hard"`; relationship/preference notes → `"soft"` |

---

## Fields Not Mapped

| CompanyCam Field | Reason Not Mapped |
|-----------------|-------------------|
| `photo.uris.thumbnail` | Redundant with `source_url`; not stored |
| EXIF GPS coordinates | Not stored in atom content; geolocation is a consent-gated field |
| `project.members[]` | Member list → not separately atomized; used only for `crew` resolution |
