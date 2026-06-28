---
type: Review
title: Current Open Engine Implementation Review
description: Review of the a-roofers-open-brain dev-engine implementation against the Open Engine source prompt and live PEC Linear setup.
resource: ../../agents/dev-engine/README.md
tags: [open-engine, dev-engine, linear, implementation-review, pro-exteriors]
timestamp: 2026-06-28T00:00:00Z
---

# Scope Reviewed

- Local files: `agents/dev-engine/AGENTS.md`, `agents/dev-engine/README.md`, `agents/dev-engine/pe-cc-*/SKILL.md`.
- Boundary docs: `docs/58-dev-vs-ops-agent-delineation.md`.
- Live Linear: PE-CC-DevTeam states, project, `agent-instructions` label, PEC-1, PEC-2, PEC-3.
- Source prompt: pasted setup prompt from the Codex attachment.

# What Is Working

| Area | Finding |
| --- | --- |
| Linear team | `PE-CC-DevTeam` exists with key `PEC`. |
| Project | `PE-CC-DevEngine` exists. |
| Label | `agent-instructions` exists and matches the runner contract. |
| Statuses | All six Open Engine statuses exist with the expected categories: `Standing`, `Agent Todo`, `Agent Working`, `Agent Needs Input`, `Agent Review`, `Agent Done`. |
| Standing issues | PEC-1, PEC-2, and PEC-3 exist, are in `Standing`, have the label, and live in the project. |
| Dev/Ops plane split | `docs/58` and `agents/dev-engine/AGENTS.md` clearly separate the DevTeam Linear plane from the Roofing-Ops Command Center/Slack plane. |
| Runtime scoping | Each private context file has an agent code and task-title claim scope. |
| Codex preflight | `pe-cc-codex` is at `1.0.1`, has left `AGENT APPLIED`, and its PEC-2 ledger comment shows `Local context: 1.0.1; none`. |

# Gaps And Risks

| Severity | Gap | Evidence | Why It Matters |
| --- | --- | --- | --- |
| High | Version drift across runtime files | `pe-cc-claude` and `pe-cc-agents` remain fully at `1.0.0`; `pe-cc-warp` and `pe-cc-hermes` have `engine_version: 1.0.1` in frontmatter but still say `1.0.0` in body/status template. | Standing preflight relies on local version fields. Mixed versions make receipts misleading and increase the chance of stale runner behavior. |
| High | `pe-cc-claude` has no PEC-2 `AGENT STATUS` comment | Live PEC-2 comments include Warp, Agents, Cursor, Codex, Hermes, but not Claude. | The ledger cannot report whether Claude is installed, stale, automated, or blocked. |
| High | No automation runner implementation yet | Context files document the runner; no durable script/cron/agent command wrapper is present in `agents/dev-engine/`. | Manual runs work, but the operating surface is not yet an engine. It is a well-specified checklist. |
| Medium | Claim filtering is title-based, not strongly assignee-bound in local text | The prompt asks for assignment ownership; local context emphasizes label/title/status. | In a team path, title-only filtering can claim work assigned to the wrong human if assignee rules are omitted by a runtime. |
| Medium | Optional skill directory is empty | PEC-3 says no optional skills registered. | The mechanism exists, but Open Skills adoption has not started. |
| Medium | Dev runtime identity vs named dev-agent identity remains unresolved | `docs/58` lists open item: map `pe-cc-<runtime>` to named dev agents. | Routing will blur if "runtime" and "role" are both called agents without a map. |
| Medium | Plane boundary is documented but not enforced by tests | `docs/58` has backlog for provisioning guard/no-Linear-for-roofing check. | A future env/provisioning mistake could give a dev runtime roofing brain credentials. |
| Low | `agents/dev-engine/AGENTS.md` is currently untracked | `git status` shows `?? agents/dev-engine/AGENTS.md`. | The `/open-engine` trigger can be lost during convergence if not committed intentionally. |

# Recommended Next Build Tasks

1. Normalize all private contexts to v1.0.1 in frontmatter, body, and status template.
2. Add missing `pe-cc-claude` PEC-2 status comment.
3. Create a repo-local `scripts/open-engine-preflight.mjs` that verifies local version/body/template consistency for all runtimes.
4. Create a `scripts/open-engine-queue-runner.mjs` or per-runtime adapter that implements the runner through Linear API/MCP and records receipt URLs.
5. Add a plane-boundary test that fails if any dev-engine env/profile exposes `SUPABASE_SERVICE_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, roofing Slack channels, or `dashboard_action_log` write routes.
6. Create a runtime-to-dev-agent routing map in a standing issue and mirror it in OKF.
7. Register the first optional skill in PEC-3: `agentic-harness-designer` or `goal-prompt-generator`.

# Citations

[1] [Open Engine | Unlock AI](https://unlock-ai.natebjones.com/open-engine)  
[2] [DevTeam vs Roofing-Ops agent delineation](../../58-dev-vs-ops-agent-delineation.md)  
[3] [Open Engine local README](../../agents/dev-engine/README.md)

