# Phase 5: Read/Write Action Layer - Research

**Researched:** 2026-07-01
**Domain:** Human-approval-gated AccuLynx write layer (Supabase Edge Function + Command Center work-queue reuse)
**Confidence:** HIGH (all core contracts verified against live source files, not inferred from docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Approval-gate substrate**
- D-01: Reuse the existing Command Center work-queue as the human gate. Do NOT build a new approval store/UI. Each pending AccuLynx write becomes a work-queue item; humans approve/reject through the existing `HumanUnblockerDashboard`, and the audit trail comes from the existing decision machinery. Reuse: `live-work` (`recordLiveWorkDecision`, `serializeLiveWorkQueueItem`, `LiveWorkItem`), `access-control` (`WorkQueueDecision`, actor/permission model, `getAllowedDecisions`), `agent-api` (`serializeWorkQueueItem`, `buildDecisionAuditEvent`), and the `work-queue/[workId]/decision.ts` endpoint.
- D-02: A new dedicated `acculynx-write-action` Edge Function is the SOLE code path that writes to AccuLynx (prod or sandbox). No other component may write. It reuses the `acculynx-sync` accounts/auth/rate-limit lib (`acculynxFetch`, accounts registry, 429/backoff, per-key limits) and holds the per-lane wrappers that encode the Phase-4 quirk guardrails. The work-queue decision endpoint invokes it only on `approve`. Keeps AccuLynx keys server-side in the edge tier where `acculynx-sync` / `acculynx-write-sweep` already live; one auditable choke point.
- D-03: The dry-run preview and the real execute share ONE code path. The `acculynx-write-action` function takes a `dryRun` flag: it builds + validates the exact request (target account, endpoint, payload, headers) and returns it without sending. Execute is the identical path minus the flag → the human provably approves exactly what will fire. No separate preview builder (that would risk preview ≠ execute drift).

**Task offloading (SC3)**
- D-04: All four discussed lanes are in scope — post a job message (`POST /jobs/{id}/messages`), record a payment (`POST /jobs/{id}/payments/received|expense`), update custom fields (`PUT /jobs/{id}/custom-fields`), add an external reference (`POST /jobs/external-references`).
- D-05: Payment is the FIRST live production write (after full sandbox validation). Because the first-ever prod write touches money, its guardrails (amount/account-type validation, idempotency, no double-post) get first-class attention. The other lanes follow on the same proven pipe once payment is proven end-to-end.

**Wrapper coverage set (SC1)**
- D-06: v1 wraps ALL 17 proven-safe lanes — the 12 `writable` + 5 `write-only` verdicts from the Phase-4 matrix (`acculynx_write_catalog`). Every wrapper carries its lane-specific guardrail (e.g., `jobCategory.id` Int32 coercion, contact `mailingAddress` objects vs job `locationAddress` strings, strict enums, multipart for docs/photos, `POST /jobs` creates an unassigned lead).
- Out of v1: the 2 `fragile-with-guardrail` lanes (`PUT /jobs/{id}/trade-types` needs `{items:[{id}]}`; `DELETE /jobs/{id}/initial-appointment` needs a non-empty `{note}` body) → deferred as guarded follow-ups. The 17 `blocked-by-dependency` and 0 `unsupported` are excluded.

**Preview + execution surface**
- D-07: The Command Center dashboard is the source of truth for the dry-run preview and the approve/reject action (rendered in `HumanUnblockerDashboard` alongside the existing work-queue). Agents create the pending write item via the agent API.
- D-08: Slack notifies on a pending write (per the `slack-agents` infra) so humans don't miss it — notification only; the dashboard remains the authoritative approve/reject + audit surface.
- D-09: Production execution requires a second barrier beyond the approval click. The pending item explicitly names its target account; a prod target requires (a) an explicit target/env flag (prod is never the implicit default — sandbox is) AND (b) an approver whose `access-control` permission allows production writes. Belt-and-suspenders so no one approves a prod write without the target being unmistakable and their role permitting it.

### Claude's Discretion
- Exact `acculynx-write-action` internal structure and per-lane wrapper request-shape construction — planner/researcher decide, grounded in the `acculynx-write-sweep` pattern and the Phase-4 quirk guardrails.
- The pending-write record shape (how the payload / dry-run diff / target / exec-result attach to a work-queue item), idempotency-key strategy on execute, and retry/rate-limit behavior on the execute call (reuse `acculynxFetch`'s 429 handling).
- Human-readable rendering of the dry-run preview (how the built request is summarized for the approver).
- How an agent authors the pending item via the agent API, and partial-failure / rollback handling on multi-step writes.

### Deferred Ideas (OUT OF SCOPE)
- 2 fragile-with-guardrail lanes (`PUT /jobs/{id}/trade-types`, `DELETE /jobs/{id}/initial-appointment`) → guarded follow-up after the 17 proven-safe lanes ship; both have known non-empty-body guardrails.
- 17 blocked-by-dependency lanes → not wrappable until the sandbox/company config supplies the missing child ids (documentFolderId, accountTypeId, role-specific CompanyUserId, etc.) — out of Phase 5.
- Dedicated AccuLynx Agent (A3-gated) → Phase 6 (REQ-09).
- Reactive status mirroring via webhooks → future; only the sandbox webhook-tier signal is noted.
- Executive Sales Pipeline dashboard → Phase 7 (REQ-10).

None of the above are in Phase 5 scope — discussion stayed within the action-layer boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-08 | A read/write exploratory branch with human-approval-gated write wrappers, beginning to offload specific human tasks. | Sections: Work-queue reuse contract (finding + gap + recommendation), Write executor lib, 17 proven-safe lanes, Pending-write persistence, Idempotency, Prod-vs-sandbox gate wiring, Slack notify, Deploy path — all below. |

Out-of-scope confirmed from ROADMAP/PROJECT.md: no prod first-tries (sandbox validated first, D-05); no autonomous external writes (every write is human-approval-gated, D-01/D-03); no milestone/invoice/material-order write-back (docs/37 "Consequences for the pipeline" #3 confirms no such endpoints exist in the AccuLynx write surface — this is a durable finding, not a Phase-5 scoping choice).
</phase_requirements>

## Summary

Phase 5 wires a human-approval-gated AccuLynx write path by joining two systems that already exist and were built for exactly this purpose, but have never been connected: the **Command Center work-queue** (human approval + durable audit trail) and the **`acculynx-write-sweep` harness pattern** (sandboxed request-building with quirk guardrails). Both halves are production code, verified line-by-line in this research — no invented contracts.

The single most important finding is a **gap, not a contract**: the work-queue's read side (`loadCommandCenterSurface()` / `GET /api/agent/work-queue`) is currently 100% derived from live Supabase query surfaces (crm_pipeline, abc_review_queue, fleet tables, etc.) — it has **no generic path for an agent to enqueue an arbitrary pending item and have it appear on the dashboard**. A working precedent exists one layer down: `POST /api/agent/intake` already upserts arbitrary `dashboard_work_items` rows with agent-supplied `source_data`/`evidence` JSON — but those rows are **never read back** into the dashboard surface today. The planner must add a small, well-scoped extension (a new `loadPendingAccuLynxWriteSurface()`-style branch inside `live-work.ts`, reading a new pending-write table) rather than assume the existing agent-intake pattern already renders on the UI.

The write side is straightforward: `acculynx-write-sweep`'s `sweep.ts` (pure, unit-tested) already contains the exact request-body builders, guardrail logic (Int32 `jobCategory.id` coercion, contact-vs-job address shape asymmetry, `assertSandbox` hard-gate pattern, 429/backoff `acculynxCall`) needed for `acculynx-write-action`. The 17-lane target set is fully enumerated with guardrails in `docs/37` and `docs/knowledge-base/acculynx/api/write-capability.md`. One correction to CONTEXT.md is required: **`PUT /jobs/{id}/custom-fields` is `blocked-by-dependency` (needs a real `CustomFieldType`), not one of the 17 proven-safe lanes** — flagged as an open question below with a recommended resolution.

**Primary recommendation:** Build `acculynx-write-action` as a new Supabase Edge Function mirroring `acculynx-write-sweep`'s structure (pure core + thin `index.ts`), reusing `acculynx-sync`'s account registry and rate-limit pattern; extend `live-work.ts` with a new pending-write surface backed by a new additive `acculynx_pending_write` table (NOT `dashboard_work_items` directly, to keep AccuLynx-specific fields — target account, dry-run render, idempotency key, exec result — out of the generic work-item shape); and gate `approve` decisions on that surface through a new branch in the existing decision endpoint that invokes the edge function only when `decision === "approve"` AND the D-09 second-barrier check passes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AccuLynx write execution (dry-run + real) | API/Backend (Supabase Edge Function) | — | `acculynx-write-action` holds the only AccuLynx key access (D-02); must stay server-side, same tier as `acculynx-sync`/`acculynx-write-sweep` |
| Pending-write enqueue (agent-authored) | API/Backend (Command Center Astro API route) | Database/Storage | New `POST /api/agent/acculynx-write-action` (or similar) writes to a new pending-write table; mirrors `agent/intake.ts` pattern |
| Human approval decision + audit trail | Frontend Server (Astro SSR, Command Center) | Database/Storage | `HumanUnblockerDashboard` + `decision.ts` already own this; D-01 says reuse, not rebuild |
| Dry-run preview rendering | Frontend Server (Astro SSR) | API/Backend | The dashboard renders whatever `LiveWorkItem`/pending-write JSON is returned; the actual preview payload is built server-side by `acculynx-write-action` with `dryRun: true` |
| Prod-vs-sandbox gate (D-09) | API/Backend (edge function `assertTarget`) | Frontend Server (decision endpoint permission check) | Belt-and-suspenders: edge function refuses prod without explicit flag; decision endpoint checks approver's `access-control` permission before ever invoking the function |
| Slack notify (D-08) | API/Backend (Astro server lib `slack.server.ts`) | — | `postSlackMessage()` already exists; notify-only, no new dependency |
| Idempotency + audit persistence | Database/Storage (Supabase) | — | New `acculynx_pending_write` + `acculynx_write_action_log` tables; additive, service-role only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | `2` (via `jsr:@supabase/supabase-js@2`) | Edge Function DB client | Already the exact import used by `acculynx-sync`/`acculynx-write-sweep`; do not introduce a different client [VERIFIED: supabase/functions/acculynx-write-sweep/index.ts:18] |
| Deno (Supabase Edge Runtime) | Supabase-managed | Edge Function runtime | `acculynx-write-action` MUST be a Supabase Edge Function per D-02; deploys via `supabase functions deploy`, not Coolify [VERIFIED: supabase/functions/acculynx-write-sweep/index.ts] |
| Astro | project-pinned (Command Center) | Command Center API routes + dashboard | Existing framework for `/api/agent/*` routes and `HumanUnblockerDashboard.astro` [VERIFIED: app/command-center/src/pages/api/agent/*, app/command-center/src/components/unblocker/HumanUnblockerDashboard.astro] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`createHash`, `timingSafeEqual`) | Node/Deno built-in | Idempotency key hashing, actor token comparison | Already used in `live-work.ts` (`createHash("sha256")` for memory content hashing) and `access-control.ts` (`timingSafeEqual` for bearer token auth) — reuse the same pattern for an idempotency-key hash on pending writes [VERIFIED: app/command-center/src/lib/live-work.ts:1, app/command-center/src/lib/access-control.ts:1] |

No new third-party packages are required for this phase — it is a pure reuse-and-extend phase over existing internal libraries. **No Package Legitimacy Audit is required** (no new external dependency is installed).

**Installation:** N/A — no new packages.

**Version verification:** N/A — internal reuse only, no new registry packages.

## Package Legitimacy Audit

Not applicable. Phase 5 introduces zero new external packages; it is entirely new internal code (one Edge Function, one Astro API route extension, two additive SQL migrations) built on libraries already present and pinned in the repo (`@supabase/supabase-js@2`, Astro, Node/Deno built-ins). Skip the gate.

## Architecture Patterns

### System Architecture Diagram

```
 Agent (Cowork/Claude runtime)
        │
        │ 1. POST /api/agent/acculynx-write-action/enqueue   (new route, agent-authored)
        │    { lane, accountKey, targetEnv, payload, idempotencyKey }
        ▼
 Command Center Astro API (agent-api.ts pattern)
        │
        │ 2. INSERT acculynx_pending_write (status=pending_review)
        │    + upsert dashboard_work_items mirror row (for existing dashboard machinery)
        ▼
 Supabase (acculynx_pending_write, dashboard_work_items, dashboard_action_log)
        │
        │ 3. GET /api/agent/work-queue  -->  loadCommandCenterSurface()
        │    NEW: loadPendingAccuLynxWriteSurface() branch reads acculynx_pending_write
        │    and maps rows into LiveWorkItem[] (workflow="acculynx-write-action")
        ▼
 HumanUnblockerDashboard.astro  (renders dry-run preview text, approve/reject buttons)
        │
        │ 4. Human clicks Approve/Reject
        ▼
 POST /api/agent/work-queue/[workId]/decision.ts
        │
        │ 5a. decision === "approve" AND D-09 second barrier passes:
        │       invoke acculynx-write-action Edge Function with dryRun=false
        │    5b. decision === "reject"/"needs_more_evidence": no edge-function call
        ▼
 acculynx-write-action Edge Function (Supabase, Deno)
        │
        │ 6. assertTarget(targetEnv, accountKey)  — D-09 barrier #1 (code-level, mirrors assertSandbox)
        │ 7. Resolve account via acculynx_accounts registry + Deno.env.get(env_secret_name)
        │ 8. Build request via per-lane wrapper (reuses acculynx-write-sweep's buildRequestBody
        │    logic + buildContactAddress/buildJobAddress + intId() Int32 coercion)
        │ 9. acculynxCall() with 429/backoff (same pattern as sweep.ts)
        ▼
 AccuLynx API v2 (sandbox or one of 8 prod accounts)
        │
        │ 10. Response persisted:
        │       UPDATE acculynx_pending_write SET status=executed, exec_result=...
        │       INSERT acculynx_write_action_log (immutable audit row)
        ▼
 dashboard_action_log (existing, via recordLiveWorkDecision)  +  Slack notify (postSlackMessage, notify-only)
```

### Recommended Project Structure
```
supabase/functions/acculynx-write-action/
├── index.ts                  # Deno.serve entrypoint — HTTP boundary, dryRun flag, calls into action.ts
├── action.ts                 # pure, unit-testable: buildWriteRequest(lane, payload) -> {method, path, body}
├── action.test.ts            # unit tests for every one of the 17 lane wrappers + guardrails
└── lanes/                    # optional: one small module per lane category if action.ts grows large
    ├── payments.ts
    ├── messages.ts
    └── external-references.ts

app/command-center/src/lib/
├── acculynx-pending-write.ts # new: buildPendingWriteRows(), loadPendingAccuLynxWriteSurface()
└── live-work.ts              # extended: loadCommandCenterSurface() includes the new surface

app/command-center/src/pages/api/agent/
└── acculynx-write-action/
    └── enqueue.ts             # new: agent-authored pending-write creation (mirrors intake.ts)

schemas/cleverwork-roofer/
├── 184-acculynx-pending-write-ddl.sql   # new table: acculynx_pending_write
└── 185-acculynx-write-action-log-ddl.sql # new table: acculynx_write_action_log
```

### Pattern 1: Pure-core + thin-entrypoint Edge Function
**What:** Separate all request-building/guardrail/classification logic into a plain-Deno/TS module with zero network calls (unit-testable), and keep `index.ts` as a thin `Deno.serve` wrapper that only does HTTP parsing, the hard gate, and orchestration.
**When to use:** Every Edge Function in this codebase that has non-trivial logic (`acculynx-write-sweep` is the precedent: `sweep.ts` is pure, `index.ts` is the thin entrypoint).
**Example:**
```typescript
// Source: supabase/functions/acculynx-write-sweep/sweep.ts (verified live in repo)
export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(`... refusing to resolve "${secretName}". Only ${SANDBOX_SECRET_NAME} is permitted.`);
  }
}
// acculynx-write-action's equivalent: assertTarget(targetEnv, accountKey, approverPermission)
// — same "throw before any network call" shape, extended for D-09's two-part barrier.
```

### Pattern 2: dryRun flag shares the exact code path (D-03)
**What:** `acculynx-write-action`'s handler builds the {method, path, headers, body} tuple via the SAME function whether `dryRun` is true or false; only the final `fetch()` call is skipped when `dryRun`.
**When to use:** Mandatory per D-03 — never write a second "preview builder."
**Example:**
```typescript
// Recommended shape, grounded in action.ts's buildRequestBody (mirrors sweep.ts:273 buildRequestBody):
async function handleWriteAction(input: WriteActionInput) {
  const built = buildRequestBody(input.lane, input.payload, input.refData); // pure, same for both paths
  if (input.dryRun) {
    return { status: "preview", request: built };
  }
  const result = await acculynxCall(built.method, built.url, built.body); // only reached when dryRun=false
  return { status: "executed", request: built, result };
}
```

### Pattern 3: Account resolution via registry, never a module-level key
**What:** Every AccuLynx-calling function resolves its API key at call time from `acculynx_accounts` + `Deno.env.get(env_secret_name)` — never a shared module-level constant (Phase 2's Pitfall 3, referenced in `acculynx-sync/index.ts` comments).
**When to use:** `acculynx-write-action` MUST do this for its 9 possible accounts (8 prod + sandbox); mirrors `loadProductionAccounts`/`resolveKey` in `acculynx-sync/lib/accounts.ts`.
**Example:**
```typescript
// Source: supabase/functions/acculynx-sync/lib/accounts.ts (verified live)
export function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}
// acculynx-write-action: look up the ONE requested account_key (not the full production fan-out),
// then resolveKey(acct) at call time — never resolve or cache all 9 keys up front.
```

### Anti-Patterns to Avoid
- **Building a second "preview" request-constructor:** violates D-03; guaranteed preview/execute drift over time. Use the single `buildRequestBody`-equivalent function for both.
- **Reading/writing `dashboard_work_items` directly from `acculynx-write-action`:** the edge function has no Astro/Supabase-JS access pattern for the Command Center's tables today and mixing concerns (AccuLynx write execution + dashboard work-item bookkeeping) in one function breaks D-02's "sole code path" boundary at the wrong layer. Keep the pending-write table + dashboard mirror row management in the Command Center Astro tier (the decision endpoint), and have the edge function do ONLY the AccuLynx call + update its own `acculynx_pending_write`/`acculynx_write_action_log` rows.
- **Assuming `dashboard_work_items` rows auto-render on the dashboard:** verified false — `loadCommandCenterSurface()` never queries `dashboard_work_items` for display purposes (it's write-only from the decision/intake paths; the ONE place it's read is `safeCount()` in `loadSystemSurface()` for a metric count, not item rendering). See "Work-Queue Reuse Contract" below.
- **Conflating `atom_access_log` with the new write-action audit log:** `atom_access_log` (schemas/cleverwork-roofer/50) is purpose-built for the cross-client consent-gated property-history read path (hard rule 6) — a completely different consent domain. Do not repurpose it for AccuLynx write auditing; create `acculynx_write_action_log` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 429/backoff HTTP retry for AccuLynx | A new retry wrapper | `acculynxCall()` pattern from `acculynx-write-sweep/index.ts` (verbatim retry-after + exponential backoff logic, explicitly commented "same 429/backoff/retry-after logic as read-sweep's acculynxGet, VERBATIM") | Already proven against the real API's rate-limit behavior across 38 endpoints; re-deriving risks missing the retry-after header nuance |
| Contact vs. job address shape handling | A generic address builder | `buildContactAddress()` / `buildJobAddress()` from `sweep.ts` | The object-vs-string asymmetry is a durable AccuLynx quirk, already correctly encoded and unit-tested |
| Human approval UI + audit trail | A new approval dashboard/table | Command Center `live-work.ts` + `HumanUnblockerDashboard.astro` (D-01) | Locked decision; also avoids two approval surfaces to keep in sync |
| Actor/permission resolution for prod-write gating | A new RBAC system | `access-control.ts`'s `CommandCenterActor`/`hasPermission`/`departmentAccess` | Already has a `permissions` array design; add one new permission (`approval.decide_prod_write` or similar) rather than a parallel system |
| Slack posting | A new Slack client/webhook | `postSlackMessage()` in `app/command-center/src/lib/slack.server.ts` + `slack-agents.ts` identity registry | Per-agent bot token resolution + fallback-to-@openbrain already solved |

**Key insight:** Every piece of infrastructure this phase needs (rate-limited HTTP client, account registry, human approval queue, audit logging, Slack posting) already exists in this codebase for an adjacent purpose. The entire job of Phase 5 is **connecting** these systems correctly — the risk is NOT "we lack a library," it's "we build a parallel system when an extension of the existing one would do," or miss a real gap (like the read-side work-queue extension) by assuming reuse where none currently exists.

## Runtime State Inventory

Not applicable — Phase 5 is net-new capability (a new write path), not a rename/refactor/migration. No existing runtime state needs relocating; the phase only adds new tables and a new edge function.

## Common Pitfalls

### Pitfall 1: Assuming the work-queue already accepts arbitrary agent-authored items
**What goes wrong:** Planner writes tasks assuming "just POST to `/api/agent/work-queue`" makes a pending AccuLynx write appear on the dashboard, discovers at implementation time that `GET /api/agent/work-queue` (`loadCommandCenterSurface()`) only returns items derived from live query surfaces (crm_pipeline, abc_review_queue, fleet tables, etc.) — plus one hardcoded fallback (`accounting:price-gap:*` in `decision.ts`'s `loadFallbackWorkItem`). Agent-created `dashboard_work_items` rows (via `intake.ts`'s pattern) are persisted but never read back for display.
**Why it happens:** `dashboard_work_items` LOOKS like a generic pending-item table (it has `source_data jsonb`, `evidence jsonb`, arbitrary `workflow`/`department` strings) and IS written to by an agent-facing endpoint already (`intake.ts`) — but that endpoint's rows only ever surface via `dashboard_action_log`/Slack mirror, never via the dashboard's live-item list.
**How to avoid:** The plan MUST include an explicit task to add a new surface-loading branch (e.g., `loadPendingAccuLynxWriteSurface()`) that queries the new `acculynx_pending_write` table and maps rows into `LiveWorkItem[]`, then wire it into `loadFreshCommandCenterSurface()`'s `Promise.all(departments.map(...))` fan-out (or a parallel non-department-keyed branch). Also extend `decision.ts`'s work-lookup (currently `surface.items.find(...) ?? loadFallbackWorkItem(...)`) with an equivalent fallback for `acculynx-write-action:*` workKeys, mirroring the existing `loadFallbackWorkItem` precedent exactly.
**Warning signs:** A task like "agent posts pending write, appears in dashboard" with no corresponding "extend loadCommandCenterSurface" task is a sign this gap wasn't accounted for.

### Pitfall 2: `jobCategory.id` sent as a string
**What goes wrong:** `POST /jobs` returns a `404` "could not be converted to System.Int32" — a durable AccuLynx quirk where `jobCategory.id` is the ONE Int32 id in a surface where every other id is a GUID string.
**Why it happens:** Reference-data GETs return ids as strings (or the harness's `pick()` helper stringifies them); passing that string straight through fails.
**How to avoid:** Reuse `intId()` from `sweep.ts` verbatim — coerces string back to number, returns `undefined` (field omitted) if not finite.
**Warning signs:** A 404 on job creation/update that mentions `System.Int32` in the error body.

### Pitfall 3: Contact address vs. job address shape swap
**What goes wrong:** `.NET` type-conversion 4xx when `state`/`country` are sent as the wrong shape — contact `mailingAddress` wants OBJECTS (`{id, name, abbreviation}`), job `locationAddress` (and `PUT /jobs/{id}/address`) wants STRINGS.
**Why it happens:** It's tempting to build one shared address-builder function; AccuLynx's two endpoints use opposite conventions.
**How to avoid:** Use `buildContactAddress()` for contact-only writes, `buildJobAddress()` for job-only writes — never share. Neither of these two is directly in the 17-lane v1 set, but `PUT /jobs/{jobId}/address` IS writable (in the 12), so this guardrail is live for v1.
**Warning signs:** Any wrapper touching addresses that imports/calls only one address-builder function for both contact and job contexts.

### Pitfall 4: Treating write-only lanes as verifiable
**What goes wrong:** A wrapper for `POST /jobs/{id}/messages`, `POST /jobs/external-references`, `POST /financials/{id}/worksheet/items`, `POST /jobs/{id}/photos-videos`, or `POST /jobs/{id}/representatives/company` tries to follow up with a GET to confirm the write persisted — none of these 5 lanes has an independent read-back path.
**Why it happens:** It's the natural instinct after any write to "verify" it landed.
**How to avoid:** Per `docs/knowledge-base/acculynx/api/write-capability.md`'s explicit guardrail: "treat the 2xx + any echoed response body as the only available evidence; do not build a Phase-5 wrapper that assumes a follow-up GET can confirm these writes — log the request and response at write time instead." The `acculynx_write_action_log` row IS the evidence.
**Warning signs:** A verification task for a write-only lane that says "confirm via GET."

### Pitfall 5: Wrapping `PUT /jobs/{id}/custom-fields` as if it's proven-safe
**What goes wrong:** CONTEXT.md D-04 lists `PUT /jobs/{id}/custom-fields` as one of the 4 first-offload lanes, but the Phase-4 evidence (docs/37, write-capability.md) classifies it as `blocked-by-dependency` — the sandbox lacks a real `CustomFieldType` + field definition, so every probe returned `400 "A valid CustomFieldType must be provided"`. It is NOT one of the 17 proven-safe (12 writable + 5 write-only) lanes D-06 says v1 wraps.
**Why it happens:** custom-fields was discussed as a desired capability before the Phase-4 evidence was finalized; the discrepancy between D-04 (names 4 lanes including custom-fields) and D-06 (locks to the 17-lane evidence set, which excludes custom-fields) was not caught during context-gathering.
**How to avoid:** See Open Questions below — flag this explicitly to the user/planner before writing any custom-fields wrapper task. Recommended resolution: treat `job message`, `payment (received/expense)`, and `external reference` as the 3 confirmed first-priority lanes from D-04 (all three ARE in the 17), and either (a) drop custom-fields from the "first four" framing since it's blocked pending sandbox company configuration, or (b) add a small prerequisite task to configure a real `CustomFieldType` in the sandbox company (outside AccuLynx-API control — likely a manual AccuLynx admin-UI step) before custom-fields can be probed as writable, in which case it moves from Phase 5 v1 to a follow-up.
**Warning signs:** A payment-first plan (per D-05) that also includes a custom-fields wrapper task without addressing this blocked-by-dependency status first.

### Pitfall 6: `PUT /jobs/{jobId}/trade-types` empty-body 500
**What goes wrong:** Deferred out of v1 per D-06/CONTEXT.md deferred list, but worth reinforcing: NEVER add this lane to v1 without also adding the `{items:[{id}]}` non-empty-body guardrail — an empty/`None` body causes a bare `500`.
**Why it happens:** It's explicitly deferred; this pitfall exists only as a reminder to keep it deferred, not to accidentally include it because it "looks similar" to the writable job-mutation PUTs.
**How to avoid:** Confirm the v1 lane list in the plan excludes this endpoint entirely.
**Warning signs:** N/A for v1 — this is a "don't accidentally scope-creep" pitfall.

## Code Examples

### The hard-gate pattern (mirror for D-09's prod barrier)
```typescript
// Source: supabase/functions/acculynx-write-sweep/sweep.ts (verified live)
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(
      `acculynx-write-sweep is sandbox-only: refusing to resolve "${secretName}". ` +
        `Only ${SANDBOX_SECRET_NAME} is permitted.`,
    );
  }
}
// acculynx-write-action needs an assertTarget(targetEnv, accountKey) that:
//  - if targetEnv !== "sandbox" and !== "prod", throw (no implicit default beyond explicit sandbox)
//  - if targetEnv === "prod", require the caller to have ALREADY verified approver permission
//    (that check lives in decision.ts, layer above — this function only enforces "explicit flag required")
```

### The rate-limited HTTP call pattern (reuse verbatim)
```typescript
// Source: supabase/functions/acculynx-write-sweep/index.ts (verified live)
async function acculynxCall(
  method: string,
  url: string,
  body?: unknown,
  formData?: FormData,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${ACCULYNX_KEY}`,
        Accept: "application/json",
      };
      if (!formData) headers["Content-Type"] = "application/json";
      res = await fetch(url, { method, headers, body: formData ?? (body ? JSON.stringify(body) : undefined) });
    } catch (e) {
      return { status: 0, ms: Date.now() - t0, body: { fetchError: String(e) }, isJson: false };
    }
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") ?? "";
    const isJson = ct.includes("json");
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
      attempt++;
      continue;
    }
    const body_ = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, ms, body: body_, isJson };
  }
}
```

### Account registry resolution (per-request, never module-level)
```typescript
// Source: supabase/functions/acculynx-sync/lib/accounts.ts (verified live)
export interface AccountRow {
  account_key: string;
  env_secret_name: string;
  label: string | null;
  market: string | null;
  state: string | null;
}

export async function loadProductionAccounts(sb: any): Promise<AccountRow[]> {
  const { data: accounts, error } = await sb
    .from("acculynx_accounts")
    .select("account_key, env_secret_name, label, market, state")
    .eq("environment", "production")
    .eq("is_active", true)
    .order("account_key");
  if (error) throw new Error(`accounts load: ${error.message}`);
  return accounts ?? [];
}

export function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}
// acculynx-write-action: SELECT a single row WHERE account_key = <requested>
// (not the production fan-out) — the pending-write item names exactly one target account.
```

### The existing agent-authored work-item pattern (to mirror, with the read-side gap fixed)
```typescript
// Source: app/command-center/src/pages/api/agent/intake.ts (verified live) — the closest
// existing precedent for "agent creates a dashboard_work_items row." Phase 5's enqueue route
// should follow this exact upsert + action-log-append shape, writing to the NEW
// acculynx_pending_write table (not dashboard_work_items) so AccuLynx-specific fields
// (target account, lane, dry-run render, idempotency key) have a proper home:
const { data: workItem, error: wiError } = await client
  .from("dashboard_work_items")   // Phase 5 equivalent: .from("acculynx_pending_write")
  .upsert(rows.workItem as Record<string, unknown>, { onConflict: "work_key" })
  .select("id, work_key, status, created_at, updated_at")
  .single();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Structural-discovery-only write capability doc (OpenAPI reference, no live evidence) | Evidence-based write-capability matrix from real sandbox HTTP probes (`acculynx_write_catalog`) | 2026-07-01 (Phase 4, batch `wsweep-2026-07-01T13-33-02-965Z`) | This phase's 17-lane target set IS the current state of the art for this codebase — no older/newer version exists to reconcile against |
| Phantom `POST /jobs/{id}/measurements` endpoint (listed in a pre-Phase-4 doc) | Confirmed non-existent in the 124-operation API v2 surface; closest analog is `POST /jobs/{jobId}/photos-videos` (write-only, in the 17-lane set) | 2026-07-01 (Phase 4 correction) | If any stale planning doc or prior conversation references a "measurements write," it must NOT be included in Phase 5 — it does not exist |

**Deprecated/outdated:**
- The 2026-06-10 version of `docs/37` (structural-discovery only) is explicitly superseded — do not reference it for endpoint verdicts.
- The "verified sandbox write findings (2026-06-30)" section of `docs/knowledge-base/acculynx/api/write-capability.md` is superseded by the 2026-07-01 matrix in the same file (per the file's own header note).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new `acculynx_pending_write` table (distinct from `dashboard_work_items`) is the right persistence shape, rather than adding AccuLynx-specific columns directly to `dashboard_work_items`. | Standard Stack / Architecture Patterns / Don't Hand-Roll | If wrong, the planner may instead choose to widen `dashboard_work_items` with nullable AccuLynx-specific columns — a valid alternative, but couples a general-purpose table to one integration's schema. This is a design recommendation, not a verified requirement; flagged as Claude's Discretion in CONTEXT.md ("the pending-write record shape ... planner/researcher decide"). |
| A2 | The recommended new permission name `approval.decide_prod_write` (or equivalent) does not yet exist in `access-control.ts`'s `CommandCenterPermission` union and must be added. | Don't Hand-Roll / Prod-vs-sandbox gate wiring | Verified: the current `CommandCenterPermission` union (read at `access-control.ts:7-14`) has no prod-write-specific permission — only `approval.decide` (generic). This is a real gap, not fully assumed, but the exact permission name/shape is a design choice for the planner. |
| A3 | `acculynx_write_action_log` should be a brand-new table rather than extending `dashboard_action_log` with AccuLynx-specific columns. | Anti-Patterns / Don't Hand-Roll | `dashboard_action_log` already has a flexible `payload jsonb` column that COULD hold AccuLynx write-action audit data without a new table. The recommendation to create a separate table is based on keeping the "sole code path" (D-02) boundary clean and giving the write-action edge function its own table to write to without needing Command Center's `dashboard_action_log` write permissions — but a valid alternative is to have the Astro decision endpoint (which already writes to `dashboard_action_log` via `recordLiveWorkDecision`) log the AccuLynx exec result there instead, and have `acculynx-write-action` return its result synchronously to the decision endpoint rather than writing its own audit row. |

**If this table is empty:** Not empty — the above 3 claims are architectural recommendations rather than fully-verified requirements, since CONTEXT.md explicitly delegates "the pending-write record shape" to planner/researcher discretion.

## Open Questions

1. **Custom-fields lane conflict (D-04 vs. D-06 evidence)**
   - What we know: CONTEXT.md D-04 lists `PUT /jobs/{id}/custom-fields` as one of the 4 first-offload lanes. The Phase-4 evidence (`docs/37`, `write-capability.md`) classifies this endpoint as `blocked-by-dependency` — every sandbox probe returned `400 "A valid CustomFieldType must be provided"` because the sandbox company has no custom-field definitions configured. D-06 explicitly locks v1 to the 17 proven-safe lanes (12 writable + 5 write-only), which does NOT include custom-fields.
   - What's unclear: Whether the user intends to (a) drop custom-fields from the "first four" framing (only job message, payment, external-reference remain confirmed-safe from D-04's list), (b) do a one-time manual AccuLynx admin-UI step to configure a real `CustomFieldType` in the sandbox company so it CAN be probed and potentially reclassified as writable before Phase 5 starts, or (c) still write a wrapper for it in v1 with the understanding that its dry-run preview will show but its execute will predictably 400 in both sandbox and (dangerously) prod until sandbox config changes.
   - Recommendation: Surface this to the user before planning locks the task list. Recommend option (a) — proceed with job message, payment, and external-reference as the 3 confirmed lanes from D-04's list for the "first offload" narrative (SC3), while still building all 17 lane wrappers as D-06 requires (custom-fields' 2 lanes — `PUT /jobs/{id}/custom-fields` and `PUT /jobs/{id}/custom-fields/{customFieldId}` — are NOT in the 17, so they are correctly excluded from v1 entirely, not just de-prioritized). This resolves the conflict by treating D-06 (the evidence-locked 17-lane scope) as authoritative over D-04's example list, since D-06 is the more specific/recent lock.

2. **Exact new-permission name and grant list for D-09's second barrier**
   - What we know: `access-control.ts`'s `CommandCenterPermission` union has no prod-write-specific permission today; `NAMED_AGENT_IDENTITIES` and human actors get `HUMAN_PERMISSIONS` (includes `approval.decide`) uniformly — there is currently no differentiation between "can approve a sandbox item" and "can approve a prod-targeting item."
   - What's unclear: Which specific humans/named agents should be granted the new prod-write-approval permission. This is a business decision (who is trusted to approve production AccuLynx writes), not a technical one.
   - Recommendation: Planner should add a `checkpoint:human-verify`-style task asking the user to name the initial prod-write-approver roster (likely Chris/Roberto per the existing `primaryHuman` ownership pattern in `live-work.ts`'s `DEPARTMENT_META`) before wiring the permission grants.

3. **Whether `acculynx-write-action` invocation from `decision.ts` is synchronous (blocking the HTTP response) or async (fire-and-forget with a follow-up status check)**
   - What we know: The existing `recordLiveWorkDecision` flow is fully synchronous (Supabase writes + Slack mirror insert all happen within the POST handler, returning the result). Edge Functions have a runtime budget (`acculynx-write-sweep` uses 150s; the real-time single-write call should be much faster than a 38-endpoint sweep).
   - What's unclear: Whether a single write call's latency (likely well under a few seconds for the 4 priority lanes) is acceptable to await synchronously within the Astro API route's request/response cycle, or whether it should be dispatched and polled.
   - Recommendation: Synchronous is almost certainly fine for a single-endpoint write (unlike the sweep's 38-endpoint fan-out) — recommend the decision endpoint calls `acculynx-write-action` via `fetch()` and awaits the JSON result before returning, mirroring the existing pattern where `recordLiveWorkDecision` already does several sequential Supabase writes synchronously.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase functions deploy`) | Deploying `acculynx-write-action` | Not verified in this research pass (no shell access to check CLI install) — ASSUMED available since `acculynx-sync`/`acculynx-write-sweep` are already deployed via this path | — | If missing, the deploy path documented in `.claude/skills/coolify/SKILL.md` (Coolify) is explicitly NOT the right tool — Coolify only builds `app/command-center/Dockerfile`; edge functions deploy separately |
| Deno (Supabase Edge Runtime) | Edge Function execution | Managed by Supabase — not a local dependency to verify | — | N/A |
| Sandbox AccuLynx account (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) | Sandbox validation (D-05, all wrapper testing) | Confirmed configured — `acculynx-write-sweep` already resolves and uses this exact secret name live [VERIFIED: supabase/functions/acculynx-write-sweep/sweep.ts:16] | — | — |
| `accountTypeId` in sandbox company config | `POST /jobs/{id}/payments/paid` (NOT in v1 scope — excluded per blocked-by-dependency) | Missing (confirmed: docs/37 blocked-by-dependency row) | — | Not needed — `payments/paid` is correctly excluded from v1; only `payments/received`/`payments/expense` (no `accountTypeId` dependency observed) are in scope |
| Real `CustomFieldType` in sandbox company config | `PUT /jobs/{id}/custom-fields*` (see Open Question 1) | Missing | — | Excluded from v1 per D-06's evidence-locked 17-lane set; see Open Question 1 |

**Missing dependencies with no fallback:** None blocking v1 — the two missing sandbox-config dependencies above (`accountTypeId`, `CustomFieldType`) both correspond to endpoints correctly excluded from the 17-lane v1 scope.

**Missing dependencies with fallback:** None needed for in-scope lanes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (Command Center, `app/command-center/vitest.config.ts`) for Astro/TS lib code; Deno's built-in `deno test` for Edge Function code (no repo-level `deno.json` task exists yet for `supabase/functions/` — see Wave 0 Gaps) |
| Config file | `app/command-center/vitest.config.ts` (Command Center); none yet for `supabase/functions/acculynx-write-action` — precedent is ad hoc `deno test` invocation per function directory (e.g. `acculynx-write-sweep/sweep.test.ts`) |
| Quick run command | `cd app/command-center && npm test` (Vitest) for Command Center lib changes; `deno test --allow-net --allow-env supabase/functions/acculynx-write-action/action.test.ts` for the edge function's pure core |
| Full suite command | `cd app/command-center && npm test` (all Vitest specs); `deno test --allow-net --allow-env supabase/functions/acculynx-write-action/` for all edge function tests |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-08 | `buildRequestBody`-equivalent produces the exact documented request shape for each of the 17 lanes (incl. Int32 coercion, address shape, strict enums) | unit | `deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts` | ❌ Wave 0 |
| REQ-08 | `dryRun=true` and `dryRun=false` produce byte-identical built requests (D-03 anti-drift guarantee) | unit | `deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts` | ❌ Wave 0 |
| REQ-08 | `assertTarget` refuses execution when `targetEnv` is unset/ambiguous (sandbox-default, prod-never-implicit, D-09 barrier #1) | unit | `deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts` | ❌ Wave 0 |
| REQ-08 | Decision endpoint refuses to invoke the edge function for a prod-targeting item when the approver lacks the prod-write permission (D-09 barrier #2) | unit/integration | `cd app/command-center && npx vitest run src/pages/api/agent/work-queue/decision.test.ts` | ❌ Wave 0 |
| REQ-08 | Pending write appears in `GET /api/agent/work-queue` after enqueue (closes Pitfall 1's gap) | integration | `cd app/command-center && npx vitest run src/lib/acculynx-pending-write.test.ts` | ❌ Wave 0 |
| REQ-08 | Idempotency key prevents a second `approve` decision from re-firing an already-executed write | unit/integration | `deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts` (idempotency-key check) + Vitest for the decision-endpoint guard | ❌ Wave 0 |
| REQ-08 | Each of the 17 lane wrappers' guardrail is exercised (e.g., `jobCategory.id` Int32, address shape, write-only-no-readback logging) | unit | `deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts` | ❌ Wave 0 (mirrors existing `sweep.test.ts` coverage pattern) |
| REQ-08 | End-to-end: sandbox job-message write, sandbox payment write, full human-gated flow through the dashboard | manual (sandbox) + integration | Manual UAT against sandbox account; scripted integration test optional | ❌ Wave 0 |
| REQ-08 | Production payment write only fires after explicit approval + prod permission + sandbox-proven | manual-only (justified: real money, real prod account — no safe way to automate a real prod financial transaction in CI) | N/A — human-gated UAT per SC3 | N/A |

### Sampling Rate
- **Per task commit:** run the specific unit test file touched (`deno test` for the edge function, `vitest run <file>` for Command Center lib changes)
- **Per wave merge:** `cd app/command-center && npm test` (full Vitest suite) AND `deno test --allow-none supabase/functions/acculynx-write-action/` (full edge function suite)
- **Phase gate:** Both full suites green before `/gsd-verify-work`; additionally, a documented sandbox dry-run + sandbox execute for every one of the 17 lanes (mirroring the write-sweep's own evidence-gathering discipline) before the payment lane is proposed for its first production write.

### Wave 0 Gaps
- [ ] `supabase/functions/acculynx-write-action/action.test.ts` — covers REQ-08 (all 17 lane builders + guardrails + dryRun/execute equivalence + assertTarget)
- [ ] `app/command-center/src/lib/acculynx-pending-write.test.ts` — covers REQ-08 (pending-write row shape, surface-loading mapping into `LiveWorkItem[]`)
- [ ] `app/command-center/src/pages/api/agent/work-queue/decision.test.ts` (if not already present — verify; this research did not find an existing test file for `decision.ts`) — covers REQ-08 (D-09 permission gate, idempotency guard, edge-function invocation on approve)
- [ ] No repo-level `deno.json` test task exists for `supabase/functions/` — recommend adding one (or documenting the ad hoc `deno test` invocation convention) so CI/local runs are consistent; existing precedent (`acculynx-write-sweep/sweep.test.ts`) is run ad hoc without a task runner

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing bearer-token (`resolveServiceActorFromBearer`) + WorkOS session auth — no new auth mechanism introduced; the new enqueue route and decision-endpoint extension reuse `locals.actor` exactly as `intake.ts`/`decision.ts` already do |
| V3 Session Management | yes | WorkOS-managed session for human approvers (existing); no new session logic |
| V4 Access Control | yes | `access-control.ts`'s `CommandCenterActor`/`hasPermission`/`departmentAccess` — extend with a new prod-write-approval permission (Open Question 2); enforce at the decision endpoint BEFORE invoking the edge function |
| V5 Input Validation | yes | Every per-lane wrapper in `acculynx-write-action` must validate its payload shape before building the AccuLynx request (mirrors `buildRequestBody`'s `bad_input` dimension in `sweep.ts`, which encodes exactly what a malformed payload looks like per lane) |
| V6 Cryptography | yes | `node:crypto` `createHash("sha256")` for idempotency-key generation (reuse the existing pattern in `live-work.ts`'s `hashText()`); `timingSafeEqual` already used for bearer-token comparison in `access-control.ts` — no new crypto primitive needed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prod write fired without explicit target flag (accidental prod mutation) | Tampering / Elevation of Privilege | D-09 belt-and-suspenders: `assertTarget` in the edge function refuses any non-explicit target; decision endpoint separately checks approver permission before ever calling the edge function |
| Double-fire on retry/re-approval (duplicate payment posted twice) | Tampering / Repudiation | Idempotency key (hash of lane+payload+target, or a UUID stamped at enqueue time) checked against `acculynx_write_action_log` before executing; AccuLynx's `POST /jobs/external-references` is explicitly documented as an "idempotency anchor" — worth investigating whether it can double as a dedup mechanism for linking a pending-write's local UUID to the executed AccuLynx side effect |
| Service token leakage exposing write capability | Information Disclosure / Elevation of Privilege | Existing `AGENT_SERVICE_TOKENS` / `AGENT_SERVICE_TOKEN_SHA256_*` pattern (sha256-hashed-at-rest option already exists per `workos-agent-auth` skill) — no new token mechanism, but ensure the new enqueue route requires the SAME `evidence.attach`-tier permission gating `intake.ts` already uses (agent/service/local actor types only, department-scoped) |
| AccuLynx API key leakage via logs/response echo | Information Disclosure | Reuse `redactSample()` from `sweep.ts` — PII and secret-shaped fields are redacted before any payload/response is persisted to `acculynx_write_action_log` |
| Cross-account write (wrong AccuLynx account touched, e.g. sandbox payload sent to a prod key) | Tampering | Account resolution strictly by `account_key` lookup from `acculynx_accounts`, resolved fresh per-call via `Deno.env.get(env_secret_name)` — never a cached/shared key across accounts (mirrors `resolveKey()`'s per-request design) |

## Sources

### Primary (HIGH confidence — verified live in repo)
- `.planning/phases/05-read-write-action-layer/05-CONTEXT.md` — locked decisions, canonical refs
- `.planning/ROADMAP.md` (lines 148-155) — REQ-08 success criteria
- `.planning/PROJECT.md` (line 35) — REQ-08 statement
- `app/command-center/src/lib/live-work.ts` (1710 lines, read in full) — `LiveWorkItem`, `recordLiveWorkDecision`, `loadCommandCenterSurface`, department surface loaders — confirmed no generic pending-item read path exists
- `app/command-center/src/lib/access-control.ts` (full) — `CommandCenterActor`, `WorkQueueDecision`, `getAllowedDecisions`, permission model, bearer-token resolution
- `app/command-center/src/lib/agent-api.ts` (full) — `serializeWorkQueueItem`, `buildDecisionAuditEvent`, `jsonApiResponse`
- `app/command-center/src/pages/api/agent/work-queue/index.ts` (full) — `GET` handler, confirms surface-derived-only read
- `app/command-center/src/pages/api/agent/work-queue/[workId]/decision.ts` (full) — confirms work lookup is surface-derived + one hardcoded price-gap fallback, no generic pending-item path
- `app/command-center/src/pages/api/agent/intake.ts` (full) — the closest existing "agent creates arbitrary work item" precedent
- `app/command-center/src/lib/agent-intake.ts` (full) — row-building pattern to mirror
- `app/command-center/src/components/unblocker/HumanUnblockerDashboard.astro` (full) — confirms UI is source-agnostic (renders whatever `LiveWorkItem[]` it's given)
- `supabase/functions/acculynx-write-sweep/index.ts` (full, 803 lines) — request-building, guardrails, `acculynxCall`, `assertSandbox` usage
- `supabase/functions/acculynx-write-sweep/sweep.ts` (full) — `assertSandbox`, `redactSample`, `buildContactAddress`/`buildJobAddress`, `classifyVerdict2`, `SANDBOX_SECRET_NAME`
- `supabase/functions/acculynx-sync/lib/accounts.ts` (full) — `loadProductionAccounts`, `resolveKey`
- `supabase/functions/acculynx-sync/index.ts` (partial, 200 lines) — legacy fetch pattern (superseded by write-sweep's `acculynxCall` for the new function)
- `schemas/cleverwork-roofer/80-command-center-workflows.sql` (full) — `dashboard_work_items`/`dashboard_action_log`/`slack_mirror_events` DDL, confirms columns available for reuse
- `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql` (full) — 9-account registry (8 prod + sandbox), `env_secret_name` mapping
- `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` (full) — `acculynx_write_catalog`/`acculynx_write_probe` DDL, verdict enum
- `schemas/cleverwork-roofer/50-consent-access-log.sql` (full) — confirms `atom_access_log` is a distinct, purpose-built consent-domain table (not reusable for write-action audit)
- `docs/37-acculynx-write-capability-matrix.md` (full) — authoritative 38-endpoint matrix, all 17 proven-safe lanes with guardrails
- `docs/knowledge-base/acculynx/api/write-capability.md` (full) — guardrail recipes, per-endpoint "it just works" preconditions
- `.claude/skills/slack-agents/SKILL.md` (full) — per-agent bot identities, channels, `postSlackMessage()` signature (verified via grep of `slack.server.ts`)
- `.claude/skills/workos-agent-auth/SKILL.md` (full) — agent bearer-token auth path, roster
- `.claude/skills/coolify/SKILL.md` (partial) — confirms Coolify deploys `main`, builds `app/command-center/Dockerfile` only (not edge functions)
- `CLAUDE.md` (full) — hard rules 1-12, Live⇄Dev deploy contract
- Live shell verification: `git branch --show-current` → `main` (current checked-out branch); schema numbering confirmed via `find` → highest is `183`; confirmed no repo-level `deno.json` test task exists for `supabase/functions/`

### Secondary (MEDIUM confidence)
- None used beyond primary sources — this research required no external web search; all contracts were verifiable directly against the live codebase per the research targets' explicit instruction.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; 100% reuse of already-live, already-tested internal libraries
- Architecture: HIGH - every contract (work-queue shape, decision endpoint, account registry, rate-limit pattern) verified by reading the actual source files, not inferred
- Pitfalls: HIGH - the central pitfall (work-queue read-side gap) was discovered by tracing actual code paths (`loadCommandCenterSurface` → department loaders → confirmed no `dashboard_work_items` read-back for display), not assumed from documentation

**Research date:** 2026-07-01
**Valid until:** 30 days (stable internal codebase; re-verify if `live-work.ts`, `access-control.ts`, or the AccuLynx write-catalog evidence changes before planning begins)

## RESEARCH COMPLETE
