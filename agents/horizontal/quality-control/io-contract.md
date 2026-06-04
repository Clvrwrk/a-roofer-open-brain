# Quality Control — IO Contract

> Concrete shapes: MCP endpoints called, `public.thoughts` fields read/written, example DMAIC flow, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose |
|---|---|
| `search_thoughts` | Semantic + metadata search for failure-mode pattern analysis (client brain only) |
| `get_thought` | Fetch specific atoms for DMAIC Measure and Analyze phases |
| `update_thought` | Change `trust_tier` on an existing atom — the only authorized path for this operation |
| `upsert_thought` | Write DMAIC phase atoms and standard version notifications |
| `write_standard` | Write new versioned standard document to `/standards/[domain]/vN.md` |
| `notify_auditor` | Signal Auditor that a new standard version is active; include artifact type + version |
| `send_slack_message` | Post DMAIC summaries to internal Cleverwork channel via Conductor |

---

## `public.thoughts` Fields Read

| Field | Why QC reads it |
|---|---|
| `content` | Failure mode description in Auditor rejection atoms; debrief hard atoms |
| `source_type` | Filter for `auditor` atoms (rejection pattern) vs. `granola` / `acculynx` (debrief atoms) |
| `audit_result` | Filter for `fail` (failure mode registry) |
| `job_id` | Cross-job frequency analysis |
| `property_id` | Cross-property failure pattern (e.g., is a failure mode concentrated on one property type?) |
| `trust_tier` | Trust-tier adjudication; change-request context |
| `created_at` | Rolling 90-day window filter |
| `model_card` | Detects whether failure modes are model-version-correlated |
| `soft_or_hard` | Hard atoms feed DMAIC; soft atoms feed EEAT consistency checks |

## `public.thoughts` Fields Written

| Field | Value |
|---|---|
| `content` | DMAIC phase description, standard version change notification, or trust-tier change record |
| `client_id` | `self` |
| `trust_tier` | `evidence` for DMAIC atoms; `instruction` for standard version notifications (these steer Auditor's behavior) |
| `source_type` | `quality-control` |
| `model_card` | Current model at write time |
| `cold_archive_status` | `live` |

## `update_thought` — Trust-Tier Change Shape

```json
{
  "rpc": "update_thought",
  "args": {
    "id": "atom_uuid_target",
    "fields": {
      "trust_tier": "instruction"
    },
    "change_reason": "Human-confirmed in post-op debrief 2026-05-28; PM and foreman both affirmed this practice as standing instruction",
    "authorized_by": "quality-control",
    "authorization_atom_id": "atom_uuid_qc_auth_001"
  }
}
```

Every `update_thought` call for `trust_tier` is preceded by writing an authorization atom (`atom_uuid_qc_auth_001`) that records the rationale. The `update_thought` call then references that atom. This creates an auditable chain.

---

## Example: DMAIC Cycle — Insurance Supplement Photo Documentation

**Trigger:** Failure-mode registry reaches 3 occurrences of `standard/sales/insurance/v1.md §3.2 — photo documentation required`.

**Define Phase atom written:**

```json
{
  "content": "DMAIC Define | failure_mode: insurance supplement missing photo documentation | occurrences: 3 (rolling 90 days) | jobs affected: Hargrove, Pemberton, Westside-Commercial | estimated cost: ~2.5h rework per occurrence at $85/h loaded = $637.50 total | standard: sales/insurance/v1 §3.2",
  "trust_tier": "evidence",
  "source_type": "quality-control"
}
```

**Measure Phase — `search_thoughts` call:**

```json
{
  "rpc": "search_thoughts",
  "args": {
    "client_id": "self",
    "filters": {
      "source_type": "auditor",
      "audit_result": "fail",
      "created_at_gte": "2026-02-28"
    },
    "semantic_query": "insurance supplement photo documentation missing",
    "top_k": 20
  }
}
```

**Analyze Phase — `skills/infranodus/ontology-creator` applied to the 20 retrieved atoms:**

Ontology Creator surfaces: *all three occurrences involved @ob-sales agents that were also handling a parallel estimate request; the photo-citation step was skipped when two tasks were in flight simultaneously. The root cause is task-state management, not knowledge of the standard.*

**Improve Phase — proposed standard amendment:**

```json
{
  "rpc": "write_standard",
  "args": {
    "domain": "sales/insurance",
    "version": "v2",
    "change_summary": "Added mandatory pre-submission checklist atom: @ob-sales must write a checklist atom before routing supplement to Auditor. Checklist atom must include: [photo atom IDs for each line item] [measurement source atom ID]. Auditor checks for checklist atom presence before evaluating content.",
    "previous_version": "v1",
    "dmaic_atom_id": "atom_uuid_dmaic_001"
  }
}
```

**Control Phase — notify Auditor:**

```json
{
  "rpc": "notify_auditor",
  "args": {
    "artifact_type": "insurance_supplement",
    "new_active_version": "v2",
    "effective_immediately": true
  }
}
```

**Control monitoring:** QC watches the next 4 insurance supplement attempts for the same failure mode. If zero re-occurrence at 90 days, cycle closes. If re-occurrence, re-open Analyze.

---

## Example: Trust-Tier Promotion

**Context:** A batch of atoms from a knowledge-harvest interview with a 30-year foreman. Initially captured as `evidence`. PM + Chris reviewed the transcript and confirm: the foreman's techniques should be treated as standing instruction for all future crews.

**Authorization atom written first:**

```json
{
  "content": "QC Trust-Tier Authorization | atoms: [atom_uuid_kh_001, atom_uuid_kh_002, atom_uuid_kh_003] | change: evidence → instruction | justification: PM and Chris confirmed in meeting 2026-05-20 that these foreman techniques represent standing instruction for all roof crews; transcript reviewed and approved | authorized_by: Chris Hussey + AM",
  "trust_tier": "instruction",
  "source_type": "quality-control"
}
```

**`update_thought` calls (one per atom):**

```json
{
  "rpc": "update_thought",
  "args": {
    "id": "atom_uuid_kh_001",
    "fields": { "trust_tier": "instruction" },
    "change_reason": "Human-confirmed standing instruction per knowledge harvest 2026-05-20",
    "authorized_by": "quality-control",
    "authorization_atom_id": "atom_uuid_qc_auth_021"
  }
}
```

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Failure-mode count reaches threshold but occurrences span different standards domains (ambiguous scope) | Write Define atom with ambiguity noted; escalate to Chris/AM for scope decision before proceeding to Measure |
| `ontology-creator` skill unavailable during Analyze | Proceed with manual pattern analysis; note in DMAIC atom that InfraNodus skills were unavailable; flag to Conductor |
| `write_standard` fails (file write error) | Retry once; if still failing, surface to Conductor; hold the DMAIC Control phase until the standard file is written; do not notify Auditor of a version that does not exist |
| `notify_auditor` fails | Retry; if unresolved, Conductor alerts Chris/AM; Auditor continues enforcing old version until notification succeeds |
| `update_thought` fails on trust-tier change | Retry once; if still failing, surface to Conductor; authorization atom already written, so the intent is recorded — the operational change is pending |
| Trust-tier change disputed by AM or Chris | Write dispute atom; defer the `update_thought` call; raise in next monthly review; Auditor continues using existing tier in the meantime |
| QC discovers Auditor is not enforcing a standard that QC knows is active | Write anomaly atom; surface to Conductor for immediate escalation to Chris — this is a jidoka stop-the-line event |
