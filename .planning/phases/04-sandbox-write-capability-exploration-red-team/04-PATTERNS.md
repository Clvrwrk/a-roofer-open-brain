# Phase 4: Sandbox Write-Capability Exploration & Red-Team - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 6 (3 new Edge Function files, 2 new SQL migration files, 1 new reconcile script) + 2 doc-regeneration targets (not classified — content is generated, not patterned)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `supabase/functions/acculynx-write-sweep/sweep.ts` | utility (pure logic module) | transform | `supabase/functions/acculynx-read-sweep/sweep.ts` | exact |
| `supabase/functions/acculynx-write-sweep/index.ts` | controller (Edge Function entrypoint) | request-response + event-driven (HTTP-triggered sweep) | `supabase/functions/acculynx-read-sweep/index.ts` | exact |
| `supabase/functions/acculynx-write-sweep/sweep.test.ts` | test | transform (unit) | `supabase/functions/acculynx-read-sweep/sweep.test.ts` | exact |
| `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` | migration (DDL) | CRUD (schema definition) | `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` | exact |
| `schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql` | migration (DDL + seed data) | batch (bulk insert) | `schemas/cleverwork-roofer/167-acculynx-get-checklist.sql` | exact |
| `scripts/acculynx-write-sweep-reconcile.sql` | utility (SQL assertion/gate script) | batch (aggregate query) | `scripts/acculynx-read-sweep-reconcile.sql` | exact |

**Not classified (generated docs, no code pattern to copy):**
- `docs/37-acculynx-write-capability-matrix.md` — regenerated from evidence tables per D-03; no analog needed, just query the tables once red-teaming completes.
- `docs/knowledge-base/acculynx/api/write-capability.md` — same; already contains the 2026-06-30 seed findings to fold in as prior evidence rows.
- `docs/knowledge-base/acculynx/ingestion/write-sweep.md` — new design doc; mirror `docs/knowledge-base/acculynx/ingestion/read-sweep.md`'s prose structure (not fetched here — low-risk, prose-only, planner/writer can freehand from the code once built).

**Not reused as a source module (confirmed, not an oversight):** `supabase/functions/acculynx-sync/lib/accounts.ts` (`loadProductionAccounts`/`resolveKey`) is the fan-out-to-all-production-accounts pattern used by the sync job. The read-sweep does **not** import it — it resolves `PE_CC_SANDBOX_ACCULYNX_API_KEY` directly via `Deno.env.get(SANDBOX_SECRET_NAME)` at module scope (`index.ts` line 19). The write-sweep must follow the **read-sweep's** direct-resolution pattern, not the sync lib's registry-driven fan-out — there is exactly one account (sandbox) in scope, and CONTEXT.md's hard gate is a code-level `assertSandbox()` check, not an accounts-table lookup.

## Pattern Assignments

### `supabase/functions/acculynx-write-sweep/sweep.ts` (utility, transform)

**Analog:** `supabase/functions/acculynx-read-sweep/sweep.ts` (89 lines, read in full)

**Header/module-doc pattern** (lines 1-9):
```typescript
// acculynx-read-sweep — sweep core (Phase 1, plan 01-02)
//
// Pure, unit-tested logic shared by the Edge Function entrypoint (index.ts):
//   - assertSandbox: code-level enforcement of the sandbox-only mandate (Chris, 2026-06-30)
//   - paginationParam: per-endpoint pagination param selection (recordStartIndex vs pageStartIndex)
//   - redactSample: homeowner-PII redaction before any response shape is stored
//
// NO secret value ever appears here — only the sandbox secret NAME constant.
```
Copy this doc-comment convention verbatim, renaming to `acculynx-write-sweep` and updating the bullet list to name the write-sweep's own exports (`assertSandbox`, `redactSample`, plus new `shouldStopProbing`, request-body builders).

**Hard sandbox gate — copy verbatim, rename error string only** (lines 10-25):
```typescript
/** The only AccuLynx secret this function is permitted to resolve. */
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(
      `acculynx-read-sweep is sandbox-only: refusing to resolve "${secretName}". ` +
        `Only ${SANDBOX_SECRET_NAME} is permitted in Phase 1.`,
    );
  }
}
```
For the write-sweep: same constant name and value (`PE_CC_SANDBOX_ACCULYNX_API_KEY` — same secret, same account), only the function name in the error message changes to `acculynx-write-sweep`. This is D-01's "single enforced safety boundary" — duplicate, do not import cross-function (Edge Functions each bundle independently; there is no shared-lib import path between `acculynx-read-sweep` and a new function without a `_shared` directory, which does not exist in this repo's `supabase/functions/` — confirmed no `_shared/` dir present).

