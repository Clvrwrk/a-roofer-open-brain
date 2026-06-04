# AccuLynx Bridge — Primary PM Adapter

AccuLynx is the primary project-management tool for the roofer brain. This adapter is the highest-
priority bridge in the entire layer. It ingests leads, jobs, milestones, contacts, insurance data,
estimates, financials, photos, and messages, converting them to atoms and maintaining the canonical
`public.job` + `public.property` rows that all other adapters and agents build on top of.

Endpoint reference: AccuLynx API V2 (`https://api.acculynx.com/api/v2`). The `acculynx-api` skill
is the authoritative reference for all endpoints, parameters, and payload schemas cited here.

---

## Authentication

AccuLynx uses a static Bearer token.

- Header: `Authorization: Bearer {ACCULYNX_API_KEY}`
- Key location: AccuLynx account → Account Settings → API page
- Rate limits: 30 req/sec per IP; 10 req/sec per API key (HTTP 429 on breach)
- Secret storage: `.env` → `ACCULYNX_API_KEY` (see `config/.env.example`)

Webhook subscriptions are created via `POST /webhooks/v2/subscriptions`. The subscription response
includes a `secret` used to verify all subsequent webhook deliveries. Store as `ACCULYNX_WEBHOOK_SECRET`
in `.env`. Webhooks may require a higher-tier AccuLynx account; confirm with AccuLynx support that
`/webhooks/v2/topics` returns valid JSON before deploying the subscription.

---

## AccuLynx Objects We Ingest

### Leads and Jobs

AccuLynx's data model treats every lead as a job file from creation. The distinction is purely
milestone-based: a job in the "Lead" milestone is what other systems call a lead. We ingest both.

**Endpoint:** `GET /jobs` (with `milestones=` filter; note: milestone filter is case-sensitive).
**Webhook topics:** `job_created`, `job_updated`, `job.category_changed`, `job.trade-type_changed`,
`job.work-type_changed`.

Dead (unassigned) leads require the query parameter `assignment=unassigned` to appear in results.
The adapter's scheduled pull must issue separate requests for assigned and unassigned jobs to catch
all records.

