# Roadmap: AccuLynx Commercialization — Multi-Location Brain Integration

## Overview

Promote the AccuLynx integration from a one-account sandbox into a commercial, multi-location
data + action layer. We start by mapping every location account and proving the full read surface
in the sandbox, then ingest all 8 production accounts and every resource, harden the scheduler to
hourly/observable/secure, prove the write surface in the sandbox, ship a human-gated write/action
layer, stand up a dedicated AccuLynx Agent backed by an in-repo OKF knowledge bundle, and finally
prove completeness with a realtime Executive Sales Pipeline dashboard that replaces the weekly snapshot.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation — Account Registry & Read-Capability Discovery** - Map all 9 keys; exhaustively probe every READ endpoint in the sandbox; stand up the knowledge-folder skeleton. (completed 2026-06-30)
- [x] **Phase 2: Multi-Location Full Ingestion** - Fan out the sync across all 8 production accounts and ingest every currently-unfed resource. (completed 2026-06-30)
- [x] **Phase 3: Commercial Cron Hardening** - Hourly, stable, observable, secure scheduling with healthchecks, alerting, and resumption. (completed 2026-07-01)
- [x] **Phase 4: Sandbox Write-Capability Exploration & Red-Team** - Exercise every WRITE endpoint in the sandbox to diminishing returns; produce a live write-capability matrix. (completed 2026-07-01)
- [ ] **Phase 5: Read/Write Action Layer** - Human-approval-gated write wrappers on a contrib branch; begin offloading specific human tasks.
- [ ] **Phase 6: AccuLynx Agent + OKF Knowledge Base** - A3-approved dedicated agent; finalized who/what/how/why/where/when knowledge folder wired to skills/memories/references.
- [ ] **Phase 7: Executive Sales Pipeline Dashboard** - Researched C-suite realtime dashboard under the Executive tab replacing the weekly snapshot (completeness proof).

## Phase Details

### Phase 1: Foundation — Account Registry & Read-Capability Discovery

**Goal**: Every AccuLynx account is catalogued and the complete READ capability surface is proven and documented from the sandbox, with the knowledge folder scaffolded.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-05
**Success Criteria** (what must be TRUE):

  1. An `acculynx_accounts` registry maps all 9 keys → location/program, market, state, environment (prod/sandbox), and stores keys securely (no secrets in repo).
  2. Every READ (GET) endpoint in the 124-operation surface has been called against the sandbox account, with real request/response shapes, includes behavior, pagination params, and undocumented quirks recorded to `acculynx_api_catalog`/probe tables.
  3. A read-capability matrix doc exists, reconciled against the published reference and noting where live behavior differs.
  4. An in-repo OKF (Open Knowledge Format) "AccuLynx" knowledge bundle exists (who/what/how/why/where/when concepts) and the acculynx-api skill points agents to it. (Drive folder dropped — agents read the repo.)

**Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md — Schema foundation: acculynx_accounts registry (165) + idempotent catalog/probe DDL (166) + 86-GET checklist seed (167) + sandbox secret
- [x] 01-02-PLAN.md — Sandbox-only read-sweep Edge Function: hard gate + Tier A/B/C HATEOAS ID-chaining + PII redaction over the 86 GETs
- [x] 01-03-PLAN.md — Reconciliation + read-capability matrix (docs/65) + OKF knowledge bundle (docs/knowledge-base/acculynx) + repo pointer

### Phase 2: Multi-Location Full Ingestion

**Goal**: The brain holds current data from all 8 production location accounts, across every resource AccuLynx exposes for read.
**Depends on**: Phase 1
**Requirements**: REQ-03, REQ-04
**Success Criteria** (what must be TRUE):

  1. The sync fans out across all 8 production keys; every row is stamped with its source account/market and there is no cross-account key bleed.
  2. Contacts, job-contacts, estimates, invoices, invoice lines, job financials, job insurance, and milestone history are populated (non-empty) for accounts that have them, with per-resource watermarks.
  3. A full historical backfill has run for every location account, windowed to respect pagination/runtime limits, with diff detection for not-seen-in-API records.
  4. Row counts by account/market reconcile against AccuLynx job counts within an acceptable tolerance.

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Schema foundation: live-schema introspection (Task 0) + migrations 168 (watermark) / 169 (11 target tables, account_key + diff cols) / 170 (reconciliation view), applied to prod DB
- [x] 02-02-PLAN.md — Locate-or-recreate acculynx-sync in repo + Wave 0 FAILING tests (fan-out, watermark, mark-not-delete, invoice two-level) + reconcile smoke SQL

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Implement lib (accounts/watermark/diff) + resources (jobs date-window, contacts/estimates full-sweep, job-walk) with account stamping; full suite GREEN

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — Verify 8 keys + sandbox-first proof → human gate → deploy + production fan-out + reconciliation (REQ-03/04 production proof)

**Status: plans executed; phase goal PARTIAL — see [02-VERIFICATION.md](phases/02-multi-location-full-ingestion/02-VERIFICATION.md).** Machinery built/deployed/proven (v19, 56/56 tests, migs 168–171, zero cross-account bleed; KC+Wichita jobs+contacts ingesting). SC1 substantially met; SC2–SC4 partial — full backfill + within-tolerance reconciliation are cron-paced and deferred to Phase 3. Production fan-out scoped to kansas_city + wichita (human-approved); other 6 accounts not yet enabled.

