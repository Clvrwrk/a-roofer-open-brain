---
phase: 1
slug: foundation-account-registry-read-capability-discovery
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-30
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 1 has no application UI; validation is assertion-via-DB-query (Supabase REST/SQL against the live `acculynx_accounts` / `acculynx_api_catalog` / `acculynx_api_probe` tables) plus a lightweight Deno smoke harness for the sweep driver.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | DB-assertion (Supabase REST + SQL via MCP/curl) + Deno smoke test for the driver (`deno test`) |
| **Config file** | none — Wave 0 seeds the checklist + creates the registry |
| **Quick run command** | single-requirement SQL/REST query (e.g. registry row count, probed-endpoint count) |
| **Full suite command** | reconciliation script: distinct probed `endpoint_pattern` ⊇ 86-op checklist + matrix-row-count + secret-leak grep |
| **Estimated runtime** | ~10–60s (a sandbox sweep is ~200–400 calls at ≤8 req/s) |

---

## Sampling Rate

- **After every task commit:** Run the relevant single-requirement query (registry rows, checklist rows, batch probe count).
- **After every plan wave:** Run the full reconciliation — probed-vs-checklist + matrix-row-count + secret-leak grep.
- **Before `/gsd-verify-work`:** All four phase success criteria provably TRUE via SQL/REST + the two manual checks (Drive folder opens, matrix doc exists).
- **Max feedback latency:** ~60 seconds.

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T3-checklist-seed | 0 | REQ-05 | — | N/A | integration (SQL) | `select count(*) from acculynx_get_checklist` ≈ 86 | ❌ W0 | ⬜ pending |
| 01-01-T1-registry-migration | 0 | REQ-02 | T-1-secret-leak | env-name-only; no value in DB | integration (SQL) | `select count(*), array_agg(distinct environment) from acculynx_accounts` → 9, {production,sandbox} | ❌ W0 | ⬜ pending |
| 01-01-T1/T3-secret-guard | 0 | REQ-02 | T-1-secret-leak | no secret value committed | security smoke | `grep -rIE 'acculynx.*=.{20,}' schemas/ .planning/` returns nothing | ❌ W0 | ⬜ pending |
| 01-01-T2-probe-tables-ddl | 0 | REQ-05 | — | repo is source-of-truth for live tables | integration (SQL) | `CREATE TABLE IF NOT EXISTS` applies cleanly (idempotent) | ❌ W0 | ⬜ pending |
| 01-02-T1-sandbox-hard-gate | 1 | REQ-05 | T-1-prod-probe | throws unless env == sandbox | unit (deno test) | `deno test` on the gate fn passes; sweep refuses non-sandbox key | ❌ W0 | ⬜ pending |
| 01-02-T2-tierA-sweep | 1 | REQ-05 | T-1-prod-probe | sandbox-tagged rows only | integration | distinct Tier-A `endpoint_pattern` in batch == Tier-A checklist | ✅ (probe table live) | ⬜ pending |
| 01-02-T2-tierBC-sweep | 1 | REQ-05 | T-1-pii | shapes stored, PII redacted in payload_sample | integration | `select count(*) from acculynx_api_probe where probe_batch_id=$B and http_status=200 and result_summary is null` = 0 | ✅ | ⬜ pending |
| 01-03-T1-reconciliation | 2 | REQ-05 | — | N/A | integration | distinct probed endpoints (any verdict) ⊇ 86-op checklist | ❌ W0 | ⬜ pending |
| 01-03-T1-read-matrix-doc | 2 | REQ-05 | — | N/A | repo smoke | `test -f docs/65-acculynx-read-capability-matrix.md`; ~86 rows | ❌ W0 | ⬜ pending |
| 01-03-T3-drive-folder | 2 | REQ-01 | T-1-secret-leak | no secrets in folder | manual + repo smoke | folder URL opens; `test -f skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `acculynx_get_checklist` seed table (or static checklist file) populated from `openapi-index.json` — the 86 GETs with tier (A/B/C), pagination param, path params, includes.
- [ ] `acculynx_accounts` migration (165) + 9 seed rows (env-name-only).
- [ ] Companion `CREATE TABLE IF NOT EXISTS` migration capturing live `acculynx_api_catalog` / `acculynx_api_probe` DDL into the repo (idempotent on existing tables).
- [ ] Reconciliation query/script: distinct probed endpoints vs 86-op checklist.
- [ ] Committed secret-leak grep check.
- [ ] Deno smoke test for the driver: pagination-param selection + sandbox hard-gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google Drive "AccuLynx" folder skeleton exists | REQ-01 | No Google Workspace MCP wired; creation via OAuth bridge / Workspace persona / manual | Open the folder URL recorded in `knowledge-folder.md`; confirm WHO/WHAT/HOW/WHY/WHERE/WHEN + matrices/ + runbooks/ skeleton present |
| Sandbox `scheduledReportId` for the 5 Reports GETs | REQ-05 | No GET lists scheduled-report IDs; id must come from the AccuLynx UI | Supply a sandbox report id at sweep time, or record those 5 as `unprobeable` in the matrix |
| Sandbox data volume sufficient to chain Tier B/C | REQ-05 | Depends on live sandbox account contents | First sweep step counts Tier-A seed data; if sparse, record `empty` and note Phase-4 write-seeding |

---

## Validation Sign-Off

- [ ] All tasks have an automated verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner aligns task IDs)

**Approval:** task IDs aligned to plans 01-01/01-02/01-03 (planner, 2026-06-30)
