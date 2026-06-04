# Researcher — IO Contract

> Concrete shapes: MCP endpoints called, fields produced, example input → output, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose | Auth |
|---|---|---|
| Web search MCP (`brave_search` or `tavily_search`, per config) | Keyword + semantic search of public web | API key from `.env` (`RESEARCHER_SEARCH_API_KEY`); no Supabase access |
| `fetch_url` | HTTP GET of a specific URL (manufacturer page, code PDF, carrier bulletin) | No auth on public URLs; carrier-portal credentials from `.env` when needed |
| Apollo API (`apollo_search_contacts`, `apollo_enrich_company`) | Business intelligence + contact enrichment | `APOLLO_API_KEY` from `.env`; rate-limited per config |
| Ahrefs API (`ahrefs_keyword_overview`, `ahrefs_backlinks`) | SEO + competitor research | `AHREFS_API_KEY` from `.env`; rate-limited per config |
| `flag_conflict` | Internal routing — signals potential contradiction to requesting agent | No external call; message bus event |

**Hard constraint:** Researcher's runtime environment has zero credentials to the client's Supabase project. The absence of credentials is the security control, not application logic.

---

## Query Input Shape

```json
{
  "intent": "fetch current GAF Timberline HDZ technical data sheet",
  "requesting_agent": "ob-ops",
  "query_type": "manufacturer_spec",
  "search_terms": ["GAF Timberline HDZ", "technical data sheet", "shingle spec"],
  "preferred_sources": ["gaf.com"],
  "jurisdiction": "OH-Franklin",
  "required_era": null,
  "prior_atom_content_for_crosscheck": null,
  "strip_pii": true
}
```

---

## Response Envelope Shape

```json
{
  "candidate_atoms": [
    {
      "content": "GAF Timberline HDZ: Class A fire-rated, ASTM D3462, 130-mph wind resistance (with 6-nail pattern per IRC R905.2.6.1), lifetime limited warranty. Available in 21 colors including Charcoal and Weathered Wood.",
      "source_url": "https://www.gaf.com/en-us/roofing-products/residential-roofing/shingles/timberline-hdz",
      "retrieved_at": "2026-05-29T08:22:00Z",
      "trust_tier": "evidence",
      "era_of_practice": null,
      "eeat_signal": null,
      "consent_flags": {
        "cross_client_shareable": true,
        "trade_restriction": [],
        "publishable_external": false,
        "expires_at": null
      },
      "source_type": "web_fetch",
      "model_card": {
        "provider": "anthropic",
        "model_name": "claude-sonnet-4-6",
        "model_version": "20250514",
        "captured_at": "2026-05-29T08:22:00Z"
      }
    }
  ],
  "conflicts_detected": [],
  "pii_stripped": false,
  "sources_checked": ["https://www.gaf.com/en-us/roofing-products/residential-roofing/shingles/timberline-hdz"],
  "sources_broken": [],
  "metadata": {
    "query_timestamp": "2026-05-29T08:22:00Z",
    "api_costs_incurred": { "search": 0.001, "fetch": 0.0 }
  }
}
```

---

## Example: Insurance Supplement Research

**Input:**

```json
{
  "intent": "State Farm current supplement guidelines for hail damage on GAF shingles",
  "requesting_agent": "ob-sales",
  "query_type": "insurance_bulletin",
  "search_terms": ["State Farm supplement guidelines", "GAF hail damage", "Xactimate line items roofing 2026"],
  "preferred_sources": [],
  "jurisdiction": "OH-Franklin",
  "required_era": null,
  "prior_atom_content_for_crosscheck": "State Farm does not allow O&P on roofing-only jobs (captured 2024-11, trust_tier: evidence)",
  "strip_pii": true
}
```

**Response:**

```json
{
  "candidate_atoms": [
    {
      "content": "State Farm Property Supplement Guidelines (2025 update): O&P allowable on roofing jobs when general contractor is coordinating multiple trades on the same loss. Single-trade roofing may still require documentation of coordination complexity. Xactimate line item ROOF > Shingles > Remove and Replace: applies per sq ft, requires photo documentation of hail dents per HAAG standards.",
      "source_url": "https://www.statefarm.com/content/dam/sf-library/en-us/documents/property/supplement-guidelines-2025.pdf",
      "retrieved_at": "2026-05-29T08:25:00Z",
      "trust_tier": "evidence",
      "era_of_practice": null
    }
  ],
  "conflicts_detected": [
    {
      "prior_atom_content": "State Farm does not allow O&P on roofing-only jobs (captured 2024-11, trust_tier: evidence)",
      "external_result_summary": "2025 guidelines indicate O&P is allowable with documentation of coordination complexity",
      "conflict_description": "External 2025 bulletin partially contradicts prior brain atom (2024-11). Prior atom may be outdated. Recommend Auditor review before brain ingestion."
    }
  ],
  "pii_stripped": false,
  "metadata": { "query_timestamp": "2026-05-29T08:25:00Z" }
}
```

---

## Example: Innovator Weekly External Scan (scheduled)

**Input:**

```json
{
  "intent": "weekly technology scan — roofing industry",
  "requesting_agent": "innovator",
  "query_type": "technology_scan",
  "search_terms": ["roofing software 2026", "AccuLynx update", "CompanyCam new feature", "drone measurement roofing", "AI roofing estimate"],
  "preferred_sources": [],
  "jurisdiction": null,
  "required_era": null,
  "prior_atom_content_for_crosscheck": null,
  "strip_pii": false
}
```

**Response:** Array of candidate technology-signal atoms, each with `source_url` and `retrieved_at`. Innovator reviews before any brain ingestion.

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Web search returns zero results for a high-stakes query | Return empty `candidate_atoms`; include `metadata.search_empty_reason`; route via Conductor escalation flag |
| `fetch_url` returns 404 or 410 | Record in `sources_broken`; do not fabricate content; return empty candidate for that URL |
| Enrichment API rate limit hit | Return partial results with `metadata.api_rate_limited: true`; notify Conductor; do not retry until next scheduled window |
| API key missing or expired | Hard error to Conductor error queue; do not return partial results without noting the credential gap |
| External result contains PII (homeowner name, SSN in permit record) | Strip PII fields before building candidate atom; set `pii_stripped: true` in metadata |
| `prior_atom_content_for_crosscheck` provided and conflict detected | Always surface conflict in `conflicts_detected`; never silently resolve |
| Researcher accidentally receives a query that includes client brain data as context | Log anomaly; surface to Conductor; refuse to process and return an error — this indicates a routing error that blurs the security boundary |
