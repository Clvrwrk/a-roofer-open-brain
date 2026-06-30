# Phase 2: Multi-Location Full Ingestion — Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 10 (3 migrations + 7 Edge Function TypeScript files)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql` | migration | CRUD (additive alter) | `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` | exact |
| `schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql` | migration | CRUD (additive alter + create) | `schemas/cleverwork-roofer/119-canonical-uom-columns.sql` | exact |
| `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql` | migration | transform (read-only view) | `schemas/cleverwork-roofer/100-invoice-line-audit.sql` (lines 43-68) | role-match |
| `supabase/functions/acculynx-sync/index.ts` | service | event-driven (fan-out sync) | `supabase/functions/acculynx-read-sweep/index.ts` | exact |
| `supabase/functions/acculynx-sync/lib/accounts.ts` | utility | request-response | `supabase/functions/acculynx-read-sweep/index.ts` (lines 11-28) | role-match |
| `supabase/functions/acculynx-sync/lib/watermark.ts` | utility | CRUD | `supabase/functions/acculynx-read-sweep/index.ts` (Supabase client pattern) | role-match |
| `supabase/functions/acculynx-sync/lib/diff.ts` | utility | batch | `supabase/functions/acculynx-read-sweep/index.ts` (upsert pattern) | role-match |
| `supabase/functions/acculynx-sync/resources/jobs.ts` | service | CRUD (incremental watermark) | `supabase/functions/acculynx-read-sweep/index.ts` (lines 73-99, acculynxGet + pagination) | exact |
| `supabase/functions/acculynx-sync/resources/contacts.ts` | service | CRUD (full sweep) | `supabase/functions/acculynx-read-sweep/index.ts` (lines 168-257, page loop) | exact |
| `supabase/functions/acculynx-sync/resources/estimates.ts` | service | CRUD (full sweep) | `supabase/functions/acculynx-read-sweep/index.ts` (lines 168-257, page loop) | exact |
| `supabase/functions/acculynx-sync/resources/job-walk.ts` | service | batch (job-walk + sub-resource) | `supabase/functions/acculynx-read-sweep/index.ts` (lines 101-119, HATEOAS harvest) | role-match |
| `supabase/functions/acculynx-sync/lib/accounts.test.ts` | test | — | `supabase/functions/acculynx-read-sweep/sweep.test.ts` | exact |
| `supabase/functions/acculynx-sync/lib/watermark.test.ts` | test | — | `supabase/functions/acculynx-read-sweep/sweep.test.ts` | exact |
| `supabase/functions/acculynx-sync/lib/diff.test.ts` | test | — | `supabase/functions/acculynx-read-sweep/sweep.test.ts` | exact |
| `supabase/functions/acculynx-sync/resources/job-walk.test.ts` | test | — | `supabase/functions/acculynx-read-sweep/sweep.test.ts` | exact |

---

## Pattern Assignments

### `schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql` (migration, CRUD additive alter)

**Analog:** `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql`

**Header comment pattern** (lines 1-13 of 166):
```sql
-- 166 — AccuLynx catalog/probe DDL capture + source_account_key tag (Phase 1, REQ-05)
--
-- <one sentence purpose>
-- <one sentence on additive/idempotent rationale>
-- <note: on live DB, CREATEs are no-ops; only real effect is the new columns>
-- Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).
```

**Additive ADD COLUMN pattern** (lines 49-56 of 166):
```sql
alter table public.acculynx_api_probe   add column if not exists source_account_key text;
alter table public.acculynx_api_catalog add column if not exists source_account_key text;

comment on column public.acculynx_api_probe.source_account_key is
  'AccuLynx account this probe ran against (acculynx_accounts.account_key). ...';
```

**DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern** (from `126-audit-views-repoint-complete-lines.sql` line 15):
```sql
ALTER TABLE public.invoice_line_audit DROP CONSTRAINT IF EXISTS invoice_line_audit_invoice_line_id_fkey;
```
Apply same pattern for the unique constraint replacement on `acculynx_sync_watermark`:
```sql
ALTER TABLE public.acculynx_sync_watermark
  DROP CONSTRAINT IF EXISTS acculynx_sync_watermark_resource_key,
  ADD CONSTRAINT acculynx_sync_watermark_account_resource UNIQUE (account_key, resource);
```

