# AccuLynx → Brain Schema Field Mapping

This is the authoritative field-level mapping for every AccuLynx object the bridge ingests.
All endpoint paths and payload field names are cited from the `acculynx-api` skill reference files.
Base URL: `https://api.acculynx.com/api/v2`

---

## 1. Job Object → `public.job` + `public.property` + atom

**Source endpoint:** `GET /jobs/{jobId}` (slug: `getjob`)

### public.job

| AccuLynx Response Field | Brain Field | Transform |
|------------------------|-------------|-----------|
| `id` (UUID) | `external_ref` | Direct |
| `"acculynx"` | `source_system` | Hard-coded |
| `name` | `title` | Direct |
| milestone (from current milestone call) | `job_phase` | Map via `roofer.config.yaml → integrations.acculynx.milestone_map` |
| `"roofing"` | `trade` | Hard-coded; override from trade type if AccuLynx provides it |
| `contract.approvedAmount` or `financials.approvedValue` | `contract_amount` | Numeric; null if no financials yet |
| `createdDateTime` | `opened_at` | ISO 8601 UTC |
| `closedDate` | `closed_at` | Set when job_phase = "closed"; null otherwise |
| `serviceAddress.*` | `property_id` | Resolve via property lookup SOP |
| `{jobId, workType, tradeType, category, leadSource, companyId}` | `metadata` | JSONB carry-all |

### public.property (from job's serviceAddress)

| AccuLynx Field | Brain Field | Transform |
|---------------|-------------|-----------|
| `serviceAddress.line1` | `address_line1` | Trim, normalize |
| `serviceAddress.line2` | `address_line2` | Optional |
| `serviceAddress.city` | `city` | |
| `serviceAddress.state.abbreviation` | `state` | 2-char code |
| `serviceAddress.postalCode` | `postal_code` | |
| `serviceAddress.country.abbreviation` | (metadata) | Carry in property.metadata |
| Not provided | `parcel_id` | null; can be enriched later via EagleView or county assessor |
| Not provided | `roof_type` | null; populated from EagleView bridge or estimate line items |
| Not provided | `jurisdiction_id` | Resolved later by the jurisdiction lookup recipe |

### public.thoughts (job atom)

| Brain Field | Value |
|-------------|-------|
| `content` | `"AccuLynx job {title} at {address} is in phase {job_phase}. Contract: ${contract_amount}."` |
| `trust_tier` | `"evidence"` |
| `model_card` | `{provider:"bridge", model_name:"acculynx-bridge", model_version:"1.0.0", captured_at:<now>}` |
| `content_fingerprint` | SHA-256(`"acculynx:{jobId}:job_phase:{job_phase}"`) |
| `property_id` | Resolved UUID |
| `job_id` | Resolved UUID |
| `client_id` | Config client UUID |
| `metadata` | `{source_system:"acculynx", external_id:<jobId>, event_type:"job_record", bridge_tier:1}` |
| `source_type` | `"captured"` |
| `soft_or_hard` | `"hard"` |
| `consent_flags` | `{cross_client_shareable:true, trade_restriction:["roofing"], publishable_external:false}` |

---

## 2. Milestone Event → `public.job` update + atom

**Source webhook:** `job.milestone.current_changed`
**Envelope field:** `Event.newMilestone.name` (case-sensitive)

| Webhook Payload Field | Brain Field / Action | Transform |
|----------------------|----------------------|-----------|
| `jobId` | `public.job.external_ref` lookup key | |
| `Event.newMilestone.name` | `public.job.job_phase` | Map via milestone_map config |
| `Event.newMilestone.milestoneDate` | `public.job.updated_at` | UTC |
| `Event.previousMilestone.name` | `metadata.previous_milestone` | Carried in atom |
| `Event.changedBy.firstName + lastName` | `metadata.changed_by` | JSONB |
| `Event.changedDateTime` | `original_capture_date` | Date portion |

**Atom content:** `"Job {title} at {address} moved from {previous_milestone} to {new_milestone} on {date}."`

**Debrief trigger:** When `new_job_phase IN ("closed", "warranty")`, emit `job.phase_changed` event
to Conductor. See `README.md §job.closed → Debrief Trigger`.

---

## 3. Contact → `public.crew` + atom

**Source endpoint:** `GET /contacts/{contactId}` (slug: `getcontact`)
**Source endpoint:** `GET /jobs/{jobId}/contacts` (slug: `getjobcontacts`)

### public.crew

