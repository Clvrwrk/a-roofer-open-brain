# GHL → brain field mapping

Every atom this bridge writes carries `model_card = {provider:"bridge", model_name:"gohighlevel", model_version:"0.1.0"}`, resolves `property_id` from the contact address, sets `source_system="gohighlevel"`, and de-dupes via `content_fingerprint`. `trust_tier = evidence` unless noted.

## Contact → property + job (pre-contract)

| GHL field | → brain |
| --- | --- |
| `contact.address1` + city/state/postal | resolve-or-create `public.property` (property-onboarding recipe) |
| `contact.id` | `job.metadata.ghl_contact_id` |
| `contact.source` | `job.metadata.lead_source` + lead-source atom |
| `contact.tags` | atoms (qualification, storm-event tag, etc.) |

## Opportunity → job phase

| GHL pipeline stage (example) | → `job.job_phase` |
| --- | --- |
| New Lead / Unqualified | `lead` |
| Inspection Scheduled / Estimating | `estimate` |
| Proposal Sent | `estimate` |
| Won / Signed | `won` → **fires AccuLynx handoff** |
| Lost | `lost` |

`opportunity.monetaryValue` → `job.contract_amount` (provisional until AccuLynx confirms). The stage→phase map is configurable per client (pipelines differ).

## Appointment → atom

`appointment.{title, startTime, address, status}` → atom on the job; an inspection/estimate visit. `@ob-sales` uses these for follow-up and adjuster scheduling.

## Conversation → atom

`message.{type, body, direction, dateAdded}` → atom linked to the job. `direction=inbound` from a homeowner is `soft_or_hard` inferred; nurture/outbound is `hard`. Call recordings (if present) → transcript atom via the meeting-capture provider.

## Won → AccuLynx handoff (the one cross-CRM seam)

On `OpportunityStageUpdate` to **won**: set `job.job_phase=won`, ensure `property`+`job` exist, trigger/link the AccuLynx job, store `job.external_ref` for both `source_system`s, and write a handoff atom. Post-handoff, AccuLynx milestones drive `job_phase`; GHL atoms continue only for nurture/reviews. The handoff is logged so the Auditor can verify nothing dropped between funnels.

## Signed contract → instruction

A signed proposal/contract event is `trust_tier = instruction` (human-confirmed truth), unlike speculative pipeline data.