**Index pattern** (lines 55-56 of 166):
```sql
create index if not exists idx_acculynx_api_probe_batch  on public.acculynx_api_probe(probe_batch_id);
create index if not exists idx_acculynx_api_probe_source on public.acculynx_api_probe(source_account_key);
```

**RLS + grant pattern** (lines 59-61 of 166):
```sql
alter table public.acculynx_api_catalog enable row level security;
alter table public.acculynx_api_probe   enable row level security;
grant select on public.acculynx_api_catalog, public.acculynx_api_probe to authenticated, service_role;
```

---

### `schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql` (migration, additive create+alter)

**Analog:** `schemas/cleverwork-roofer/119-canonical-uom-columns.sql`

**Multi-column ADD COLUMN IF NOT EXISTS pattern** (lines 26-53 of 119):
```sql
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS ship_uom text
    GENERATED ALWAYS AS (NULLIF(raw->'shippedQty'->>'uom','')) STORED;
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS ship_qty numeric
    GENERATED ALWAYS AS (NULLIF(raw->'shippedQty'->>'value','')::numeric) STORED;
```
For migration 169, apply the same pattern per target table (one `ALTER TABLE` block per table, `ADD COLUMN IF NOT EXISTS` for each of `account_key`, `market`, `last_seen_by_api`, `archived_at`, `archive_reason`). Example:
```sql
ALTER TABLE public.acculynx_contacts
  ADD COLUMN IF NOT EXISTS account_key        text,
  ADD COLUMN IF NOT EXISTS market             text,
  ADD COLUMN IF NOT EXISTS last_seen_by_api   timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at        timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason     text;
```

**CREATE TABLE IF NOT EXISTS pattern** (from `164-invoice-register-export.sql` lines 13-24):
```sql
create table if not exists invoice_register_export (
  invoice_number       text primary key,
  register_exported_at timestamptz not null default now(),
  batch_id             uuid not null,
  ...
);
comment on table invoice_register_export is '...';
create index if not exists idx_invoice_register_export_batch on invoice_register_export(batch_id);
```
Use this structure for any of the 11 tables where DDL is being captured from scratch (table body not yet in repo).

**RLS pattern** (from 166, lines 59-61): Same `enable row level security` + `grant select` per table.

**Migration header note about DDL-gap closure** (from line 7 of 166):
```sql
-- On the live brain the tables already exist with data,
-- so the CREATEs are no-ops; the only real effect is adding <columns>.
```
Adapt to: "The 11 target tables were created in the live DB before DDL-in-repo discipline was established; `CREATE TABLE IF NOT EXISTS` is a no-op for existing tables; the real effects are the new `account_key`, `last_seen_by_api`, `archived_at`, `archive_reason` columns."

---

### `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql` (migration, read-only view)

**Analog:** `schemas/cleverwork-roofer/100-invoice-line-audit.sql` (lines 43-68) and `schemas/cleverwork-roofer/119-canonical-uom-columns.sql` (lines 61-73)

**CREATE OR REPLACE VIEW pattern** (from 119, lines 61-73):
```sql
CREATE OR REPLACE VIEW public.v_item_uom_map AS
SELECT
  item_number,
  mode() WITHIN GROUP (ORDER BY ship_uom)                AS ship_uom,
  ...
FROM public.abc_invoice_lines
WHERE price_uom IS NOT NULL
GROUP BY item_number;

COMMENT ON VIEW public.v_item_uom_map IS
  'Per-item canonical UOM map ...';
```

**Multi-CTE view pattern** (from 100, lines 43-63):
```sql
CREATE OR REPLACE VIEW public.v_invoice_line_audit_eval AS
WITH m AS (
  SELECT DISTINCT ON (l.id)
    l.id AS invoice_line_id, ...
  FROM ...
  JOIN ...
  WHERE ...
  ORDER BY l.id, ...
)
SELECT m.*, ... FROM m;
```
Apply to reconciliation view: wrap per-resource subqueries in a CTE or lateral subselect keyed on `(w.account_key, w.resource)`.

**Migration header note** (same pattern as 166 header): state that this creates a new view (`v_acculynx_reconciliation`) that did not previously exist, idempotent via `CREATE OR REPLACE`.

