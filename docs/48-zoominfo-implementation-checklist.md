# ZoomInfo Implementation Checklist and Ticket Pack

This is the execution companion to `docs/47-zoominfo-devportal-manual.md`.

Use this to move from documentation to working production integrations for:

- speed-to-lead
- B2B commercial property `->` sold-job matching

---

## Phase 0 - Program Controls (1-2 days)

### ZI-000 - Confirm product and entitlement envelope

- **Goal:** lock what APIs/scopes/packages are available before engineering starts.
- **Tasks:**
  - Validate ZoomInfo package(s): Enterprise API, Copilot, optional Insights/Audiences.
  - Confirm endpoint entitlements and any partner constraints.
  - Capture current rate-limit tier (Builder/Standard/Scaling).
- **Acceptance criteria:**
  - Entitlement matrix documented in repo.
  - Named owner for ZoomInfo account/admin escalation.

### ZI-001 - Define budget and policy guardrails

- **Goal:** prevent accidental credit burn.
- **Tasks:**
  - Set monthly credit budget and per-run enrichment cap.
  - Set auto-enrich threshold vs human-approval threshold.
  - Define escalation when projected credit spend exceeds threshold.
- **Acceptance criteria:**
  - Written policy for "auto enrich", "confirm enrich", "deny enrich".
  - Budget values referenced in config/runbook.

---

## Phase 1 - DevPortal and Auth Foundations (2-3 days)

### ZI-100 - Create ZoomInfo apps per environment

- **Goal:** clean environment isolation.
- **Tasks:**
  - Create separate DevPortal apps for `dev`, `staging`, `prod`.
  - Add exact redirect URIs for each environment.
  - Apply least-privilege scopes for each app.
- **Acceptance criteria:**
  - Three app records exist with validated redirect URIs.
  - Scope lists reviewed and signed off.

### ZI-101 - Secrets and rotation setup

- **Goal:** secure credential lifecycle.
- **Tasks:**
  - Store `client_id`/`client_secret` in secret manager.
  - Remove any secrets from code and docs.
  - Create a secret-rotation runbook (routine + incident path).
- **Acceptance criteria:**
  - No credentials present in repo.
  - Rotation test completed once in non-prod.

### ZI-102 - OAuth flow implementation

- **Goal:** production auth reliability.
- **Tasks:**
  - Implement Client Credentials flow for server jobs.
  - Implement Authorization Code + PKCE where user attribution is required.
  - Implement refresh token rotation handling for PKCE apps.
- **Acceptance criteria:**
  - Token acquisition + refresh e2e tests passing.
  - Failed/expired token auto-recovery verified.

---

## Phase 2 - Core Data Access Layer (3-5 days)

### ZI-200 - Build ZoomInfo client wrapper

- **Goal:** one reliable API client abstraction.
- **Tasks:**
  - Add standardized request builder and auth injection.
  - Add response logging with sensitive-field redaction.
  - Add standard retries/backoff for 429/5xx.
- **Acceptance criteria:**
  - Shared client used by all ZoomInfo calls.
  - Retry behavior validated in tests.

### ZI-201 - Add rate-limit-aware throttler

- **Goal:** avoid quota collisions.
- **Tasks:**
  - Parse `X-RateLimit-*` headers.
  - Honor `Retry-After` and rejected bucket metadata.
  - Dynamically reduce throughput near second/hour/day limits.
- **Acceptance criteria:**
  - Synthetic 429 tests pass.
  - No fixed-loop retry behavior remains.

### ZI-202 - Lookup-first filter normalization

- **Goal:** reduce invalid requests and bad matches.
- **Tasks:**
  - Add lookup resolver for controlled vocabulary.
  - Cache lookup maps with periodic refresh.
  - Convert natural-language filter values to valid API values.
- **Acceptance criteria:**
  - Invalid filter 400s reduced in test runs.
  - Lookup resolver used before search in all workflows.

---

## Phase 3 - Speed-to-Lead Workflow (4-7 days)

### ZI-300 - Company discovery workflow

- **Goal:** identify target companies quickly and cheaply.
- **Tasks:**
  - Implement narrow ICP company search pipeline.
  - Support pagination (`page[number]`, `page[size]`) with max page guardrails.
  - Rank by fit + freshness + available intent/signal context.
- **Acceptance criteria:**
  - Workflow produces ranked company list with traceable scoring.
  - Search stage incurs no enrichment credits.

### ZI-301 - Contact discovery + ranking workflow

- **Goal:** find decision-makers fast.
- **Tasks:**
  - Search contacts for selected companies.
  - Rank by seniority, function, relevance, data-confidence hints.
  - Return enrich candidate set with "why selected" explanation.
