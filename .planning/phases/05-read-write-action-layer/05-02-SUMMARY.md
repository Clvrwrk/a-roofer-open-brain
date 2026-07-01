---
phase: 05-read-write-action-layer
plan: 02
subsystem: db
tags: [supabase, migration, ddl, acculynx, write-action, idempotency, audit-log]

# Dependency graph
requires:
  - phase: 05-read-write-action-layer
    plan: 01
    provides: "the acculynx-write-action index.ts consumer contract (exact column names this DDL matches: work_key, status, exec_result, idempotency_key, lane, account_key, target_env, request_method, request_path, request_body_sample, response_body, http_status)"
provides:
  - "schemas/cleverwork-roofer/184-acculynx-pending-write-ddl.sql — acculynx_pending_write table DDL (APPLIED to prod rnhmvcpsvtqjlffpsayu 2026-07-01)"
  - "schemas/cleverwork-roofer/185-acculynx-write-action-log-ddl.sql — acculynx_write_action_log table DDL (APPLIED to prod rnhmvcpsvtqjlffpsayu 2026-07-01)"
affects: [05-03-work-queue-surface, 05-04-decision-endpoint-invocation]
applied_to_prod: "2026-07-01 — migrations 184 + 185 applied to rnhmvcpsvtqjlffpsayu via Supabase MCP apply_migration; verified live: 2 tables, 6 indexes, 3 CHECK constraints (lane/target_env/status), 1 FK, RLS enabled on both, idempotent re-run = clean no-op. Task 2 blocking checkpoint CLOSED."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive/idempotent DDL (create table/index if not exists, CHECK-enum, enable RLS + explicit grants) mirroring migration 182's shape (hard rule 1)"
    - "Two distinct tables — pending-write lifecycle state (184) and immutable write-action audit log (185) — kept separate from each other and from the consent-domain atom_access_log (hard rule 6)"

key-files:
  created:
    - schemas/cleverwork-roofer/184-acculynx-pending-write-ddl.sql
    - schemas/cleverwork-roofer/185-acculynx-write-action-log-ddl.sql
  modified: []

key-decisions:
  - "Reconciled the PLAN.md column contract with the ALREADY-IMPLEMENTED consumer code in supabase/functions/acculynx-write-action/index.ts (Plan 05-01, committed prior to this plan): index.ts's persistExecutionResult() writes acculynx_write_action_log rows with columns lane, account_key, target_env, idempotency_key, request_method, request_path, request_body_sample, response_body, http_status, status, created_at — and updates acculynx_pending_write by work_key with status/exec_result/updated_at. 185's DDL uses these exact column names (plus additive pending_write_id/work_key/actor columns for FK traceability) rather than the plan's illustrative request_sample/response_sample/outcome/actor-only shape, so the already-shipped edge function's inserts/updates succeed against this schema without modification."
  - "185's status CHECK uses ('success','failed') to match index.ts's literal success/failed strings, not the plan's illustrative ('executed','failed') outcome enum — this is the same two-terminal-outcome concept, aligned to the actual caller."
  - "Reworded the 'no DROP/TRUNCATE' file-header comment to 'nothing destructive' after discovering the literal substring 'TRUNCATE' inside an explanatory comment tripped the plan's own verify-gate grep (case-insensitive match on the word 'truncate' appearing in prose, not SQL). No DDL statement changed — this was a comment-wording fix to pass the automated gate cleanly."
  - "acculynx_pending_write's lane CHECK enumerates exactly the 17 WriteLane names from action.ts (postContact, postJob, postJobPaymentReceived, postJobPaymentExpense, putJobAddress, putJobInitialAppointment, putJobInsurance, putJobInsuranceCompany, putJobLeadSource, putJobPriority, deleteJobArOwner, deleteJobSalesOwner, postWorksheetItem, postJobMessage, postJobPhotosVideos, postJobRepresentativeCompany, postJobExternalReference) — verified against the LANES object and 05-01-SUMMARY.md's lane list, not re-derived independently."

