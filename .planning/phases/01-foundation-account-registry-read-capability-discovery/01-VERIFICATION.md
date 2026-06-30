---
phase: 1
slug: foundation-account-registry-read-capability-discovery
status: passed
verified: 2026-06-30
---

# Phase 1 — Verification (goal-backward)

**Goal:** Every AccuLynx account is catalogued and the complete READ capability surface is
proven and documented from the sandbox, with the knowledge bundle scaffolded.

All four success criteria are provably TRUE.

| # | Success criterion | Evidence | Verdict |
|---|---|---|---|
| 1 | `acculynx_accounts` maps all 9 keys → location/program, market, state, environment; secrets out of repo | `select count(*)=9`, environments `{production,sandbox}`, 9 canonical `env_secret_name` names; no value in any migration (migration 165) | ✅ |
| 2 | Every documented GET (86) called against the sandbox; real shapes recorded | sandbox batch `sweep-2026-06-30T10-38-31-506Z`: 86 probe rows, 0 unreconciled ops, 0 rows with 200+null summary, accounts = `{sandbox}` only | ✅ |
| 3 | Read-capability matrix doc reconciled vs published reference | `docs/65` (86 rows, evidence-linked); `scripts/acculynx-read-sweep-reconcile.sql` 3 assertions all return 0 | ✅ |
| 4 | In-repo OKF knowledge bundle (who/what/how/why/where/when) + repo pointer routes agents to it | `docs/knowledge-base/acculynx/` (14 conformant OKF concepts); `knowledge-folder.md` wired into `acculynx-api` SKILL | ✅ |

## Sandbox-only mandate

Proven both in code (`assertSandbox` throws on any non-sandbox key; 6/6 deno tests) and in
data (zero non-sandbox-tagged probe rows). No production account was touched in Phase 1.

## Requirement coverage

- REQ-02 → criterion 1 (registry); REQ-05 → criteria 2+3 (sweep + matrix); REQ-01 → criterion 4 (OKF bundle).

## Scope note

REQ-01's "Google OKF folder" was clarified to **OKF = Open Knowledge Format** (in-repo
markdown bundle), not Google Drive. A Drive folder was dropped as redundant.

## Carry-forward to later phases

- Sandbox is sparse (1 job/1 contact/1 supplement) → Phase 4 write-seeding deepens the read matrix on a re-run.
- `PE_CC_MULTI-FAMILY_COMMERCIAL_...` hyphen in local `.env` breaks the Supabase CLI dotenv parser — rename `-`→`_` before Phase 2 sets the 8 production secrets.
- `acculynx_company_id` per-account binding deferred (sandbox `getCompanySettings` returned 200; backfill later).

**Status: PASSED**
