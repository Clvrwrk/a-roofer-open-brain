# StartInfinity Bridge

StartInfinity is a kanban-style project management platform used by several Cleverwork clients
either alongside AccuLynx or as a primary PM tool for non-roofing-specialist contractors
(remodelers, multi-trade companies). In the roofer brain template it occupies priority 4 — lower
specificity for roofing domain data than AccuLynx but important for Cleverwork's multi-client
template repeatability.

Priority: 4 of 5 in the roofer shortlist.

---

## Authentication

StartInfinity uses API key authentication.

- Header: `Authorization: Bearer {STARTINFINITY_API_KEY}` (confirm exact auth scheme with
  StartInfinity documentation — key-based auth is standard; verify header format against
  your account's API settings)
- Secret storage: `.env` → `STARTINFINITY_API_KEY`
- API docs: https://startinfinity.com/docs/api (verify current URL at account setup)

---

## Ingested Objects

### Boards and Columns

StartInfinity projects are organized as boards with columns representing workflow stages. The adapter
reads the board structure at setup and builds a column-name → `job_phase` map analogous to AccuLynx's
milestone map. This map is stored in `roofer.config.yaml → integrations.startinfinity.column_map`.

Common roofing-relevant column names and their default mappings:

| StartInfinity Column Name (example) | `public.job.job_phase` | Debrief Trigger |
|--------------------------------------|------------------------|----------------|
| New Lead, Inquiry | `lead` | No |
| Estimate Scheduled, Measuring | `estimate` | No |
| Proposal Sent | `estimate` | No |
| Contract Signed, Approved | `won` | No |
| In Progress, On the Roof | `in_progress` | No |
| Punch List | `punch` | No |
| Complete, Closed | `closed` | **Yes** |
| Warranty | `warranty` | Yes (if not already triggered) |
| Lost, Not Interested | `lost` | No |

### Cards

A StartInfinity card represents a job or project. Cards have a title, description, custom fields,
assigned members, due dates, and attachments. The adapter maps cards to `public.job` rows and
generates atoms per card state change.

### Custom Fields

StartInfinity supports custom fields per board. The adapter reads the board's field definitions and
maps known field names (address, contract amount, permit number, insurance carrier) to the appropriate
brain schema fields. Unknown custom fields are carried in `metadata.custom_fields`.

### Comments

Card comments are treated the same as AccuLynx messages: classified as hard (scope/financial) or
soft (relational/preference) based on content, and atomized accordingly.

### Attachments

Attachment file names and upload dates are recorded as metadata in atoms but files are not downloaded
into the brain. If CompanyCam is also active, photo attachments sourced from CompanyCam are linked
via `metadata.companycam_photo_id`.

---

## Webhook vs. Pull

StartInfinity webhook availability should be confirmed against the current plan tier. The adapter
supports both webhook-driven ingestion (preferred) and scheduled pull fallback. Configure in
`roofer.config.yaml → integrations.startinfinity.mode: "webhook" | "pull"`.

---

## job.closed → Debrief Trigger

When a card moves to a column mapped to `"closed"` or `"warranty"`, the bridge emits
`job.phase_changed` to Conductor using the same debrief-trigger pattern as the AccuLynx bridge.

---

## Co-existence with AccuLynx

If both AccuLynx and StartInfinity are active for the same client:

1. AccuLynx is the authoritative source for `public.job` rows (it has more roofer-specific fields).
2. StartInfinity cards are linked to existing `public.job` rows via address matching.
3. StartInfinity-only activity (comments, attachments) produces atoms with `job_id` pointing to the
   AccuLynx-sourced job row where a match is found.
4. StartInfinity-only jobs (no AccuLynx counterpart) create their own `public.job` rows with
   `source_system = "startinfinity"`.