---

### `supabase/functions/acculynx-sync/index.ts` (service, event-driven fan-out sync)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts`

**Imports + Supabase client pattern** (lines 11-28 of index.ts):
```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assertSandbox, paginationParam, redactSample, SANDBOX_SECRET_NAME } from "./sweep.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PACE_MS = 130;            // ~8 req/s on the single sandbox key
const RUNTIME_BUDGET_MS = 110_000;
const MAX_RETRIES = 3;

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```
For `acculynx-sync/index.ts`: same imports. Remove `assertSandbox`/`SANDBOX_SECRET_NAME` as production keys are allowed; instead import `loadProductionAccounts` from `./lib/accounts.ts`.

**Runtime budget + deadline pattern** (lines 131-133 of index.ts):
```typescript
const started = Date.now();
const deadline = started + RUNTIME_BUDGET_MS;
const batchId = `sweep-${new Date(started).toISOString().replace(/[:.]/g, "-")}`;
```

**Deno.serve entry point + POST-only guard** (lines 121-130 of index.ts):
```typescript
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // ... setup, then:
  return json({ batch_id: batchId, ... });
});
```

**json() response helper** (lines 309-311 of index.ts):
```typescript
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
```

**429 retry / acculynxGet fetch pattern** (lines 73-99 of index.ts):
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
For `acculynx-sync`: promote `apiKey` to an explicit parameter of the fetch helper (not a module-level constant) to prevent cross-account key bleed:
```typescript
async function acculynxGet(url: string, apiKey: string): Promise<...> { ... }
```

**Budget check inside loop** (lines 170-171 of index.ts):
```typescript
if (Date.now() >= deadline) { bump("budget_skipped"); continue; }
```

---

### `supabase/functions/acculynx-sync/lib/accounts.ts` (utility, request-response)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (Supabase client query pattern, lines 135-140)

**Supabase query + error guard pattern** (lines 135-140 of index.ts):
```typescript
const { data: checklist, error: clErr } = await sb
  .from("acculynx_get_checklist")
  .select("operation_id, path, base_url, tier, path_params, pagination_param, includes_supported, probeability")
  .order("tier", { ascending: true })
  .order("operation_id", { ascending: true });
if (clErr) return json({ error: `checklist load: ${clErr.message}` }, 500);
```
Apply to `accounts.ts` as:
```typescript
export async function loadProductionAccounts(sb: SupabaseClient) {
  const { data: accounts, error } = await sb
    .from("acculynx_accounts")
    .select("account_key, env_secret_name, label, market, state")
    .eq("environment", "production")
    .eq("is_active", true)
    .order("account_key");
  if (error) throw new Error(`accounts load: ${error.message}`);
  return accounts ?? [];
}
```

**Secret resolution + skip-on-missing pattern** (from RESEARCH.md Pattern 1):
```typescript
const apiKey = Deno.env.get(acct.env_secret_name);
if (!apiKey) {
  console.warn(`[sync] secret ${acct.env_secret_name} not set — skipping ${acct.account_key}`);
  continue;
}
```

---

### `supabase/functions/acculynx-sync/lib/watermark.ts` (utility, CRUD)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (Supabase upsert pattern)

**Upsert pattern** (from index.ts lines 261-270):
```typescript
const { error } = await sb.from("acculynx_api_probe").insert(probeRows);
if (error) return json({ error: `probe insert: ${error.message}`, batch_id: batchId }, 500);

const { error: catErr } = await sb
  .from("acculynx_api_catalog")
  .upsert(catalogRows, { onConflict: "endpoint_pattern,method" });
if (catErr) console.warn(`[sweep] catalog upsert skipped: ${catErr.message}`);
```
Apply to watermark reads and writes:
```typescript
// Read watermark
export async function readWatermark(sb: SupabaseClient, accountKey: string, resource: string) {
  const { data, error } = await sb
    .from("acculynx_sync_watermark")
    .select("*")
    .eq("account_key", accountKey)
    .eq("resource", resource)
    .maybeSingle();
  if (error) throw new Error(`watermark read: ${error.message}`);
  return data;
}

// Advance watermark
export async function advanceWatermark(sb: SupabaseClient, row: WatermarkRow) {
  const { error } = await sb
    .from("acculynx_sync_watermark")
    .upsert(row, { onConflict: "account_key,resource" });
  if (error) console.warn(`[sync] watermark upsert: ${error.message}`);
}
```

