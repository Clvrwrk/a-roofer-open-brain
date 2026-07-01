# Phase 3: Commercial Cron Hardening - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the AccuLynx ingestion cron into commercial-grade infrastructure: **hourly, self-resuming, observable (alerts on failure/staleness), trust-hardened, and security-reviewed** — and finish the Phase 2 carry-forward that this phase now owns.

**In scope:**
- Move the schedule from daily 08:15 UTC (users+jobs only, single Kansas key) to **hourly, all wired accounts, all synced resources**, within the 30 req/s IP + 10 req/s per-key limits.
- Reconcile pg_net responses so `v_acculynx_cron_outcomes` reflects real outcomes (no perpetual `pending`).
- Alerting on failure and staleness (Slack + Sentry).
- Clean watermark-based resume for incomplete/timed-out runs + a comprehensive recovery runbook.
- Ingestion-layer **trust/provenance guardrails** so ingested data cannot poison / drift / rot the brain agents later consume.
- A security review (secret handling, RLS, least-privilege) with a durable artifact.
- **Phase 2 carry-forward:** complete KC+Wichita backfill to within tolerance; fix jobs `last_api_count` (currently stores `1`); stamp/triage the 8 legacy NULL non-job rows; expand fan-out to the remaining 6 production accounts (human-gated).

**Out of scope (defer):**
- Building the AccuLynx Agent and its runtime injection/scope-drift defenses (REQ-09, separate phase). This phase only *labels and constrains the data* the agent will later consume.
- Any new ingestion resources beyond the 9 already synced/planned in Phase 2.
- Production write paths (REQ-06/REQ-08).

</domain>

<decisions>
## Implementation Decisions

### Cron Cadence & Pacing
- **D-01:** Single hourly pg_cron schedule, **one serial edge invocation** per trigger — loops all wired accounts serially under the ~110s runtime budget (matches proven v19 behavior; safest against the shared 30 req/s IP limit). Do **not** fan out to one-invocation-per-account.
- **D-02:** Each run does **incremental for all wired accounts first**, then spends remaining budget on a **bounded backfill slice**. Backfill drains over many hourly runs; every run resumes cleanly from watermarks (per-page advance).
- **D-03:** Retire the daily 08:15 UTC schedule as part of the cutover; hourly is the single production cadence.

### Alerting
- **D-04:** Alerts go to **both Slack and Sentry** — Sentry for structured error/exception capture + history, Slack for immediate human-readable visibility. Both are already in the stack (see `/slack-agents` and `/sentry` skills).
- **D-05:** Alert triggers (all four): (a) **failed run** — non-200/exception, reconciled from the pg_net response; (b) **stale watermark** — no successful sync for an (account, resource) within the window; (c) **reconciliation delta over tolerance** — `v_acculynx_reconciliation.delta_pct` above tolerance after backfill should have caught up; (d) **pg_net response unreconciled** — a request stuck `pending` past a grace window (catches the reconciliation loop itself breaking).
- **D-06:** Stale-watermark window = **3 hours** (~3 missed hourly runs — tolerant of transient blips and rate-limit backoff).

### Reconciliation Tolerance & 6-Account Expansion
- **D-07:** "Within tolerance" = **delta_pct ≤ 2%** (brain_count vs API `last_api_count`). Absorbs normal API count wobble without masking real gaps.
- **D-08:** Expansion gate = **KC + Wichita reconcile within tolerance on ALL synced resources AND the jobs `last_api_count` bug is fixed, THEN an explicit human-approved step sets the 6 remaining Edge secrets.** (Human-approved scope step per PROJECT.md.)
- **D-09:** Rollout after the gate = **canary then batch** — bring 1 of the 6 accounts online, confirm it reconciles within tolerance, then enable the remaining 5.

