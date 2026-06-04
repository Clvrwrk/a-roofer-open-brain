# Conductor — IO Contract

> Concrete shapes: MCP endpoints called, `public.thoughts` fields read/written, example flows, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose |
|---|---|
| `get_recent_atoms` | Pull last-N atoms by client_id for digest construction |
| `get_job_calendar` | Fetch upcoming jobs + crew from AccuLynx bridge |
| `upsert_thought` | Write routing confirmation atoms and error triage atoms |
| `send_slack_message` | Post digests, escalation DMs, debrief reminders |
| `create_calendar_event` | Schedule post-op debrief |
| `update_job_phase` | Push phase update to AccuLynx |
| `route_to_agent` | Internal message bus: queue task for a vertical or horizontal agent |
| `route_to_auditor` | Route a completed work product to Auditor for QA gate |
| `get_maintenance_hygiene_status` | Pull Maintenance's daily one-liner for the morning digest |
| `get_auditor_reject_summary` | Pull counts + brief rationale for weekly digest |

---

## `public.thoughts` Fields Read

| Field | Why Conductor reads it |
|---|---|
| `content` | Summarized for digest |
| `soft_or_hard` | Digest categorizes hard vs soft atoms |
| `job_id` | Groups atoms by job in digest |
| `property_id` | Links atoms to property in digest |
| `trust_tier` | Included in digest summaries for transparency |
| `created_at` | Filters to last-24h for morning digest, last-7d for weekly |
| `source_type` | Notes provenance category in digest |
| `eeat_signal` | Flags soft atoms with high EEAT scores for Marketing's attention in weekly digest |

## `public.thoughts` Fields Written

| Field | Value |
|---|---|
| `content` | Routing decision description or error triage note |
| `client_id` | Always `self` |
| `trust_tier` | `inference` for routing atoms; `evidence` for error log atoms |
| `source_type` | `conductor` |
| `model_card` | Current model at write time |
| `cold_archive_status` | `live` |

---

## Example: Routing a Vertical Agent Request

**Trigger:** Human posts in Slack — `@ob-ops what's the status on the Hargrove job?`

**Conductor routing flow:**

```json
{
  "step": "routing_decision",
  "inbound_mention": "@ob-ops",
  "message": "what's the status on the Hargrove job?",
  "routing_to": "ob-ops",
  "historian_query_prepared": {
    "intent": "job status and recent activity",
    "filters": { "job_id": "job_uuid_hargrove" },
    "semantic_query": "status materials crew schedule invoices"
  },
  "researcher_query_prepared": null
}
```

**Routing confirmation atom written:**

```json
{
  "content": "Routing: @ob-ops | query: job status Hargrove | Historian called for job atoms | Researcher not called | 2026-05-29T09:12:00Z",
  "trust_tier": "inference",
  "source_type": "conductor",
  "client_id": "self"
}
```

**After @ob-ops produces a response, route to Auditor:**

```json
{ "rpc": "route_to_auditor", "args": { "work_product_id": "wp_uuid_001", "producing_agent": "ob-ops", "artifact_type": "job_status_response" } }
```

**Auditor returns pass → Conductor delivers to Slack:**

```json
{ "rpc": "send_slack_message", "args": { "channel": "#cleverwork-ops", "text": "<@ob-ops response content>" } }
```

---

## Example: Morning Digest Post

**Digest construction (06:00 cron):**

```json
{ "rpc": "get_recent_atoms", "args": { "client_id": "self", "since": "2026-05-28T06:00:00Z", "limit": 50 } }
{ "rpc": "get_job_calendar", "args": { "client_id": "self", "date": "2026-05-29" } }
{ "rpc": "get_maintenance_hygiene_status", "args": { "client_id": "self" } }
```

**Digest Slack message (simplified):**

```
Good morning. Here's your brain digest for Thursday, May 29.

YESTERDAY'S ATOMS (12 new)
  Jobs: 5 atoms — Hargrove (2), Henderson (3)
  Materials: 3 atoms — GAF delivery confirmed, OSB reorder queued
  Soft: 2 atoms — Henderson debrief soft track (EEAT flagged for Marketing)
  Financial: 2 atoms — QB invoice #2847 created

TODAY'S SCHEDULE
  Hargrove (1247 Elm): Crew B, 07:00 start. Foreman: Mike.
  Henderson (412 Birchwood): Punch list, AM only.

OPEN BLOCKERS
  • Hargrove permit inspection — awaiting AHJ callback (3rd business day)

MAINTENANCE STATUS
  Sort: Clean. 0 missing-field flags. 1 near-duplicate routed for review.

ESCALATIONS PENDING
  None.
```

---

## Example: Debrief Scheduling on `job.closed`

**Webhook received:**

```json
{ "event": "job.closed", "job_id": "ALX-2851", "job_address": "412 Birchwood Dr, Columbus, OH", "closed_at": "2026-05-28T17:00:00Z" }
```

**Conductor actions:**

```json
// 1. Resolve job record
{ "rpc": "get_job", "args": { "acculynx_id": "ALX-2851" } }

// 2. Schedule debrief calendar event
{ "rpc": "create_calendar_event", "args": {
  "title": "Post-Op Debrief — Henderson / 412 Birchwood Dr",
  "attendees": ["pm@client.com", "foreman_mike@client.com", "homeowner@client.com"],
  "proposed_window": "2026-06-02 to 2026-06-04",
  "duration_minutes": 30,
  "notes": "Blameless review. 6-question script. Recording consent already on file."
}}

// 3. Write scheduling atom
{ "rpc": "upsert_thought", "args": {
  "content": "Post-op debrief scheduled for Henderson job (ALX-2851). Target window: 2026-06-02 to 2026-06-04. Attendees: PM, Foreman Mike, homeowner.",
  "trust_tier": "evidence",
  "source_type": "conductor",
  "job_id": "job_uuid_henderson_2026",
  "property_id": "prop_uuid_henderson"
}}
```

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Slack API returns error on digest post | Retry once; if fails, write digest to error log atom; DM Chris/AM with digest content directly |
| `get_job_calendar` returns empty (AccuLynx bridge down) | Post digest without calendar section; include "calendar unavailable — AccuLynx bridge error" note |
| Routing decision is ambiguous (human mention doesn't map cleanly to one vertical) | Route to most likely vertical with a clarifying question in Slack; write routing atom with `trust_tier: inference` and ambiguity note |
| Auditor returns escalation on a work product | Conductor surfaces to Chris/AM with full Auditor context; does not attempt to resolve the ambiguity itself |
| `create_calendar_event` fails | Fall back to a Slack DM to attendees with proposed debrief window; note the calendar-invite failure; retry next day |
| Error queue depth > 10 | Immediately page Chris via Slack DM with error log summary; do not wait for next digest cycle |
| Conductor's own MCP container crashes mid-digest | On restart, re-fetch atoms and regenerate; detect if digest was already partially posted (by checking `public.thoughts` for the day's conductor atom) and post a "digest resumed" message |
