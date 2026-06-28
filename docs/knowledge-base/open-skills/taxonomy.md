---
type: taxonomy
title: Open Skills Taxonomy
description: Category and capability map for the Open Skills library.
resource: https://unlock-ai.natebjones.com/open-skills/skills
tags:
  - open-skills
  - taxonomy
  - agent-capabilities
timestamp: "2026-06-28"
---

# Open Skills Taxonomy

The Open Skills public library is organized into 7 categories and 31 skills. The categories are useful because they describe durable work domains rather than tool-specific tricks.

## Categories

| Category | Count | Purpose |
| --- | ---: | --- |
| Core Infrastructure | 5 | Shared primitives for search, ingestion, artifacts, image generation, and transcription. |
| Research & Thinking | 5 | Turning messy inputs into decisions, assumptions, signals, and research output. |
| Writing, Voice & Content | 4 | Producing content that carries a consistent voice and can move from raw thought to publishable form. |
| Web Publishing & Frontend | 4 | Shipping web pages and frontend artifacts with practical quality checks. |
| Video & Media Production | 3 | Producing and refining media workflows. |
| Testing & Quality | 3 | Browser QA, testing runbooks, and quality memory. |
| Agent Operations | 7 | Delegation, session maps, stakeholder updates, PR merge discipline, and skill extraction. |

## Notable Skills

Core Infrastructure includes image generation gateway, current-information search, media transcription, heavy file ingestion, and HTML artifact builder.

Research & Thinking includes brain dump processing, meeting synthesis, weekly signal diff, assumption checking, and related reasoning primitives.

Testing & Quality includes browser automation QA, testing runbook creation, and page testing memory. These map directly to this repo's need for reproducible Command Center checks.

Agent Operations includes goal prompt generation, visible delegation, session operating map, self-authored PR merge, stakeholder update email, session-to-skill extraction, and agentic harness designer.

## Repo Adoption Notes

The first local Open Skills bundle should avoid copying all 31 public skills wholesale. Adopt by need:

- Start with internal skills that are already implicit in this repo's docs and repeated agent tasks.
- Register skills in PEC-3 with owner, scope, risk class, and rollback path.
- Require a standing issue or local policy link for skills that can affect production, secrets, auth, data, or external services.
- Add receipts: every skill run should leave a short note or artifact that future agents can audit.

## Citations

- Open Skills library: https://unlock-ai.natebjones.com/open-skills/skills
- Core Infrastructure: https://unlock-ai.natebjones.com/open-skills/skills/core-infrastructure
- Agent Operations: https://unlock-ai.natebjones.com/open-skills/skills/agent-operations

