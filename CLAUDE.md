# CLAUDE.md — agent instructions for a-roofers-open-brain

This file governs how AI coding tools (Claude Code, Codex, Cursor, etc.) work in this repo. It inherits OB1's guard rails and adds Cleverwork's. **Read [`CONVENTIONS.md`](CONVENTIONS.md) first — it is the contract.**

## What this repo is

The deployable template for a single roofing company's persistent, property-first memory brain. One isolated brain per client, provisioned from this template. The agents are the interface; the brain is the asset. Built on the OB1 memory spine (Supabase + pgvector + containerized MCPs).

## Hard rules (the line stops if you break these)

1. **No destructive SQL.** Never `DROP TABLE`/`DROP COLUMN`/`TRUNCATE` against a client brain. Migrations are additive and idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`). Archive or deprecate; never delete atoms.
2. **No secrets in code.** No API keys, tokens, service-role keys, or PII in any committed file. Use placeholders mirrored in `config/.env.example`.
3. **MCPs are MCP containers only.** No local stdio MCP servers, no local Node MCPs in `claude_desktop_config`. (OB1 rule, inherited.)
4. **Trust-tier discipline.** Inferred/generated memory is `evidence` by default. `instruction`-grade requires human confirmation or trusted import. Only Quality Control changes a `trust_tier` on an existing atom.
5. **Security boundary.** Historian is internal-only (never the public internet). Researcher is external-only (never the client brain). Keep them separate.
6. **Consent boundary.** Cross-client property atoms move only through the consent-gated read path with anonymization and `atom_access_log` entries. No exceptions.
7. **Property-first.** Atoms about a place carry `property_id`. The property is the primary key; clients and jobs are foreign keys.
8. **Era-aware.** Any atom describing a code, material, or practice carries `era_of_practice` + (where known) `regulatory_snapshot_id`. A future retrieval must be able to tell 2026 practice from 2031 practice.
9. **10x ROI gate.** No new agent skill without an approved A3 (`proposals/`). Mission-grade infrastructure and high-error-cost tasks are the only exemptions.
10. **No profanity. Clean, professional content** in docs, prompts, comments, seed data.

## Licensing & attribution

- This repo is **MIT-licensed** (see `LICENSE`), structured as a fork: all Cleverwork-original work is MIT; the four vendored OB1 base schemas retain their FSL-1.1-MIT notice (auto-converts to MIT on OB1's schedule); Dynamous/InfraNodus are cited concepts, re-expressed, never redistributed. Full map in `LICENSE.md`.
- Vendor only OB1's openly-licensed base schemas, under `schemas/ob1-base/` with `ATTRIBUTION.md`. Carry Nate B. Jones / OB1 provenance naturally (links to natebjones.com and the Substack).
- **Never copy Dynamous or InfraNodus files verbatim.** Re-express concepts in Cleverwork's own words and cite.

## Working style

- Diagram-first docs where it helps: diagram → short explanation → copy-paste setup → deeper reference.
- Keep the customization surface in `config/roofer.config.yaml`. Don't hard-code a specific company anywhere else.
- Parallel agents: one git worktree per workstream. See [`AGENTS.md`](AGENTS.md). The assigned path is the boundary.
- When a decision changes a schema, an MCP contract, a trust policy, a consent path, or a publishing path — record it in `docs/` while it's fresh, not after.
