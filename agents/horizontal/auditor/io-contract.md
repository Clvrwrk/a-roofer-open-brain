# Auditor — IO Contract

> Concrete shapes: MCP endpoints called, `public.thoughts` fields read/written, example input → output, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose |
|---|---|
| `get_standard` | Fetch active standard document by artifact type + version |
| `upsert_thought` | Write audit result atom |
| `route_rejection` | Return reject + structured notes to producing agent via Conductor |
| `route_escalation` | Route ambiguous case to Chris/AM via Conductor |
| `get_thought` | Verify accuracy of brain atom citations within a work product |

---

## `public.thoughts` Fields Read

| Field | Why Auditor reads it |
|---|---|
| `content` | Verifies a cited atom's content matches what the work product claims |
| `trust_tier` | Verifies cited atoms meet minimum trust-tier requirement for the artifact type |
| `era_of_practice` | Checks era-awareness compliance (e.g., code-era citation required for technical claims) |
| `consent_flags` | For EEAT publication candidates: verifies `publishable_external` and `consent_recorded_at` |
| `eeat_signal` | Verifies EEAT classification meets publishability threshold |

## `public.thoughts` Fields Written (audit result atoms)

| Field | Value |
|---|---|
| `content` | Audit result summary: pass/fail/escalate, artifact type, standard version, score, failure modes if any |
| `client_id` | `self` |
| `job_id` | From the work product being audited (when applicable) |
| `property_id` | From the work product being audited (when applicable) |
| `trust_tier` | Always `evidence` for audit atoms |
| `source_type` | `auditor` |
| `model_card` | Current model at write time |
| `cold_archive_status` | `live` |

---

## Artifact Type → Standard Mapping

Auditor selects the standard document by artifact type using this mapping (configured in `config/roofer.config.yaml` under `auditor.standard_map`):

| Artifact type | Standard path |
|---|---|
| `job_status_response` | `/standards/ops/v[active].md` |
| `estimate_proposal` | `/standards/sales/v[active].md` |
| `change_order` | `/standards/sales/v[active].md` |
| `insurance_supplement` | `/standards/sales/insurance/v[active].md` |
| `financial_close` | `/standards/accounting/v[active].md` |
| `daily_log_digest` | `/standards/ops/daily-log/v[active].md` |
| `marketing_draft` | `/standards/marketing/v[active].md` |
| `eeat_publication_candidate` | `/standards/marketing/eeat/v[active].md` |
| `debrief_summary` | `/standards/ops/debrief/v[active].md` |
| `schema_markup` | `/standards/marketing/schema/v[active].md` |

---

## Example: EEAT Publication Candidate — Pass

**Input work product (from @ob-marketing):**

```json
{
  "artifact_type": "eeat_publication_candidate",
  "producing_agent": "ob-marketing",
  "content": "Draft case study: Henderson project — 412 Birchwood Dr. 'Our crew ran extra debris tarps to protect the flower bed Ms. Henderson planted in memory of her mother. She told us it was the most thoughtful thing any contractor had ever done.' — Mary H. (name redacted on publication; consent recorded 2026-05-28). Roof replacement: GAF Timberline HDZ, Charcoal, 28 squares. Completed on schedule. Zero callbacks in 30-day warranty window.",
  "cited_atoms": ["atom_uuid_soft_001", "atom_uuid_hard_003"],
  "job_id": "job_uuid_henderson_2026",
  "property_id": "prop_uuid_henderson"
}
```

**Auditor checks:**

1. `get_standard`: fetch `/standards/marketing/eeat/v1.md`
2. Verify `atom_uuid_soft_001`: `consent_flags.publishable_external = false`, `eeat_signal.consent_recorded_at = "2026-05-28"` ← consent IS recorded; cross-check passes
3. Apply `skills/infranodus/critical-perspective`: no unsupported claims; "30-day warranty window" is verifiable from `atom_uuid_hard_003`
4. Apply `skills/infranodus/rhetorical-analyst`: tone is warm + specific; no superlative puffery; EEAT signals authentic
5. Apply `skills/cleverwork-roofer/consent-pii-checker`: homeowner name redacted in draft; consent flag set; PII clean

**Audit result atom written:**

```json
{
  "content": "AUDIT PASS | artifact: eeat_publication_candidate | job: Henderson 2026 | standard: marketing/eeat/v1 | score: 0.94 | notes: all consent flags verified; PII redacted; critical-perspective pass; rhetorical-analyst pass",
  "trust_tier": "evidence",
  "source_type": "auditor",
  "job_id": "job_uuid_henderson_2026"
}
```

**Work product delivered to Conductor for publication routing.**

---

## Example: Insurance Supplement — Fail

**Input work product (from @ob-sales):**

```json
{
  "artifact_type": "insurance_supplement",
  "producing_agent": "ob-sales",
  "content": "Supplement request: State Farm claim #SF-44821. Additional line items: (1) Dumpster haul-away 2x; (2) Additional decking 12 sq ft; (3) Step flashing replacement. Xactimate codes: ROOF>DMP>2, ROOF>DKG>SF, ROOF>FLS.",
  "cited_atoms": [],
  "job_id": "job_uuid_hargrove"
}
```

**Auditor checks:**

1. `get_standard`: fetch `/standards/sales/insurance/v1.md`
2. Standard requires: photo documentation atom citation for each line item; square-footage measurement atom from EagleView or field measure.
3. `cited_atoms` is empty — no photo atoms linked, no measurement atom linked.
4. Apply `skills/infranodus/critical-perspective`: line item 2 (additional decking) is unverifiable without measurement source; line item 1 (dumpster 2x) requires before/after photo evidence per standard §3.2.

**Rejection issued:**

```json
{
  "audit_result": "fail",
  "failure_modes": [
    {
      "rule": "standard/sales/insurance/v1.md §3.2 — photo documentation required for each line item",
      "affected_lines": ["dumpster haul-away 2x", "additional decking 12 sq ft", "step flashing replacement"],
      "recommendation": "Attach CompanyCam photo atom citations for each line item. Include the photo atom IDs in cited_atoms."
    },
    {
      "rule": "standard/sales/insurance/v1.md §2.1 — EagleView or field-measure atom required for any sq-ft claim",
      "affected_lines": ["additional decking 12 sq ft"],
      "recommendation": "Link the measurement atom (EagleView report or foreman field measure) that confirms 12 sq ft."
    }
  ]
}
```

**Audit fail atom written; rejection routed to @ob-sales via Conductor.**

---

## Failure Handling

| Failure | Behavior |
|---|---|
| `get_standard` returns null (no standard for this artifact type) | Do not pass; escalate to Conductor with error: "no active standard for artifact type [X]; work product held until standard created" |
| Standard version referenced in work product is outdated (prior version) | Apply current active version; note version delta in audit atom; do not reject solely for referencing old version |
| `get_thought` returns atom with different content than cited in work product | Include discrepancy in fail result; producing agent must reconcile before resubmit |
| `upsert_thought` fails (audit atom write fails) | Retry once; if still failing, surface to Conductor; do not pass the work product until the audit atom is durably written (audit trail is non-negotiable) |
| Auditor's own skill invocation fails (critical-perspective or rhetorical-analyst error) | Log failure; proceed with standards-only check; note in audit atom that InfraNodus skills were unavailable for this pass; flag to Conductor for awareness |
| Third rejection of the same work product for same failure mode | Pass the rejection as normal but also emit escalation atom flagging the pattern; Conductor notifies QC threshold watch |