**PII redaction — copy verbatim** (lines 56-83):
```typescript
const PII_KEY = /^(jobName|contactName|firstName|lastName|fullName|name|street1|street2|address|addressLine\d*|line1|line2|email|emailAddress|phone|phoneNumber|mobilePhone)$/i;

const MAX_STR = 200; // truncate long non-PII strings; we store shapes, not full payloads

export function redactSample(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactSample(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY.test(k)) {
        out[k] = `[redacted:${Array.isArray(v) ? "array" : v === null ? "null" : typeof v}]`;
      } else {
        out[k] = redactSample(v);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_STR) {
    return value.slice(0, MAX_STR) + `…[+${value.length - MAX_STR}]`;
  }
  return value;
}
```
Reuse exactly as-is — the write-sweep creates synthetic/anonymized data, but per RESEARCH.md's security section this still applies as defense-in-depth and for stored-shape consistency with the read side. No changes needed; the PII_KEY regex already covers every field the write bodies will contain (firstName/lastName/phone/email/address).

**pathParams — copy verbatim** (lines 86-88):
```typescript
export function pathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}
```
Needed identically for resolving `{jobId}`, `{financialsId}`, `{contactId}`, `{customFieldId}`, `{subscriptionId}`, `{messageId}` in write endpoint paths.

**`paginationParam` — NOT needed for the write-sweep.** Write endpoints don't paginate (POST/PUT/DELETE bodies, not list GETs); omit this export or leave it unused. Two of the smoke-tier endpoints (`POST /jobs/search`, `POST /contacts/search`) are search-shaped and may return paginated results in their response body, but that's a response-shape concern (harvest keys), not a request pagination param — do not port `paginationParam` unless a specific need surfaces.