- **Acceptance criteria:**
  - Ranked contact shortlist generated per account.
  - Candidate ranking is deterministic/reproducible.

### ZI-302 - Controlled enrich gate

- **Goal:** pay only for records needed to activate.
- **Tasks:**
  - Add top-N enrich selection policy.
  - Add projected credit message before enrich execution.
  - Batch enrich in chunks (<= 25 per call for core contact/company enrich).
- **Acceptance criteria:**
  - Enrich calls blocked without policy compliance.
  - Credit projections logged before each paid run.

### ZI-303 - Routing and SLA instrumentation

- **Goal:** turn enriched records into action quickly.
- **Tasks:**
  - Route top opportunities to assigned owner/channel.
  - Emit timestamps for lead received, enriched, routed, first-touch.
  - Track speed-to-lead and response SLA metrics.
- **Acceptance criteria:**
  - Time-to-first-touch dashboard is live.
  - SLA breach alerting in place.

---

## Phase 4 - Property <-> Sold Job Layer-Cake (5-10 days)

### ZI-400 - Identity and join model

- **Goal:** reliable entity joins across property/account/job.
- **Tasks:**
  - Define canonical keys for property, company, and job entities.
  - Add normalization for company IDs/domains and property identifiers.
  - Define confidence scoring for record linkage.
- **Acceptance criteria:**
  - Join schema documented and tested with sample datasets.
  - Link confidence reported per match.

### ZI-401 - Signal enrichment layer

- **Goal:** add intent/scoops/news/insights to joined entities.
- **Tasks:**
  - Attach signal timelines to account/property records.
  - Support recency-weighted signal scoring.
  - Add suppression for stale or low-confidence signals.
- **Acceptance criteria:**
  - Joined records expose current signal summary + raw detail.
  - Signal quality checks pass threshold.

### ZI-402 - Outcome learning feedback loop

- **Goal:** improve targeting and spend efficiency over time.
- **Tasks:**
  - Capture outcomes (won/lost, cycle time, no-response, disqualified).
  - Feed outcomes into ranking model weights.
  - Track enrich-to-win conversion by segment.
- **Acceptance criteria:**
  - Monthly model-tuning report produced.
  - Conversion lift trend is measurable.

---

## Phase 5 - Production Hardening (2-4 days)

### ZI-500 - Error recovery matrix implementation

- **Goal:** predictable recovery behavior for all major failure classes.
- **Tasks:**
  - Implement policy for 400/401/403/429/5xx responses.
  - Add actionable user/operator messages for non-retryable failures.
  - Add dead-letter queue for repeated failed jobs.
- **Acceptance criteria:**
  - Runbook maps each error class to action.
  - Retry storms prevented in load test.

### ZI-501 - Observability and audit

- **Goal:** operational visibility and compliance traceability.
- **Tasks:**
  - Log request ID, endpoint, latency, status, credit impact estimate.
  - Build dashboards for success rate, quota pressure, credit burn.
  - Add redacted audit trail for enrichment actions.
- **Acceptance criteria:**
  - On-call can diagnose failures from dashboards + logs.
  - Audit log includes actor, action, scope, and outcome.

### ZI-502 - Webhook/event orchestration

- **Goal:** reduce polling and latency for async flows.
- **Tasks:**
  - Subscribe to relevant webhook/event surfaces.
  - Implement idempotent event handlers.
  - Configure retry and DLQ behavior.
- **Acceptance criteria:**
  - End-to-end event flow verified.
  - Duplicate event handling does not create duplicate actions.

---

## Cross-Cutting Definition of Done

Every ZoomInfo workflow ticket is only done when:

- least-privilege scope confirmed
- rate-limit handling verified
- projected credit spend exposed before paid enrich
- retries limited to retryable classes
- logs redacted and audit-safe
- staging test evidence attached

---

## Suggested Execution Order (fastest path)

1. `ZI-000`, `ZI-001`
2. `ZI-100`, `ZI-101`, `ZI-102`
3. `ZI-200`, `ZI-201`, `ZI-202`
4. `ZI-300`, `ZI-301`, `ZI-302`, `ZI-303`
5. `ZI-400`, `ZI-401`, `ZI-402`
6. `ZI-500`, `ZI-501`, `ZI-502`

---

## Immediate Next 72-Hour Sprint

If you want a concrete first sprint, run this subset:

- Day 1: `ZI-000`, `ZI-001`, `ZI-100`
- Day 2: `ZI-101`, `ZI-102`, `ZI-200`
- Day 3: `ZI-201`, `ZI-202`, `ZI-300` (first narrow flow in staging)

This gives you a secure, scope-correct, credit-aware baseline with one functional speed-to-lead path by end of sprint.
