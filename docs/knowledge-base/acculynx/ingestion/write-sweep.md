---
type: Pipeline
title: AccuLynx Write-Capability Sweep
description: The sandbox-only harness that red-teams every documented write endpoint to map real API write behavior.
tags: [acculynx, ingestion, sandbox, capability, probe, write, red-team]
timestamp: 2026-07-01T00:00:00Z
---

A sandbox-only Edge Function (`acculynx-write-sweep`) that systematically probes every documented
AccuLynx write operation (POST/PUT/DELETE) against the **sandbox** account, red-teams the highest-value
paths across five dimensions, and records the real response shape, status, side effect, and guardrail
per endpoint. It is the write-side structural mirror of Phase 1's
[read-capability sweep](read-sweep.md), extended for request bodies, dependency-chain seeding, and
disposable-entity lifecycle.

# Purpose

`docs/37` (the write-capability matrix) existed since 2026-06-10 as a **structural** discovery document —
built from the AccuLynx API V2 reference plus 198 historical GET-only probes, with zero live evidence for
any write. This sweep closes that probe gap: every one of the 38 write endpoints (19 POST / 15 PUT /
4 DELETE) gets at least one real sandbox HTTP call, and the resulting evidence rows are the sole source of
truth for the regenerated matrix ([docs/37](../../../37-acculynx-write-capability-matrix.md) +
[write-capability.md](../api/write-capability.md)) — the docs are **generated from** the evidence tables,
never hand-maintained (D-03).

# Hard sandbox gate

The single enforced safety boundary, reused verbatim from `acculynx-read-sweep`:

```typescript
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(
      `acculynx-write-sweep is sandbox-only: refusing to resolve "${secretName}". ` +
        `Only ${SANDBOX_SECRET_NAME} is permitted.`,
    );
  }
}
```

This runs before any AccuLynx HTTP call. No production account key can ever be resolved by this function,
even under misconfiguration — matching the read-sweep's hard-gate precedent and CLAUDE.md's "no first-tries
in production" mandate. A dedicated new Edge Function was built rather than extending
`acculynx-read-sweep` in place, to keep the read harness's GET-only prod-safety story clean (D-01).

# The dependency walk (contact → job → financials)

Unlike the read sweep's flat HATEOAS list→detail walk, writes require **seeding a real entity graph**
before most of the 38 endpoints can be probed at all:

1. **`POST /contacts`** — dependency-root seed. Harvests `contactId`.
2. **`POST /jobs`** — requires `contact.id` from step 1. Harvests `jobId`. Creates an **unassigned lead**
   (not visible via the default `GET /jobs` — the harness fetches with `?assignment=unassigned` to
   confirm).
3. **`GET /jobs/{jobId}/financials`** — harvests `financialsId`. There is no `POST /financials`; financials
   are auto-provisioned alongside the job. A short retry (one attempt, ~1.5s delay) covers the case where
   provisioning isn't instantaneous.
4. **Everything else** — worksheet items, payments, custom-fields, documents, messages, representatives,
   external-references — is probed using the harvested `jobId`/`financialsId`/`contactId` as parents.

A **10-endpoint reference-data pre-fetch** runs alongside the dependency walk (`Promise.all` of
contact-types, job-categories, trade-types, lead-sources, states, custom-field definitions,
document-folders, account-types, users, work-types) to harvest ids the write bodies need (e.g. a valid
`jobCategory.id`, a `leadSourceId`, a role-appropriate `CompanyUserId`). Where a reference GET returns
nothing in the sandbox (no account-types, no document-folders configured), the dependent write is recorded
`blocked-by-dependency` with the missing id named explicitly — never faked.

**Two distinct address builders** encode a durable AccuLynx quirk: contact `mailingAddress`/`billingAddress`
use **object-shaped** `state`/`country` (`{id, name, abbreviation}`); job `locationAddress` (and
`PUT /jobs/{jobId}/address`) use **STRING** abbreviations — the opposite shape. The two builders are never
shared, and each has its own unit test asserting the correct shape.

# Tiered red-team + stop rule (D-05)

| Tier | Endpoints | Depth |
|---|---|---|
| **Deep** | ~14 "meaningful write lane" endpoints (create contact + job, custom-fields, worksheet items, payments, documents/photos, messages, representatives, external-references) | Full 5-dimension red-team, iterated to the stop rule |
| **Smoke** | Remaining ~24 endpoints | One happy-path probe + one bad-input probe each |

**The 5 red-team dimensions:**

1. **Bad/malformed input** — invalid enum values, empty required arrays, wrong address shape, missing
   required fields, oversized bulk payloads.
2. **Partial failure** — does a multi-item bulk operation (e.g. `PUT .../custom-fields`) fail atomically,
   or do valid items persist while only the malformed one errors?
3. **Idempotency / retries** — repeat an identical create; call a DELETE twice; retry after a simulated
   timeout and check whether the first attempt actually landed before retrying.
4. **Ordering / dependency** — call a child endpoint before its parent/precondition exists (documented
   `412` responses are a direct signal here); call a reply endpoint with a fabricated parent id.
5. **Authz / scope** — does any well-formed write still return `403` under the sandbox key's own
   permissions; does a foreign/nonexistent id 404 without leaking existence of other tenants' records.

**Stop rule (the concrete "diminishing returns"):** stop probing a single endpoint after **2 consecutive
probes reveal no new error shape and no new guardrail** — implemented as a pure, unit-tested
`shouldStopProbing(history): boolean` function in `sweep.ts` so the stop-rule logic is testable without a
live sandbox call.