**New export needed (no analog — write-sweep-only, per RESEARCH.md Wave 0 gap):** `shouldStopProbing(history)` — a pure function implementing D-05's stop rule ("stop probing an endpoint after 2 consecutive probes reveal no new error shape or new guardrail"). No existing code to mirror; write fresh, but follow the same pure-function-with-Deno.test convention as the rest of `sweep.ts` so it is unit-testable in isolation. Suggested shape:
```typescript
export interface ProbeSignal { status: number; errorShape: string | null; guardrail: string | null; }
export function shouldStopProbing(history: ProbeSignal[]): boolean {
  if (history.length < 2) return false;
  const [last, prev] = [history[history.length - 1], history[history.length - 2]];
  const noNewSignal = (a: ProbeSignal, b: ProbeSignal) =>
    a.status === b.status && a.errorShape === b.errorShape && a.guardrail === b.guardrail;
  return noNewSignal(last, prev);
}
```
(Planner/implementer should refine the exact signal fields during task-writing — this is Claude's Discretion per CONTEXT.md — but the pure-function/testable shape is the pattern to preserve.)

**New export needed (no analog — write-sweep-only):** request-body builders per the address-shape asymmetry landmine (RESEARCH.md Pitfall 1 / "Known Landmines" code block). Source these directly from `scripts/seed-sandbox-from-wichita.mjs` lines 38-53 and 106-124 (see Shared Patterns below) rather than the read-sweep (reads have no body).

---

### `supabase/functions/acculynx-write-sweep/index.ts` (controller, request-response/event-driven)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (312 lines, read in full)

**Header/module-doc pattern** (lines 1-10):
```typescript
// acculynx-read-sweep — Edge Function entrypoint (Phase 1, plan 01-02 Task 2)
//
// SANDBOX-ONLY spec-driven sweep of the 86 documented AccuLynx GET operations. Reads the
// checklist from acculynx_get_checklist, resolves ONLY the sandbox key behind a code-level
// hard gate, chains IDs via a HATEOAS list->detail walk, paces <=8 req/s, redacts homeowner
// PII, and records one acculynx_api_probe row per op (tagged source_account_key='sandbox')
// plus an upsert into acculynx_api_catalog. Every checklist op gets a row under some verdict
// so the 01-03 reconciliation (EXCEPT) returns zero.
//
// NO secret value in source — only the sandbox secret NAME constant (see sweep.ts).
```
Copy the structure; update the body to describe the 38-endpoint write sweep, `acculynx_write_catalog`/`acculynx_write_probe`, tiered deep/smoke red-team instead of tier A/B/C GET-walking, and the reconcile script this phase writes.

**Client + constants setup — copy verbatim, add `MAX_RETRIES`-adjacent constants for red-team dimensions** (lines 11-28):
```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertSandbox,
  paginationParam,
  redactSample,
  SANDBOX_SECRET_NAME,
} from "./sweep.ts";

const ACCULYNX_KEY = Deno.env.get(SANDBOX_SECRET_NAME);
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE_ACCOUNT = "sandbox";
const PACE_MS = 130;            // ~8 req/s on the single sandbox key
const RUNTIME_BUDGET_MS = 110_000;
const MAX_RETRIES = 3;

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```
Same shared sandbox key, same client init, same pacing philosophy (write endpoints likely need the same or a more conservative PACE_MS given they mutate state — keep 130ms unless red-teaming shows a need to slow down). `RUNTIME_BUDGET_MS` may need to be larger given writes chain dependencies (contact→job→financials round trips) — flag as a planner decision, not a hard requirement to change.

**Hard gate at top of handler — copy verbatim structure** (lines 121-129):
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
Identical pattern for the write-sweep — this is the single enforced boundary D-01 requires; do not weaken or bypass it even though this function's whole purpose is to write (the risk is writing to the WRONG account, not writing itself).

**Fetch-with-retry/backoff helper — copy verbatim, generalize the HTTP method** (lines 73-99):
```typescript
async function acculynxGet(
  url: string,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${ACCULYNX_KEY}`, Accept: "application/json" },
      });
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
    const body = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, ms, body, isJson };
  }
}
```
The write-sweep needs a generalized version accepting `method` and an optional `body`, e.g. `acculynxCall(method, url, requestBody)` — adds `"Content-Type": "application/json"` and `body: requestBody ? JSON.stringify(requestBody) : undefined` to the fetch call (mirror `scripts/seed-sandbox-from-wichita.mjs` line 55-56's `call()` helper, which already generalizes this exact way — see Shared Patterns). Keep the identical 429/backoff/retry-after logic verbatim — this is the "Don't Hand-Roll" rate-limit pattern RESEARCH.md calls out explicitly.

**Seed pre-fetch / dual assigned+unassigned job fetch — reuse the *pattern*, not the literal GETs** (lines 144-159):
```typescript
try {
  const base = "https://api.acculynx.com/api/v2/jobs?pageSize=25&includes=contact";
  const assigned = await acculynxGet(base);
  const unassigned = await acculynxGet(`${base}&assignment=unassigned`);
  const items = [
    ...((assigned.body as { items?: any[] })?.items ?? []),
    ...((unassigned.body as { items?: any[] })?.items ?? []),
  ];
  const jobIds = [...new Set(items.map((j) => j?.id).filter(Boolean))].slice(0, 5);
  if (jobIds.length) seeds.jobId = jobIds;
  const contactIds = [...new Set(items.flatMap((j) => (j?.contacts ?? []).map((c: any) => c?.contact?.id)).filter(Boolean))].slice(0, 5);
  if (contactIds.length) seeds.contactId = contactIds;
} catch (_e) { /* non-fatal */ }
```
For the write-sweep, this dual-fetch is still directly relevant per RESEARCH.md Pitfall 3 (API-created jobs are unassigned leads, invisible to the default list) — but the write-sweep's *primary* seeding is CREATE calls (`POST /contacts` → `POST /jobs` → `GET .../financials`), not a GET-and-harvest walk. Use this snippet as the fallback/pre-check (confirm a freshly `POST`-created job is retrievable via `?assignment=unassigned` before assuming a provisioning delay — RESEARCH.md Open Question 1).

**Verdict classification + probe row construction — mirror the *shape*, extend for write-specific fields** (lines 209-256):
```typescript
let verdict: string;
if (status === 200 && Array.isArray(items) && items.length === 0) verdict = "empty";
else if (status === 200) verdict = "200";
else if (row.base_url.includes("/webhooks/v2") && (status === 404 || !isJson)) verdict = "tier_gated";
else verdict = String(status);
bump(verdict);
...
probeRows.push({
  probe_batch_id: batchId,
  probe_name: row.operation_id,
  api_endpoint: resolvedPath,
  method: "GET",
  http_status: status,
  response_ms: ms,
  reported_count: count,
  items_on_page: itemsOnPage,
  result_summary,
  payload_sample: redactSample(firstItem ?? body),
  error: status >= 400 ? `HTTP ${status}` : null,
  source_account_key: SOURCE_ACCOUNT,
});
```
Write-sweep's probe row needs additional columns per D-02 ("extend for method + red-team dimension + side-effect") — see Pattern Assignments for the DDL below for the exact extended column set. The verdict vocabulary must also extend: read-sweep's `{"200","empty","tier_gated",<status-code-string>}` becomes write's `{"writable","write-only","unsupported","fragile-with-guardrail","blocked-by-dependency","read-shaped"}` per CONTEXT.md D-02 (plus the open-question 3 addition `read-shaped` for the two search-POSTs — planner's discretion whether to add this 5th enum value or use `notes`).

**Persistence: insert probes, upsert catalog — copy verbatim structure** (lines 259-271):
```typescript
if (probeRows.length) {
  const { error } = await sb.from("acculynx_api_probe").insert(probeRows);
  if (error) return json({ error: `probe insert: ${error.message}`, batch_id: batchId }, 500);
}
if (catalogRows.length) {
  const { error: catErr } = await sb
    .from("acculynx_api_catalog")
    .upsert(catalogRows, { onConflict: "endpoint_pattern,method" });
  if (catErr) console.warn(`[sweep] catalog upsert skipped: ${catErr.message}`);
}
```
Direct rename to `acculynx_write_probe` / `acculynx_write_catalog`, same `onConflict: "endpoint_pattern,method"` upsert key (still unique per write endpoint since method now varies POST/PUT/DELETE across otherwise-identical paths, e.g. `/subscriptions/{subscriptionId}` has both a PUT and a DELETE).

**JSON response helper + `mkProbe` fallback-row builder — copy verbatim** (lines 286-311):
```typescript
function mkProbe(
  row: ChecklistRow,
  batchId: string,
  status: number | null,
  verdict: string,
  extra: Record<string, unknown>,
): Record<string, unknown> { /* ... */ }

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
```
Reuse identically for endpoints that can't be probed (e.g., `blocked-by-dependency` verdict rows — the write-sweep's equivalent of read-sweep's `unprobeable`).

---

### `supabase/functions/acculynx-write-sweep/sweep.test.ts` (test, transform/unit)

**Analog:** `supabase/functions/acculynx-read-sweep/sweep.test.ts` (76 lines, read in full)

**Import + framework pattern — copy verbatim** (lines 1-10):
```typescript
// Deno smoke tests for the acculynx-read-sweep core (plan 01-02 Task 1).
// Run: deno test supabase/functions/acculynx-read-sweep/sweep.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertSandbox,
  paginationParam,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
} from "./sweep.ts";
```
Same `jsr:@std/assert@1` import, same run-command comment convention. Swap `paginationParam` out of the import list (not used by write-sweep) and add `shouldStopProbing` and any request-body builder exports.

**assertSandbox test pattern — copy verbatim, same fixture list** (lines 12-27):
```typescript
Deno.test("assertSandbox throws for any production key name", () => {
  for (
    const prod of [
      "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
      "PE_CC_FLORIDA_ACCULYNX_API_KEY",
      "ACCULYNX_API_KEY",
      "",
    ]
  ) {
    assertThrows(() => assertSandbox(prod), Error, "sandbox-only");
  }
});