---

### `supabase/functions/acculynx-sync/lib/diff.ts` (utility, batch)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (Supabase client, upsert + error pattern)

No direct fetch-layer analog exists in the codebase for the "mark not-seen" UPDATE pattern. The DB UPDATE is expressed via the Supabase JS client's `.update()`:
```typescript
// After a complete sweep for (accountKey, resource, sweepStartedAt):
export async function markNotSeen(
  sb: SupabaseClient,
  table: string,
  accountKey: string,
  sweepStartedAt: string,
) {
  const { error } = await sb
    .from(table)
    .update({ archived_at: new Date().toISOString(), archive_reason: "not_seen_in_api" })
    .eq("account_key", accountKey)
    .is("archived_at", null)
    .lt("last_seen_by_api", sweepStartedAt);
  if (error) console.warn(`[diff] markNotSeen on ${table}: ${error.message}`);
}
```
Error handling follows the `console.warn` best-effort pattern from the catalog upsert (line 270 of index.ts): diff detection failure is non-fatal; it is logged but does not abort the sync.

---

### `supabase/functions/acculynx-sync/resources/jobs.ts` (service, CRUD incremental watermark)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (lines 192-257, URL construction + page loop)

**URL construction + pagination loop pattern** (lines 192-215 of index.ts):
```typescript
const pp = row.pagination_param ?? paginationParam({ pagination_param: row.pagination_param });
let url = `${row.base_url}${resolvedPath}`;
const qs: string[] = [];
if (pp) qs.push(`pageSize=25`, `${pp}=0`);
if (qs.length) url += `?${qs.join("&")}`;

if (calls > 0) await sleep(PACE_MS);
const { status, ms, body, isJson } = await acculynxGet(url);
calls++;
```
For `jobs.ts` adapt as date-windowed loop with `recordStartIndex`:
```typescript
const BASE = "https://api.acculynx.com/api/v2";
let offset = 0;
while (Date.now() < deadline) {
  const url = `${BASE}/jobs?dateFilterType=ModifiedDate` +
    `&startDate=${wm.last_modified_date ?? acct.account_open_date}` +
    `&pageSize=25&recordStartIndex=${offset}` +
    `&sortBy=ModifiedDate&sortOrder=Ascending`;
  if (offset > 0) await sleep(PACE_MS);
  const { status, body } = await acculynxGet(url, apiKey);
  // ... upsert, advance watermark, break on empty page
}
```

**Upsert to target table** (adapted from catalog upsert, lines 265-270 of index.ts):
```typescript
const { error } = await sb
  .from("acculynx_jobs")
  .upsert(rows, { onConflict: "id,account_key" });
if (error) console.warn(`[jobs] upsert: ${error.message}`);
```

**Source/account stamping on every row** (pattern from RESEARCH.md Pattern 1):
Every object in `rows` must include `account_key: acct.account_key` and `market: acct.market`.

---

### `supabase/functions/acculynx-sync/resources/contacts.ts` (service, CRUD full sweep)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (lines 168-257, checklist loop with pagination)

**Full-sweep pagination loop** (same page-loop skeleton as jobs.ts, but with `pageStartIndex` and no date filter):
```typescript
let pageIndex = wm.last_page_index ?? 0;
while (Date.now() < deadline) {
  const url = `${BASE}/contacts?pageSize=50&pageStartIndex=${pageIndex}`;
  await sleep(PACE_MS);
  const { status, body } = await acculynxGet(url, apiKey);
  const items = (body as { items?: unknown[] })?.items ?? [];
  if (!items.length) break;      // confirmed full sweep complete
  // upsert, set last_seen_by_api = now() on each row
  // advance watermark.last_page_index = pageIndex + items.length
  pageIndex += items.length;
}
```

**paginationParam helper reuse** (from sweep.ts, lines 35-54):
```typescript
import { paginationParam } from "../../acculynx-read-sweep/sweep.ts";
// OR copy the helper into acculynx-sync/lib/ — either is valid
```
Note: RESEARCH.md says to read `pagination_param` from `acculynx_get_checklist` or use the reference table. For contacts, `pageStartIndex` is known-constant; no dynamic lookup needed. Use the literal, or call `paginationParam({ pagination_param: "pageStartIndex" })` for explicitness.

