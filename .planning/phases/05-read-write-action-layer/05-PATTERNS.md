# Phase 5: Read/Write Action Layer - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/functions/acculynx-write-action/index.ts` | controller (edge function entrypoint) | request-response (HTTP → outbound AccuLynx call) | `supabase/functions/acculynx-write-sweep/index.ts` | exact |
| `supabase/functions/acculynx-write-action/action.ts` (pure core) | service (pure request-builder) | transform | `supabase/functions/acculynx-write-sweep/sweep.ts` | exact |
| `supabase/functions/acculynx-write-action/action.test.ts` | test | transform | `supabase/functions/acculynx-write-sweep/sweep.test.ts` | exact |
| Migration `184-acculynx-pending-write-ddl.sql` (+ `185-acculynx-write-action-log-ddl.sql`) | migration | CRUD (audit/state table DDL) | `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` | exact (shape/idempotency precedent); `50-consent-access-log.sql` for audit-log column shape only, NOT for reuse |
| `app/command-center/src/lib/live-work.ts` (new `loadPendingAccuLynxWriteSurface()` branch + wiring into `loadFreshCommandCenterSurface`) | service (surface loader) | CRUD (read) | Existing `loadAccountingSurface`/price-gap branch in the same file, and `loadFreshCommandCenterSurface`'s `Promise.all(departments.map(...))` fan-out | role-match (same file, same pattern, new branch) |
| `app/command-center/src/pages/api/agent/work-queue/[workId]/decision.ts` (fallback lookup + synchronous edge-function invoke on approve) | controller (Astro API route) | request-response | The file's own existing `loadFallbackWorkItem` (hardcoded `accounting:price-gap:*` prefix match) | exact (same file, extend the same pattern) |
| New `app/command-center/src/pages/api/agent/acculynx-write-action/enqueue.ts` (agent-authored pending-write creation) | controller (Astro API route) | CRUD (create) | `app/command-center/src/pages/api/agent/intake.ts` | exact |
| `app/command-center/src/lib/access-control.ts` (add prod-write permission) | middleware/config (permission model) | request-response (authorization check) | Existing `CommandCenterPermission` union + `HUMAN_PERMISSIONS`/`hasPermission` | exact (extend in place) |

## Pattern Assignments

### `supabase/functions/acculynx-write-action/index.ts` (controller, request-response)

**Analog:** `supabase/functions/acculynx-write-sweep/index.ts`