Deno.test("assertSandbox accepts the sandbox key name", () => {
  assertSandbox(SANDBOX_SECRET_NAME); // must not throw
});
```
Identical test — this is exactly the behavior the write-sweep's own `assertSandbox` must have (same 9-account fixture list from `acculynx_accounts`, since all 8 production keys are equally forbidden).

**redactSample test pattern — copy verbatim, extend fixture with write-specific fields (e.g. `checkNumber`, `notes`)** (lines 38-70):
```typescript
Deno.test("redactSample masks homeowner PII but preserves keys + non-PII values", () => {
  const raw = {
    id: "abc-123",
    jobName: "KS-8: Daniel Nagel",
    currentMilestone: "approved",
    locationAddress: { street1: "123 Main St", city: "Wichita", zipCode: "67203" },
    contacts: [{ firstName: "Daniel", lastName: "Nagel", email: "d@x.com", isPrimary: true }],
    count: 42,
  };
  const out = redactSample(raw) as Record<string, any>;
  assertEquals(out.jobName, "[redacted:string]");
  /* ... */
});
```
Reuse verbatim (the redaction function itself is unchanged); optionally add one write-specific fixture (e.g., a `payments/received` body with `from`, `checkNumber`) to confirm non-PII financial fields survive redaction.

**New tests needed (no analog):**
- `shouldStopProbing` — table-driven Deno.test cases: 1 probe → false; 2 identical-signal probes → true; 2 differing-signal probes → false.
- Request-body builders (contact-address-as-objects vs job-address-as-strings) — assert the two builder functions produce the opposite state/country shapes per RESEARCH.md's "Known Landmines" code block, e.g.:
```typescript
// New test — no read-sweep analog (reads have no request body)
Deno.test("buildContactAddress uses object state/country; buildJobAddress uses string state/country", () => {
  const contact = buildContactAddress({ state: "KS", ... });
  assertEquals(typeof contact.state, "object");
  const job = buildJobAddress({ state: "KS", ... });
  assertEquals(typeof job.state, "string");
});
```

---

### `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` (migration, CRUD)

**Analog:** `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` (61 lines, read in full)

**Header/doc-comment pattern — copy verbatim structure** (lines 1-12):
```sql
-- 166 — AccuLynx catalog/probe DDL capture + source_account_key tag (Phase 1, REQ-05)
--
-- acculynx_api_catalog (per-endpoint canonical record) and acculynx_api_probe (per-call
-- evidence) were created directly in the live DB and had no repo DDL. This migration captures
-- their exact live shape as idempotent CREATE TABLE IF NOT EXISTS so the repo is the source of
-- truth and a fresh brain can rebuild them. ...
--
-- source_account_key tags each probe row with the AccuLynx account it came from ...
-- Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).
```
Rewrite for 182: this is a **net-new** table pair (not a capture-of-existing-live-table like 166 was), so drop the "were created directly in the live DB" framing — state instead that `acculynx_write_catalog`/`acculynx_write_probe` are new tables mirroring the read-side shape per D-02, extended for method + red-team dimension + side-effect. Keep the hard-rule-1 additive/idempotent framing verbatim.

**`acculynx_api_catalog` column shape — mirror column-for-column, extend per D-02** (lines 14-30):
```sql
create table if not exists public.acculynx_api_catalog (
  id               integer generated always as identity primary key,
  endpoint_pattern text not null,
  method           text not null,
  category         text not null,
  subcategory      text,
  requires_param   text,
  is_collection    boolean,
  response_keys    text[],
  target_table     text,
  sync_enabled     boolean,
  last_probe_status integer,
  last_probed_at   timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```
`acculynx_write_catalog` should carry the same base columns (`endpoint_pattern`, `method`, `last_probe_status`, `last_probed_at`, `notes`, `created_at`/`updated_at`) plus new write-specific columns: `verdict text not null check (verdict in ('writable','write-only','unsupported','fragile-with-guardrail','blocked-by-dependency'))` (or add a 5th `read-shaped` value per Open Question 3), `tier text check (tier in ('deep','smoke'))`, `red_team_dimensions_covered text[]` (or `jsonb`), `side_effect text` (e.g. `creates_entity`, `mutates_entity`, `no_side_effect`, `fires_webhook`), `guardrail_notes text`. `category`/`is_collection` (read-only concepts — GET list vs detail) do not apply to writes; drop or repurpose `category` as a grouping label (e.g. `contacts`, `jobs`, `financials`, `payments`, `documents`, `messages`, `representatives`, `subscriptions`) instead.

**`acculynx_api_probe` column shape — mirror column-for-column, extend per D-02** (lines 32-46):
```sql
create table if not exists public.acculynx_api_probe (
  id             bigint generated always as identity primary key,
  probe_batch_id text not null,
  probe_name     text not null,
  api_endpoint   text not null,
  method         text not null,
  http_status    integer,
  response_ms    integer,
  reported_count integer,
  items_on_page  integer,
  result_summary jsonb not null default '{}'::jsonb,
  payload_sample jsonb,
  error          text,
  probed_at      timestamptz not null default now()
);
```
`acculynx_write_probe` keeps `id`, `probe_batch_id`, `probe_name`, `api_endpoint`, `method`, `http_status`, `response_ms`, `result_summary`, `payload_sample`, `error`, `probed_at` verbatim; drops `reported_count`/`items_on_page` (list-pagination concepts, not applicable to single-entity writes) in favor of new columns: `request_body_sample jsonb` (redacted, mirrors `payload_sample` but for the outbound request), `red_team_dimension text check (red_team_dimension in ('bad_input','partial_failure','idempotency','ordering_dependency','authz_scope', null))` (null for plain happy-path smoke probes), `side_effect_observed text`, `created_entity_id text` (tag+leave lifecycle traceability — D-04), `run_tag text` (the run-id marker stamped on every sandbox-created entity per D-04).

**source_account_key tagging — copy verbatim** (lines 48-56):
```sql
alter table public.acculynx_api_probe   add column if not exists source_account_key text;
alter table public.acculynx_api_catalog add column if not exists source_account_key text;

comment on column public.acculynx_api_probe.source_account_key is
  'AccuLynx account this probe ran against (acculynx_accounts.account_key). Phase 1 sweep tags every row ''sandbox''; reconciliation asserts no non-sandbox rows.';

create index if not exists idx_acculynx_api_probe_batch  on public.acculynx_api_probe(probe_batch_id);
create index if not exists idx_acculynx_api_probe_source on public.acculynx_api_probe(source_account_key);
```
Since `acculynx_write_probe`/`acculynx_write_catalog` are brand-new tables (unlike 166's `alter`-onto-existing-tables), `source_account_key` can be defined directly in the `create table` column list (`source_account_key text not null default 'sandbox'`) rather than a separate `alter table add column`. Keep the same comment convention and the same two indexes (`probe_batch_id`, `source_account_key`).

**RLS + grants — copy verbatim** (lines 58-61):
```sql
alter table public.acculynx_api_catalog enable row level security;
alter table public.acculynx_api_probe   enable row level security;
grant select on public.acculynx_api_catalog, public.acculynx_api_probe to authenticated, service_role;
```
Identical deny-by-default posture (matches hard rule / RESEARCH.md V4 Access Control note) — rename table names only.

---

### `schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql` (migration, batch)

**Analog:** `schemas/cleverwork-roofer/167-acculynx-get-checklist.sql` (122 lines, read in full)

**Table shape — mirror, extend for write-specific fields** (lines 11-24):
```sql
create table if not exists public.acculynx_get_checklist (
  operation_id        text primary key,
  path                text not null,
  base_url            text not null,
  tier                text not null check (tier in ('A','B','C')),
  path_params         jsonb not null default '[]'::jsonb,
  pagination_param    text,
  includes_supported  boolean not null default false,
  seed_source         text,
  probeability        text not null default 'probeable'
                        check (probeability in ('probeable','tier_gated','unprobeable_no_seed')),
  swept               boolean not null default false,
  created_at          timestamptz not null default now()
);
```
`acculynx_write_checklist` (naming: the file is called "checklist-seed" — planner should confirm whether the table itself is named `acculynx_write_checklist` to mirror `acculynx_get_checklist`, distinct from `acculynx_write_catalog` which stores the evidence-derived verdict; these are two different tables per the RESEARCH.md architecture diagram — the catalog is the *evidence* output, the checklist is the *input* target list). Column mapping: `operation_id`/`path`/`base_url` verbatim; `tier` becomes `check (tier in ('deep','smoke'))` per D-05 instead of A/B/C; `pagination_param`/`includes_supported` drop (not applicable to writes); add `method text not null check (method in ('POST','PUT','DELETE'))`, `required_body_fields jsonb` (e.g. `["contactTypeIds"]`), `dependency_chain text` (mirrors `seed_source`'s "contactId -> jobId" style notation, e.g. `$$contactId -> jobId -> financialsId$$`), `red_team_dimensions jsonb default '["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]'::jsonb` for deep-tier rows / a shorter list for smoke; `probeability` can be kept verbatim or renamed, still useful for `blocked-by-dependency` pre-flagging (e.g. `PUT /jobs/{jobId}/insurance` flagged per Open Question 2); `swept` verbatim (watermark-resume, same purpose).

**Seed insert pattern — copy the `$$...$$` dollar-quoting + `on conflict do nothing` convention verbatim** (lines 29-118):
```sql
insert into public.acculynx_get_checklist
  (operation_id, path, base_url, tier, path_params, pagination_param, includes_supported, seed_source, probeability)
values
  ($$getAccuLynxCountries$$, $$/acculynx/countries$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, true, null, $$probeable$$),
  ...
on conflict (operation_id) do nothing;
```
Use the identical dollar-quote (`$$...$$`) style for every text literal (safe against embedded quotes/apostrophes in `notes`/path values) and the identical `on conflict (<primary key>) do nothing` idempotency guard. The 38 rows come directly from RESEARCH.md's "Full 38-Endpoint Enumeration" table (13 deep + 25 smoke) — each research table row maps to one seed `values (...)` tuple. Example first row translation (deep-tier, `POST /contacts`):
```sql
($$postContact$$, $$/contacts$$, $$https://api.acculynx.com/api/v2$$, $$POST$$, $$deep$$,
 $$[]$$::jsonb, $$["contactTypeIds"]$$::jsonb, null,
 $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),
```
(Exact column order/count depends on the final DDL from 182 — planner finalizes the column list, then this seed file's `insert` statement follows directly from the research table row-by-row.)

**RLS + grant footer — copy verbatim** (lines 120-121):
```sql
alter table public.acculynx_get_checklist enable row level security;
grant select on public.acculynx_get_checklist to authenticated, service_role;
```

---

### `scripts/acculynx-write-sweep-reconcile.sql` (utility, batch/aggregate query)

**Analog:** `scripts/acculynx-read-sweep-reconcile.sql` (37 lines, read in full — this is the entire file)

**Header comment — copy verbatim structure** (lines 1-8):
```sql
-- acculynx-read-sweep-reconcile.sql — Phase 1 (plan 01-03) read-sweep gate
--
-- Three committed assertions over the LATEST sandbox sweep batch. All three must return
-- ZERO for the phase to pass. Run via the Supabase MCP execute_sql or psql.
--
-- Secret-leak companion (run separately, expect no output):
--   grep -rIE 'ACCULYNX_[A-Z_]*KEY=[A-Za-z0-9]{12,}' schemas/ docs/ scripts/ \
--     skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md
```
Rename to "Phase 4 write-sweep gate"; keep the secret-leak grep companion verbatim (still relevant — same secret name family).

**Latest-batch CTE + three-assertion `union all` structure — copy verbatim, retarget table names** (lines 10-36):
```sql
with latest as (
  select probe_batch_id
  from public.acculynx_api_probe
  order by probed_at desc
  limit 1
),
batch as (
  select p.* from public.acculynx_api_probe p, latest l
  where p.probe_batch_id = l.probe_batch_id
)
-- (1) RECONCILIATION: every one of the 86 checklist GETs must appear in the batch
--     under SOME verdict. Expect 0 rows.
select 'unreconciled_op' as assertion, c.operation_id as detail
from public.acculynx_get_checklist c
where not exists (select 1 from batch b where b.probe_name = c.operation_id)

union all
-- (2) SHAPE-COMPLETENESS: no HTTP 200 row may have a null result_summary. Expect 0 rows.
select 'status200_null_summary', b.probe_name
from batch b
where b.http_status = 200 and b.result_summary is null

union all
-- (3) SANDBOX-ONLY: no row in the batch may be tagged a non-sandbox account. Expect 0 rows.
select 'non_sandbox_row', coalesce(b.source_account_key, '(null)')
from batch b
where b.source_account_key is distinct from 'sandbox';
```
Direct mirror: swap `acculynx_api_probe`→`acculynx_write_probe`, `acculynx_get_checklist`→`acculynx_write_checklist` (or whatever 183 names it), and comment `(1)` from "86 checklist GETs" to "38 checklist write endpoints." Assertions (2) and (3) carry over unchanged in spirit — `status200_null_summary` should generalize to "no 2xx row may have a null result_summary" (writes succeed on 200/201/202/204, not just 200 — e.g. `where b.http_status between 200 and 299 and b.result_summary is null`). Consider adding a 4th assertion specific to D-04/D-05: e.g. `blocked_by_dependency_missing_notes` (any `blocked-by-dependency` verdict row must carry evidence in `notes`/`result_summary`, not a bare verdict) — optional, planner's discretion, but flagged here since RESEARCH.md's Anti-Patterns section explicitly warns against "faking a dependency chain."

## Shared Patterns

### Hard Sandbox Gate (applies to `sweep.ts` + `index.ts`)
**Source:** `supabase/functions/acculynx-read-sweep/sweep.ts` lines 10-25, reused at `index.ts` lines 121-129 (call site)
**Apply to:** Both new Edge Function files. This is the single non-negotiable safety boundary per D-01 — must be present, unmodified in behavior, before any AccuLynx HTTP call.
```typescript
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";
export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(`acculynx-write-sweep is sandbox-only: refusing to resolve "${secretName}". Only ${SANDBOX_SECRET_NAME} is permitted.`);
  }
}
```

### PII Redaction (applies to `sweep.ts` probe/request payload storage)
**Source:** `supabase/functions/acculynx-read-sweep/sweep.ts` lines 56-83
**Apply to:** Every `payload_sample`/`request_body_sample` write into `acculynx_write_probe`.
(Full excerpt already given above under sweep.ts Pattern Assignments — reuse verbatim, no changes.)

### 429/Backoff Rate-Limit Handling (applies to `index.ts`'s HTTP call helper)
**Source:** `supabase/functions/acculynx-read-sweep/index.ts` lines 90-95 (the retry branch inside `acculynxGet`)
```typescript
if (res.status === 429 && attempt < MAX_RETRIES) {
  const ra = Number(res.headers.get("retry-after"));
  await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
  attempt++;
  continue;
}
```
**Apply to:** the write-sweep's generalized `acculynxCall(method, url, body)` helper — do not hand-roll a new retry loop (RESEARCH.md's explicit "Don't Hand-Roll" guidance).

### Request-Body Shape Builders — Address Asymmetry (applies to `sweep.ts` request-body construction, no read-sweep analog)
**Source:** `scripts/seed-sandbox-from-wichita.mjs` lines 38-53 (`addr()` builder, contact-side) and lines 106-116 (`jobAddr` inline construction, job-side)
```javascript
// Contact mailingAddress: state/country as OBJECTS (from seed-sandbox-from-wichita.mjs)
const addr = (a) => a && {
  street1: a.street1 ?? "1 Test St",
  street2: a.street2 ?? null,
  city: a.city ?? "Wichita",
  state: resolveState(a.state) ?? STATE_BY_ABBR.KS ?? null,
  zipCode: a.zipCode ?? null,
  country: (a.country && typeof a.country === "object" ? stripLink(a.country) : US),
};