---

### `supabase/functions/acculynx-sync/resources/estimates.ts` (service, CRUD full sweep)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` — identical structure to `contacts.ts` above.

Same full-sweep loop pattern as contacts.ts. Differences:
- Endpoint: `/estimates?pageSize=50&pageStartIndex=${pageIndex}`
- Target table: `acculynx_estimates`
- Upsert conflict target: `(id, account_key)` (verify against live schema in Task 0)
- Stamp `job_id` from the estimate's `jobId` field on upsert.

---

### `supabase/functions/acculynx-sync/resources/job-walk.ts` (service, batch job-walk + sub-resources)

**Analog:** `supabase/functions/acculynx-read-sweep/index.ts` (lines 101-119, HATEOAS harvest + inner loop)

**HATEOAS ID harvesting pattern** (lines 101-119 of index.ts):
```typescript
function harvest(op: string, body: unknown, seeds: Record<string, string[]>) {
  const rules = HARVEST[op];
  if (!rules) return;
  for (const r of rules) {
    let ids: string[] = [];
    if (r.from === "items") {
      const items = (body as { items?: unknown[] })?.items ?? [];
      ids = (Array.isArray(items) ? items : [])
        .map((it) => (it as { id?: string })?.id)
        .filter(Boolean) as string[];
    } else {
      const id = (body as { id?: string })?.id;
      if (id) ids = [id];
    }
    ...
  }
}
```
Apply to invoice two-level walk:
```typescript
// Level 1: GET /jobs/{jobId}/invoices → list of invoice IDs
const invList = await acculynxGet(`${BASE}/jobs/${jobId}/invoices?pageSize=25&pageStartIndex=0`, apiKey);
const invoiceIds = ((invList.body as { items?: {id:string}[] })?.items ?? []).map(i => i.id);

// Level 2: GET /invoices/{invoiceId} → detail + line items
for (const invoiceId of invoiceIds) {
  await sleep(PACE_MS);
  const detail = await acculynxGet(`${BASE}/invoices/${encodeURIComponent(invoiceId)}`, apiKey);
  // upsert header to acculynx_invoices, lines to acculynx_invoice_lines
}
```

**Budget check inside inner loop** (from index.ts lines 170-171):
```typescript
if (Date.now() >= deadline) break;  // stop cleanly; watermark already advanced to last jobId
```
Advance `watermark.last_walked_job_id = jobId` after EACH job, before checking the budget — ensures resumption picks up from the next job.

---

### `supabase/functions/acculynx-sync/lib/*.test.ts` and `resources/job-walk.test.ts` (tests)

**Analog:** `supabase/functions/acculynx-read-sweep/sweep.test.ts`

**Test file header + imports** (lines 1-11 of sweep.test.ts):
```typescript
// Deno smoke tests for the acculynx-read-sweep core (plan 01-02 Task 1).
// Run: deno test supabase/functions/acculynx-read-sweep/sweep.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertSandbox, paginationParam, pathParams, redactSample, SANDBOX_SECRET_NAME } from "./sweep.ts";
```

**Deno.test structure** (lines 12-23 of sweep.test.ts):
```typescript
Deno.test("assertSandbox throws for any production key name", () => {
  for (const prod of ["PE_CC_KANSAS_CITY_ACCULYNX_API_KEY", ...]) {
    assertThrows(() => assertSandbox(prod), Error, "sandbox-only");
  }
});
```
Tests for Phase 2 libs must be pure unit tests — no live DB or network. Inject `sb` as a mock/stub. Mirror the assertion-per-behavior structure: one `Deno.test` block per distinct behavior (fan-out filters production only, account_key stamped, watermark keyed by tuple, markNotSeen calls `.update()` not `.delete()`, etc.).

**Run command** (from RESEARCH.md Validation Architecture):
```
deno test supabase/functions/acculynx-sync/lib/ --allow-env
```

---

## Shared Patterns

### Supabase Client Initialization
**Source:** `supabase/functions/acculynx-read-sweep/index.ts` lines 21-22, 27
**Apply to:** `index.ts`, `lib/accounts.ts`, `lib/watermark.ts`, `lib/diff.ts`
```typescript
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
```