| AccuLynx Field | Brain Field | Transform |
|---------------|-------------|-----------|
| `firstName + " " + lastName` | `person_name` | |
| `contactType.name` | `role` | Map: "Homeowner"→"client", "Adjuster"→"adjuster", "Sales Rep"→"pm", "Sub"→"sub" |
| `isSubcontractor` (derived from type) | `is_subcontractor` | bool |
| `false` | `consent_to_attribute` | Default; set via debrief consent flow |
| job_id | `job_id` | Resolved job UUID |

### public.thoughts (contact atom)

| Brain Field | Value |
|-------------|-------|
| `content` | `"Contact {name} ({role}) associated with job at {address}."` |
| `trust_tier` | `"evidence"` |
| `soft_or_hard` | Contact type determines: adjuster/insurance contacts → `"hard"`; homeowner relationship notes → `"soft"` |
| `eeat_signal` | `null` default; set to `{type:"Experience", value:0.7, publishable_with_consent:true, consent_recorded_at:null}` for homeowner contacts with a completed job (EEAT testimonial candidate) |

---

## 4. Insurance Record → `public.insurance_claim` + atoms

**Source endpoint:** `GET /jobs/{jobId}/insurance` (slug: `getinsuranceforjob`)
**Source endpoint:** `GET /jobs/{jobId}/adjuster` (slug: `getadjusterforjob`)
**Source endpoint:** `GET /supplements?jobId={jobId}` (slug: `getfinancialssupplementsforcompany`)

### public.insurance_claim

| AccuLynx Field | Brain Field | Transform |
|---------------|-------------|-----------|
| job_id (resolved) | `job_id` | |
| property_id (resolved) | `property_id` | |
| `insurance.insuranceCompany.name` | `carrier` | |
| `insurance.claimNumber` | `claim_number` | |
| `adjuster.firstName + lastName` | `adjuster_name` | |
| `adjuster.emailAddress` or `phoneNumber` | `adjuster_contact` | |
| `insurance.dateOfLoss` | `date_of_loss` | DATE |
| `insurance.typeOfLoss` | `peril` | Normalize: "Hail"→"hail", "Wind"→"wind", etc. |
| Derived from supplement count + status | `claim_status` | Map: see status mapping below |
| `"xactimate"` or `insurance.estimatePlatform` | `estimate_platform` | |
| `insurance.rcvAmount` | `rcv_amount` | NUMERIC |
| `insurance.acvAmount` | `acv_amount` | NUMERIC |
| `insurance.deductible` | `deductible` | NUMERIC |
| `rcv_amount - acv_amount` | `depreciation_recoverable` | Computed |
| count of supplements | `supplement_count` | From supplements pull |

### claim_status Mapping

| AccuLynx Insurance State | `claim_status` |
|--------------------------|----------------|
| Claim number present, no approval | `filed` |
| Inspection appointment created | `inspection_scheduled` |
| RCV amount set, no supplement pending | `approved` |
| Supplement submitted | `supplement_pending` |
| Supplement approved | `supplement_approved` |
| Final payment received | `paid` |
| Job in warranty phase | `closed` |

### Supplement Atoms

Each supplement from `GET /supplements?jobId={jobId}` becomes a separate atom:

| Brain Field | Value |
|-------------|-------|
| `content` | `"Supplement #{n} for claim {claim_number} on {address}: {supplement description}. Amount: ${amount}."` |
| `trust_tier` | `"evidence"` → `"instruction"` when supplement status = approved |
| `soft_or_hard` | `"hard"` |
| `metadata.event_type` | `"insurance_supplement"` |

---

## 5. Estimate → atoms

**Source endpoint:** `GET /jobs/{jobId}/estimates` (slug: `getestimatesforjob`)
**Source endpoint:** `GET /estimates/{estimateId}/sections/{sectionId}/items` (slug: `getestimatesectionitems`)

| AccuLynx Field | Brain Field | Value / Transform |
|---------------|-------------|------------------|
| estimate summary | `content` | `"Estimate {name} for {address}: {section count} sections, total ${total}."` |
| `"hard"` | `soft_or_hard` | Always hard |
| `"evidence"` | `trust_tier` | Default |
| section + line items | `metadata.estimate_detail` | JSONB array of `{section, item, qty, uom, unit_price}` |

Line-item atoms are written at the estimate level (not per-line) to avoid atom sprawl. If the estimate
contains specific material specs (GAF Timberline HDZ, ice-and-water shield, synthetic underlayment),
those are extracted into separate atoms with `metadata.event_type = "material_spec"` because they
are relevant to future warranty registration and property history.

---

## 6. Financial Record → atoms

