# AccuLynx Write Capability Matrix (docs/33 §4.10 / §9.3)

Date: 2026-06-10
Status: Capability discovery complete (API V2 reference + live probe history)
Sources: AccuLynx REST API V2 reference (113 endpoints); `acculynx_api_probe`
(198 probes, GET-only, Apr–May 2026) confirming read access and the
write-only message quirk. No response yet from api@acculynx.com — but the
findings below are structural: the endpoints either exist or they don't,
independent of account tier (webhooks excepted).

## §4.10 handoff targets vs API V2

| Handoff target (§4.10) | API V2 support | Endpoint / Fallback |
| --- | --- | --- |
| Create job + contact | **WRITE** | `POST /contacts` then `POST /jobs` (contact.id required) |
| Job fields (custom fields) | **WRITE** | `PUT /jobs/{id}/custom-fields` (bulk ≤120) |
| External reference (link estimate_run → job) | **WRITE** | `POST /jobs/external-references` |
| Scope | none | dashboard/Slack fallback |
| Estimate items | read-only | Estimates group has no POST — fallback |
| Worksheet items | **WRITE** | `POST /financials/{financialsId}/worksheet/items` (omit sectionId to auto-create worksheet) |
| Proposal document (PDF) | **WRITE** | `POST /jobs/{id}/documents` |
| Measurement docs | **WRITE** | `POST /jobs/{id}/measurements` + `/measurements/files` |
| Invoice draft | read-only | `GET` only — fallback |
| Payments | **WRITE** | `POST /jobs/{id}/payments/received|paid|expense` |
| Material order draft | none | no endpoint exists — fallback permanently |
| Schedule (crew) | none | only `PUT /jobs/{id}/initial-appointment` — crew scheduling is fallback |
| Stage/status (milestone) updates | **read-only** | `GET .../milestones/current` only; no milestone write exists — fallback |
| Handoff note to job file | **WRITE (write-only)** | `POST /jobs/{id}/messages` (GET returns 404+Allow:POST) |
| Sales owner / company rep | **WRITE** | `POST /jobs/{id}/representatives/...` |

## Consequences for the pipeline

1. **The §4.10 Slack/dashboard fallback is not temporary.** Milestone
   updates, invoices, material orders, and crew schedules can never be
   API-written on V2 as it stands. The fallback packet is the permanent
   path for those four; §4.13 "automated status updates" is blocked on
   AccuLynx shipping new endpoints.
2. **A meaningful write lane exists once a write-scoped key is wired:**
   create contact+job, set custom fields, upload the proposal PDF and
   measurement files, post worksheet items, post a handoff message, set
   reps, link `estimate_run.id` via external-references (idempotency
   anchor per §5.9).
3. **Probe gap:** all 198 historical probes are GET/OPTIONS. Write
   endpoints are unverified against the live account (key scope unknown;
   key currently lives in the sync pipeline, not repo .env). Next probe
   batch should POST to a sandbox/test job before any production write.
4. **Webhooks** may be tier-gated (`/webhooks/v2/*` non-JSON 404 if not
   enabled) — relevant for §4.13 reactive status mirroring; untested.

## Revisit triggers

- AccuLynx replies to the API team thread → re-run discovery; check for
  V2 additions (milestone write, invoice write) and webhook tier.
- Write-scoped API key added to the server env → run a POST probe batch
  against a test job and update this matrix with live results.