### Rate-Limiting (PACE_MS + sleep)
**Source:** `supabase/functions/acculynx-read-sweep/index.ts` lines 23, 200
**Apply to:** Every resource module that calls AccuLynx (`jobs.ts`, `contacts.ts`, `estimates.ts`, `job-walk.ts`)
```typescript
const PACE_MS = 130;   // ~8 req/s; must be per-account, not shared across the account loop
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Usage:
if (calls > 0) await sleep(PACE_MS);
```

### 429 Retry + Exponential Backoff
**Source:** `supabase/functions/acculynx-read-sweep/index.ts` lines 73-99 (`acculynxGet`)
**Apply to:** All resource modules — do NOT hand-roll; extract into `lib/` or pass as a dependency
```typescript
if (res.status === 429 && attempt < MAX_RETRIES) {
  const ra = Number(res.headers.get("retry-after"));
  await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
  attempt++;
  continue;
}
```
**CRITICAL change for acculynx-sync:** `apiKey` must be an explicit parameter of `acculynxFetch`, not a module-level constant, to prevent cross-account key bleed (RESEARCH.md Pitfall 3).

### Additive Idempotent SQL — Hard Rule 1
**Source:** `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` lines 49-56; `schemas/cleverwork-roofer/119-canonical-uom-columns.sql` lines 26-53
**Apply to:** All three migration files (168, 169, 170)
- Use `ADD COLUMN IF NOT EXISTS` — never `ALTER COLUMN` with a type change
- Use `CREATE TABLE IF NOT EXISTS` — never `DROP TABLE`
- Use `CREATE OR REPLACE VIEW` — never `DROP VIEW`
- Use `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT` when replacing a unique constraint
- Use `CREATE INDEX IF NOT EXISTS` — never `DROP INDEX`

### Secret Resolution — Hard Rule 2
**Source:** `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql` (comments lines 7-13); `supabase/functions/acculynx-read-sweep/sweep.ts` line 11
**Apply to:** `lib/accounts.ts`, `index.ts`
```typescript
// Only the secret NAME lives in the DB (acculynx_accounts.env_secret_name).
// The value is resolved only at runtime:
const apiKey = Deno.env.get(acct.env_secret_name);
if (!apiKey) {
  console.warn(`[sync] secret ${acct.env_secret_name} not set — skipping ${acct.account_key}`);
  continue;
}
```
Never store or log the resolved `apiKey` value.

### Account Stamping on Every Upserted Row
**Source:** RESEARCH.md Pattern 1; `supabase/functions/acculynx-read-sweep/index.ts` lines 229-243 (`source_account_key: SOURCE_ACCOUNT` on every probe row)
**Apply to:** All resource modules
```typescript
// On every upserted row object:
{
  ...apiRow,
  account_key: acct.account_key,   // NOT NULL constraint on all target tables (mig 169)
  market: acct.market,
  last_seen_by_api: new Date().toISOString(),
}
```

### RLS + Grant Pattern
**Source:** `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql` lines 52-54; `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` lines 59-61
**Apply to:** All new/altered tables in migrations 168-169; the view in migration 170
```sql
alter table public.<table> enable row level security;
grant select on public.<table> to authenticated, service_role;
```

### Migration File Header Comment
**Source:** `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` lines 1-13
**Apply to:** All three migrations (168, 169, 170)
Standard pattern: migration number, descriptive title, phase+REQ reference, one-paragraph rationale, explicit "Additive + idempotent; no DROP/TRUNCATE (hard rule 1)."

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/acculynx-reconcile-check.sql` | utility script | transform | No standalone SQL smoke-test script exists yet in `scripts/`; use the reconciliation view pattern from mig 170 and write a simple `SELECT * FROM v_acculynx_reconciliation WHERE delta_pct > 5` query |

---

## Metadata

**Analog search scope:**
- `supabase/functions/acculynx-read-sweep/` (3 files, fully read)
- `schemas/cleverwork-roofer/` migrations 100, 105, 108, 116, 119, 126, 164, 165, 166, 167 (fully or partially read)

**Files scanned:** 13 source files

**Pattern extraction date:** 2026-06-30