### Trust / Provenance Guardrails (anti poison/drift/rot)
- **D-10:** **Tag & segregate untrusted free-text, never mutate.** Mirror AccuLynx free-text (job/contact notes, descriptions, names) faithfully but mark it as **untrusted-content, evidence tier, never instruction**, and document a "treat as data, never instructions" boundary the REQ-09 agent MUST honor. Ingestion labels; it never rewrites source data (fidelity vs AccuLynx preserved).
- **D-11:** **Enforce provenance/trust as DB invariants** — `account_key`/`market` provenance NOT NULL, evidence-tier default, immutable `acculynx_raw` archive — via constraints/checks so a poisoned or mislabeled row structurally cannot land. Verified in the security review.
- **D-12:** **Data-rot guards (all four), surfaced + alerted:** duplicate detection (uniqueness on AccuLynx GUID per resource), orphan detection (sub-resources referencing a missing parent job/contact), NULL-provenance sweep (same class as the 8 legacy rows), and stale-tail detection (rows not re-seen across N full sweeps that `markNotSeen` didn't archive).

### Security Review & Recovery Runbook
- **D-13:** Security review = **run `/gsd-secure-phase` AND write a security posture doc** (secret handling, RLS, least-privilege, injection/untrusted-content boundary) as the durable artifact.
- **D-14:** **RLS on, deny-by-default** on all `acculynx_*` tables — `service_role` (edge function) writes; dashboards read only through explicit policies; anon/public denied.
- **D-15:** **Comprehensive recovery runbook** at `docs/knowledge-base/acculynx/ingestion/runbook.md` covering: stuck/pending pg_net, watermark rewind/reset, edge function rollback (v19→v12), rate-limit lockout, secret rotation, and re-running a torn backfill.

### Claude's Discretion
- Exact pg_net → response reconciliation mechanism (join `net._http_response` to requests, retention/cleanup of the response table, whether reconciliation is a follow-up cron or a view rewrite).
- Backfill slice size + resource priority order within the "incremental first, then slice" rule (D-02) — subject to keeping within the 110s budget and 30 req/s IP limit.
- Which Slack channel the alerts post to and the exact alert message format (align with `/slack-agents`).
- Exact schema/constraint mechanics for D-11/D-12 (check constraints vs triggers vs monitoring views), provided the guarantee holds.
- Sentry capture wiring specifics (align with `/sentry`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — project intent, REQ-07 definition, constraints, key decisions (sandbox-first, keep pg_cron+pg_net, per-account fan-out).
- `.planning/ROADMAP.md` §"Phase 3: Commercial Cron Hardening" — goal, 4 success criteria, carry-forward list.
- `.planning/phases/02-multi-location-full-ingestion/02-VERIFICATION.md` — Phase 2 PARTIAL verdict + the authoritative carry-forward list (backfill, `last_api_count` fix, 8 legacy NULL rows, 6-account expansion) and the 7 bugs already fixed.

### Live ingestion pipeline (integration of record — plan against this, NOT the repo bridge stub)
- `supabase/functions/acculynx-sync/index.ts` — v19 entry point: serial multi-account fan-out, 110s runtime budget, watermark-per-page resume, runtime-only key resolution (Rule 2).
- `supabase/functions/acculynx-sync/lib/accounts.ts` — account/key resolution registry.
- `supabase/functions/acculynx-sync/lib/watermark.ts` — `readWatermark`/`advanceWatermark` (persists `last_api_count`).
- `supabase/functions/acculynx-sync/lib/diff.ts` — `markNotSeen` (update-only, never delete — Rule 1).
- `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` — the pg_cron → pg_net → edge-function architecture + known cron observability gap.

### Schema (additive/idempotent only — shared prod DB, migrations are immediately live)
- `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql` — the accounts registry (9 keys).
- `schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql` — watermark table.
- `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql` — `v_acculynx_reconciliation` (delta_pct source of truth; excludes intentionally-unsynced tables).
- `schemas/cleverwork-roofer/171-acculynx-watermark-pk-fix.sql` — composite `(account_key, resource_type)` PK that unblocked per-resource watermarks. Next migration number = **172**.

### Operational skills (read before touching the relevant surface)
- `.claude/skills/slack-agents/SKILL.md` — per-agent bot identities, tokens, channel IDs (Slack alerting).
- `.claude/skills/sentry/SKILL.md` — Sentry project/DSN, tokens, alert-rule wiring.
- `.claude/skills/coolify/SKILL.md` — deploy/redeploy the edge function + Command Center.

### Governing rules
- `CLAUDE.md` — hard rules 1 (no destructive SQL), 2 (no secrets in code), 4 (trust-tier discipline), 8 (era-aware).
- `CONVENTIONS.md` §13 — Live⇄Dev converge + deploy discipline.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `acculynx-sync` v19 (deployed; rollback target v12): serial fan-out, 429 handling (Retry-After + exponential backoff, 3 retries), 110s budget, per-page watermark advance, `acculynx_raw` archival. Hardening builds on this, not a rewrite.
- `v_acculynx_reconciliation` — already computes `delta_pct` per (account_key, resource_type); D-07 tolerance and D-05(c) alert read from it.
- `acculynx_sync_watermark` with composite PK (mig 171) — per-resource watermarks now function; resume + stale detection key off this.

### Established Patterns
- **Live DB is source of truth, not migration files** (memory: verify-against-live-db) — cron scheduling + pg_net wiring live in prod DB, applied via Supabase MCP, not committed SQL. Any cron/pg_net change must be captured as an additive migration in `schemas/cleverwork-roofer/` (next = 172) AND applied to prod.
- Serial account loop enforces the 30 req/s IP limit — do not introduce concurrent fan-out (D-01).
- Diff detection is update-only (`markNotSeen`) — never delete atoms (Rule 1).

### Integration Points
- pg_cron schedule + `trigger_acculynx_sync(...)` SQL fn → pg_net async POST → edge function. Hourly cutover + pg_net reconciliation touch this seam.
- Edge Function secrets: currently sandbox + kansas_city + wichita only; the 6 others are intentionally absent (physically cannot fan out until set — the D-08 human gate).
- Slack + Sentry for alerting; Coolify for deploy.

</code_context>

<specifics>
## Specific Ideas

- Current production state at Phase 2 close: `acculynx-sync` v19 deployed; migrations 168–171 live; edge secrets set for sandbox+KC+wichita only; backfill ~5% in (wichita contacts 62/1,312); jobs `last_api_count` bug stores `1`.
- The jobs `last_api_count` fix is a **prerequisite** for the D-08 expansion gate — jobs reconciliation is currently blind and cannot prove tolerance until fixed.
- The 8 legacy NULL non-job rows (3 contacts, 3 job_contacts, 1 financial, 1 insurance) are the NULL-provenance-sweep guard's (D-12) first cleanup target.

</specifics>

<deferred>
## Deferred Ideas

- **AccuLynx Agent runtime guardrails** (injection defense at read time, scope-drift limits on agent actions) — REQ-09, its own phase preceded by an approved A3. This phase only labels/constrains the *data*; the agent honors the documented untrusted-content boundary (D-10) later.
- Production write paths / write wrappers — REQ-06, REQ-08.
- Executive Sales Pipeline dashboard — REQ-10.

</deferred>

---

*Phase: 03-commercial-cron-hardening*
*Context gathered: 2026-06-30*