Each job record maps to:
- One `public.job` row (upserted by `source_system="acculynx"` + `external_ref=jobId`)
- One `public.property` row (resolved from the job's service address)
- One `public.thoughts` atom summarizing the job state

### Milestones

AccuLynx's workflow milestones are the operational heartbeat of a roofing company. Each milestone
transition is an event that changes the `job_phase` in our schema and may trigger downstream actions.

**Endpoint:** `GET /jobs/{jobId}/milestones/current` (current state), `GET /jobs/{jobId}/milestone-history`
(full timeline).
**Webhook topic:** `job.milestone.current_changed` — the primary automation trigger.

See the milestone → job_phase mapping in `mapping.md`. The mapping is configured per-client in
`config/roofer.config.yaml` under `integrations.acculynx.milestone_map` because AccuLynx milestone
names are user-defined and vary by company. The defaults reflect common roofer configurations.

### Contacts

AccuLynx contacts include homeowners (the property owner / customer), adjusters (for insurance jobs),
subcontractors, and sales reps.

**Endpoint:** `GET /contacts` (list), `GET /contacts/{contactId}` (detail), `GET /jobs/{jobId}/contacts`.
**Webhook topics:** `contact_added`, `contact_changed`, `job.primary-contact_changed`.

Contacts map to `public.crew` rows (for job-linked contacts) and to `public.thoughts` atoms carrying
relational-equity content (the "flowers" class of atom — homeowner preferences, family context,
accessibility notes captured in the debrief).

Note: `POST /contacts/{contactId}/logs` is write-only; `GET` on that path returns 404+Allow:POST.
The adapter does not read contact logs from AccuLynx for this reason.

### Photos and Videos

AccuLynx job photos are uploaded via `POST /jobs/{jobId}/photos-videos`. The API supports reading
the job's photo collection via the job detail endpoint with appropriate includes.

Photos are among the highest-EEAT atoms a roofer produces. Before/after documentation of a storm-
damaged roof is simultaneously: insurance claim evidence, EEAT signal for the website, and operational
record of scope performed. The adapter assigns `eeat_signal.type = "Experience"` to before/after pairs
and `eeat_signal.value = 0.85` as a default (configurable in `roofer.config.yaml`).

**Atom type:** `"photo_record"` in `metadata.event_type`. The photo URL is stored in `metadata.source_url`.
Photos are not downloaded into the brain — only the URL, caption, tags, and job/property references.

### Messages (Internal Notes)

AccuLynx job messages are the internal notes a PM or estimator writes on a job file. These frequently
contain the highest-value soft atoms: *"homeowner works nights, only call after 2pm"*, *"adjuster
Ramos is reasonable on hail damage but tight on O&P — come in with documentation"*.

**Webhook topic:** `job_updated` (messages do not have a dedicated webhook).
**Write-only path:** `POST /jobs/{jobId}/messages` works; `GET` returns 404. The adapter uses the
job detail endpoint (with `includes=messages` if supported, or the history endpoint) to pull messages.

Message atoms default to `trust_tier = "evidence"` and `soft_or_hard` assigned by a lightweight
classification: messages containing insurance carrier names or financial figures are tagged `"hard"`;
messages about homeowner preferences, relationship notes, or "remember for next time" language are
tagged `"soft"`.

### Insurance Data

AccuLynx has native insurance claim support. The adapter reads:
- `GET /jobs/{jobId}/insurance` — carrier, claim number, adjuster, RCV/ACV, deductible
- `GET /jobs/{jobId}/adjuster` — adjuster name and contact
- `GET /supplements?jobId={jobId}` — supplement history (note: NOT `/jobs/{jobId}/supplements` — that returns 404)

These map to `public.insurance_claim` rows and to atoms with `trust_tier = "evidence"` (escalated
to `"instruction"` when the claim status reaches `"approved"` or `"paid"`).

### Estimates and Financials

- `GET /jobs/{jobId}/estimates` → estimate line items; map to atoms describing scope and material quantities
- `GET /jobs/{jobId}/financials` + `GET /financials/{financialsId}/worksheet` → approved value, amendments
- `GET /jobs/{jobId}/payments/overview` → payment summary; triggers accounting atom on receipt
- `GET /jobs/{jobId}/invoices` → invoice list; `invoice_updated` webhook fires on change

Financial atoms default to `trust_tier = "evidence"`. Approved invoices (`invoice_updated` where
status indicates approval) are promoted to `trust_tier = "instruction"`.

---

## Milestone → job_phase Mapping

The bridge uses configurable milestone names because AccuLynx allows customers to rename and
reorder milestones. The defaults below reflect the most common roofer configuration. Override in
`config/roofer.config.yaml → integrations.acculynx.milestone_map`.

| AccuLynx Milestone Name (default) | `public.job.job_phase` | Debrief Trigger? |
|-----------------------------------|------------------------|-----------------|
| `Lead` | `lead` | No |
| `Appointment Set` | `lead` | No |
| `Inspection Complete` | `estimate` | No |
| `Estimate Sent` | `estimate` | No |
| `Approved` | `won` | No |
| `Contract Signed` | `won` | No |
| `Material Ordered` | `in_progress` | No |
| `In Production` | `in_progress` | No |
| `Job Complete` | `punch` | No |
| `Final Inspection` | `punch` | No |
| `Invoice Sent` | `closed` | **Yes** |
| `Final Payment Received` | `closed` | **Yes** |
| `Warranty` | `warranty` | Yes (if not already triggered) |
| `Lost` | `lost` | No |
| `Dead` | `lost` | No |

**Important:** AccuLynx milestone names are case-sensitive in the API filter. The config map must
use exactly the names configured in the AccuLynx account. The adapter logs a warning when it
receives a milestone name not present in the config map.

---

## job.closed → Debrief Trigger

When the AccuLynx bridge receives a `job.milestone.current_changed` webhook and the new milestone
maps to `job_phase = "closed"` or `"warranty"`:

1. The handler writes a `job_phase_changed` atom to `public.thoughts`.
2. The handler emits a `job.phase_changed` event to Conductor's internal event channel.
3. Conductor checks for an existing debrief scheduling atom for this `job_id`.
4. If none exists, Conductor posts to the PM's Slack channel and schedules the debrief per
   `docs/00-architecture-brief.md §2.1`.

The debrief trigger is idempotent: the fingerprint of the phase-change atom prevents duplicate firings
from duplicate webhook deliveries.

---

## Scheduled Pull

In addition to webhooks, the adapter runs a scheduled pull to catch:
- Jobs modified while the webhook was down or before subscription was active
- Historical backfill on first deploy

Pull schedule (configurable in `roofer.config.yaml → integrations.acculynx.pull_schedule`):
- **New/updated jobs:** every 15 minutes, window = last 24 hours
- **Supplement changes:** every 4 hours (supplements have no webhook topic)
- **Historical backfill:** one-time run on first enable, windowed by month to respect pagination limits

Pagination uses `recordStartIndex` for jobs (not `pageStartIndex` — these differ by endpoint in the
AccuLynx API). The max safe index is 99,999; the adapter uses date-windowed queries to avoid hitting
this ceiling.

---

## Known Quirks

Sourced from the `acculynx-api` skill (`reference/full-endpoint-reference.md §18`):

- Milestone filter on `GET /jobs` is case-sensitive and returns empty results silently on mismatch.
  The adapter normalizes milestone names against the company settings response before filtering.
- `GET /jobs` does not return unassigned (dead) leads by default. A separate request with
  `assignment=unassigned` is required.
- `GET /jobs/{jobId}/supplements` returns HTTP 404. The correct path is `GET /supplements?jobId={jobId}`.
- Messages and contact logs are write-only via their dedicated POST routes; the adapter reads them
  via job detail includes or job history, not the dedicated message paths.
- Webhooks are tier-gated. If `GET /webhooks/v2/topics` returns a non-JSON 404, the account does not
  have webhook access. The adapter falls back to polling-only mode in this case.
