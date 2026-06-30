# AccuLynx Commercialization — Multi-Location Brain Integration

## What This Is

The AccuLynx integration is being promoted from a single-account sandbox experiment into a
commercial-grade, multi-location ingestion + action layer for the Pro Exteriors Open Brain.
AccuLynx is the roofer's PM system of record; this work makes the brain hold *all* of the
client's AccuLynx data (every location/program account), keeps it current by the hour, proves
the full read/write capability surface through sandbox testing, and exposes the result to humans
through a realtime executive dashboard and to agents through a dedicated AccuLynx Agent.

## Core Value

**The brain holds current, complete, trustworthy AccuLynx data for every Pro Exteriors location —
and an agent can act on it within explicit human-approved guardrails.** If everything else fails,
the data must be complete across all 8 location accounts and never stale by more than an hour.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Single-account incremental jobs+users sync (Kansas/Wichita) via Supabase pg_cron → pg_net → `acculynx-sync` Edge Function (pre-existing, ~1,284 jobs).

### Active

- [ ] REQ-01: Full who/what/how/why/where/when documentation published as a Google Drive "AccuLynx" knowledge/OKR folder that repo skills, memories, and references point AI agents to.
- [ ] REQ-02: Account registry mapping all 9 AccuLynx API keys (8 production locations/programs + 1 sandbox) to location, market, state, and trust posture.
- [ ] REQ-03: Full ingestion across all 8 production location accounts — not just Kansas.
- [ ] REQ-04: Ingest the currently-unfed resources: contacts, job-contacts, estimates, invoices, invoice lines, job financials, job insurance, milestone history.
- [ ] REQ-05: Exhaustive sandbox test of every READ endpoint, with real-response capability matrix (beyond published docs).
- [ ] REQ-06: Exhaustive sandbox test of every WRITE endpoint (POST/PUT/DELETE), red-teamed to diminishing returns, with a live write-capability matrix superseding docs/37.
- [ ] REQ-07: Commercial cron infrastructure — hourly, stable, observable (alerting on failure/staleness), secure, with healthchecks and incomplete-run resumption; off the Claude Cowork schedule.
- [ ] REQ-08: A read/write exploratory branch with human-approval-gated write wrappers, beginning to offload specific human tasks.
- [ ] REQ-09: A dedicated AccuLynx Agent (preceded by an approved A3 per CLAUDE.md rule 9) responsible for all AccuLynx work.
- [ ] REQ-10: A realtime Executive Sales Pipeline dashboard under the Executive tab of cc.proexteriorsus.net, replacing the weekly snapshot, built to researched C-suite best practices and KPIs.

### Out of Scope

- Production write operations executed without explicit human approval — every write path is approval-gated; autonomous external actions are out of scope (SOUL.md boundary).
- First-attempting any endpoint behavior against a production location account — all behavior is proven in the sandbox first (Chris's mandate, 2026-06-30).
- AccuLynx milestone/invoice/material-order write-back — API V2 has no such endpoints (docs/37); these remain human/Slack fallback until AccuLynx ships endpoints.
- Replacing AccuLynx as system of record — the brain mirrors and assists; AccuLynx stays authoritative.

## Context

- **Live reality vs. repo:** the repo's `integrations/bridges/acculynx/` (webhook bridge, `handler.ts`) is a Phase-1 STUB targeting a template schema never applied to this brain. The *real* ingestion is the Supabase `acculynx-sync` Edge Function (v10) + pg_cron + pg_net, landing in `acculynx_jobs` and `crm_pipeline`. Plan against the live function, not the stub.
- **Multi-account API model:** AccuLynx is per-account. Each PE location/program is a separate AccuLynx account with its own API key and its own 10 req/s limit. Keys live in `.env` as `PE_CC_{LOCATION}_ACCULYNX_API_KEY` (Florida, Colorado, Georgia, Kansas City, Texas, Wichita, Insurance Program, Multi-Family/Commercial) plus `PE_CC_SANDBOX_ACCULYNX_API_KEY`. The runtime key lives in Supabase Edge Function secrets.
- **Current coverage:** `acculynx_jobs` is ~99% Kansas (1,273/1,284) — only one location account is wired. 7 production accounts are entirely unsynced.
- **Rate limits:** 30 req/s per IP, 10 req/s per API key. Per-key limit means 8 accounts give 8× parallel headroom but require careful fan-out. Existing `acculynxFetch` already handles 429 (Retry-After + exponential backoff) and a 120s runtime budget with watermark resume.
- **Known cron gap:** `v_acculynx_cron_outcomes` shows only the latest run captured a 200; prior runs show `pending` (pg_net response unreconciled) — must be fixed for "stable/observable".
- **Stack:** Supabase (`rnhmvcpsvtqjlffpsayu`, shared dev+prod), Deno Edge Functions, pg_cron/pg_net; Command Center Astro app deployed via Coolify→Hetzner at cc.proexteriorsus.net (WorkOS-gated); Slack + Sentry available for alerting.

## Constraints

- **Security**: No secrets in committed files; AccuLynx keys stay in `.env`/edge secrets (CLAUDE.md hard rule 2). Historian/internal boundary preserved.
- **Data safety**: Additive, idempotent migrations only — never drop/truncate a client brain (hard rule 1). Shared prod DB: every migration is immediately live.
- **Testing posture**: Nothing is first-tried in production. Every read and write is tested → red-teamed → retested in the sandbox account until diminishing returns prove it is production-ready, non-fragile, and its guardrails are known (Chris, 2026-06-30).
- **Approval gate**: All production writes are explain-then-ship with human approval; deploys follow the Live⇄Dev converge discipline (CONVENTIONS §13).
- **Governance**: New agent skill (AccuLynx Agent) requires an approved A3 (hard rule 9).
- **Property-first / era-aware / trust-tier** atom discipline applies to any atomization (hard rules 4,7,8).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plan via scaffolded `.planning/` + ultraplan per-phase | User chose ultraplan cloud planning; repo was not GSD-initialized | — Pending |
| Sandbox account (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) is the only place new behavior is first tested | No first-tries in production; prove guardrails before prod | — Pending |
| Keep pg_cron + pg_net → Edge Function, harden to hourly | Proven path; lowest-risk; no new infra to operate | — Pending |
| Multi-account fan-out keyed by an `acculynx_accounts` registry | AccuLynx is per-account; one key = one location | — Pending |
| Live `acculynx-sync` Edge Function is the integration of record, not the repo bridge stub | Stub targets unused template schema | ✓ Good |

---
*Last updated: 2026-06-30 at project scaffold (AccuLynx commercialization kickoff)*
