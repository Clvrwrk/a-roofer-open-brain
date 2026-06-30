# 01-02 Summary — Sandbox Read-Sweep Driver

**Status:** Complete
**Date:** 2026-06-30
**Requirements:** REQ-05

## What was built

- **`supabase/functions/acculynx-read-sweep/sweep.ts`** — pure sweep core: `assertSandbox` (throws unless the secret name is `PE_CC_SANDBOX_ACCULYNX_API_KEY`), `paginationParam` (recordStartIndex > pageStartIndex > null), `redactSample` (masks homeowner-PII values to shape tokens), `pathParams`. 6/6 deno tests green.
- **`supabase/functions/acculynx-read-sweep/index.ts`** — the driver: loads the 86-GET checklist, runs a Tier A→B→C HATEOAS list→detail walk, paces ≤8 req/s with 429 backoff + 110s budget, redacts PII, and writes one `acculynx_api_probe` row per checklist op (tagged `source_account_key='sandbox'`) plus best-effort catalog upsert. Deployed via Supabase MCP (v1, `verify_jwt` on).
- **Sandbox secret** `PE_CC_SANDBOX_ACCULYNX_API_KEY` set as a Supabase Edge secret (via CLI from local `.env`).

## Sweep result (batch `sweep-2026-06-30T10-38-31-506Z`)

- 86 probe rows for 86 checklist ops; 64 live sandbox calls; 18.1s runtime.
- Verdicts: **52× 200**, 6× empty, 2× 204, 2× 400, 1× 404, 1× 416, 22× unprobeable (5 Reports + 17 unseeded).
- Sandbox data is sparse: **1 job, 1 contact, 1 supplement** (A1 risk realized) → deep Tier B/C chains correctly recorded `unprobeable`/`empty`, not failures.

## Verification (DB assertions)

- batch rows = 86; every checklist op represented (unreconciled ops = **0**) ✓
- `source_account_key` distinct = `{sandbox}`; non-sandbox rows = **0** (sandbox-only proven) ✓
- 200-status rows with NULL `result_summary` = **0** (every success captured a real shape) ✓
- 34 rows carry redacted PII; unit test proves `jobName` masking ✓

## Notes / follow-ups

- **Sparse sandbox** limits Tier B/C coverage to whatever 1 seed record exposes. Phase 4 (write-seeding) can create disposable sandbox jobs/contacts/estimates to deepen the read matrix on a re-run. The sweep is idempotent (re-run appends a fresh batch).
- `acculynx_accounts.acculynx_company_id` for sandbox not yet backfilled (optional) — `getCompanySettings` returned 200, so a later backfill can bind it.
- The hyphenated `PE_CC_MULTI-FAMILY_COMMERCIAL_...` var name in local `.env` breaks the Supabase CLI's dotenv parser — rename `-`→`_` before Phase 2 sets the 8 production secrets.

## Self-Check: PASSED
