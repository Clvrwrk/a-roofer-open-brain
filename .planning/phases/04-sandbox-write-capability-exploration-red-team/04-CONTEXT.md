# Phase 4: Sandbox Write-Capability Exploration & Red-Team - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Exhaustively exercise AccuLynx's entire **write surface** — **19 POST / 15 PUT / 4 DELETE = 38 endpoints** — against the **sandbox account only**, red-team each to diminishing returns, and produce an **evidence-based write-capability matrix** that supersedes `docs/37`, with a documented **guardrail recipe per writable path**.

This phase is pure *discovery + red-team*: it proves what each write endpoint does, its validation rules, idempotency, error shapes, side effects, and undocumented guardrails. It does **not** build the production write/action layer — that is Phase 5 (REQ-08). No production writes; no autonomous external sends.

Requirement: **REQ-06** — "Exhaustive sandbox test of every WRITE endpoint (POST/PUT/DELETE), red-teamed to diminishing returns, with a live write-capability matrix superseding docs/37."
</domain>

<decisions>
## Implementation Decisions

### Test-harness form
- **D-01:** Build a **new dedicated `acculynx-write-sweep` Edge Function**, mirroring the Phase 1 `acculynx-read-sweep` harness. It reuses the `acculynx-sync` lib (accounts/auth), and bakes in a **hard sandbox-key-only gate** — the function must refuse to run against any non-sandbox account key (single enforced safety boundary; matches the read-sweep's hard gate). Do **not** extend `acculynx-read-sweep` in place (keeps the read harness's prod-safety story clean) and do **not** make a local script the durable artifact.
- The existing `scripts/seed-sandbox-from-wichita.mjs` and its verified findings are **prior art / seed data**, not the harness.

### Result recording schema
- **D-02:** Create **new `acculynx_write_catalog` + `acculynx_write_probe` tables**, mirroring the read-side `acculynx_api_catalog` / `acculynx_api_probe`. One catalog row per write endpoint carrying the **evidence-based verdict** (writable / write-only / unsupported / fragile-with-guardrail); one probe row per attempt (method, path, request shape, status, error shape, side-effect, red-team dimension). Additive/idempotent DDL (hard rule 1).
- **D-03:** The superseding write-capability matrix doc is **generated from the tables**, not hand-maintained — `docs/37` and `docs/knowledge-base/acculynx/api/write-capability.md` are updated from the evidence rows.

