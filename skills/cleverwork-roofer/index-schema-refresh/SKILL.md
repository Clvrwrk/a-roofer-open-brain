---
name: index-schema-refresh
description: Regenerates the brain's navigability layer — the top-level brain map, per-folder READMEs, and the Supabase schema catalog — so agents orient from indexes instead of scanning the whole tree/DB (Hermes's tokens-to-orient goal).
when_to_use: Weekly, and after any schema migration or significant structural change; before onboarding a new agent.
inputs:
  - the current file tree + folder contents
  - the live Supabase schema (tables, views, RPCs, comments)
outputs:
  - refreshed brain map (top-level index of domains + where things live)
  - refreshed per-folder README summaries
  - refreshed schema catalog (table/view/RPC → purpose, one line each)
trust_tier_of_output: evidence
bound_agents: [maintenance]
provenance: cleverwork-original
---

# index-schema-refresh

Keep the navigability artifacts current so orientation is cheap:

1. **Brain map** — a single top-level index: domains (pricing, territories, fleet, invoices, agents), where each lives (paths + key tables), and what's current vs archived.
2. **Per-folder READMEs** — ensure each folder's README summarizes its contents in a few lines an agent can read instead of opening every file.
3. **Schema catalog** — read the live schema (table/view/RPC names + comments) and produce a one-line-each catalog so an agent queries the catalog, not `information_schema`. Flag any object lacking a comment as a documentation gap (proposal to add one).

Write outputs as `evidence`; propose (don't auto-commit) large rewrites for human review. Success = a new agent answers "where does X live / what's current?" from these indexes within a small token budget.
