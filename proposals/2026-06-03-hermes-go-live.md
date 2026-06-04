# A3: Hermes go-live (deploy the Maintenance agent as the first live agent)

Proposed by: Chris
Date: 2026-06-03
Status: pending
Affected clients: Pro Exteriors (template-wide pattern for all future clients)
A3 file: proposals/2026-06-03-hermes-go-live.md

> Governance note: the Maintenance agent is **mission-grade infrastructure**, which CONVENTIONS §10 exempts from the 10× ROI gate. This A3 is recorded for traceability and to fix the go-live scope, not to justify a payback multiple. Any new *skill* Hermes later adds still needs its own gated A3.

---

## 1. The problem (measured)

- **Task today:** brain hygiene — dedup, metadata validation, naming/structure conformance, archival, and keeping indexes current — is done ad-hoc by Chris or not at all.
- **Consequence:** as the brain grows (it already spans vendor pricing, territories, fleet, invoices), every agent and human pays a rising "orientation tax": more tokens and time to find what's current, more risk of acting on stale/duplicate atoms.
- **Why it's high-error-cost:** a degraded brain multiplies error cost across *every* downstream agent. This is infrastructure, not a line task — the justification is avoided systemic error and token spend, not a single workflow's hours.

## 2. Root cause (brief)

The brain was built fast and correctly, but nothing owns its ongoing order. Humans don't scale to daily hygiene; the existing tools (Supabase, the repo) don't self-organize. Now that the corpus is large enough to matter and more agents are imminent, the cost of *not* having a librarian compounds.

## 3. Proposed state

Deploy the existing `Maintenance` agent as **Hermes** (see [`agents/horizontal/maintenance/HERMES.md`](../agents/horizontal/maintenance/HERMES.md)) on the production runtime: scheduled 5S cadence, a published brain map + schema catalog, per-folder README coverage, an archival/relocation review queue, and a daily hygiene digest to Slack + the Agent Monitoring view. Propose-only for irreversible-looking moves; humans/QC confirm.

## 4. Guardrails

Never deletes atoms / edits provenance / changes `trust_tier` / publishes. Internal-only (Historian side). All structural changes proposed, not auto-applied. (CONVENTIONS §4/§10.)

## 5. Success measures

- **Tokens-to-orient** trending down (index coverage up; avg context per orientation task down).
- Dedup hits and missing-metadata flags trending to zero.
- 100% leaf-folder README coverage; naming/structure conformance ≥ target.
- Backup restorability verified each quarter.

## 6. Rollout

Per the go-live checklist in `HERMES.md`: provision scoped key + AgentMail inbox + Slack handle, deploy cron, run **one week dry-run (propose-only)**, review with Chris/QC, then flip to live.

## 7. Decision

- [ ] Approve go-live
- [ ] Defer (revisit_at: __)
- [ ] Changes requested: __