### Disposable-entity lifecycle
- **D-04:** **Tag + leave; DELETE where the 4 DELETE endpoints allow.** Stamp every sandbox-created entity with a run-id / test marker so test data is identifiable. Exercise the real DELETE endpoints as part of red-teaming (they are 4 of the 38 endpoints under test). **Reuse created parents for dependent writes** (e.g. a created job/financials as the parent for worksheet-items, custom-fields, payments) — dependency chains are seeded, not mocked. Leave everything else; the sandbox is disposable. No reseed/reset (AccuLynx has no bulk reset and most entities can't be deleted).

### Red-team depth & stop rule
- **D-05:** **Tiered depth.** Full **5-dimension** red-team on the ~8 "meaningful write lane" endpoints; a lighter pass on the remaining ~30.
  - **Dimensions:** (1) bad/malformed input, (2) partial failure, (3) idempotency / retries, (4) ordering / dependency, (5) authz / scope.
  - **Meaningful write lane (deep):** create contact + job, `PUT /jobs/{id}/custom-fields`, `POST /financials/{id}/worksheet/items`, `POST /jobs/{id}/payments/*`, `POST /jobs/{id}/documents` (+ photos/measurements), `POST /jobs/{id}/messages`, representatives, `POST /jobs/external-references`.
  - **Remaining ~30 (smoke):** one happy-path + one bad-input probe each.
  - **Stop rule (the concrete "diminishing returns"):** stop probing an endpoint after **2 consecutive probes reveal no new error shape or new guardrail**.

### Claude's Discretion
- Exact `acculynx-write-sweep` internal structure, tier A/B/C endpoint ordering, and per-endpoint request-shape construction — planner/researcher decide, grounded in the read-sweep pattern and the known request-shape quirks (see canonical refs).
- The exact column set of `acculynx_write_catalog` / `acculynx_write_probe` — mirror the read tables' shape, extend for method + red-team dimension + side-effect.
- How dependency chains are seeded (reuse of prior seeder vs. fresh sandbox creates).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Write surface (the thing being superseded)
- `docs/37-acculynx-write-capability-matrix.md` — current (pre-Phase-4) write matrix; §4.10 handoff targets vs API V2, the "meaningful write lane," the 4 permanent-fallback categories. **This phase supersedes it with evidence.**
- `docs/knowledge-base/acculynx/api/write-capability.md` — 19 POST / 15 PUT / 4 DELETE surface; **verified sandbox write findings (2026-06-30)** including the contact-`mailingAddress`-as-OBJECTS vs job-`locationAddress`-as-STRINGS quirk, `priority` strict enum (`Low`/`Normal`/`High`), `contactTypeIds` required, `POST /jobs` creates an unassigned lead (use `assignment=unassigned`), messy-string acceptance, webhook tier available in sandbox.

### Harness analog (Phase 1 read-sweep — the pattern to mirror)
- `supabase/functions/acculynx-read-sweep/` — the read harness to mirror as `acculynx-write-sweep` (hard-gate + Tier A/B/C ID-chaining + PII redaction pattern).
- `docs/knowledge-base/acculynx/ingestion/read-sweep.md` — read-sweep design/behavior.
- `docs/knowledge-base/acculynx/api/read-capability.md` — read-capability matrix (the evidence-doc format to mirror for writes).
- `supabase/functions/acculynx-sync/` — shared accounts/auth/watermark lib to reuse.

### Recording-schema analog
- `acculynx_api_catalog` / `acculynx_api_probe` (prod DB `rnhmvcpsvtqjlffpsayu`) — read-side catalog/probe tables to mirror as `acculynx_write_catalog` / `acculynx_write_probe`.

### Seed data / prior art
- `scripts/seed-sandbox-from-wichita.mjs` — sandbox seeder (51 anonymized Wichita records); prior-art writes + validation-behavior findings.

### Governing rules
- `CLAUDE.md` — hard rule 1 (additive/idempotent migrations, never destructive), hard rule 5 (security boundary), sandbox-first mandate, zero external sends v1.
- `.planning/REQUIREMENTS.md` — REQ-06 (this phase), non-goals (no prod first-tries; no milestone/invoice/material-order write-back — those endpoints don't exist).
- `context/SOUL.md` — approval boundary (draft/calculate/prepare freely; nothing external without a human).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `acculynx-read-sweep` Edge Function: direct structural template for `acculynx-write-sweep` (hard account gate, tiered endpoint walk, redaction).
- `acculynx-sync/lib`: accounts registry + auth + rate-limit helpers — reuse for the write sweep.
- `acculynx_api_catalog` / `acculynx_api_probe`: schema template for the new write catalog/probe tables.
- `scripts/seed-sandbox-from-wichita.mjs`: existing sandbox writes + dependency-seeding logic to reuse for parent entities.

### Established Patterns
- Hard **sandbox-key-only** gate lives inside the harness (read-sweep precedent) — the single enforced boundary.
- Additive/idempotent migrations only (hard rule 1); evidence tables carry per-probe rows; docs generated from evidence.
- Known request-shape quirks are landmines the planner must encode (address object-vs-string asymmetry; strict enums; unassigned-lead visibility).

### Integration Points
- New Edge Function deploys via `supabase functions deploy` (NOT Coolify).
- New tables applied to prod Supabase `rnhmvcpsvtqjlffpsayu` (schemas continue past 181).
- Generated matrix updates `docs/37` + `docs/knowledge-base/acculynx/api/write-capability.md`.
</code_context>

<specifics>
## Specific Ideas

- The 4 "permanent human/Slack fallback" categories (milestone/status, invoice, material orders, crew scheduling) have **no V2 write endpoint** — the phase records this as an evidence-backed *unsupported* verdict, it does not try to make them work.
- Webhook tier IS available in the sandbox (`/topics` → 200; `POST /jobs` fires `job_created`) — relevant as a side-effect signal when red-teaming writes, and for later reactive mirroring.
</specifics>

<deferred>
## Deferred Ideas

- **Production write/action layer + approval-gated write wrappers** → Phase 5 (REQ-08). This phase only proves capability in the sandbox.
- **AccuLynx Agent** (dedicated agent, A3-gated) → Phase 6 (REQ-09).
- **Reactive status mirroring via webhooks** → future; only the sandbox webhook-tier signal is noted here, not built.

None of the above are in Phase 4 scope — discussion stayed within the write-discovery boundary.
</deferred>

---

*Phase: 04-sandbox-write-capability-exploration-red-team*
*Context gathered: 2026-07-01*
