---
phase: 04-sandbox-write-capability-exploration-red-team
asvs_level: 1
block_on: high
threats_total: 10
threats_closed: 10
threats_open: 0
register_authored_at_plan_time: true
verified: 2026-07-01
verifier: gsd-security-auditor
---

# SECURITY.md — Phase 4: Sandbox Write-Capability Exploration & Red-Team

Retroactive verification of the threat register declared across plans 04-01…04-04 against the
SHIPPED implementation. Register was authored at plan time (not reconstructed); this audit verifies
each declared mitigation exists in code — it does not scan for new vulnerabilities.

No `severity` field was present in the original STRIDE tables in any of the four plans. Per the
audit protocol, severities below were assigned retroactively based on impact × likelihood, and
`threats_open` is computed using `block_on: high` (only high/critical open threats would block).

## Threat Verification

| Threat ID | Category | Severity (assigned) | Disposition | Status | Evidence |
|-----------|----------|----------------------|-------------|--------|----------|
| T-04-sandbox | Tampering / Elevation of Privilege | critical | mitigate | **CLOSED** | `supabase/functions/acculynx-write-sweep/sweep.ts:23-30` (`assertSandbox` throws unless `secretName === SANDBOX_SECRET_NAME`); called at `supabase/functions/acculynx-write-sweep/index.ts:477` inside `Deno.serve` (line 473) BEFORE the first possible `fetch` call (the only `fetch(` in the file is inside the `acculynxCall` helper definition at line 86, which is never invoked before the gate runs). `grep -c 'acculynx_accounts\|loadProductionAccounts\|resolveKey\|acculynx-sync' index.ts` = 0 (verified live). `deno test supabase/functions/acculynx-write-sweep/` re-run live by this audit: 31/31 passing, including "assertSandbox throws for any production key name" and "assertSandbox accepts the sandbox key name". |
| T-04-prodfirst | Tampering | critical | mitigate | **CLOSED** | Same hard gate as T-04-sandbox is structurally the only path to a resolvable key (`ACCULYNX_KEY = Deno.env.get(SANDBOX_SECRET_NAME)` at `index.ts:32`) — no per-account loop or registry reference exists in the file (grep count 0, confirmed live by this audit, not just accepted from the SUMMARY). |
| T-04-pii | Information Disclosure | high | mitigate | **CLOSED** | `redactSample()` defined at `sweep.ts:43-60`, masking `firstName\|lastName\|email\|phone\|street1\|...` (PII_KEY regex at `sweep.ts:33`, includes street1/street2/email/phone). Applied to the response body at `index.ts:519` (`payload_sample: redactSample(s.body)`), `index.ts:689` (`payload_sample: redactSample(respBody)`), `index.ts:720` (DELETE-lifecycle second probe); applied to the outbound request body at `index.ts:520` (`request_body_sample: s.requestBody ? redactSample(s.requestBody) : null`) and `index.ts:690` (`request_body_sample: ... redactSample(body) ...`). Multipart bodies are recorded as a field-name list only (`index.ts:690` ternary), never raw file bytes. `deno test` re-run confirms "redactSample masks homeowner PII but preserves keys + non-PII values" and "redactSample preserves non-PII write-body fields (checkNumber, amount)" both pass. |
| T-04-secret | Information Disclosure | high | mitigate | **CLOSED** | Key resolved only via `Deno.env.get(SANDBOX_SECRET_NAME)` (`index.ts:32`); the resolved value `ACCULYNX_KEY` is used exactly once, in the outbound `Authorization: Bearer` header (`index.ts:82`) — never logged, never placed in a JSON response. Error bodies reference the NAME only: `` `${SANDBOX_SECRET_NAME} not set in Edge secrets}` `` (`index.ts:481`). Repo-wide grep for a literal key pattern (`ACCULYNX_[A-Z_]*KEY\s*[:=]\s*[A-Za-z0-9]{12,}` and `Bearer [A-Za-z0-9_.-]{20,}`) across `supabase/`, `schemas/`, `scripts/`, `docs/` returns zero matches for any AccuLynx key (the one `Bearer` hit found is an unrelated Slack-alert test fixture in `acculynx-sync/lib/alerts.test.ts` using a fake `sk-live-...` string, outside this phase's scope). |
| T-04-ddl | Tampering | critical | mitigate | **CLOSED** | `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` and `183-acculynx-write-checklist-seed.sql`: `grep -c 'create table if not exists' ` on 182 = 2; `grep -vE '^\s*--' ... | grep -ciE 'drop table|truncate|drop column'` = 0 on both files (re-run live by this audit). Both carry `alter table ... enable row level security` + `grant select ... to authenticated, service_role` (182 line 76-78; 183 line 194-195). Seed 183 uses `on conflict (operation_id) do nothing` (line 192). |
| T-04-fakepass | Repudiation / evidence integrity | high | mitigate | **CLOSED** | `scripts/acculynx-write-sweep-reconcile.sql` assertion 4 (`blocked_dep_missing_evidence`, lines 40-48): any `acculynx_write_catalog` row with `verdict = 'blocked-by-dependency'` and empty `notes`/`guardrail_notes` fails the gate. Enforced in the harness at `index.ts:611` (`guardrail_notes: "no seed id available in sandbox entity graph"`) and `index.ts:740-742` (`missingIdNote` naming the exact missing child id via `CHILD_ID_SEED_NAME`), so no bare verdict can be produced by the code path. 04-03-SUMMARY documents a human-verify checkpoint correcting one verdict in place rather than accepting a synthetic pass. |
| T-04-contention | DoS (false 429 signal) | low | mitigate | **CLOSED** | `PACE_MS = 130` (`index.ts:36`) enforced via `await sleep(PACE_MS)` before each call in the main loop (`index.ts:662`) and DELETE second-probe (`index.ts:705`); 429/backoff retry logic verbatim from read-sweep at `acculynxCall` (`index.ts:97-102`). 04-03-SUMMARY documents the sweep was run in isolation per Pitfall 6 (no concurrent sandbox-key consumer) — this is an execution-discipline claim not independently re-verifiable by static code inspection, but the code-level pacing/backoff mitigation is present and verified. |
| T-04-drift | Repudiation / integrity | low | mitigate | **CLOSED** | `docs/37-acculynx-write-capability-matrix.md` header (lines 1-23) states "Generated: 2026-07-01 from sandbox write-sweep batch `wsweep-2026-07-01T13-33-02-965Z`" with the literal generating SQL query and a reproducibility note ("generated from the evidence tables, not hand-maintained (D-03)"). `docs/knowledge-base/acculynx/api/write-capability.md` carries the equivalent header per 04-04-SUMMARY (verified via grep count: 21 verdict-vocabulary matches, 6 correction-language matches, self-reported in SUMMARY and consistent with docs/37's structure read directly by this audit). |
| T-04-dos | DoS (sandbox pollution) | low | accept | **CLOSED** | Accepted-risk entry present in this SECURITY.md (see Accepted Risks below); code-level evidence of the mitigating control (`run_tag`) still verified: `grep -c "run_tag: runTag" index.ts` = 4 (every probe-row-construction site — seed steps, unresolvable-path case, main loop, DELETE second-probe — stamps `run_tag`). |
| T-04-SC | Tampering (package installs) | medium | accept | **CLOSED** | Accepted-risk entry present (see below). Verified no new package: the only imports in `index.ts`/`sweep.ts` are `jsr:@supabase/supabase-js@2` (pre-existing, already running in prod per read-sweep) and local `./sweep.ts` — confirmed via `grep -n '^import'` across both files. |

## Unregistered Flags

None. No `## Threat Flags` section was present in any of the four SUMMARY files
(04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md — confirmed via
repo-wide grep, zero matches). No new attack surface was flagged by the executor during
implementation beyond the pre-registered threats.

## Accepted Risks Log

| Threat ID | Risk | Rationale | Owner |
|-----------|------|-----------|-------|
| T-04-dos | Sandbox pollution — every red-team run leaves disposable test entities (contacts/jobs/payments/etc.) in the AccuLynx sandbox account, with no bulk-reset mechanism. | The sandbox is explicitly disposable and not a production/client-facing environment; every created entity is stamped with a `run_tag` (verified: `index.ts` line-level grep count 4) so accumulated test data stays identifiable and attributable to a specific sweep batch if cleanup is ever needed. Non-blocking per the original plan disposition. | Phase 4 plan authors (04-01, 04-02) |
| T-04-SC | Package supply-chain risk from new installs during this phase. | No new packages were introduced — the only dependency is `jsr:@supabase/supabase-js@2`, already vetted and running in prod via the read-sweep sibling function. Verified by this audit via direct import-statement grep. | Phase 4 plan authors (all 4 plans) |

## Live-Proof Claims — Verified vs. Reported

This audit re-ran verifiable static/code-level checks directly rather than accepting SUMMARY
claims at face value:

- **Re-ran `deno test supabase/functions/acculynx-write-sweep/` live**: 31/31 passing (matches
  the 04-03-SUMMARY claim exactly, including the `classifyVerdict2`/`isReachableRoute`/
  `looksLikeProblemDetails` suite added in Plan 03).
- **Re-ran the secret-leak grep** across `supabase/`, `schemas/`, `scripts/`, `docs/` for both an
  `ACCULYNX_*KEY=<value>` pattern and a `Bearer <long-token>` pattern: no AccuLynx key literal
  found (one unrelated hit in an existing `acculynx-sync` Slack-alert test fixture, outside this
  phase's file set).
- **Re-ran the DROP/TRUNCATE/DELETE-column grep** on migrations 182/183 directly: 0/0.
- **Directly read** `index.ts` to confirm `assertSandbox` precedes the only `fetch()` call site
  and that no `acculynx-sync` import exists (grep count 0), rather than trusting the plan's
  acceptance-criteria description of the same check.
- **Did NOT re-execute** the live reconcile SQL (`scripts/acculynx-write-sweep-reconcile.sql`)
  or the `information_schema`/coverage queries against prod Supabase
  (`rnhmvcpsvtqjlffpsayu`) — a direct-to-prod SQL execution was attempted via `supabase db
  execute --linked` and was blocked by the harness's own auto-mode permission classifier
  (production-write/read guard), which is the correct posture for a read-only security audit
  running outside an explicit human-authorized session. The "non_sandbox_row = 0" / "38/38
  reconciled" / "31/31 tests" claims for the live batch (`wsweep-2026-07-01T13-33-02-965Z`)
  are therefore **reported evidence** from the 04-01/04-02/04-03-SUMMARY human-verify
  checkpoints (each an explicit `checkpoint:human-action` / `checkpoint:human-verify` gate in
  the plans, not a self-reported executor claim), not independently re-queried by this audit.
  The code-level mitigations that would produce that live result (the hard gate, the
  sandbox-only tag, the reconcile SQL's assertions) are all independently verified present and
  correct above.

## Notes on Severity Assignment

The original PLAN.md `<threat_model>` blocks across 04-01…04-04 did not include a `severity`
column — only Category / Component / Disposition / Mitigation Plan. Per the audit's fail-closed
rule, an OPEN threat with no severity would have been treated as critical; since every threat
here resolved CLOSED, this had no effect on the gate outcome, but severities were still assigned
retroactively (documented per-row above) to make `block_on: high` meaningful for any future
re-audit of this phase.