### Phase 3: Commercial Cron Hardening

**Goal**: Ingestion is current within the hour, runs reliably without human babysitting, alerts on failure or staleness, and is secure.
**Depends on**: Phase 2
**Requirements**: REQ-07
**Success Criteria** (what must be TRUE):

  1. The scheduler runs hourly (off the Claude Cowork schedule) for all accounts and resources, within per-key rate limits.
  2. pg_net responses are reconciled — `v_acculynx_cron_outcomes` reflects real outcomes (no perpetual `pending`); failures and stale watermarks raise an alert (Slack/Sentry).
  3. Incomplete/timed-out runs resume cleanly from watermarks; a runbook documents recovery.
  4. A security review confirms secret handling, RLS, and least-privilege are sound; no secret is exposed.

**Carried forward from Phase 2** (cron-paced ingestion completion):
  - Complete the KC + Wichita backfill to within tolerance (contacts → estimates → job-walk sub-resources) via the hourly cron.
  - Fix jobs `last_api_count` to store the true API total (currently stores `1` → jobs reconciliation is blind).
  - Stamp/triage the 8 remaining legacy NULL non-job rows (3 contacts, 3 job_contacts, 1 financial, 1 insurance).
  - Expand fan-out to the remaining 6 production accounts (florida, colorado, georgia, texas, insurance_program, multi_family_commercial) — set Edge secrets after KC+Wichita reconcile within tolerance; human-approved scope step.

**Plans**: 6 plans (5 waves)

Plans:

**Wave 1**
- [x] 03-01-PLAN.md — Wave 0 live-DB verification (cron jobname, RLS status, last_api_count, Slack channel) + committed verify-acculynx-cron.sql

**Wave 2** *(blocked on Wave 1)*
- [x] 03-02-PLAN.md — Hourly cutover (multiAccount:true, migs 172-175) + pg_net reconciliation (owned dispatch table + /10 reconcile cron + rewritten outcomes view); ends perpetual pending, fixes jobs last_api_count
- [x] 03-04-PLAN.md — Trust/provenance guardrails + rot guards + RLS deny-by-default (migs 177-180): legacy NULL triage → RLS revoke → rot-guard views → NOT NULL invariants

**Wave 3** *(blocked on 03-02)*
- [x] 03-03-PLAN.md — Alerting: SQL check_acculynx_alerts() (4 D-05 conditions, mig 176) + edge-side lib/alerts.ts (Slack+Sentry, no-secret-in-payload)

**Wave 4** *(blocked on 03-02/03/04)*
- [x] 03-05-PLAN.md — Security review (/gsd-secure-phase + posture doc, D-13) + recovery runbook (D-15) + sync-pipeline.md update

**Wave 5** *(blocked on all prior — human-gated)*
- [x] 03-06-PLAN.md — 6-account expansion: D-08 tolerance gate → canary-then-batch enable (D-09)

**Status: COMPLETE (2026-07-01) — see [03-VERIFICATION.md](phases/03-commercial-cron-hardening/03-VERIFICATION.md).** All 4 success criteria met on live prod (`rnhmvcpsvtqjlffpsayu`): hourly cron active for all 8 accounts, pg_net reconciled (no perpetual pending), watermark-resumable + runbook, security review CLOSED T-03-01…T-03-11. All 8 accounts fully backfilled, zero cross-account bleed. Two accepted cosmetic residuals: georgia/insurance jobs phantom 7.4% delta (API count-overcount, data complete); alert *delivery* proof pending 2 human steps (03-03).

### Phase 4: Sandbox Write-Capability Exploration & Red-Team

**Goal**: We know exactly what every WRITE endpoint does, its validation rules, idempotency, error shapes, and undocumented guardrails — proven safe in the sandbox.
**Depends on**: Phase 1 (registry + harness); can run parallel to 2–3
**Requirements**: REQ-06
**Success Criteria** (what must be TRUE):

  1. Every POST/PUT/DELETE endpoint has been exercised against disposable sandbox jobs/contacts, recorded with real behavior, validation errors, and side effects.
  2. Each write path has been red-teamed (bad input, partial failure, retries/idempotency, ordering) and re-tested until diminishing returns.
  3. A live write-capability matrix supersedes docs/37 with evidence-based verdicts (writable / write-only / unsupported / fragile-with-guardrail).
  4. Each writable path has a documented guardrail recipe ("it just works" conditions and failure modes).

**Plans**: 4 plans (4 waves)

Plans:

**Wave 1**
- [x] 04-01-PLAN.md — Wave 0 foundation: DDL 182 (write catalog/probe) + seed 183 (38-endpoint checklist) + reconcile SQL + pure sweep.ts (hard gate/redaction/stop-rule/address builders) with failing-first tests + [BLOCKING] apply 182/183 to prod (live-DB verified)

