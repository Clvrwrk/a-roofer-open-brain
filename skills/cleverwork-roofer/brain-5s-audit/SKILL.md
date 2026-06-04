---
name: brain-5s-audit
description: Hermes's core hygiene sweep — runs a 5S pass (Sort, Set-in-order, Shine, Standardize, Sustain) over the brain corpus and produces a hygiene report with proposed (never auto-applied) fixes.
when_to_use: Daily Sort and weekly Set-in-order/Shine cadence for the Maintenance agent (Hermes); also on demand before onboarding a new agent.
inputs:
  - new/changed atoms since last run (from public.thoughts)
  - prior hygiene report (for trend)
outputs:
  - hygiene status atom (counts: new, dedup hits, missing-field flags, orphans, contradictions)
  - a review queue of PROPOSED archival/relocation/merge actions for human/QC confirmation
trust_tier_of_output: evidence
bound_agents: [maintenance]
provenance: cleverwork-original
---

# brain-5s-audit

Run a 5S pass over the brain. **Propose, never execute, anything destructive-looking** (CONVENTIONS §10): never delete atoms, edit provenance, change `trust_tier`, or publish.

1. **Sort** — detect duplicates (fingerprint), validate required metadata on new atoms (`property_id`/`client_id`/`trust_tier`/era stamps where applicable), find orphans.
2. **Set-in-order** — surface contradictions and stale cross-references; note embedding drift clusters.
3. **Shine** — HEAD-check external source URLs (flag `source_link_broken`, do not edit content); spot atoms missing era/regulatory stamps.
4. **Standardize** — sample per-agent schema/field completion; flag off-pattern records.
5. **Sustain** — list atoms inactive 18+ months as cold-archive *candidates* (proposal only).

Emit a one-line hygiene status for the Conductor/Hermes digest, plus the structured review queue. Anything that would move/relocate/merge an atom goes to the queue for a human or QC to approve — Hermes does not apply it.
