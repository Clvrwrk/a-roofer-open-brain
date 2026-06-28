---
type: framework
title: Open Skills Framework
description: Reusable AI-agent primitives and runbooks for turning repeated workflows into portable operating capability.
resource: https://unlock-ai.natebjones.com/open-skills
tags:
  - open-skills
  - agent-skills
  - workflow-primitives
timestamp: "2026-06-28"
---

# Open Skills Framework

Open Skills is a library of reusable AI-agent primitives: skills, checklists, and runbooks that encode repeatable work patterns. The public surface positions the library as 31 skills across 7 categories, plus 7 runbooks that compose those skills into end-to-end workflows.

The important design idea is that a skill is not just a prompt snippet. It is a named, reusable operating unit with scope, expected inputs, outputs, quality criteria, and often surrounding workflow discipline. This makes the framework a natural complement to Open Engine: Open Engine coordinates who does what, while Open Skills defines how common classes of work should be done.

## Core Pattern

Open Skills has three layers:

- Skill: a focused reusable capability such as current-information search, heavy file ingestion, browser QA, or session-to-skill extraction.
- Category: a portfolio grouping that makes the library navigable by work type.
- Runbook: a composed workflow that chains several skills into a repeatable operating pattern.

## Strategic Strengths

- Skills make quality reusable instead of depending on a single agent remembering local practice.
- Categories make the library teachable and browseable.
- Runbooks turn skills into an operating system for recurring work, not just a toolbox.
- The framework has a strong fit for repositories where multiple agent runtimes work across the same codebase.

## Main Risks

- Skill sprawl: without ownership and retirement rules, a library can become a graveyard of stale instructions.
- Authority confusion: skills must not override repo policy, security rules, or task-specific human instructions.
- Weak gating: third-party or externally sourced skills need provenance, egress, and permission review before use in this repo.
- Missing receipts: a skill invocation should leave evidence about which inputs, sources, and checks were used.

## Fit For This Repo

Open Skills should become the reusable work primitive layer beneath the dev-engine. In this repo, skills should be registered through PEC-3 and governed by the existing third-party agent tool gate. The first candidates should be low-risk, high-value internal skills:

- standing preflight
- Linear status ledger update
- endpoint auth matrix review
- prompt-injection review
- Supabase performance triage
- Command Center p95 performance check
- session-to-skill extraction

## Citations

- Open Skills overview: https://unlock-ai.natebjones.com/open-skills
- Open Skills library: https://unlock-ai.natebjones.com/open-skills/skills
- Open Skills runbooks: https://unlock-ai.natebjones.com/open-skills/runbooks