requirements-completed: []

coverage:
  - id: D1
    description: "184/185 SQL files exist, use create-table-if-not-exists, contain no destructive DDL, lane CHECK lists exactly the 17 lane names, idempotency_key and work_key are UNIQUE, both tables enable RLS with service-role-scoped grants"
    requirement: "REQ-08"
    verification:
      - kind: other
        ref: "grep -qi 'create table if not exists public.acculynx_pending_write' 184-*.sql && grep -qi 'create table if not exists public.acculynx_write_action_log' 185-*.sql && ! grep -riE 'drop table|truncate|drop column' 184-*.sql 185-*.sql"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both tables applied to prod rnhmvcpsvtqjlffpsayu and verifiably exist there; unique indexes and CHECK constraints present; re-apply is a clean no-op"
    requirement: "REQ-08"
    verification:
      - kind: manual
        ref: "checkpoint:human-verify Task 2 — NOT performed by this executor per explicit scope boundary (apply-to-prod is a human/orchestrator action, not an autonomous one)"
        status: pending
    human_judgment: true
    rationale: "Task 2 is a [BLOCKING] checkpoint requiring a human (or the orchestrator with explicit authorization) to invoke the Supabase MCP apply_migration/execute_sql path against the shared prod project. This executor was explicitly instructed NOT to touch prod rnhmvcpsvtqjlffpsayu and to return a CHECKPOINT REACHED message instead. No build/type-check substitutes for live DB verification here — the tables do not exist in prod as of this SUMMARY."

# Metrics
duration: 20min
completed: 2026-07-01
status: in-progress
---

# Phase 5 Plan 2: Pending-Write + Write-Action-Log Migrations Summary

**Two additive/idempotent SQL migrations (184 pending-write lifecycle, 185 immutable write-action audit log) written and committed; NOT yet applied to prod — Task 2's apply-to-prod is a blocking human checkpoint, unmet by design.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-01 (Task 1 only; Task 2 pending)
- **Tasks:** 1/2 completed (Task 2 is a blocking checkpoint, intentionally not executed)
- **Files modified:** 2 created

## Accomplishments

- Wrote `184-acculynx-pending-write-ddl.sql`: `create table if not exists public.acculynx_pending_write` with the full column contract from PLAN.md (work_key, lane, target_env, account_key, endpoint, payload, dry_run_render, idempotency_key, status, approver, exec_result, department, created_by, created_at, updated_at). The `lane` CHECK enumerates exactly the 17 proven-safe `WriteLane` names from `action.ts`. Two unique indexes (`idx_acculynx_pending_write_idempotency` on `idempotency_key`, `idx_acculynx_pending_write_work_key` on `work_key`) plus a non-unique status index. RLS enabled; `service_role`-only grant (select/insert/update) — no blanket authenticated/anon grant, per D-02's sole-code-path boundary and the dashboard's service-role read pattern in `live-work.ts`.
- Wrote `185-acculynx-write-action-log-ddl.sql`: `create table if not exists public.acculynx_write_action_log`, an immutable per-write audit row. Column names were reconciled against the ALREADY-SHIPPED `supabase/functions/acculynx-write-action/index.ts` (Plan 05-01) rather than PLAN.md's illustrative shape alone — `persistExecutionResult()` in that file writes `lane`, `account_key`, `target_env`, `idempotency_key`, `request_method`, `request_path`, `request_body_sample`, `response_body`, `http_status`, `status` (`'success'`/`'failed'`), `created_at`; this DDL uses those exact names, plus additive `pending_write_id` (FK to 184), `work_key`, and `actor` columns for traceability. RLS enabled; `service_role`-only grant with `select, insert` only — no update/delete grant to any role, enforcing append-only immutability at the grant layer, not just by convention.
- Both files pass the plan's automated verify gate: `create table if not exists` present for both tables, zero destructive DDL (`DROP TABLE`/`TRUNCATE`/`DROP COLUMN`), confirmed via the exact grep command in PLAN.md's `<verify>` block.
- Committed as `ae60c08`: `feat(05-02): add pending-write + write-action-log migrations (184/185)`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migrations 184 (pending-write) and 185 (write-action-log)** - `ae60c08` (feat)
2. **Task 2: [BLOCKING] Apply migrations 184/185 to prod rnhmvcpsvtqjlffpsayu** - NOT PERFORMED (blocking human checkpoint; see below)

