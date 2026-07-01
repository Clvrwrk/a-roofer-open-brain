# Phase 4: Sandbox Write-Capability Exploration & Red-Team - Research

**Researched:** 2026-07-01
**Domain:** AccuLynx REST API V2 write surface (POST/PUT/DELETE), sandbox-only red-team harness, Supabase Edge Functions + Postgres evidence tables
**Confidence:** HIGH (endpoint surface, shapes, status codes verified directly against the vendored OpenAPI index; harness pattern verified against live Phase-1 code; red-team recipes are MEDIUM — synthesized from general REST red-team practice, no vendor-specific red-team doc exists)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test-harness form**
- **D-01:** Build a **new dedicated `acculynx-write-sweep` Edge Function**, mirroring the Phase 1 `acculynx-read-sweep` harness. It reuses the `acculynx-sync` lib (accounts/auth), and bakes in a **hard sandbox-key-only gate** — the function must refuse to run against any non-sandbox account key (single enforced safety boundary; matches the read-sweep's hard gate). Do **not** extend `acculynx-read-sweep` in place (keeps the read harness's prod-safety story clean) and do **not** make a local script the durable artifact.
- The existing `scripts/seed-sandbox-from-wichita.mjs` and its verified findings are **prior art / seed data**, not the harness.

**Result recording schema**
- **D-02:** Create **new `acculynx_write_catalog` + `acculynx_write_probe` tables**, mirroring the read-side `acculynx_api_catalog` / `acculynx_api_probe`. One catalog row per write endpoint carrying the **evidence-based verdict** (writable / write-only / unsupported / fragile-with-guardrail); one probe row per attempt (method, path, request shape, status, error shape, side-effect, red-team dimension). Additive/idempotent DDL (hard rule 1).
- **D-03:** The superseding write-capability matrix doc is **generated from the tables**, not hand-maintained — `docs/37` and `docs/knowledge-base/acculynx/api/write-capability.md` are updated from the evidence rows.

