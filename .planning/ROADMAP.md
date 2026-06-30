# Roadmap: AccuLynx Commercialization — Multi-Location Brain Integration

## Overview

Promote the AccuLynx integration from a one-account sandbox into a commercial, multi-location
data + action layer. We start by mapping every location account and proving the full read surface
in the sandbox, then ingest all 8 production accounts and every resource, harden the scheduler to
hourly/observable/secure, prove the write surface in the sandbox, ship a human-gated write/action
layer, stand up a dedicated AccuLynx Agent backed by a Google Drive knowledge folder, and finally
prove completeness with a realtime Executive Sales Pipeline dashboard that replaces the weekly snapshot.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation — Account Registry & Read-Capability Discovery** - Map all 9 keys; exhaustively probe every READ endpoint in the sandbox; stand up the knowledge-folder skeleton.
- [ ] **Phase 2: Multi-Location Full Ingestion** - Fan out the sync across all 8 production accounts and ingest every currently-unfed resource.
- [ ] **Phase 3: Commercial Cron Hardening** - Hourly, stable, observable, secure scheduling with healthchecks, alerting, and resumption.
- [ ] **Phase 4: Sandbox Write-Capability Exploration & Red-Team** - Exercise every WRITE endpoint in the sandbox to diminishing returns; produce a live write-capability matrix.
- [ ] **Phase 5: Read/Write Action Layer** - Human-approval-gated write wrappers on a contrib branch; begin offloading specific human tasks.
- [ ] **Phase 6: AccuLynx Agent + Google Drive Knowledge Base** - A3-approved dedicated agent; finalized who/what/how/why/where/when knowledge folder wired to skills/memories/references.
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
  4. A Google Drive "AccuLynx" knowledge folder skeleton exists (who/what/how/why/where/when sections) and a repo reference points agents to it.
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Schema foundation: acculynx_accounts registry (165) + idempotent catalog/probe DDL (166) + 86-GET checklist seed (167) + sandbox secret
- [x] 01-02-PLAN.md — Sandbox-only read-sweep Edge Function: hard gate + Tier A/B/C HATEOAS ID-chaining + PII redaction over the 86 GETs
- [ ] 01-03-PLAN.md — Reconciliation + read-capability matrix (docs/65) + Google Drive knowledge-folder skeleton + repo pointer

### Phase 2: Multi-Location Full Ingestion
**Goal**: The brain holds current data from all 8 production location accounts, across every resource AccuLynx exposes for read.
**Depends on**: Phase 1
**Requirements**: REQ-03, REQ-04
**Success Criteria** (what must be TRUE):
  1. The sync fans out across all 8 production keys; every row is stamped with its source account/market and there is no cross-account key bleed.
  2. Contacts, job-contacts, estimates, invoices, invoice lines, job financials, job insurance, and milestone history are populated (non-empty) for accounts that have them, with per-resource watermarks.
  3. A full historical backfill has run for every location account, windowed to respect pagination/runtime limits, with diff detection for not-seen-in-API records.
  4. Row counts by account/market reconcile against AccuLynx job counts within an acceptable tolerance.
**Plans**: TBD

Plans:
- [ ] 02-01: TBD (set during planning)

### Phase 3: Commercial Cron Hardening
**Goal**: Ingestion is current within the hour, runs reliably without human babysitting, alerts on failure or staleness, and is secure.
**Depends on**: Phase 2
**Requirements**: REQ-07
**Success Criteria** (what must be TRUE):
  1. The scheduler runs hourly (off the Claude Cowork schedule) for all accounts and resources, within per-key rate limits.
  2. pg_net responses are reconciled — `v_acculynx_cron_outcomes` reflects real outcomes (no perpetual `pending`); failures and stale watermarks raise an alert (Slack/Sentry).
  3. Incomplete/timed-out runs resume cleanly from watermarks; a runbook documents recovery.
  4. A security review confirms secret handling, RLS, and least-privilege are sound; no secret is exposed.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD (set during planning)

### Phase 4: Sandbox Write-Capability Exploration & Red-Team
**Goal**: We know exactly what every WRITE endpoint does, its validation rules, idempotency, error shapes, and undocumented guardrails — proven safe in the sandbox.
**Depends on**: Phase 1 (registry + harness); can run parallel to 2–3
**Requirements**: REQ-06
**Success Criteria** (what must be TRUE):
  1. Every POST/PUT/DELETE endpoint has been exercised against disposable sandbox jobs/contacts, recorded with real behavior, validation errors, and side effects.
  2. Each write path has been red-teamed (bad input, partial failure, retries/idempotency, ordering) and re-tested until diminishing returns.
  3. A live write-capability matrix supersedes docs/37 with evidence-based verdicts (writable / write-only / unsupported / fragile-with-guardrail).
  4. Each writable path has a documented guardrail recipe ("it just works" conditions and failure modes).
**Plans**: TBD

Plans:
- [ ] 04-01: TBD (set during planning)

### Phase 5: Read/Write Action Layer
**Goal**: Agents can perform proven-safe AccuLynx writes through human-approval-gated wrappers, offloading specific tasks humans do today.
**Depends on**: Phase 4
**Requirements**: REQ-08
**Success Criteria** (what must be TRUE):
  1. A read/write exploratory contrib branch exists with write wrappers for the proven-safe set (e.g., job message, custom fields, worksheet items, payments, reps, external references, doc/photo upload).
  2. Every write wrapper enforces dry-run preview → explicit human approval → execute, and writes an audit-log entry.
  3. At least one real human task is offloaded end-to-end through the action layer (sandbox-validated, then prod with approval).
  4. No write path can fire against production without passing the approval gate.
**Plans**: TBD

Plans:
- [ ] 05-01: TBD (set during planning)

### Phase 6: AccuLynx Agent + Google Drive Knowledge Base
**Goal**: A dedicated AccuLynx Agent owns all AccuLynx work, backed by a complete, navigable Google Drive knowledge folder that skills/memories/references route agents to.
**Depends on**: Phase 1, 4, 5
**Requirements**: REQ-01, REQ-09
**Success Criteria** (what must be TRUE):
  1. An approved A3 (proposals/) justifies the AccuLynx Agent per CLAUDE.md rule 9.
  2. The AccuLynx Agent exists (role, bound skills/tools, read + gated-write capability) and can answer/act across the full data and capability surface.
  3. The Google Drive "AccuLynx" folder is complete (who/what/how/why/where/when, read+write matrices, runbooks, account registry, dashboard spec) and is the cited source of truth.
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
| 1. Foundation — Account Registry & Read-Capability Discovery | 2/3 | In Progress|  |
| 2. Multi-Location Full Ingestion | 0/TBD | Not started | - |
| 3. Commercial Cron Hardening | 0/TBD | Not started | - |
| 4. Sandbox Write-Capability Exploration & Red-Team | 0/TBD | Not started | - |
| 5. Read/Write Action Layer | 0/TBD | Not started | - |
| 6. AccuLynx Agent + Google Drive Knowledge Base | 0/TBD | Not started | - |
| 7. Executive Sales Pipeline Dashboard | 0/TBD | Not started | - |