// Job locationAddress: state/country as STRINGS (opposite convention — QUIRK, verified live)
const jobAddr = {
  street1: la.street1 ?? "1 Test St", street2: la.street2 ?? null, city: la.city ?? "Wichita",
  state: (resolveState(la.state) ?? STATE_BY_ABBR.KS ?? {}).abbreviation ?? "KS",
  zipCode: la.zipCode ?? null,
  country: "US",
};
```
**Apply to:** `sweep.ts`'s new `buildContactAddress()` / `buildJobAddress()` builders — port this exact object-vs-string asymmetry as two distinct functions (never share one builder between contact and job bodies, per RESEARCH.md Pitfall 1's explicit warning).

### Reference-Data Pre-Fetch for Dependency Seeding (applies to `index.ts`'s pre-flight seeding step)
**Source:** `scripts/seed-sandbox-from-wichita.mjs` lines 62-76 (`ref()` helper + parallel fetch of contact-types/job-categories/trade-types/lead-sources + `STATE_BY_ABBR` map)
```javascript
const ref = async (path) => (await (await fetch(`${B}${path}`, { headers: aHdr })).json()).items ?? [];
const [types, cats, trades, sources] = await Promise.all([
  ref("/contacts/contact-types"),
  ref("/company-settings/job-file-settings/job-categories"),
  ref("/company-settings/job-file-settings/trade-types"),
  ref("/company-settings/leads/lead-sources"),
]);
STATE_BY_ABBR = Object.fromEntries((await ref("/acculynx/countries/1/states")).map((s) => [s.abbreviation, stripLink(s)]));
```
**Apply to:** `index.ts`'s seeding step — this is exactly RESEARCH.md's Pattern 2 ("Seed prerequisite reference data") already proven live against the sandbox by the seeder script; reuse the parallel-`Promise.all` + `Object.fromEntries` map-building idiom rather than re-deriving it.

### Contact→Job Creation Chain (applies to `index.ts`'s deep-tier dependency walk)
**Source:** `scripts/seed-sandbox-from-wichita.mjs` lines 91-127 (full contact-create → job-create sequence, including the `contactTypeIds` requirement and `priority: "Normal"` fixture)
```javascript
const contactBody = {
  contactTypeIds: [defaultType],
  firstName: anonFirst(i), lastName: anonLast(i),
  phoneNumbers: [{ number: anonPhone(i), type: "Mobile", primary: true }],
  emailAddresses: [{ address: anonEmail(i), type: "Personal", primary: true }],
  mailingAddress: addr(r.locationAddress),
};
const c = await call("POST", "/contacts", contactBody);
const contactId = c.json?.id ?? c.json;
...
const jobBody = {
  contact: { id: contactId },
  locationAddress: jobAddr,
  jobCategory: cat ? { id: cat } : undefined,
  tradeTypes: (trade.length ? trade : [firstTrade]).filter(Boolean).map((id) => ({ id })),
  leadSource: firstSource ? { id: firstSource } : undefined,
  priority: "Normal",
};
const j = await call("POST", "/jobs", jobBody);
```
**Apply to:** the write-sweep's Tier-A dependency-root probes (`POST /contacts` then `POST /jobs`) — this is already-verified-working request-shape prior art (D-04/CONTEXT.md explicitly calls this file "prior art / seed data, not the harness" — use its shapes, don't re-derive them from scratch, but the write-sweep is the durable harness, not this script).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/knowledge-base/acculynx/ingestion/write-sweep.md` | doc (design/behavior description) | — | Prose-only design doc; mirrors `docs/knowledge-base/acculynx/ingestion/read-sweep.md` in structure but has no code pattern to extract — planner/writer should draft it after the code exists, following the read-sweep doc's section headings (not fetched in this pass; low-risk, purely descriptive) |
| `docs/37-acculynx-write-capability-matrix.md` (regeneration) | doc (generated) | — | Per D-03, generated from `acculynx_write_catalog` evidence rows via a SQL query once red-teaming completes — this is a data-export step, not a code pattern to copy |
| `docs/knowledge-base/acculynx/api/write-capability.md` (regeneration) | doc (generated) | — | Same as above; already contains 2026-06-30 findings to be superseded/folded into the generated version |
| `shouldStopProbing(history)` in `sweep.ts` | utility (pure function) | transform | No existing function in the codebase implements a "stop after N no-new-signal probes" rule; this is new logic specific to D-05's red-team stop rule — write fresh following the existing pure-function/`Deno.test`-friendly convention in `sweep.ts` |

## Metadata

**Analog search scope:** `supabase/functions/acculynx-read-sweep/`, `supabase/functions/acculynx-sync/lib/`, `schemas/cleverwork-roofer/165-181*.sql`, `scripts/acculynx-read-sweep-reconcile.sql`, `scripts/seed-sandbox-from-wichita.mjs`, `docs/37-acculynx-write-capability-matrix.md`, `docs/knowledge-base/acculynx/api/write-capability.md`
**Files scanned:** 11 read in full (all ≤ 312 lines; single-pass reads, no re-reads) — `acculynx-read-sweep/{sweep.ts, sweep.test.ts, index.ts}`, `acculynx-sync/lib/accounts.ts`, `schemas/cleverwork-roofer/{165,166,167}-*.sql`, `scripts/acculynx-read-sweep-reconcile.sql`, `scripts/seed-sandbox-from-wichita.mjs`, plus CONTEXT.md/RESEARCH.md
**Pattern extraction date:** 2026-07-01