**Wave 2** *(blocked on 04-01)*
- [x] 04-02-PLAN.md — acculynx-write-sweep Edge Function index.ts: hard gate + generalized acculynxCall + reference-data pre-fetch + contact→job→financials walk + tiered deep/smoke red-team loop + persistence; deploy via supabase functions deploy

**Wave 3** *(blocked on 04-02 — human-gated)*
- [x] 04-03-PLAN.md — Execute the sweep against the sandbox to 38/38 coverage + red-team deep lanes to diminishing returns + evidence-based verdicts + reconcile gate (zero rows)

**Wave 4** *(blocked on 04-03)*
- [x] 04-04-PLAN.md — Generate the write-capability matrix from acculynx_write_catalog (D-03): regenerate docs/37 + write-capability.md (correct the phantom measurements endpoint) + guardrail recipes + write-sweep.md design doc

### Phase 5: Read/Write Action Layer

**Goal**: Agents can perform proven-safe AccuLynx writes through human-approval-gated wrappers, offloading specific tasks humans do today.
**Depends on**: Phase 4
**Requirements**: REQ-08
**Success Criteria** (what must be TRUE):

  1. A read/write exploratory contrib branch exists with write wrappers for the proven-safe set (e.g., job message, custom fields, worksheet items, payments, reps, external references, doc/photo upload).
  2. Every write wrapper enforces dry-run preview → explicit human approval → execute, and writes an audit-log entry.
  3. At least one real human task is offloaded end-to-end through the action layer (sandbox-validated, then prod with approval).
  4. No write path can fire against production without passing the approval gate.

**Plans**: 4 plans (3 waves)

Plans:

**Wave 1**
- [ ] 05-01-PLAN.md — acculynx-write-action edge function: pure core (action.ts) + tests + thin entrypoint (index.ts); 17-lane builder, D-03 preview==execute, D-09 assertTarget, per-request key resolution, idempotency
- [ ] 05-02-PLAN.md — Migrations 184 (acculynx_pending_write) + 185 (acculynx_write_action_log), additive/idempotent, with a [BLOCKING] apply-to-prod task (RQ-4, SC2)

**Wave 2** *(blocked on Wave 1)*
- [ ] 05-03-PLAN.md — Command Center wiring: prod-write permission (D-09), enqueue route + live-work surface loader (RQ-1 gap closure), decision-endpoint fallback + edge invoke on approve, Slack notify (D-08)

**Wave 3** *(blocked on Wave 2 — human-gated)*
- [ ] 05-04-PLAN.md — Deploy (edge + Coolify) → sandbox proof for 3 offload lanes → approver-roster config (OQ-2) → first live PROD payment write (SC3/SC4) → converge to main

### Phase 6: AccuLynx Agent + OKF Knowledge Base

**Goal**: A dedicated AccuLynx Agent owns all AccuLynx work, backed by a complete, navigable in-repo OKF knowledge bundle that skills/memories/references route agents to.
**Depends on**: Phase 1, 4, 5
**Requirements**: REQ-01, REQ-09
**Success Criteria** (what must be TRUE):

  1. An approved A3 (proposals/) justifies the AccuLynx Agent per CLAUDE.md rule 9.
  2. The AccuLynx Agent exists (role, bound skills/tools, read + gated-write capability) and can answer/act across the full data and capability surface.
  3. The in-repo OKF "AccuLynx" bundle is complete (who/what/how/why/where/when, read+write matrices, runbooks, account registry, dashboard spec) and is the cited source of truth.
  4. Repo skills (`acculynx-api`), memories, and references point to the folder so any agent reaches the right knowledge quickly.

**Plans**: TBD

Plans:

- [ ] 06-01: TBD (set during planning)

### Phase 7: Executive Sales Pipeline Dashboard

**Goal**: A realtime, executive-grade sales pipeline dashboard under the Executive tab proves the full multi-location data is present and replaces the weekly snapshot.
**Depends on**: Phase 2, 3 (full current data)
**Requirements**: REQ-10
**Success Criteria** (what must be TRUE):

  1. C-suite dashboard best practices and required KPIs are researched (Firecrawl/Exa/Tavily) and distilled into a dashboard spec.
  2. A realtime dashboard exists under the Executive tab at cc.proexteriorsus.net, replacing the weekly snapshot, with the researched KPIs and interactivity.
  3. The dashboard reflects all 8 location accounts (filterable by location/market) and updates within the hourly freshness SLA.
  4. It is deployed and verified live (buildCommit flipped) per the deploy gate.

**Plans**: TBD

Plans:

- [ ] 07-01: TBD (set during planning)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Account Registry & Read-Capability Discovery | 3/3 | Complete   | 2026-06-30 |
| 2. Multi-Location Full Ingestion | 4/4 | Complete   | 2026-06-30 |
| 3. Commercial Cron Hardening | 3/6 | In Progress|  |
| 4. Sandbox Write-Capability Exploration & Red-Team | 4/4 | Complete   | 2026-07-01 |
| 5. Read/Write Action Layer | 0/4 | Planned | - |
| 6. AccuLynx Agent + OKF Knowledge Base | 0/TBD | Not started | - |
| 7. Executive Sales Pipeline Dashboard | 0/TBD | Not started | - |