**Imports pattern** (lines 18-30):
```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertSandbox,
  buildContactAddress,
  buildJobAddress,
  classifyVerdict2,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
  shouldStopProbing,
  type ProbeSignal,
  type VerdictInput,
} from "./sweep.ts";
```
`acculynx-write-action/index.ts` should import from its own pure core (`action.ts`) the equivalent of `assertSandbox`/`redactSample`/`buildContactAddress`/`buildJobAddress`/`intId`, plus a new `assertTarget(targetEnv, accountKey)` (D-09 barrier #1).

**Hard-gate pattern** (lines 473-481, entrypoint top):
```typescript
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // HARD GATE: enforce sandbox-only in code before any network call.
  try {
    assertSandbox(SANDBOX_SECRET_NAME);
  } catch (e) {
    return json({ error: (e as Error).message }, 403);
  }
  if (!ACCULYNX_KEY) return json({ error: `${SANDBOX_SECRET_NAME} not set in Edge secrets` }, 500);
```
`acculynx-write-action` replaces the single-secret `assertSandbox` with `assertTarget(targetEnv, accountKey)` — same "throw before any network call" shape, extended to allow BOTH sandbox (default) and an explicit, named prod account (never implicit).

**Rate-limited call pattern (`acculynxCall`)** (lines 70-106) — reuse VERBATIM:
```typescript
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
Only material change for `acculynx-write-action`: `ACCULYNX_KEY` must be resolved per-request from the specific requested `account_key` (not a single sandbox module constant) — see the account-registry pattern below. `PACE_MS`/`MAX_RETRIES`/`BASE` constants carry over unchanged.

**Persistence + response shape** (lines 763-798) — mirror the "insert probe rows, upsert catalog, return summary JSON" shape, but write to the new `acculynx_pending_write` / `acculynx_write_action_log` tables instead of `acculynx_write_probe` / `acculynx_write_catalog`.

**Error handling:** the `json()` helper (lines 800-802) is a one-line wrapper; reuse verbatim:
```typescript
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
```

---

### `supabase/functions/acculynx-write-action/action.ts` (pure core, transform)

**Analog:** `supabase/functions/acculynx-write-sweep/sweep.ts`

**assertSandbox → assertTarget hard-gate pattern** (lines 15-30):
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
D-09's `assertTarget(targetEnv, accountKey)` follows the identical "throw before any resolution" shape, but must allow a second explicit path (`targetEnv === "prod"`) rather than hard-refusing anything non-sandbox. The approver-permission check (barrier #2) stays OUT of this function — it belongs in `decision.ts`, per RESEARCH.md's explicit code comment on this exact point.

**Redaction pattern** (lines 32-60) — reuse `redactSample()` verbatim for both `payload_sample` and `request_body_sample` on every row written to `acculynx_write_action_log`; the `PII_KEY` regex and shape-preservation logic need no changes.

**Int32 coercion (`intId`)** (sweep.ts is the caller-side helper defined in `index.ts:198-202`, verified live):
```typescript
function intId(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
```
Move this into the new pure core (`action.ts`) so it's exported and unit-tested — required for `jobCategory.id` (Pitfall 2) wherever a lane wrapper touches job category.

**Address-shape builders** (lines 214-255) — reuse `buildContactAddress()` / `buildJobAddress()` verbatim; never share one builder across contact vs. job contexts (Pitfall 3). Only `PUT /jobs/{jobId}/address` (in the 17-lane set) needs `buildJobAddress`; none of the 17 lanes write a contact address directly, but keep both builders available since `buildRequestBody`-style per-lane construction commonly needs job address fields.

**Per-lane request-body builder pattern** (sweep.ts's sibling `buildRequestBody` lives in `index.ts:273-399`, verified live) — this is the direct template for `action.ts`'s pure `buildWriteRequest(lane, payload, refData)`:
```typescript
function buildRequestBody(
  op: string,
  seeds: Record<string, string | null>,
  refData: ReferenceData,
  dimension: string | null,
): unknown {
  switch (op) {
    case "postPaymentReceived":
      return dimension === "bad_input"
        ? { amount: "not-a-number" }
        : { from: "Write Sweep", amount: 1, paymentDate: new Date().toISOString().slice(0, 10), notes: "probe" };
    case "postJobMessage":
      return dimension === "bad_input" ? {} : { message: "write-sweep probe message" };
    case "postJobExternalReference":
      return dimension === "bad_input"
        ? { jobId: seeds.jobId, source: "write-sweep" } // missing required projectId -> expect 400
        : { jobId: seeds.jobId, source: "write-sweep", projectId: `probe-${seeds.jobId}` };
    // ...
  }
}
```
`acculynx-write-action`'s equivalent switch has ONE case per proven-safe lane (17 total: the 3 D-04 first-priority lanes — `postJobMessage`, `postPaymentReceived`/`postPaymentExpense`, `postJobExternalReference` — plus the other 14 from D-06's evidence set), but takes the agent/human-supplied `payload` instead of synthesizing probe fixtures, and has NO `dimension === "bad_input"` branch (that was sweep-only red-teaming). Each case must still apply the SAME lane-specific guardrail sweep.ts encodes (Int32 coercion, address shape, strict enums).

**Write-only lane list** (line 417) — reuse verbatim as the set that must never attempt a follow-up GET (Pitfall 4):
```typescript
const WRITE_ONLY_OPS = new Set(["postJobMessage", "postJobMessageReply", "postContactLog"]);
```

---

### `supabase/functions/acculynx-write-action/action.test.ts` (test)

**Analog:** `supabase/functions/acculynx-write-sweep/sweep.test.ts` (referenced by import surface in `index.ts:18-30`; run via `deno test --allow-net --allow-env`). Mirror its structure: one test per pure function (`assertTarget`, `redactSample`, `buildContactAddress`/`buildJobAddress`, `intId`, and each of the 17 lane builders), plus an explicit test asserting `dryRun=true` and `dryRun=false` produce byte-identical built requests (D-03 anti-drift guarantee — this is a NEW test class sweep.test.ts didn't need, since sweep had no dry-run concept).

---

### Migrations `184-acculynx-pending-write-ddl.sql` / `185-acculynx-write-action-log-ddl.sql` (migration, CRUD)

**Analog (shape + idempotency + RLS posture):** `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql`

**Idempotent DDL + verdict-style enum-via-CHECK pattern** (lines 20-37):
```sql
create table if not exists public.acculynx_write_catalog (
  id                         integer generated always as identity primary key,
  endpoint_pattern           text not null,
  method                     text not null,
  verdict                    text not null
                               check (verdict in ('writable','write-only','unsupported','fragile-with-guardrail','blocked-by-dependency','read-shaped')),
  source_account_key         text not null default 'sandbox',
  last_probe_status          integer,
  last_probed_at             timestamptz,
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
```
`acculynx_pending_write` mirrors this shape with new columns: `lane` (text, CHECK against the 17-lane set), `target_env` (text CHECK in ('sandbox','prod')), `account_key` (text), `payload` (jsonb), `dry_run_render` (jsonb), `idempotency_key` (text, unique), `status` (text CHECK in ('pending_review','approved','executed','rejected','failed')), `work_key` (text, unique — the join key back to `dashboard_work_items`/`LiveWorkItem.workKey`), plus `created_at`/`updated_at`.

**Unique-index + RLS grant pattern** (lines 69-78):
```sql
create unique index if not exists idx_acculynx_write_catalog_endpoint_method
  on public.acculynx_write_catalog(endpoint_pattern, method);

alter table public.acculynx_write_catalog enable row level security;
grant select on public.acculynx_write_catalog, public.acculynx_write_probe to authenticated, service_role;
```
`acculynx_write_action_log` needs `enable row level security` + a service-role-only grant (it's the immutable audit trail — no `authenticated` SELECT unless the dashboard needs to read it directly; if the dashboard reads it via `live-work.ts`'s service-role Supabase client, `service_role`-only is sufficient, matching D-02's "sole code path" boundary).

**Audit-log column-shape reference ONLY (do NOT reuse the table itself, per RQ-4):** `schemas/cleverwork-roofer/50-consent-access-log.sql` lines 9-20 (`atom_access_log`) — useful only as a shape reference (requester identity, decision outcome, timestamp columns); this table is a different consent domain (hard rule 6) and must not be touched or extended.

**Numbering:** continue past 183 → use **184** and **185** (confirmed live: highest applied is 183, per RESEARCH.md's live shell verification).

---

### `app/command-center/src/lib/live-work.ts` (service, CRUD-read; new surface-loading branch)

**Analog:** the file's own `loadFreshCommandCenterSurface` fan-out + per-department loader dispatch (lines 1248-1291, verified live):
```typescript
try {
    if (department === "accounting") return await loadAccountingSurface(client);
    if (department === "operations") return await loadOperationsSurface(client);
    if (department === "sales") return await loadSalesSurface(client);
    if (department === "marketing") return await loadMarketingSurface(client);
    if (department === "executive") return await loadExecutiveSurface(client);
    return await loadSystemSurface(client);
  } catch (error) {
    return {
      ...DEPARTMENT_META[department],
      department,
      errors: [error instanceof Error ? error.message : "Live department query failed"],
      generatedAt: new Date().toISOString(),
      items: [],
      metrics: [],
      status: "degraded",
    };
  }
}

async function loadFreshCommandCenterSurface(env: RuntimeEnv): Promise<LiveCommandCenterSurface> {
  const surfaces = await Promise.all(departments.map((department) => loadDepartmentSurface(department.id, env)));
  const items = surfaces.flatMap((surface) => surface.items).sort((a, b) => { /* ... */ });
```
New task: add `loadPendingAccuLynxWriteSurface(client)` (queries `acculynx_pending_write` WHERE `status = 'pending_review'`, maps rows into `LiveWorkItem[]` with `workflow: "acculynx-write-action"`, `workKey: acculynx-write-action:<row.work_key>`), then splice its `items`/`errors` into `loadFreshCommandCenterSurface`'s aggregate — either as a non-department-keyed `Promise.all` branch alongside the `departments.map(...)` fan-out, or folded into the existing `system`/`accounting` department surface (whichever department the prod-write approver roster maps to; D-09 Open Question 2 leaves this to config).

**`LiveWorkItem` shape to populate** (interface at lines 30-53) — every pending write maps into these fields; `sourceTable: "acculynx_pending_write"`, `sourcePk: row.id`, `approval: "before_write"` (mirrors `buildPriceGapWorkItem`'s `approval: "before_write"` in `decision.ts:54`), `auditTrail` built from the dry-run render summary.

**`recordLiveWorkDecision`** (lines 1565-1708) is reused UNMODIFIED by the decision endpoint on every decision type (`approve`/`reject`/etc.) — it already does the full `dashboard_work_items` upsert + `dashboard_action_log` insert + Slack-mirror-event insert + `invalidateCommandCenterSurfaceCache()` sequence. Phase 5 does not need to touch this function; the NEW work happens in `decision.ts` (edge-function invocation on `approve`, additionally updating `acculynx_pending_write`/`acculynx_write_action_log`) either before or after this call.

---

### `app/command-center/src/pages/api/agent/work-queue/[workId]/decision.ts` (controller, request-response)

**Analog:** the file's own existing fallback-lookup pattern (lines 85-102, verified live):
```typescript
async function loadFallbackWorkItem(decodedWorkId: string): Promise<LiveWorkItem | null> {
  const prefix = "accounting:price-gap:";
  if (!decodedWorkId.startsWith(prefix)) return null;

  const rowId = decodedWorkId.slice(prefix.length);
  const gapSurface = await loadAgreementGapSurface();
  const row = gapSurface.rows.find((candidate) => candidate.id === rowId);
  return row ? buildPriceGapWorkItem(row) : null;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const surface = await loadCommandCenterSurface();
  const decodedWorkId = params.workId ? decodeURIComponent(params.workId) : "";
  let work = surface.items.find((candidate) => candidate.workKey === decodedWorkId || candidate.id === decodedWorkId) ?? null;
  work ??= await loadFallbackWorkItem(decodedWorkId);
```
New `loadFallbackAcculynxWriteItem(decodedWorkId)` mirrors this exactly: prefix `acculynx-write-action:`, looks up the row directly in `acculynx_pending_write` (bypassing the cached `loadCommandCenterSurface()` for freshness on a single-row fetch), and maps it via the same `LiveWorkItem`-building helper the new `live-work.ts` surface loader uses (avoid duplicating the mapping logic — export it once and call it from both places).

**Decision permission-gating pattern to extend for D-09** (lines 127-143):
```typescript
const allowedDecisions: WorkQueueDecision[] = [];
if (work.approval !== "none" && hasPermission(actor, "approval.decide")) allowedDecisions.push("approve", "reject");
// ...
if (!actorCanAccessDepartment(actor, work.department) || !allowedDecisions.includes(decision)) {
  return jsonApiResponse({ error: "forbidden", ... }, { status: 403 });
}
```
For an `acculynx-write-action:*` work item whose `target_env === "prod"`, add a second check BEFORE calling `recordLiveWorkDecision`/the edge function: `if (isProdTarget && !hasPermission(actor, "approval.decide_prod_write")) return 403` (D-09 barrier #2 — belt-and-suspenders alongside the edge function's own `assertTarget`).

**Synchronous edge-function invocation** (new code, OQ-3 resolved: synchronous) — insert right after the existing `recordLiveWorkDecision(...)` call (line 145), gated on `decision === "approve"`:
```typescript
const result = await recordLiveWorkDecision(work, actor, decision, note, { /* ...context... */ });

if (decision === "approve" && work.workflow === "acculynx-write-action") {
  const execResult = await fetch(`${env.SUPABASE_FUNCTIONS_URL}/acculynx-write-action`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workKey: work.workKey, dryRun: false }),
  }).then((r) => r.json());
  // persist execResult onto acculynx_pending_write / acculynx_write_action_log
}
```
Mirrors the existing "sequential synchronous Supabase writes within the POST handler" pattern `recordLiveWorkDecision` already uses (per RESEARCH.md OQ-3 recommendation) — no new async/polling infrastructure needed.

---

### New `app/command-center/src/pages/api/agent/acculynx-write-action/enqueue.ts` (controller, CRUD-create)

**Analog:** `app/command-center/src/pages/api/agent/intake.ts` (full file, verified live)

**Actor-type + permission gate** (lines 21-52):
```typescript
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  if (actor.type !== "service_agent" && actor.type !== "named_agent" && actor.type !== "local_operator") {
    return jsonApiResponse({ error: "forbidden", error_description: "Only agent actors may create intake items." }, { status: 403 });
  }
  if (actor.departmentAccess !== "all" && !actor.departmentAccess.includes("accounting")) {
    return jsonApiResponse({ error: "forbidden", ... }, { status: 403 });
  }
  if (!hasPermission(actor, "evidence.attach")) {
    return jsonApiResponse({ error: "forbidden", error_description: "evidence.attach permission required." }, { status: 403 });
  }
```
`enqueue.ts` copies this exact gate shape (agent-actor-only, permission check via `hasPermission`), swapping the department check for whichever department the AccuLynx write belongs to (likely `accounting` for payments, `operations`/`sales` for job messages — department should come from the lane, not be hardcoded to accounting).

**Required-field validation loop** (lines 59-75) — reuse the same `for (const key of required)` pattern, with `required = ["lane", "accountKey", "targetEnv", "payload"]` (+ optionally `idempotencyKey`, generated server-side via `createHash("sha256")` per `live-work.ts`'s own `hashText()`-style usage if the agent doesn't supply one).

**Upsert + action-log-append shape** (lines 90-126) — reuse VERBATIM, writing to `acculynx_pending_write` instead of `dashboard_work_items`:
```typescript
const { data: workItem, error: wiError } = await client
  .from("dashboard_work_items")   // Phase 5: .from("acculynx_pending_write")
  .upsert(rows.workItem as Record<string, unknown>, { onConflict: "work_key" })
  .select("id, work_key, status, created_at, updated_at")
  .single();

if (wiError) {
  return jsonApiResponse({ error: "database_error", error_description: wiError.message }, { status: 500 });
}

const actionLogRow = { ...rows.actionLog, work_item_id: workItem?.id ?? null };
const { data: actionLog, error: alError } = await client
  .from("dashboard_action_log")
  .insert(actionLogRow)
  .select("id, created_at")
  .single();
```
The `dashboard_action_log` append (non-fatal on error, logged via `console.error`) still applies — every pending write gets a mirror action-log entry so it participates in the existing audit trail, even though its authoritative row lives in the new table.

**Slack notify (D-08)** — not present in `intake.ts` directly (that's handled via the `slack_mirror_events` insert inside `recordLiveWorkDecision`), but `enqueue.ts` should call `postSlackMessage()` (from `slack.server.ts`, per `slack-agents` skill) directly after the insert succeeds, since a pending write must notify at CREATE time, not just at decision time.

---

### `app/command-center/src/lib/access-control.ts` (middleware/config, request-response)

**Analog:** the file's own `CommandCenterPermission` union + `hasPermission` (lines 7-14, 525-527):
```typescript
export type CommandCenterPermission =
  | "command_center.read"
  | "work_queue.read"
  | "approval.decide"
  | "approval.request_more_evidence"
  | "evidence.attach"
  | "agent.resume"
  | "desktop.command_center_ui";

export function hasPermission(actor: CommandCenterActor, permission: CommandCenterPermission) {
  return actor.permissions.includes(permission);
}
```
Add a new union member `"approval.decide_prod_write"` and include it in `HUMAN_PERMISSIONS` (lines 66-74) ONLY for the initial approver roster named by the human/config step (D-09/OQ-2 — NOT a code decision; the code change is just adding the permission name and NOT granting it to every human by default, unlike the current fully-open `HUMAN_PERMISSIONS` array). Concretely: either (a) add a new `PROD_WRITE_APPROVER_EMAILS` env-driven allowlist checked inside `resolveActorFromSessionUser` (mirrors the existing `isHumanAdminEmail`/`isEmailOnList` pattern at lines 382-401), or (b) hardcode the initial roster the same way `NAMED_AGENT_IDENTITIES` is hardcoded — planner's discretion, but the mechanism (a checkable permission) must exist before `decision.ts` can gate on it.

## Shared Patterns

### Rate-limited HTTP call + 429/backoff (`acculynxCall`)
**Source:** `supabase/functions/acculynx-write-sweep/index.ts:70-106`
**Apply to:** `acculynx-write-action/index.ts` — reuse verbatim per Don't-Hand-Roll guidance; only change is per-account key resolution instead of a single sandbox constant.

### Account resolution via registry (never module-level key)
**Source:** `supabase/functions/acculynx-sync/lib/accounts.ts:30-53`
```typescript
export function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}
```
**Apply to:** `acculynx-write-action` — SELECT the single requested `account_key` row (not the full production fan-out `loadProductionAccounts` does), then `resolveKey(acct)` at call time, per request.

### Human approval + audit trail (D-01, do not rebuild)
**Source:** `app/command-center/src/lib/live-work.ts` (`recordLiveWorkDecision`, `LiveWorkItem`, `serializeLiveWorkQueueItem`), `app/command-center/src/lib/access-control.ts` (`WorkQueueDecision`, `hasPermission`, `getAllowedDecisions`), `app/command-center/src/lib/agent-api.ts` (`buildDecisionAuditEvent`, `jsonApiResponse`).
**Apply to:** every Command Center file in this phase — reuse these functions rather than building a parallel approval/audit mechanism.

### Redaction before persistence (PII safety)
**Source:** `supabase/functions/acculynx-write-sweep/sweep.ts:32-60` (`redactSample`)
**Apply to:** every row written to `acculynx_write_action_log` / `acculynx_pending_write.payload` / `dry_run_render` — apply `redactSample()` to both outbound request bodies and inbound AccuLynx responses before storage (hard rule 2).

### Additive/idempotent migration DDL
**Source:** `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` (full file)
**Apply to:** migrations 184/185 — `create table if not exists`, `create index if not exists`, CHECK-constraint enums, `enable row level security` + explicit grants; never `DROP`/`TRUNCATE`/retype (hard rule 1).

## No Analog Found

None — every file in this phase has a strong same-codebase analog (this is explicitly a "connect two existing systems" phase per RESEARCH.md; no net-new architectural pattern is required).

## Metadata

**Analog search scope:** `supabase/functions/acculynx-write-sweep/`, `supabase/functions/acculynx-sync/`, `app/command-center/src/lib/`, `app/command-center/src/pages/api/agent/`, `schemas/cleverwork-roofer/`
**Files scanned:** 9 (index.ts + sweep.ts for write-sweep; accounts.ts for sync; live-work.ts, access-control.ts, agent-api.ts for Command Center lib; intake.ts, decision.ts for Command Center API routes; 182-acculynx-write-catalog-ddl.sql + 50-consent-access-log.sql for schema precedent)
**Pattern extraction date:** 2026-07-01

## PATTERN MAPPING COMPLETE

**Phase:** 05 - read-write-action-layer
**Files classified:** 8
**Analogs found:** 8 / 8

### Coverage
- Files with exact analog: 6 (index.ts, action.ts, action.test.ts, migration DDL, enqueue.ts, access-control.ts)
- Files with role-match analog: 2 (live-work.ts new branch, decision.ts extension — both extend an existing file's existing pattern in place)
- Files with no analog: 0

### Key Patterns Identified
- Pure-core + thin-entrypoint Edge Function split (`action.ts`/`index.ts` mirrors `sweep.ts`/`index.ts`) with a single `buildWriteRequest`-equivalent function shared by `dryRun=true` and `dryRun=false` (D-03 anti-drift).
- The Command Center work-queue read side has NO generic pending-item path today — `live-work.ts` needs a genuinely new surface-loading branch (`loadPendingAccuLynxWriteSurface`), not just a reuse of `intake.ts`'s write-side upsert.
- `decision.ts`'s hardcoded `accounting:price-gap:*` fallback-lookup is the exact template for the new `acculynx-write-action:*` fallback, including the two-tier work-lookup (`surface.items.find(...) ?? loadFallbackWorkItem(...)`).
- Account/key resolution must always be per-request from a registry (`resolveKey(acct)`), never a cached/module-level constant — this guards against cross-account (sandbox-vs-prod) key bleed, which is exactly D-09's risk surface.

### File Created
`.planning/phases/05-read-write-action-layer/05-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