**Disposable-entity lifecycle**
- **D-04:** **Tag + leave; DELETE where the 4 DELETE endpoints allow.** Stamp every sandbox-created entity with a run-id / test marker so test data is identifiable. Exercise the real DELETE endpoints as part of red-teaming (they are 4 of the 38 endpoints under test). **Reuse created parents for dependent writes** (e.g. a created job/financials as the parent for worksheet-items, custom-fields, payments) — dependency chains are seeded, not mocked. Leave everything else; the sandbox is disposable. No reseed/reset (AccuLynx has no bulk reset and most entities can't be deleted).

**Red-team depth & stop rule**
- **D-05:** **Tiered depth.** Full **5-dimension** red-team on the ~8 "meaningful write lane" endpoints; a lighter pass on the remaining ~30.
  - **Dimensions:** (1) bad/malformed input, (2) partial failure, (3) idempotency / retries, (4) ordering / dependency, (5) authz / scope.
  - **Meaningful write lane (deep):** create contact + job, `PUT /jobs/{id}/custom-fields`, `POST /financials/{id}/worksheet/items`, `POST /jobs/{id}/payments/*`, `POST /jobs/{id}/documents` (+ photos/measurements), `POST /jobs/{id}/messages`, representatives, `POST /jobs/external-references`.
  - **Remaining ~30 (smoke):** one happy-path + one bad-input probe each.
  - **Stop rule (the concrete "diminishing returns"):** stop probing an endpoint after **2 consecutive probes reveal no new error shape or new guardrail**.

### Claude's Discretion
- Exact `acculynx-write-sweep` internal structure, tier A/B/C endpoint ordering, and per-endpoint request-shape construction — planner/researcher decide, grounded in the read-sweep pattern and the known request-shape quirks.
- The exact column set of `acculynx_write_catalog` / `acculynx_write_probe` — mirror the read tables' shape, extend for method + red-team dimension + side-effect.
- How dependency chains are seeded (reuse of prior seeder vs. fresh sandbox creates).

### Deferred Ideas (OUT OF SCOPE)
- **Production write/action layer + approval-gated write wrappers** → Phase 5 (REQ-08). This phase only proves capability in the sandbox.
- **AccuLynx Agent** (dedicated agent, A3-gated) → Phase 6 (REQ-09).
- **Reactive status mirroring via webhooks** → future; only the sandbox webhook-tier signal is noted here, not built.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-06 | Exhaustive sandbox test of every WRITE endpoint (POST/PUT/DELETE), red-teamed to diminishing returns, with a live write-capability matrix superseding docs/37 | Full 38-endpoint enumeration below (§ Standard Stack / Endpoint Enumeration), dependency graph (§ Architecture Patterns), red-team dimension recipes (§ Code Examples), evidence-table schema (§ Standard Stack), matrix-generation approach (§ Architecture Patterns) |
</phase_requirements>

## Summary

The AccuLynx API V2 write surface is exactly **19 POST / 15 PUT / 4 DELETE = 38 endpoints**, confirmed directly against the vendored OpenAPI index (`skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json`, `counts.operations: 124`, method breakdown `{GET:86, POST:19, PUT:15, DELETE:4}`). This is the authoritative enumeration — more reliable than docs/37 prose, which references a `measurements` write endpoint that **does not exist** in the current 124-operation surface (docs/37 is stale on this point; Phase 4 corrects it).

The phase is a direct structural mirror of the Phase 1 read-sweep: a new sandbox-gated Edge Function (`acculynx-write-sweep`) walks a spec-driven checklist table (`acculynx_write_catalog` seeded from this research), executes tiered probes (deep 5-dimension red-team on ~8 write-lane endpoints, smoke happy-path+bad-input on the remaining ~30), records one row per attempt in `acculynx_write_probe`, and a reconciliation query (mirroring `acculynx-read-sweep-reconcile.sql`) asserts every one of the 38 endpoints has at least one probe row. The write-capability matrix (docs/37 + write-capability.md) is then regenerated from the evidence tables, not hand-maintained.

The core technical risk is **dependency chaining**: a bare API-created job (`POST /jobs`) has no financials, no estimate, no invoice, and is an **unassigned lead** invisible to the default `GET /jobs` list. This means roughly a third of the 30 "smoke" endpoints (financials-nested writes beyond worksheet items, insurance/adjuster on a lead with no claim, custom-fields whose IDs come from company settings) either need extra seed calls to read prerequisite IDs (contact-types, job-categories, custom-field definitions) from company-settings GETs, or are genuinely untestable by pure API seeding and should receive an evidence-backed `blocked-by-dependency` verdict rather than a forced/fake probe.

**Primary recommendation:** Build `acculynx-write-sweep` as a near-literal structural clone of `acculynx-read-sweep` (same hard-gate function, same tiered ID-harvesting walk, same redaction, same batch-tagging), driven by a new `acculynx_write_catalog` checklist table populated with the 38 endpoints below, their required-body shapes (verified from the OpenAPI index), and dependency chains; red-team the ~8 write-lane endpoints across all 5 dimensions until 2 consecutive no-new-signal probes, smoke-test the rest; regenerate docs/37 and write-capability.md from the resulting `acculynx_write_probe` rows.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sandbox-only write execution | API / Backend (Supabase Edge Function) | — | Same tier as read-sweep; the hard gate and all HTTP calls to AccuLynx must run server-side where the sandbox secret is resolvable and never exposed to a client |
| Evidence recording (catalog/probe) | Database / Storage (Postgres, prod Supabase) | API / Backend | Tables are the source of truth; the Edge Function only writes rows, it does not own the schema definition (that's a migration file) |
| Dependency-chain seeding (contact→job→financials→...) | API / Backend | — | Must happen server-side via the AccuLynx API itself using the sandbox key; no client tier is involved |
| Red-team probe construction (bad input, authz, ordering) | API / Backend | — | Probe payload variants are constructed and sent by the same Edge Function; this is pure server-side test logic, not a UI concern |
| Matrix generation (docs/37, write-capability.md) | Database / Storage → docs (build-time/manual step) | — | A SQL query over the evidence tables produces the matrix content; the docs themselves are static markdown files regenerated by a human/agent step, not served at runtime |
| Deploy path | API / Backend (`supabase functions deploy`) | — | NOT Coolify — this is a Supabase Edge Function, deployed via the Supabase CLI, independent of the Coolify-hosted Command Center app |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jsr:@supabase/supabase-js@2` | 2.x | Postgres client for the Edge Function (insert probe rows, upsert catalog rows) | [VERIFIED: codebase] Already the exact import used by `acculynx-read-sweep/index.ts` and `acculynx-sync/index.ts` — no new dependency, same version pin (`@2`) |
| Deno (Supabase Edge Runtime) | 2.8.1 locally; Supabase-managed on deploy | Edge Function runtime | [VERIFIED: local environment + existing functions] `deno --version` confirms 2.8.1 available locally for `deno check`/`deno test`; Supabase's hosted edge runtime is Deno-based and already runs `acculynx-read-sweep` and `acculynx-sync` in production |
| `jsr:@std/assert@1` | 1.x | Unit-test assertions for the pure sweep-core module | [VERIFIED: codebase] Used verbatim by `acculynx-read-sweep/sweep.test.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase CLI | 2.105.0 (local) | Deploy the new function (`supabase functions deploy acculynx-write-sweep`), apply new migrations | [VERIFIED: local environment] `supabase --version` confirms 2.105.0 on PATH |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New dedicated Edge Function (D-01, locked) | Extending `acculynx-read-sweep` in place | Rejected by CONTEXT.md — would blur the read harness's "GET-only, no writes" safety story; not evaluated further |
| New dedicated Edge Function (D-01, locked) | Durable local Node script (like `seed-sandbox-from-wichita.mjs`) | Rejected by CONTEXT.md — not durable/repeatable infrastructure, no evidence-table integration, no reconciliation gate |

**No package installation required this phase.** The only runtime dependency (`jsr:@supabase/supabase-js@2`) is already vendored and running in production via the two existing Edge Functions this phase mirrors. The Package Legitimacy Audit below is included per protocol but is a no-op — there is nothing new to vet.

**Version verification:**
```bash
deno --version        # 2.8.1 (stable) — confirmed via Bash, 2026-07-01
supabase --version     # 2.105.0 — confirmed via Bash, 2026-07-01
```

## Package Legitimacy Audit

This phase installs **no new external packages**. It reuses `jsr:@supabase/supabase-js@2`, already imported by `supabase/functions/acculynx-read-sweep/index.ts` and `supabase/functions/acculynx-sync/index.ts`, both currently running in production. No `npm install`/`pip install`/`cargo add` is part of this phase's scope.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@supabase/supabase-js` | jsr | Established (multi-year, official Supabase SDK) | High (core SDK for all Supabase projects) | github.com/supabase/supabase-js | not run — already vetted/running in prod by prior phases | Approved (pre-existing, reused) |

**Packages removed due to slopcheck [SLOP] verdict:** none — no new packages considered.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────┐
                     │  acculynx_write_catalog (checklist)      │
                     │  38 rows: method, path, body schema,     │
                     │  tier (deep/smoke), dependency chain      │
                     └───────────────────┬───────────────────────┘
                                         │ read (ordered by dependency)
                                         ▼
POST (trigger)          ┌──────────────────────────────────────────┐
──────────────► │  acculynx-write-sweep (Edge Function)     │
                 │  1. assertSandbox() — hard gate            │
                 │  2. Load checklist                          │
                 │  3. Seed prerequisite IDs (company-settings  │
                 │     GETs: contact-types, job-categories,    │
                 │     trade-types, lead-sources, custom-field  │
                 │     definitions)                             │
                 │  4. Walk checklist in dependency order:      │
                 │     contact → job → financials/worksheet →   │
                 │     payments/custom-fields/docs/messages/    │
                 │     reps/external-ref → DELETE (4 endpoints) │
                 │  5. Per endpoint: tier=deep → 5-dimension    │
                 │     red-team to stop-rule; tier=smoke →      │
                 │     happy-path + 1 bad-input probe           │
                 │  6. Redact PII in stored payload samples     │
                 │  7. Tag every created entity with a run-id   │
                 │     marker (tag+leave, D-04)                  │
                 └───────┬───────────────────────┬──────────────┘
                         │ writes                 │ writes
                         ▼                         ▼
          ┌───────────────────────┐   ┌─────────────────────────┐
          │ acculynx_write_probe   │   │ acculynx_write_catalog   │
          │ (one row per attempt,  │   │ (upsert: verdict per     │
          │  incl. red-team dim,   │   │  endpoint — writable /   │
          │  status, error shape,  │   │  write-only / unsupported│
          │  side-effect)          │   │  / fragile-with-guardrail)│
          └───────────┬────────────┘   └────────────┬─────────────┘
                      │                              │
                      └──────────────┬───────────────┘
                                     ▼
                     ┌─────────────────────────────────┐
                     │  Reconciliation query (SQL)       │
                     │  mirrors acculynx-read-sweep-      │
                     │  reconcile.sql: assert all 38      │
                     │  endpoints have ≥1 probe row,       │
                     │  assert source_account_key=        │
                     │  'sandbox' for every row            │
                     └───────────────┬─────────────────────┘
                                     ▼
                     ┌─────────────────────────────────┐
                     │  Matrix regeneration (manual/agent │
                     │  step): query evidence tables →    │
                     │  update docs/37 +                  │
                     │  write-capability.md                │
                     └─────────────────────────────────┘

              AccuLynx SANDBOX account (external)
              ▲ hard-gated: only PE_CC_SANDBOX_ACCULYNX_API_KEY
              │ resolvable; assertSandbox() throws otherwise
              └── all POST/PUT/DELETE HTTP calls target this account only
```

### Recommended Project Structure
```
supabase/functions/acculynx-write-sweep/
├── index.ts             # Edge Function entrypoint — hard gate, checklist walk, persistence
├── sweep.ts              # Pure logic: assertSandbox, request-body builders, redaction, verdict classification
└── sweep.test.ts          # Deno unit tests for sweep.ts (mirrors read-sweep's test file)

schemas/cleverwork-roofer/
├── 182-acculynx-write-catalog-ddl.sql     # acculynx_write_catalog + acculynx_write_probe tables
└── 183-acculynx-write-checklist-seed.sql  # 38-row checklist seed (mirrors 167-acculynx-get-checklist.sql)

scripts/
└── acculynx-write-sweep-reconcile.sql     # reconciliation gate (mirrors acculynx-read-sweep-reconcile.sql)

docs/37-acculynx-write-capability-matrix.md                  # regenerated from evidence
docs/knowledge-base/acculynx/api/write-capability.md          # regenerated from evidence
docs/knowledge-base/acculynx/ingestion/write-sweep.md          # new design doc (mirrors read-sweep.md)
```

### Pattern 1: Hard Sandbox Gate (reuse verbatim pattern)
**What:** A code-level assertion that throws before any network call unless the resolved secret name is exactly the sandbox secret constant.
**When to use:** At the very top of the Edge Function handler, before any AccuLynx HTTP call — this is the single enforced safety boundary (D-01).
**Example:**
```typescript
// Source: supabase/functions/acculynx-read-sweep/sweep.ts (existing, verified in this repo)
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
For the write-sweep, reuse this exact function (import from a shared module, or duplicate verbatim into the new function's own `sweep.ts` — duplication is acceptable here since CONTEXT.md explicitly wants the read harness untouched).

### Pattern 2: Dependency-Ordered Checklist Walk with ID Harvesting
**What:** Tier A (no dependency) endpoints run first and harvest IDs into a `seeds` map; later tiers consume those seeds to resolve path params and request-body parent references.
**When to use:** For every write endpoint whose body or path requires a prerequisite entity ID.
**Example (adapted from read-sweep's HARVEST table + seed pre-fetch):**
```typescript
// Source: supabase/functions/acculynx-read-sweep/index.ts (existing pattern, adapted for writes)
// 1. Seed prerequisite reference data (read-only GETs, safe to call from write-sweep too):
const [contactTypes, jobCategories, tradeTypes, leadSources] = await Promise.all([
  acculynxGet(`${BASE}/contacts/contact-types`),
  acculynxGet(`${BASE}/company-settings/job-file-settings/job-categories`),
  acculynxGet(`${BASE}/company-settings/job-file-settings/trade-types`),
  acculynxGet(`${BASE}/company-settings/leads/lead-sources`),
]);

// 2. Create contact -> harvest contactId
const contact = await acculynxPost(`${BASE}/contacts`, contactBody);
seeds.contactId = [contact.body.id];

// 3. Create job using harvested contactId -> harvest jobId
const job = await acculynxPost(`${BASE}/jobs`, { contact: { id: seeds.contactId[0]!}, ...jobBody });
seeds.jobId = [job.body.id];

// 4. GET /jobs/{jobId}/financials to harvest financialsId (financials are auto-created with the job)
const financials = await acculynxGet(`${BASE}/jobs/${seeds.jobId[0]}/financials`);
seeds.financialsId = [financials.body.id];

// 5. Now worksheet items, payments, custom-fields, documents, messages, reps, external-refs
//    can all be probed using seeds.jobId / seeds.financialsId as parents.
```
**Key seed-order finding (verified against `scripts/seed-sandbox-from-wichita.mjs` + write-capability.md):** `POST /contacts` must precede `POST /jobs` (job requires `contact.id`). `POST /jobs` creates the job AND its financials record implicitly — `GET /jobs/{jobId}/financials` retrieves `financialsId` without a separate create call (there is no `POST /financials`). This is the parent-seed for `POST /financials/{financialsId}/worksheet/items`.

### Pattern 3: PII Redaction Before Storage (reuse verbatim)
**What:** Recursively mask PII-shaped keys (`firstName`, `lastName`, `phone`, `email`, address fields) with `[redacted:<type>]` tokens while preserving structure, truncating long non-PII strings.
**When to use:** Before writing any `payload_sample` into `acculynx_write_probe` — this phase creates *new* sandbox contacts/jobs with anonymized names, but the redaction discipline should still apply uniformly (defense in depth, and consistency with the read-sweep's stored-shape convention).
**Example:**
```typescript
// Source: supabase/functions/acculynx-read-sweep/sweep.ts (existing, reuse verbatim or near-verbatim)
export function redactSample(value: unknown): unknown { /* ... */ }
```

### Anti-Patterns to Avoid
- **Reset/reseed between probes:** AccuLynx has no bulk sandbox reset and most entities cannot be deleted (D-04 locked). Do not attempt to "clean up" between red-team dimensions — accumulate tagged entities and reuse them as parents.
- **Faking a dependency chain to force a smoke-test "pass":** If an endpoint genuinely cannot be reached because its parent entity has no create path via the API (e.g. milestone-gated financials fields that only populate once a human advances the job past a milestone in the AccuLynx UI), record `blocked-by-dependency` with the evidence, not a synthetic success.
- **Treating `POST /jobs/search` and `POST /contacts/search` as writes:** these are POST-verb but read-shaped (search bodies), not create operations. They still count toward the 19-POST enumeration and need a probe row for completeness, but they carry no side-effect and don't belong in the "meaningful write lane" red-team depth — smoke-test them like the other ~30.
- **Ignoring the 412 status code on ordering-sensitive endpoints:** `PUT /jobs/{jobId}/initial-appointment`, `PUT /jobs/{jobId}/insurance/insurance-company`, `PUT /jobs/{jobId}/job-categories`, `POST /jobs/{jobId}/payments/expense`, `POST /subscriptions`, `PUT /subscriptions/{id}` all document a `412 Precondition Failed` response in the OpenAPI spec — this is a directly-labeled ordering/dependency red-team signal (dimension 4) and should be probed explicitly (e.g., call before a required precondition is met) rather than discovered by accident.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sandbox-only enforcement | A new ad-hoc guard/env-check | The existing `assertSandbox()` pattern from `acculynx-read-sweep/sweep.ts`, duplicated/adapted | Already reviewed, tested, and proven correct in production (Phase 1) — re-implementing risks a subtly different (weaker) gate |
| Rate-limiting/backoff on 429 | A custom retry loop from scratch | The existing `acculynx-sync` lib pattern (exponential backoff + `Retry-After` header respect) already implemented in `read-sweep/index.ts`'s `acculynxGet` helper | AccuLynx enforces 10 req/s per API key; the existing pattern already handles `Retry-After` + jittered exponential backoff correctly |
| Evidence-table schema design | A bespoke new schema shape | Mirror `acculynx_api_catalog` / `acculynx_api_probe` column-for-column (per D-02), extending only for method/dimension/side-effect | Consistency lets a single reconciliation-style query pattern and a single "matrix generation" mental model serve both read and write evidence |
| Matrix doc generation | Hand-editing docs/37 per probe result | A SQL query (or short script) over `acculynx_write_catalog` that emits the markdown table, run once red-teaming is complete | D-03 requires the doc be *generated from* the tables, not maintained by hand — hand-editing reintroduces exactly the drift problem this phase exists to fix |

**Key insight:** Nearly every piece of infrastructure this phase needs already exists as a proven pattern from Phase 1 (read-sweep) and the sandbox seeder script. The engineering task is mirroring and extending those patterns for writes (add red-team dimensions, add dependency-chain creation instead of pure GET-walking), not designing new infrastructure from scratch.

## Common Pitfalls

### Pitfall 1: Address shape asymmetry (contact vs job)
**What goes wrong:** Sending `state`/`country` as strings on a contact's `mailingAddress`, or as objects on a job's `locationAddress`, produces a 4xx with a message like `"could not be converted to ... State"` or `"... to System.String"`.
**Why it happens:** `contactAddress` (used by `POST /contacts` `mailingAddress`/`billingAddress`) expects `state`/`country` as **objects** (`{id, name, abbreviation}`); `jobAddressPost` (used by `POST /jobs` `locationAddress`, and `PUT /jobs/{jobId}/address` per its flat string-only schema) expects `state`/`country` as **strings** (abbreviation).
**How to avoid:** Encode both shapes explicitly as fixtures/builders in the sweep — do not share one address-builder function between contact and job bodies. `PUT /jobs/{jobId}/address` schema (verified from OpenAPI index) is `{street1, street2, city, state, country, zipCode}` — all flat strings, confirming the job-side convention extends to this endpoint too.
**Warning signs:** A precise 4xx mentioning a .NET type-conversion failure (`System.String`, a named enum/model type) — this is AccuLynx's server-side model binder rejecting the shape, not a generic validation error. [VERIFIED via write-capability.md live probe, 2026-06-30]

### Pitfall 2: `priority` and other strict server-side enums
**What goes wrong:** Sending any value for `priority` other than the exact accepted set returns `404` (not `400`) with `"could not be converted to ... JobPriority"`.
**Why it happens:** AccuLynx models several fields as C#-style enums bound directly from the JSON string; invalid values fail model binding before reaching business logic, and AccuLynx's binder returns 404 for this failure mode rather than 400.
**How to avoid:** Treat every "enum-typed" property (`priority` on `POST /jobs` and `PUT /jobs/{jobId}/priority`; `fieldType` on `PUT /contacts/{contactId}/custom-fields/{customFieldId}` and `PUT /jobs/{jobId}/custom-fields/{customFieldId}`; `integrationType` on `POST /subscriptions`, observed default `Api`) as a red-team target for dimension 1 (bad input) — probe with a plausible-but-wrong value and record the exact status+message shape.
**Warning signs:** `404` returned for what looks like a validation error (most APIs would return `400`) — this is the AccuLynx-specific tell that a strict enum type-bind failed.

### Pitfall 3: `POST /jobs` creates an invisible unassigned lead
**What goes wrong:** A freshly-created job does not appear in the default `GET /jobs` list, making it look like the create silently failed or landed somewhere else.
**Why it happens:** API-created jobs default to `assignment=unassigned` and AccuLynx's default job list filters to assigned jobs only.
**How to avoid:** Always query with `?assignment=unassigned` (or use the `Location`/`id` from the `201` response directly) to find and continue working with API-created jobs. The read-sweep's own seed pre-fetch already does this (`assigned` + `unassigned` merge) — copy that dual-fetch into the write-sweep's seeding step.
**Warning signs:** A `201` on `POST /jobs` with a valid `id` in the body, but a subsequent `GET /jobs` (default filter) doesn't include it.

### Pitfall 4: Bare API-created jobs have no financials/estimate/invoice depth
**What goes wrong:** Attempting to red-team endpoints like `GET/PUT /jobs/{jobId}/insurance`, amendments, or invoice-nested writes against a job created purely via the API returns empty/degenerate shapes, not because the endpoint is broken but because the entity graph is genuinely shallow.
**Why it happens:** Milestone advancement (which in the human UI triggers estimate/invoice creation) has **no write endpoint** — verified by the full 38-endpoint enumeration (no `POST`/`PUT` under `/estimates`, `/invoices`, or `/milestones` beyond history reads). A job created by `POST /jobs` is a bare lead.
**How to avoid:** For any endpoint whose only real seed source is milestone-progressed job state, record the verdict as `blocked-by-dependency` with the evidence ("no write path exists to advance past milestone X; entity graph cannot be deepened by API alone") rather than forcing a synthetic probe. This is itself a valuable finding for the matrix, distinct from `unsupported`.
**Warning signs:** A dependent endpoint consistently returns `200`/`204` with an empty or null-heavy body across multiple otherwise-well-formed requests.

### Pitfall 5: Write-only endpoints have no read-back to verify a "successful" write
**What goes wrong:** `POST /jobs/{jobId}/messages` (and its `.../replies` sibling) return `201` but there is no `GET` to confirm the message actually persisted with the exact content sent.
**Why it happens:** The job message/chat stream is intentionally write-only in this API version (confirmed: no GET operation exists under `/jobs/{jobId}/messages` in the 86-GET surface).
**How to avoid:** Treat the `201` + response body (if any) as the only available evidence; note in the catalog verdict that the endpoint is `write-only` (no independent verification path) rather than `writable` (verifiable). This distinction matters for Phase 5's design of write-wrapper confidence.
**Warning signs:** None at the HTTP layer — this must be caught by cross-referencing the write endpoint list against the read (`acculynx_get_checklist`) list for a matching GET path.

### Pitfall 6: Rate limit is per-key, and the write-sweep will share the sandbox key with any concurrent seeding activity
**What goes wrong:** If `scripts/seed-sandbox-from-wichita.mjs` or another process is run concurrently against the sandbox key while the write-sweep executes, both consumers share the same 10 req/s ceiling, and 429s may appear that look like an idempotency/retry finding but are actually just contention.
**Why it happens:** AccuLynx rate-limits per API key, not per calling process (SKILL.md: "10 requests/sec per API key").
**How to avoid:** Run the write-sweep in isolation (no concurrent sandbox-key consumers) when interpreting 429 responses as red-team evidence; if a 429 is observed, check `Retry-After` and confirm it's not simply exceeding the shared budget.
**Warning signs:** 429s clustering at moments coinciding with another script's known run window.

## Code Examples

### Full 38-Endpoint Enumeration (verified via `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json`)

**Tier-deep — the ~8 "meaningful write lane" endpoints (full 5-dimension red-team):**

| # | Method | Path | Required body fields | Parent dependency | Success codes |
|---|--------|------|----------------------|--------------------|----------------|
| 1 | POST | `/contacts` | none formally required, but `contactTypeIds` empty-array → 400 in practice [VERIFIED live] | none (Tier-A root) | 201, 400, 401 |
| 2 | POST | `/jobs` | `contact` (contactId) | contact.id from #1 | 201, 400, 401, 403, 404 |
| 3 | PUT | `/jobs/{jobId}/custom-fields` | `customFields` array (bulk, ≤120 per docs/37) | job.id; custom-field definitions from `GET /company-settings/custom-fields` | 204, 400, 401, 404, 416 |
| 4 | POST | `/financials/{financialsId}/worksheet/items` | `price` (required); optional `sectionId` (omit → auto-create worksheet per docs/37), `parentItemId`, `itemName`, `description`, `quantity`, `unitOfMeasure`, `costPerUnit`, `cost` | financialsId from `GET /jobs/{jobId}/financials` | 201, 400, 401, 404 |
| 5 | POST | `/jobs/{jobId}/payments/received` | none formally required; `from`, `amount`, `paymentDate`, `checkNumber`, `notes` | job.id | 201, 400, 401, 404 |
| 5b | POST | `/jobs/{jobId}/payments/paid` | none formally required; `to`, `paymentMethod`, `amount`, `paymentDate`, `notes`, `accountTypeId`, `refNumber`, `isPaid` | job.id; `accountTypeId` from `GET /company-settings/location-settings/account-types` | 201, 400, 401, 404 |
| 5c | POST | `/jobs/{jobId}/payments/expense` | none formally required; `to`, `amount`, `notes`, `accountTypeId`, `isPaid`, `refNumber` | job.id | 201, 400, 401, 404, **412** |
| 6 | POST | `/jobs/{jobId}/documents` | `file` (binary), `documentFolderId` (both required) | job.id; `documentFolderId` from `GET /company-settings/job-file-settings/document-folders` | 202, 400, 401, 404 |
| 6b | POST | `/jobs/{jobId}/photos-videos` | none formally required; `file`, `description`, `tags`, `fileUri`, `externalId`, `externalSource` | job.id | 202, 400, 401, 404 |
| 7 | POST | `/jobs/{jobId}/messages` | `message` (required) | job.id | 201, 400, 401, 404 |
| 8 | POST | `/jobs/{jobId}/representatives/company` | `id` | job.id; rep-user id from `GET /users` | 204, 401, 404 |
| 8b | POST | `/jobs/{jobId}/representatives/sales-owner` | `id` | job.id | 204, 401, 404 |
| 8c | POST | `/jobs/{jobId}/representatives/ar-owner` | `id` | job.id | 204, 401, 404 |
| 9 | POST | `/jobs/external-references` | `jobId`, `source`, `projectId` (all required) | job.id | 201, 400, 401, 404 |

*(Note: the CONTEXT.md "~8" write-lane count groups payments/*, photos+documents, and representatives/* as single conceptual lanes; the table above expands each variant since they are separately-probeable endpoints with distinct paths — 13 endpoint rows covering ~8 conceptual "lanes.")*

**Tier-smoke — remaining ~25 endpoints (happy-path + 1 bad-input probe each):**

| Method | Path | Required body | Notes |
|--------|------|----------------|-------|
| PUT | `/contacts/{contactId}/custom-fields` | `customFields` array | mirrors #3 for contacts |
| PUT | `/contacts/{contactId}/custom-fields/{customFieldId}` | `fieldType`, `values` | needs a specific customFieldId — seed from `GET /contacts/{contactId}/custom-fields` |
| POST | `/contacts/{contactId}/logs` | none documented as required | write-only side channel; check for a read-back path |
| POST | `/contacts/search` | `startDate`, `endDate`, `sort` (all required) | search-shaped, not a create |
| POST | `/jobs/search` | none required (`searchTerm`, `geoLocation`) | search-shaped, not a create |
| PUT | `/jobs/{jobId}/address` | flat `street1/street2/city/state/country/zipCode` (all strings) | confirms job-address-as-strings convention |
| PUT | `/jobs/{jobId}/adjuster` | none required; `adjusterName`, `phone`, `fax`, `email`, `claimApproved`, `claimApprovedDate`, `metWithAdjuster`, `metWithAdjusterDate` | likely `blocked-by-dependency` unless an insurance claim context exists on the bare lead — test and record actual behavior |
| PUT | `/jobs/{jobId}/custom-fields/{customFieldId}` | `fieldType`, `values` | needs specific customFieldId |
| PUT | `/jobs/{jobId}/initial-appointment` | none required; `startDate`, `endDate`, `notes` | documents **412** — good ordering-dependency probe target |
| DELETE | `/jobs/{jobId}/initial-appointment` | optional `note` | one of the 4 DELETEs; requires the PUT above to have succeeded first (ordering test) |
| PUT | `/jobs/{jobId}/insurance` | (schema shows no top-level required properties in index — verify actual shape live) | flagged "shape may need live discovery — index shows empty properties list" |
| PUT | `/jobs/{jobId}/insurance/insurance-company` | none required; `insuranceCompanyId`, `insuranceCompanyName` | documents **412** |
| PUT | `/jobs/{jobId}/job-categories` | `id` (required) | documents **412**; id from `GET /company-settings/job-file-settings/job-categories` |
| PUT | `/jobs/{jobId}/lead-source` | `id` (required) | id from `GET /company-settings/leads/lead-sources` |
| PUT | `/jobs/{jobId}/priority` | `priority` (required, strict enum Low/Normal/High) | good bad-input target (invalid enum → 404, see Pitfall 2) |
| PUT | `/jobs/{jobId}/trade-types` | none shown required in index — verify live shape | flagged "shape TBD — discover in sweep" |
| PUT | `/jobs/{jobId}/work-type` | `id` (integer, required) | id from `GET /company-settings/job-file-settings/work-types` |
| POST | `/jobs/{jobId}/messages/{messageId}/replies` | `message` (required) | needs a messageId from #7's response |
| DELETE | `/jobs/{jobId}/representatives/ar-owner` | none | pairs with #8c (create-then-delete lifecycle) |
| DELETE | `/jobs/{jobId}/representatives/sales-owner` | none | pairs with #8b |
| POST | `/subscriptions` | `consumerUrl`, `techContact`, `topicNames` (all required) | webhook tier confirmed available in sandbox (docs confirm `/topics` → 200); documents **412** |
| PUT | `/subscriptions/{subscriptionId}` | none required; `technicalContact`, `topicNames` | documents **412** |
| DELETE | `/subscriptions/{subscriptionId}` | none | 4th DELETE endpoint |
| POST | `/subscriptions/{subscriptionId}/test-event` | `topicName` (required) | fires a test webhook event — side-effect probe, not a true "write" to a business entity |

**Total accounted for: 13 (deep) + 25 (smoke) = 38.** This matches the locked 19 POST / 15 PUT / 4 DELETE surface exactly.

### The 4 DELETE Endpoints (Research Question 3)

| Method | Path | Precondition | Lifecycle fit |
|--------|------|--------------|----------------|
| DELETE | `/jobs/{jobId}/initial-appointment` | An appointment must exist (created via `PUT /jobs/{jobId}/initial-appointment`) | create → red-team → delete; tests the full appointment lifecycle in one chain |
| DELETE | `/jobs/{jobId}/representatives/ar-owner` | An AR owner must be set (via `POST /jobs/{jobId}/representatives/ar-owner`) | same create → delete pattern |
| DELETE | `/jobs/{jobId}/representatives/sales-owner` | A sales owner must be set (via `POST /jobs/{jobId}/representatives/sales-owner`) | same create → delete pattern |
| DELETE | `/subscriptions/{subscriptionId}` | A subscription must exist (via `POST /subscriptions`) | webhook lifecycle: create → test-event → delete |

All 4 fit the "tag+leave; DELETE where the 4 DELETE endpoints allow" lifecycle (D-04) cleanly: each DELETE has a corresponding create/set endpoint earlier in the chain, so the natural sequence is create → (red-team other dimensions) → delete, verifying idempotent delete-of-nonexistent (call DELETE twice, expect 404 the second time — a direct idempotency-dimension probe) as part of the same chain.

### Red-Team Dimension Recipes (Research Question 6)

**Dimension 1 — Bad/malformed input:**
```
- Invalid enum value (priority="Urgent" instead of Low/Normal/High) → expect 404 w/ type-conversion message [VERIFIED pattern from write-capability.md]
- Empty required array (contactTypeIds: []) → expect 400 w/ "Must contain at least one item" [VERIFIED pattern]
- Wrong address shape (contact mailingAddress.state as string, job locationAddress.state as object) → expect 4xx type-conversion error [VERIFIED pattern]
- Missing required field entirely (omit `contact` from POST /jobs) → expect 400
- Wrong data type (customFields[].values as a string instead of array)
- Oversized payload (>120 custom fields per docs/37's documented bulk limit) → expect 416 (already listed as a documented response code for both custom-fields PUTs)
```

**Dimension 2 — Partial failure:**
```
- Multi-item bulk operation (PUT .../custom-fields with N field entries) where item 2 of 5 is malformed
  -> does the whole batch 400, or do valid items persist and only the bad one error?
  This directly probes atomicity, a key guardrail finding for Phase 5's write-wrapper design.
- POST /jobs/{jobId}/documents with a valid documentFolderId but a corrupt/oversized file
```

**Dimension 3 — Idempotency / retries:**
```
- Repeat the identical POST /contacts body twice — does AccuLynx dedupe, or create a duplicate contact?
- Repeat POST /jobs/external-references with the same {jobId, source, projectId} — this is documented
  as an "idempotency anchor" (docs/37 §2) so this is the single most important idempotency probe in
  the whole surface: confirm whether a second identical call 201s a duplicate or 400s/409s as a conflict.
- DELETE the same subscriptionId twice — first 204, second should 404 (verify, don't assume).
- Retry a POST that received a network timeout (simulate via short client-side timeout) — check if the
  first attempt actually landed (GET the resource) before concluding the retry was needed.
```

**Dimension 4 — Ordering / dependency:**
```
- Call PUT /jobs/{jobId}/insurance/insurance-company BEFORE any insurance context exists on the job
  -> the 412 in the documented response set suggests exactly this precondition-not-met scenario.
- Call POST /financials/{financialsId}/worksheet/items with a jobId's financialsId before confirming
  GET /jobs/{jobId}/financials actually returns one (race between job creation and financials
  provisioning, if any).
- Call child-before-parent: POST /jobs/{jobId}/messages/{messageId}/replies with a fabricated messageId
  that was never returned by a real POST /jobs/{jobId}/messages call -> expect 404.
- Call PUT /jobs/{jobId}/job-categories with a job in a state that may not support recategorization
  (documented 412) — determine what precondition triggers it.
```

**Dimension 5 — Authz / scope:**
```
- Every probe already runs under the sandbox key (D-01's hard gate) — "wrong-scope key" in this phase
  means: does the SANDBOX key itself have any internal role/permission restrictions? Probe by checking
  whether a 403 appears on any write (POST /jobs already documents 403 as a possible response, as do
  PUT job-categories/lead-source/trade-types/work-type) even when the request body is well-formed.
  Record which endpoints return 403 and under what condition — this maps directly to the "authz/scope"
  dimension without needing a second (non-sandbox) key, which the hard gate forbids probing anyway.
- Attempt a write against an entity ID that plausibly belongs to a different "tenant" shape (e.g., a
  contactId that doesn't exist / was never created in this sandbox) -> expect 404, confirming the API
  scopes lookups to the authenticated account and doesn't leak existence of foreign records.
```

### Known Landmines to Encode as Fixtures (from write-capability.md, verified 2026-06-30)

```typescript
// Contact address: state/country as OBJECTS
const contactAddress = {
  street1: "1 Test St", city: "Wichita",
  state: { id: "...", name: "Kansas", abbreviation: "KS" },
  zipCode: "67203",
  country: { id: 1, name: "United States", abbreviation: "US" },
};

// Job address: state/country as STRINGS (the opposite convention)
const jobLocationAddress = {
  street1: "1 Test St", city: "Wichita",
  state: "KS", zipCode: "67203", country: "US",
};

// contactTypeIds is required and must be non-empty
const contactBody = { contactTypeIds: [defaultContactTypeId], firstName: "...", lastName: "..." };

// priority is a strict enum: only "Low" | "Normal" | "High"
const jobBody = { contact: { id: contactId }, locationAddress: jobLocationAddress, priority: "Normal" };

// Newly-created jobs are unassigned leads — query with assignment=unassigned to find them
// GET /jobs?assignment=unassigned&pageSize=25
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| docs/37 (2026-06-10): write matrix built from API V2 reference + 198 GET-only probes, no live write evidence | Phase 4: evidence-based matrix from real sandbox POST/PUT/DELETE probes, tiered red-team | This phase (2026-07) | Supersedes docs/37's "structural, independent of account tier" caveat with actual behavior; corrects the stale `measurements` endpoint reference (does not exist in the 124-op surface) |
| Ad-hoc `seed-sandbox-from-wichita.mjs` findings (2026-06-30) treated as informal notes in write-capability.md | Formal per-probe evidence rows in `acculynx_write_probe`, reconciled against a 38-row checklist | This phase | Every one of the 38 endpoints gets at least one recorded probe row, closing the "probe gap" docs/37 explicitly flagged |

**Deprecated/outdated:**
- docs/37's claim that "Measurement docs" are `WRITE (POST /jobs/{id}/measurements + /measurements/files)` — **no such endpoint exists** in the current 124-operation OpenAPI index (verified directly, zero matches for "measurement" in any path). This must be corrected to `unsupported` (or removed as a category) in the regenerated matrix, with a note that photos/videos (`POST /jobs/{jobId}/photos-videos`) is the closest existing analog for visual documentation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PUT /jobs/{jobId}/insurance` has no meaningfully required body fields (OpenAPI index shows an empty `properties` list for its schema) | Code Examples / Tier-smoke table | If the live endpoint actually requires fields not captured in the vendored index (e.g., the index generation missed a nested schema), the sweep's first probe will surface a 400 and self-correct — low risk, but flagged as "verify live" rather than asserted |
| A2 | `PUT /jobs/{jobId}/trade-types` has no required body fields per the index, but this seems suspicious given `POST /jobs`'s `tradeTypes` is an array of `{id}` objects | Code Examples / Tier-smoke table | The actual PUT may require a `tradeTypes` array the index failed to enumerate; tagged "shape TBD — discover in sweep" per the objective's instruction |
| A3 | The 4 DELETE endpoints' "lifecycle fit" (create-then-delete chaining, calling DELETE twice to test idempotency) is the correct way to sequence them within the 5-dimension red-team | Code Examples / DELETE table | This is a reasonable inference from D-04 and general REST practice, not confirmed against any AccuLynx-specific documentation of delete semantics — if AccuLynx's DELETE is not idempotent (e.g., a second DELETE 500s instead of 404s), that itself is exactly the kind of finding this phase should surface, so the risk is low (worst case: an extra recorded probe row) |
| A4 | Red-team dimension recipes (bulk partial-failure semantics, retry-after-timeout probing, wrong-scope 403 interpretation) are general REST red-team practice adapted to this API, not vendor-documented AccuLynx red-team guidance | Code Examples / Red-Team Dimension Recipes | No AccuLynx-specific red-team methodology doc exists (confirmed: no matches for "red-team" or dimension-specific guidance anywhere in the vendored reference docs) — these recipes are MEDIUM confidence and should be treated as a starting menu, not a rigid checklist; the planner/executor should adapt live based on what the sandbox actually returns |

## Open Questions

1. **Does `POST /jobs` financials auto-provisioning happen synchronously?**
   - What we know: `GET /jobs/{jobId}/financials` is documented to return a `financialsId` (Tier B in the read checklist, harvest rule `getFinancialsForJob -> financialsId` already exists in read-sweep).
   - What's unclear: whether the financials record is available **immediately** after the `POST /jobs` `201` response, or whether there's a short provisioning delay requiring a retry/poll.
   - Recommendation: the write-sweep should attempt the financials GET immediately after job creation and, if empty/404, retry once after a short delay before concluding it's a genuine gap — this affects whether worksheet-item probes need a wait step.

2. **What does `PUT /jobs/{jobId}/insurance` actually require, given the index shows no properties?**
   - What we know: the OpenAPI index's `requestBody.content[0].schema.properties` array is empty for this operation, distinct from `putInsuranceCompanyForJob` (which does list 2 properties) and `putAdjusterForJob` (8 properties).
   - What's unclear: whether this is a genuinely bodyless PUT (unlikely for an "insurance information" update) or an index-generation gap.
   - Recommendation: probe with a body shaped like the sibling `putAdjusterForJob`/`putInsuranceCompanyForJob` fields as a first guess, record the actual accepted/rejected shape, and correct the knowledge-base skill's generated reference if the index is wrong.

3. **Should search endpoints (`POST /jobs/search`, `POST /contacts/search`) be scored in the write-capability matrix at all, or footnoted as "POST-verb reads"?**
   - What we know: they carry no side effect and don't fit "writable / write-only / unsupported / fragile-with-guardrail" cleanly — arguably a 5th verdict value (`read-shaped`) is needed.
   - What's unclear: whether D-02's verdict enum should be extended, or whether these two endpoints get folded into `writable` (harmless) with a note.
   - Recommendation: the planner should decide during task-writing whether to add a `read-shaped`/`no-side-effect` verdict value to `acculynx_write_catalog`, or keep the enum exactly as specified in CONTEXT.md and use the `notes` column for this nuance. This is a schema-design decision within Claude's Discretion per CONTEXT.md, not a locked constraint.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno | Local `deno check`/`deno test` on the new function | ✓ | 2.8.1 | — |
| Supabase CLI | `supabase functions deploy acculynx-write-sweep`; applying new migrations | ✓ | 2.105.0 | — |
| `PE_CC_SANDBOX_ACCULYNX_API_KEY` (Edge secret) | The hard gate + all HTTP calls | Not independently verified in this research session (no direct secret access) — but `acculynx_accounts` registry (schema 165) confirms the `sandbox` row and its `env_secret_name` are already correctly configured, and Phase 1/the seeder script both already use this exact secret name successfully in production | — | If unset in Edge Function secrets at deploy time, the function will 500 with `"${SANDBOX_SECRET_NAME} not set in Edge secrets"` (existing read-sweep behavior) — no fallback; this must simply be present (it already is, per prior phases' successful runs) |
| Prod Supabase project `rnhmvcpsvtqjlffpsayu` | New tables (182/183 migrations), probe/catalog inserts | ✓ (shared prod DB, per CLAUDE.md Live⇄Dev alignment) | — | — |

**Missing dependencies with no fallback:** none identified — all required tooling and the sandbox secret are already present and proven working by Phase 1/2/3 code that currently runs successfully.

**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno's built-in test runner (`Deno.test`), matching `acculynx-read-sweep/sweep.test.ts` exactly |
| Config file | `server/deno.json` defines `"test": "deno test --allow-none tests/"` for the MCP server; the Edge Function tests are run directly via `deno test <path>` (no separate config needed, matches existing precedent) |
| Quick run command | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` |
| Full suite command | `deno test supabase/functions/acculynx-write-sweep/` (covers both `sweep.test.ts` and any `index.test.ts` added) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| REQ-06 | `assertSandbox` throws for every non-sandbox secret name, accepts the sandbox name | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ Wave 0 (new file, mirrors existing read-sweep test) |
| REQ-06 | Redaction masks PII in stored write-probe payload samples, preserves structure | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ Wave 0 (reuse/adapt `redactSample` tests from read-sweep) |
| REQ-06 | Request-body builders produce the correct shape per endpoint (e.g., contact address as objects, job address as strings) | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ Wave 0 (new — no equivalent exists in read-sweep since reads have no body) |
| REQ-06 | Every one of the 38 checklist endpoints has ≥1 probe row after a sweep run; every row is tagged `source_account_key='sandbox'` | integration (SQL reconciliation, run against live prod DB post-sweep) | `psql ... -f scripts/acculynx-write-sweep-reconcile.sql` (mirrors `acculynx-read-sweep-reconcile.sql`) | ❌ Wave 0 (new file, direct structural mirror of the existing read reconciliation script) |
| REQ-06 | Red-team stop rule (2 consecutive no-new-signal probes) is applied correctly per endpoint | manual-only — this is a runtime decision made during the actual sweep execution against live sandbox responses, not a pure-function behavior that can be unit-tested without mocking the entire AccuLynx API surface | — | justification: the stop-rule logic can be unit-tested in isolation (given a sequence of mock probe results, does the classifier correctly decide "stop"?) — recommend a small pure function `shouldStopProbing(probeHistory): boolean` extracted into `sweep.ts` specifically so this CAN be unit tested; flagging as a Wave 0 gap below |

### Sampling Rate
- **Per task commit:** `deno test supabase/functions/acculynx-write-sweep/` (fast — pure-function unit tests only, no live API calls)
- **Per wave merge:** Full suite + a dry-run/limited invocation of the deployed function against the sandbox (e.g., trigger the Edge Function once, inspect its JSON summary response for `verdicts`/`calls_made`, mirroring how read-sweep's response body is inspected)
- **Phase gate:** `scripts/acculynx-write-sweep-reconcile.sql` returns zero rows across all 3 assertions (unreconciled endpoint, missing result_summary on a 2xx, non-sandbox row) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/acculynx-write-sweep/sweep.ts` — does not exist yet; needs `assertSandbox`, request-body builders per endpoint, `redactSample`, and a new pure `shouldStopProbing(history)` function to make the D-05 stop-rule unit-testable
- [ ] `supabase/functions/acculynx-write-sweep/sweep.test.ts` — does not exist yet; mirror read-sweep's test file plus new tests for body-shape builders and the stop-rule function
- [ ] `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` — does not exist yet; `acculynx_write_catalog` + `acculynx_write_probe` DDL
- [ ] `schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql` — does not exist yet; 38-row seed with tier (deep/smoke), dependency chain, request-body schema reference
- [ ] `scripts/acculynx-write-sweep-reconcile.sql` — does not exist yet; direct structural mirror of `acculynx-read-sweep-reconcile.sql` adjusted for the write tables/checklist
- Framework install: none — Deno + `jsr:@std/assert@1` already available/vendored via the read-sweep precedent, no new install step needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Sandbox API key resolved server-side only via `Deno.env.get`, never logged/returned/committed (hard rule 2); `assertSandbox()` hard gate prevents any non-sandbox key from being used by this function even if misconfigured |
| V3 Session Management | no | N/A — server-to-server API key auth, no user sessions involved |
| V4 Access Control | yes | The hard sandbox gate IS the access control boundary for this phase — enforced in code (not just config), matching the existing read-sweep precedent; RLS deny-by-default on the new tables (grant `select` only to `authenticated`/`service_role`, matching schema 166/177's posture) |
| V5 Input Validation | yes | Request-body builders for each endpoint should validate/normalize known-enum fields (priority, fieldType, integrationType) before sending, both to reduce accidental noise probes and to make deliberate bad-input probes clearly intentional (test fixture, not a typo) |
| V6 Cryptography | no | N/A — no new cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Accidental production write (misconfigured secret name resolves a production key) | Tampering / Elevation of Privilege | Code-level `assertSandbox()` hard gate — already the established, tested pattern from Phase 1; must be duplicated/reused verbatim, not reimplemented |
| PII leakage into stored evidence rows (probe payload samples) | Information Disclosure | `redactSample()` recursive PII masking before any `payload_sample` write — reuse verbatim from read-sweep; applies even though this phase's own seeded data is synthetic/anonymized (defense in depth + consistency) |
| Secret value logged or returned in an error/response body | Information Disclosure | Only `env_secret_name` (the NAME) is ever referenced in code/logs/DB rows, never the resolved value — matches `acculynx-sync/lib/accounts.ts`'s documented convention |
| Unbounded/duplicate entity creation during idempotency-retry probes polluting the sandbox indefinitely | Denial of Service (resource exhaustion, cost) | Tag every created entity with a run-id marker (D-04) so accumulated test data stays identifiable and bounded in intent even though nothing is deleted; the sandbox is explicitly disposable per CONTEXT.md, so this is an accepted risk, not a blocker |

## Sources

### Primary (HIGH confidence)
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` (vendored AccuLynx OpenAPI V2 index, `generatedAt`/`counts` fields inspected directly) — full 38-endpoint enumeration, request-body schemas, required fields, response status codes
- `supabase/functions/acculynx-read-sweep/index.ts`, `sweep.ts`, `sweep.test.ts` — the harness pattern to mirror (hard gate, tiered walk, redaction, ID harvesting)
- `supabase/functions/acculynx-sync/lib/accounts.ts` — account/secret resolution pattern
- `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql`, `166-acculynx-catalog-probe-ddl.sql`, `167-acculynx-get-checklist.sql` — DDL patterns to mirror for the new write tables/checklist
- `scripts/acculynx-read-sweep-reconcile.sql` — reconciliation gate pattern to mirror
- `scripts/seed-sandbox-from-wichita.mjs` — verified live request-body shapes and quirks (contact/job address asymmetry, priority enum, contactTypeIds requirement)
- Local environment probes (`deno --version`, `supabase --version`) — 2026-07-01

### Secondary (MEDIUM confidence)
- `docs/knowledge-base/acculynx/api/write-capability.md` — "Verified sandbox write findings (2026-06-30)" section, cross-checked against the OpenAPI index and found consistent (contact/job address asymmetry, priority enum, contactTypeIds requirement, unassigned-lead visibility, write-only messages, webhook tier availability all corroborated)
- `docs/knowledge-base/acculynx/ingestion/read-sweep.md` — read-sweep design/behavior description, used to confirm the harness pattern description matches the actual code
- Red-team dimension recipes (bad input / partial failure / idempotency / ordering / authz) — synthesized from general REST API security-testing practice, not from an AccuLynx-specific red-team document (none exists)

### Tertiary (LOW confidence)
- `docs/37-acculynx-write-capability-matrix.md` — the document being superseded; used as a starting point but explicitly noted where it is stale (measurements endpoint claim) or unverified (all 198 historical probes were GET-only per its own text)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, exact reuse of an already-running dependency
- Endpoint enumeration & request shapes: HIGH — extracted directly and programmatically from the vendored OpenAPI index (124 total operations, method counts verified)
- Architecture/harness pattern: HIGH — read directly from the existing, running Phase 1 code
- Dependency graph / seeding order: MEDIUM-HIGH — core chain (contact→job→financials) verified via the existing seeder script and live findings; some leaf endpoints (insurance, adjuster) have unverified real-world seedability, correctly flagged as open questions
- Red-team dimension recipes: MEDIUM — reasonable, general-practice recipes adapted to this specific API's documented quirks (enums, 412 codes, bulk limits), but not drawn from any AccuLynx-specific red-team guidance since none exists
- Pitfalls: HIGH — all sourced from either the live-verified write-capability.md findings or direct OpenAPI-index inspection (response status codes)

**Research date:** 2026-07-01
**Valid until:** 30 days (AccuLynx API V2 is described elsewhere in this repo as slow-moving/stable; the sandbox account and its data are entirely within this repo's control, so staleness risk is low, but AccuLynx could ship new endpoints, which would need re-verification against a refreshed `openapi-index.json`)