**Disposable-entity lifecycle (D-04):** every sandbox-created entity is tagged with a run-id marker
(`run_tag`) for identifiability. Created parents are **reused** across dependent probes (a created
job/financials becomes the parent for worksheet-items, custom-fields, payments — dependency chains are
seeded, not mocked). The 4 real DELETE endpoints are exercised as part of the sweep (create → red-team →
delete → delete-again to confirm idempotent-repeat behavior). Everything else is left in place — the
sandbox is disposable, AccuLynx has no bulk reset, and most entities cannot be deleted at all.

# Evidence-correct verdict classification

A core correctness finding from this phase: **`unsupported` must be reserved for genuinely-absent
routes only.** A reachable `4xx` with an AccuLynx `ProblemDetails` body (`type`/`title`/`status`/`detail`/
`traceId`) or a `5xx` crash is *evidence the route exists* — it must classify as `blocked-by-dependency`
(missing child id/config) or `fragile-with-guardrail` (a real failure mode), never `unsupported`. The pure,
unit-tested `classifyVerdict2` (`looksLikeProblemDetails` / `isReachableRoute` / `classifyVerdict2` in
`sweep.ts`) enforces this distinction. The first sweep run over-assigned `unsupported` to 18 reachable
endpoints before this classifier existed; the corrected run drove `unsupported` to 0/38.

Multipart file-upload endpoints (`postJobDocument`, `postJobPhotoVideo`) send genuine
`multipart/form-data` bodies (an in-memory fixture file), not JSON — sending JSON to these routes
previously produced a false `unsupported`-looking 404 from content-type mis-negotiation.

# Evidence tables

Mirrors the read-side schema (`acculynx_api_catalog` / `acculynx_api_probe`), extended for method,
red-team dimension, side effect, and tag+leave traceability:

- **`acculynx_write_checklist`** — the 38-endpoint **input** target list (method, path, tier deep/smoke,
  request-body schema reference, dependency chain).
- **`acculynx_write_probe`** — one row per probe **attempt**: method, path, request-body sample (redacted),
  status, response shape (redacted), error shape, side effect, red-team dimension, `run_tag`,
  `created_entity_id`.
- **`acculynx_write_catalog`** — one row per endpoint carrying the **evidence-based verdict**
  (`writable` / `write-only` / `unsupported` / `fragile-with-guardrail` / `read-shaped` /
  `blocked-by-dependency`), tier, side effect, and guardrail notes — upserted on
  `(endpoint_pattern, method)`.

Checklist = input; catalog = evidence output — kept as two distinct tables so the target list and the
observed results never get conflated.

**PII redaction** (`redactSample`, reused verbatim from the read-sweep) is applied to both
`payload_sample` (response) and `request_body_sample` (outbound body) before any row is stored — even
though this phase's seeded data is synthetic/anonymized, the discipline is applied uniformly as defense in
depth.

# Reconcile gate

`scripts/acculynx-write-sweep-reconcile.sql` mirrors the read-sweep's reconciliation script, with a 4th
assertion added for the write side:

1. **Unreconciled op** — every checklist row has ≥1 matching probe row.
2. **2xx with null summary** — every successful write has a recorded result summary, not a bare status.
3. **Non-sandbox row** — every probe row is tagged `source_account_key='sandbox'`.
4. **Blocked-dep-missing-evidence** — no `blocked-by-dependency` verdict is stored without a
   `guardrail_notes`/evidence entry naming the specific missing prerequisite.

A passing gate returns **zero rows** across all four assertions. The live run (batch
`wsweep-2026-07-01T13-33-02-965Z`) reconciled clean: 38/38 endpoints covered, zero orphaned probes, zero
non-sandbox rows, zero bare blocked-by-dependency verdicts.

# Deploy path

The Edge Function deploys via the **Supabase CLI**, independent of the Coolify-hosted Command Center app:

```bash
supabase functions deploy acculynx-write-sweep --project-ref rnhmvcpsvtqjlffpsayu
```

This is **not** a Coolify deploy — `acculynx-write-sweep` is a standalone Supabase Edge Function, same
deploy path as `acculynx-read-sweep` and `acculynx-sync`. A boot check (unauthenticated request →
`401` from the platform JWT gate) confirms the function is deployed and reachable before invoking it with a
service-token-authenticated POST to actually run the sweep.

# Result (sandbox write sweep, 2026-07-01)

Batch `wsweep-2026-07-01T13-33-02-965Z`: 38/38 endpoints probed, reconcile gate PASS, human-verified final
tally — writable 12 · write-only 5 · fragile-with-guardrail 2 · read-shaped 2 · blocked-by-dependency 17 ·
unsupported 0. The full per-endpoint result is the
[Write Capability](../api/write-capability.md) matrix and [docs/37](../../../37-acculynx-write-capability-matrix.md).
Idempotent by design (re-running appends a fresh batch and reuses the tagged entities already in the
sandbox) — a future re-run (e.g. after the sandbox company gains missing configuration) can deepen the
17 blocked-by-dependency verdicts without re-probing the whole surface from scratch.

# Citations

[1] Edge Function `acculynx-write-sweep`, `supabase/functions/acculynx-write-sweep/`
[2] [Write Capability matrix](../api/write-capability.md)
[3] [docs/37 — write-capability matrix](../../../37-acculynx-write-capability-matrix.md)
[4] Reconciliation `scripts/acculynx-write-sweep-reconcile.sql`
[5] [Read-sweep harness (structural analog)](read-sweep.md)