## Task 2 — Blocking Checkpoint (Not Performed)

Per this plan's explicit scope boundary and the executor's instructions, Task 2 (applying the migrations to the shared prod project `rnhmvcpsvtqjlffpsayu`) was NOT performed by this execution pass. The Supabase MCP `apply_migration`/`execute_sql` tools were not invoked; the prod database was not touched.

**What a human (or an explicitly-authorized follow-up agent) must do to close this checkpoint:**

1. Apply `184-acculynx-pending-write-ddl.sql` to project `rnhmvcpsvtqjlffpsayu` via the Supabase MCP `apply_migration` (or `execute_sql`) path — the SAME path migrations 182/183 used in Phase 4. This repo does NOT use `supabase db push`.
2. Apply `185-acculynx-write-action-log-ddl.sql` the same way, immediately after 184 (185 has a foreign key to 184's `id` column).
3. Verify both tables exist live:
   ```sql
   select table_name from information_schema.tables
   where table_name in ('acculynx_pending_write', 'acculynx_write_action_log');
   ```
   Confirm BOTH rows return.
4. Verify the unique indexes and CHECK constraints landed:
   ```sql
   select indexname from pg_indexes
   where tablename = 'acculynx_pending_write'
     and indexname in ('idx_acculynx_pending_write_idempotency', 'idx_acculynx_pending_write_work_key');

   select conname, pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.acculynx_pending_write'::regclass and contype = 'c';
   ```
   Confirm both index names return and the `lane`/`target_env`/`status` CHECK constraints are present.
5. Confirm idempotency: re-run both DDL files a second time against the same prod project — must be a clean no-op (no error).

**Expected outcome:** both tables live in prod, indexes + CHECKs present, re-apply is a clean no-op.

## Column Contract (final, as written to disk)

**`acculynx_pending_write`** (184):
- `id integer generated always as identity primary key`
- `work_key text not null` (UNIQUE via `idx_acculynx_pending_write_work_key`)
- `lane text not null check (lane in (17 WriteLane names))`
- `target_env text not null default 'sandbox' check (target_env in ('sandbox','prod'))`
- `account_key text not null`
- `endpoint text not null`
- `payload jsonb not null`
- `dry_run_render jsonb`
- `idempotency_key text not null` (UNIQUE via `idx_acculynx_pending_write_idempotency`)
- `status text not null default 'pending_review' check (status in ('pending_review','approved','executed','rejected','failed'))`
- `approver text`
- `exec_result jsonb`
- `department text`
- `created_by text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**`acculynx_write_action_log`** (185):
- `id integer generated always as identity primary key`
- `pending_write_id integer references public.acculynx_pending_write(id)`
- `work_key text`
- `lane text not null`
- `target_env text not null`
- `account_key text not null`
- `idempotency_key text not null`
- `actor text`
- `request_method text`
- `request_path text`
- `request_body_sample jsonb`
- `response_body jsonb`
- `http_status integer`
- `status text not null check (status in ('success','failed'))`
- `created_at timestamptz not null default now()`

## Lane CHECK List (exactly 17, verified against action.ts's LANES + 05-01-SUMMARY.md)

`postContact`, `postJob`, `postJobPaymentReceived`, `postJobPaymentExpense`, `putJobAddress`, `putJobInitialAppointment`, `putJobInsurance`, `putJobInsuranceCompany`, `putJobLeadSource`, `putJobPriority`, `deleteJobArOwner`, `deleteJobSalesOwner`, `postWorksheetItem`, `postJobMessage`, `postJobPhotosVideos`, `postJobRepresentativeCompany`, `postJobExternalReference`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Column-name alignment with already-shipped consumer code (185)**
- **Found during:** Task 1 (writing 185's DDL)
- **Issue:** PLAN.md's illustrative column contract for `acculynx_write_action_log` (`request_sample`, `response_sample`, `outcome`) does not match the column names `supabase/functions/acculynx-write-action/index.ts`'s `persistExecutionResult()` already writes in production code committed under Plan 05-01 (`request_method`, `request_path`, `request_body_sample`, `response_body`, `status` with values `'success'`/`'failed'`). Since 05-01's code is already committed and this DDL must support it without modification, using the plan's illustrative names verbatim would have made the already-shipped edge function's inserts fail against the real schema.
- **Fix:** Used the exact column names and CHECK values (`status in ('success','failed')`) that `index.ts` already writes, while keeping the plan's additional `pending_write_id`/`work_key`/`actor` columns as an additive superset for FK traceability.
- **Files modified:** `schemas/cleverwork-roofer/185-acculynx-write-action-log-ddl.sql`
- **Commit:** `ae60c08`

**2. [Rule 3 - Blocking] Verify-gate false positive from a comment string**
- **Found during:** Task 1 verification (running the plan's exact grep gate)
- **Issue:** The file-header comment "no DROP/TRUNCATE, no retype, no data touch (hard rule 1)" contains the literal substring "TRUNCATE" in prose, which the case-insensitive verify grep `grep -riE 'drop table|truncate|drop column'` matched as a false positive, blocking the gate from passing even though no SQL statement was destructive.
- **Fix:** Reworded the comment to "nothing destructive, no retype, no data touch (hard rule 1)" in both files — no DDL change, comment-only.
- **Files modified:** `schemas/cleverwork-roofer/184-acculynx-pending-write-ddl.sql`, `schemas/cleverwork-roofer/185-acculynx-write-action-log-ddl.sql`
- **Commit:** `ae60c08`

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

**Task 2 is a blocking checkpoint requiring human action** (or an explicitly-authorized follow-up execution pass with prod DB access): apply migrations 184 and 185 to `rnhmvcpsvtqjlffpsayu` via the Supabase MCP `apply_migration`/`execute_sql` path, then verify both tables exist live with their unique indexes and CHECK constraints, per the steps listed above. This executor did not touch prod per its explicit scope boundary.

## Next Phase Readiness

- Plan 05-03 (work-queue surface loader, `loadPendingAccuLynxWriteSurface()`) and Plan 05-04 (decision-endpoint invocation) both read/write `acculynx_pending_write` and `acculynx_write_action_log` — they cannot be verified end-to-end against a live database until Task 2's checkpoint closes.
- `supabase/functions/acculynx-write-action/index.ts` (Plan 05-01, already shipped) will begin succeeding its persistence calls (currently degrading gracefully with `console.warn`) the moment these tables exist in prod — no code change required on that side.
- Do NOT mark this plan (05-02) complete in ROADMAP.md — it has an unmet blocking checkpoint (Task 2). STATE.md/ROADMAP.md should reflect "in progress" until a human confirms the migrations are applied and verified live.

---
*Phase: 05-read-write-action-layer*
*Status: in-progress (Task 1 complete, Task 2 blocked on human apply-to-prod checkpoint)*

## Self-Check: PASSED

- FOUND: schemas/cleverwork-roofer/184-acculynx-pending-write-ddl.sql
- FOUND: schemas/cleverwork-roofer/185-acculynx-write-action-log-ddl.sql
- FOUND commit ae60c08 (Task 1)
