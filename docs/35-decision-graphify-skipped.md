# 35 — Decision: Graphify Evaluated and Skipped

**Date:** 2026-06-10
**Status:** Decided — do not adopt. Do not re-evaluate unless a revisit trigger below fires.
**Decided by:** Chris (CTO/AI Administrator), on Claude review
**Subject:** [safishamsi/graphify](https://github.com/safishamsi/graphify) (PyPI `graphifyy`, v0.8.36 at review, MIT)

## Decision

```
Question: will graphify make the brain faster / more token-efficient as the KB grows?

  Layer 1  Supabase atom store (estimate_*/kb_*, pgvector)   → NO  (can't index DB rows)
  Layer 2  Repo files (code, specs, scripts)                 → modest yes (not our bottleneck)
  Layer 3  MemSearch memory (snapshot → L1 → L2 → L3)        → NO  (would conflict)

  Verdict: skip. Speed work belongs where the growth is — Layer 1.
```

## What graphify is

A CLI + agent skill that builds a static knowledge graph from **files in a folder** — code parsed locally via tree-sitter (free), docs/PDFs via LLM extraction (costs tokens at build time). `graphify query` then returns small BFS subgraphs instead of agents grepping/reading raw files. Token savings are real but only at query time, only over repo files.

## Why we skipped

1. **Wrong growth surface.** The exponential growth is atoms in Supabase/pgvector, not repo files. Graphify cannot index database rows (its `--postgres` extra introspects schema only). It can never be the brain's retrieval layer; pgvector + HNSW + tiered recall is that layer.
2. **Retrieval-discipline conflict.** Graphify installs PreToolUse hooks pushing "query the graph first." We just validated the memory discipline (Tier 0 snapshot → memsearch L1/L2/L3). Two competing query-first systems degrade both.
3. **Hard-rule conflicts.** Its MCP mode is a local stdio server (violates rule 3: MCP containers only). Installing it as an agent skill requires an approved A3 (rule 9), and the repo-navigation gain didn't approach the 10x bar.
4. **Consent/PII exposure.** `graphify-out/` is designed to be committed, and doc extraction routes through an LLM. Misconfigured, it would index unsanitized client data from `archive/local-uncommitted-*` — violating the consent boundary and the no-PII rule simultaneously.
5. **Cost asymmetry + staleness.** Build/update costs tokens recurringly as docs grow; the graph is a static snapshot that misleads when stale and adds a git-hook moving part when fresh.
6. **Supply chain.** Single-maintainer YC S26 startup, pre-1.0, PyPI name squatted (`graphifyy`). Not disqualifying alone, but no reason to take the dependency for a modest gain.

## What we kept from it

The **concept** — query a pre-built relationship graph instead of re-reading sources — is sound. If repo-scale token waste ever becomes measurable pain, re-express the idea (per our autoresearch/Dynamous precedent: cite, never copy) as a relationship layer **over atoms** (property ↔ job ↔ material ↔ code edges), where the scale problem actually lives. That would be a new A3.

## Revisit triggers (any one, otherwise leave closed)

- Graphify (or similar) gains the ability to graph live Postgres/Supabase **data**, not just schema.
- Measured evidence that agents waste significant tokens navigating *this repo* despite CLAUDE.md/AGENTS.md routing.
- We design the atom-relationship layer and want a reference implementation to study.