**Source endpoint:** `GET /jobs/{jobId}/financials` (slug: `getfinancialsforjob`)
**Source endpoint:** `GET /jobs/{jobId}/payments/overview` (slug: `getpaymentsoverviewforjob`)
**Webhook topics:** `job.financials.approved-value_changed`, `invoice_updated`, `invoice_voided`

| Event | Atom content | trust_tier |
|-------|-------------|-----------|
| `job.financials.approved-value_changed` | `"Approved contract value for {address} changed from ${previous} to ${new} on {date}."` | `"evidence"` |
| `invoice_updated` (status = approved) | `"Invoice #{number} for ${total} on job {address} approved. Balance: ${balance}."` | `"instruction"` |
| `invoice_updated` (other) | `"Invoice #{number} updated: total ${total}, paid ${paid}, balance ${balance}."` | `"evidence"` |
| `invoice_voided` | `"Invoice #{number} voided on {date}."` | `"evidence"` |
| Payment received (from overview) | `"Payment received: ${amount} on {date}. Running total: ${cumulative}."` | `"evidence"` |

---

## 7. Photos/Videos → atoms

**Source:** `POST /jobs/{jobId}/photos-videos` (upload); photo list via job detail includes

| Brain Field | Value |
|-------------|-------|
| `content` | `"Photo uploaded for job {title} at {address}. Tag: {tag}. Caption: {caption}."` |
| `trust_tier` | `"evidence"` |
| `eeat_signal` | `{type:"Experience", value:0.85, publishable_with_consent:true, consent_recorded_at:null}` for before/after pairs; `{type:"Experience", value:0.65, ...}` for single photo |
| `metadata.source_url` | AccuLynx-hosted photo URL |
| `metadata.photo_tags` | Array of tag names from AccuLynx |
| `metadata.event_type` | `"photo_record"` |
| `soft_or_hard` | `"hard"` (documentation evidence); `"soft"` if caption contains narrative about the homeowner |

Photo tags from `GET /company-settings/job-file-settings/photo-video-tags` are mapped to brain
metadata tags. Common roofer tags and their EEAT classification:

| AccuLynx Tag | EEAT Signal Type | Default Value |
|-------------|-----------------|---------------|
| Before / Pre-storm | Experience | 0.80 |
| After / Post-install | Experience | 0.85 |
| Storm damage | Experience + Authoritativeness | 0.85 |
| Insurance adjuster inspection | Authoritativeness | 0.80 |
| Permit / Inspection pass | Trustworthiness | 0.90 |
| Detail / Flashing | Expertise | 0.75 |
| Material delivery | Experience | 0.60 |

---

## 8. Job Messages → atoms

**Source:** Job detail with message includes or `GET /jobs/{jobId}/history`
(Note: `GET /jobs/{jobId}/messages` returns 404+Allow:POST — write-only route)

| Brain Field | Value |
|-------------|-------|
| `content` | Full message text |
| `trust_tier` | `"evidence"` |
| `soft_or_hard` | Auto-classified: contains dollar amounts / carrier names / code references → `"hard"`; contains homeowner preferences / relationship notes → `"soft"` |
| `eeat_signal` | `null` unless message author has `consent_to_attribute=true` and message contains publishable narrative |
| `metadata.author` | `{userId, firstName, lastName}` from message |

---

## 9. Adjuster and Representative Atoms

| Source | Brain Field | Notes |
|--------|-------------|-------|
| `GET /jobs/{jobId}/adjuster` | `crew` row with `role="adjuster"` | Adjuster notes are high-value soft atoms for institutional memory: adjuster preferences, negotiation outcomes |
| `GET /jobs/{jobId}/representatives/company` | `crew` row with `role="pm"` | Company rep = account manager for this job |
| `GET /jobs/{jobId}/representatives/sales-owner` | `crew` row with `role="sales"` | |

Adjuster relationship atoms (`trust_tier = "evidence"`, `soft_or_hard = "soft"`) should carry the
adjuster's known preferences, noted from message content or debrief. These are among the most valuable
cross-job institutional atoms for insurance-heavy roofing companies.

---

## Fields Not Mapped

| AccuLynx Object / Field | Reason Not Mapped |
|------------------------|-------------------|
| Calendar appointments | Not job-completion relevant; deferred to Phase 2 scheduling skill |
| Report runs | Operational reporting is AccuLynx's domain; we ingest atoms, not reports |
| Custom field definitions (company settings) | Pulled once to build the milestone config map; not atomized |
| User roster (`GET /users`) | Used internally for `crew` role resolution; not separately atomized |
