---
type: Framework
title: Open Engine
description: Linear-based operating surface for agents with standing context, status ledger, receipts, resumable blockers, and one-task queue runs.
resource: https://unlock-ai.natebjones.com/open-engine
tags: [open-engine, linear, agents, queue, receipts, standing-context]
timestamp: 2026-06-28T00:00:00Z
---

# Overview

Open Engine turns Linear into a shared operating surface for agents. Its core promise is not "agents can read tasks"; it is a durable loop where each runtime has enough private context to claim exactly one scoped task, leave auditable receipts, pause cleanly, resume correctly, and keep a status ledger current.

# Core Concepts

| Concept | Purpose |
| --- | --- |
| Shared queue | Linear team/project/statuses/label form the work surface. |
| Private setup issue | Durable standing context for local files, account boundaries, receipt meanings, and smoke tests. |
| Status ledger | One top-level `AGENT STATUS` comment per runtime, updated in place. |
| Queue runner | Ordered heartbeat loop: standing preflight, optional skill preflight, resume holds/blockers, delegated follow-up, then one task. |
| Receipts | Exact tokens such as `AGENT CLAIMED`, `AGENT DONE`, `AGENT BLOCKED`, `AGENT HUMAN HOLD`, `AGENT APPLIED`, and `AGENT STATUS`. |
| Smoke tests | Basic claim/done, blocked/resume, human-hold, and optional-directory behavior before trusting the engine. |

# Minimum Viable Engine

1. One Linear team and one project.
2. Six statuses: `Standing`, `Agent Todo`, `Agent Working`, `Agent Needs Input`, `Agent Review`, `Agent Done`.
3. Exact `agent-instructions` label.
4. Stable runtime agent codes.
5. One local private context file per runtime.
6. Standing setup issue, optional skill directory issue, and status ledger issue.
7. A runner that stops after exactly one task issue.

# Design Strength

Open Engine is strong because it makes agent coordination observable and restartable. Linear becomes the audit trail; statuses become locks and pause states; comments become receipts; the local context file gives every runtime a repeatable starting point.

# Design Risk

The framework depends on strict naming and version discipline. If a runtime's local context, Linear standing issue, and ledger drift apart, the loop still appears to run but loses its safety guarantees. The highest-risk failure is a stale or over-broad runner claiming work outside its lane.

# Citations

[1] [Open Engine | Unlock AI](https://unlock-ai.natebjones.com/open-engine)  
[2] [Linear MCP docs](https://linear.app/docs/mcp)  
[3] [OKF v0.1 spec](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md)

