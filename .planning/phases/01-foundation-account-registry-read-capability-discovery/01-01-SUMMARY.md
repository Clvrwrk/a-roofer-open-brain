# 01-01 Summary — Schema Foundation

**Status:** Complete
**Date:** 2026-06-30
**Requirements:** REQ-02, REQ-05

## What was built

Three additive/idempotent migrations applied to prod Supabase (`rnhmvcpsvtqjlffpsayu`) via the Supabase MCP, plus the multi-key `.env.example` contract.

- **Migration 165 — `acculynx_accounts`** registry: 9 rows mapping every AccuLynx key (8 production locations/programs + sandbox) to `account_key`, `env_secret_name` (NAME only), `label`, `program`, `state`, `environment`. RLS enabled. Verified: `count=9`, environments `{production, sandbox}`, all 9 canonical `PE_CC_*_ACCULYNX_API_KEY` names; `MULTI_FAMILY_COMMERCIAL` normalized hyphen→underscore.
- **Migration 166 — catalog/probe DDL capture + `source_account_key`**: idempotent `CREATE TABLE IF NOT EXISTS` reproducing the live `acculynx_api_catalog` (15 cols) and `acculynx_api_probe` (13 cols) so the repo is source-of-truth; added `source_account_key` to both for sandbox-only sweep tagging. Verified: column present on both, probe rows still **198**, catalog **28** (no data loss).
- **Migration 167 — `acculynx_get_checklist`**: 86 GET operations generated directly from `openapi-index.json` (not by hand) with tier (A=25/B=44/C=17), pagination param (recordStartIndex=21, pageStartIndex=10), path params, includes flag, and probeability (3 webhook `tier_gated`, 5 Reports `unprobeable_no_seed`). `swept` flag for watermark-resume.
- **`config/.env.example`**: replaced the single `ACCULYNX_API_KEY` with the 9 per-account `PE_CC_*` key names (placeholders only).

## Key files

- `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql`
- `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql`
- `schemas/cleverwork-roofer/167-acculynx-get-checklist.sql`
- `config/.env.example`

## Verification

- `acculynx_accounts`: 9 rows, both environments, canonical names ✓
- `source_account_key` on probe + catalog; 198/28 rows intact ✓
- `acculynx_get_checklist`: 86 rows; 21/10 pagination split; 3 webhook; 5 reports unprobeable ✓
- No secret VALUE in any migration or `.env.example` (placeholders/names only) ✓

## Notes / follow-ups

- **Wave 2 dependency:** the sweep reads `PE_CC_SANDBOX_ACCULYNX_API_KEY` from **Supabase Edge secrets** — must be set (dashboard or CLI) before 01-02 runs. No MCP tool sets secrets.
- `acculynx_company_id` on each registry row is null until a probe backfills it (sandbox in 01-02; prod in Phase 2).

## Self-Check: PASSED
