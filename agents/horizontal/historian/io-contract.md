# Historian — IO Contract

> Concrete shapes: MCP endpoints called, `public.thoughts` fields read/written, example input → output, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose | Auth |
|---|---|---|
| `match_thoughts` | Semantic + metadata search over `public.thoughts` | Service-role key scoped to this client's Supabase project only |
| `get_thought` | Fetch single atom by UUID | Same |
| `property_history_for` | Cross-client consent-gated property read (`public.property_history_for`) | Same; consent filter enforced inside the RPC |
| `get_regulatory_snapshot` | Fetch snapshot record by UUID | Same |
| `get_jurisdiction_current_snapshot` | Fetch the active snapshot for a jurisdiction | Same |
| `log_atom_access` | Append entry to `atom_access_log` | Same; must succeed before response is returned |

**No outbound calls** to any URL outside these MCP containers. Network egress policy blocks all other outbound.

---

## `public.thoughts` Fields Read

| Field | Why Historian reads it |
|---|---|
| `id` | Reference for `atom_access_log` and cross-reference resolution |
| `content` | The fact being retrieved |
| `embedding` | Similarity ranking via pgvector |
| `property_id` | Filter by property; input to `property_history_for` |
| `client_id` | Verify atom belongs to this client before returning |
| `job_id` | Filter by job |
| `trust_tier` | Include in response; filter by `min_trust_tier` query param |
| `era_of_practice` | Era-delta calculation vs. current jurisdiction snapshot |
| `regulatory_snapshot_id` | Fetch snapshot for era-delta annotation |
| `original_capture_date` | Staleness signal; included in response provenance |
| `original_practitioner` | Attribution context (returned with consent_to_attribute flag) |
| `recontextualization_notes` | Already-written notes from prior Maintenance passes |
| `eeat_signal` | Passed through to Marketing-adjacent queries |
| `consent_flags` | Cross-client share eligibility, expiration check |
| `cold_archive_status` | Filter: only return `live` or `archived`; never `deprecated` |
| `source_link_broken` | Include in provenance warning if true |
| `model_card` | Provenance: which model wrote this atom |
| `soft_or_hard` | Returned in response metadata; callers may filter |
| `derived_from` | Passed to provenance-chains skill for full chain resolution |

**Historian never writes to `public.thoughts`.**

---

## Query Input Shape

```json
{
  "intent": "materials draw for active job",
  "client_id": "self",
  "filters": {
    "property_id": "prop_uuid_abc123",
    "job_id": "job_uuid_hargrove",
    "min_trust_tier": "evidence",
    "soft_or_hard": null,
    "cold_archive_status": ["live"]
  },
  "semantic_query": "materials ordered delivered invoice GAF shingle",
  "top_k": 10,
  "include_cross_client_property_history": false,
  "requesting_trade": "roofing"
}
```

---

## Response Envelope Shape

```json
{
  "atoms": [
    {
      "id": "atom_uuid_1",
      "content": "Ordered 42 squares GAF Timberline HDZ Charcoal, delivered 2026-05-20. PO #4471. Invoice QB-2847.",
      "trust_tier": "evidence",
      "era_of_practice": "IRC-2021",
      "original_capture_date": "2026-05-20",
      "source_type": "acculynx",
      "model_card": { "provider": "anthropic", "model_name": "claude-sonnet-4-6", "captured_at": "2026-05-20T09:31:00Z" },
      "recontextualization_note": null,
      "source_link_broken": false,
      "confidence_note": null
    }
  ],
  "cross_client_history": [],
  "contradictions": [],
  "era_staleness_warnings": [],
  "metadata": {
    "total_matched": 3,
    "returned": 3,
    "omitted_consent_restricted": 0,
    "query_timestamp": "2026-05-29T08:14:00Z"
  }
}
```

---

## Example: Property History Cross-Client Lookup

**Input:**

```json
{
  "intent": "prior work on this property by other trades",
  "client_id": "self",
  "filters": { "property_id": "prop_uuid_henderson" },
  "include_cross_client_property_history": true,
  "requesting_trade": "roofing",
  "semantic_query": "structural inspection foundation report soil"
}
```

**`property_history_for` RPC call:**

```json
{
  "rpc": "public.property_history_for",
  "args": {
    "property_id": "prop_uuid_henderson",
    "requesting_client_id": "self",
    "requesting_trade": "roofing"
  }
}
```

**RPC response (cross-client atoms, consent-filtered, anonymized):**

```json
[
  {
    "id": "atom_uuid_ext_1",
    "content": "Soil borings completed 2019-03. Clay expansion risk rated moderate. Recommend 6-inch separation at all penetrations.",
    "source_attribution": "prior_contractor (different trade), 2019-03, era: pre-IRC-2018",
    "trust_tier": "evidence",
    "era_of_practice": "pre-IRC-2018",
    "consent_flags": { "cross_client_shareable": true, "trade_restriction": [] }
  }
]
```

**Historian response to vertical agent** (cross_client_history populated, client identity never revealed):

```json
{
  "atoms": [ ... ],
  "cross_client_history": [
    {
      "content": "Soil borings completed 2019-03. Clay expansion risk rated moderate. Recommend 6-inch separation at all penetrations.",
      "source_attribution": "prior_contractor (different trade), 2019-03, era: pre-IRC-2018",
      "trust_tier": "evidence",
      "recontextualization_note": "Captured under pre-IRC-2018 era. Current jurisdiction OH-Franklin is on IRC-2021. Soil report typically does not have a code-version dependency; verify with current AHJ if penetration details are relevant."
    }
  ],
  "metadata": { "omitted_consent_restricted": 0 }
}
```

---

## `atom_access_log` Entry (written on every retrieval)

```json
{
  "atom_id": "atom_uuid_1",
  "accessed_by_agent": "historian",
  "accessed_by_client": "self",
  "query_intent": "materials draw for active job",
  "accessed_at": "2026-05-29T08:14:00Z",
  "cross_client": false
}
```

For cross-client atoms, `cross_client: true` and `source_client_id: <anonymized_id>`.

---

## Failure Handling

| Failure | Behavior |
|---|---|
| `match_thoughts` returns empty | Return empty atom set with `metadata.total_matched = 0`; include suggestion to try Researcher for external context |
| `property_history_for` returns consent-restricted atoms | Silently omit restricted atoms; include `metadata.omitted_consent_restricted` count |
| `log_atom_access` fails | Hard error; do not return retrieved atoms; surface error to Conductor error queue; retry once |
| `get_regulatory_snapshot` fails (snapshot UUID broken) | Return atom without era-delta annotation; flag `source_link_broken`-equivalent in response metadata; route to Maintenance flag queue |
| Contradiction detected (two atoms, same property + field, conflicting values) | Include both atoms in response; add `contradictions` array entry; route contradiction flag to Maintenance Set-in-Order queue |
| Atom with `cold_archive_status = deprecated` appears in match set | Filter out before response; do not surface to caller |
| Network error to MCP container | Retry up to 2 times; if still failing, surface error to Conductor; return partial results with error flag |
