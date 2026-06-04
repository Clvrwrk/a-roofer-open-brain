# AGENTS.md — the workforce + parallel-agent discipline

Two kinds of agents run per client brain: **vertical** (client-facing in Slack) and **horizontal** (infrastructure). Full charters live under [`agents/`](agents/). This file is the roster + the worktree discipline for AI agents building/maintaining the repo.

## The 13-agent workforce

### Vertical (5) — client-facing, mentioned in Slack

| Agent | Handle | Owns | Charter |
| --- | --- | --- | --- |
| Accounting | `@ob-accounting` | invoicing, AR/AP, job costing, change orders, draws, **insurance supplements**, close | [`agents/vertical/accounting/ROLE.md`](agents/vertical/accounting/ROLE.md) |
| Operations | `@ob-ops` | scheduling, crews, subs, daily logs, materials, **tear-off/install sequencing**, safety, permits | [`agents/vertical/ops/ROLE.md`](agents/vertical/ops/ROLE.md) |
| Sales | `@ob-sales` | leads, **storm canvassing**, estimates, **insurance claims**, proposals, follow-up, win/loss | [`agents/vertical/sales/ROLE.md`](agents/vertical/sales/ROLE.md) |
| Marketing | `@ob-marketing` | content, reviews, photos, **EEAT flywheel**, schema.org, manufacturer-cert badges | [`agents/vertical/marketing/ROLE.md`](agents/vertical/marketing/ROLE.md) |
| Executive | `@ob-exec` | dashboards, KPIs, strategy, hiring, capacity | [`agents/vertical/exec/ROLE.md`](agents/vertical/exec/ROLE.md) |

### Horizontal (8) — infrastructure, mostly invisible

| Agent | Visibility | Owns | Charter |
| --- | --- | --- | --- |
| Capture | dashboard only | always-on atomization; dual-track debrief atomizer | [`agents/horizontal/capture/ROLE.md`](agents/horizontal/capture/ROLE.md) |
| Historian | via Conductor | **internal-only** retrieval w/ provenance | [`agents/horizontal/historian/ROLE.md`](agents/horizontal/historian/ROLE.md) |
| Researcher | dashboard only | **external-only** retrieval | [`agents/horizontal/researcher/ROLE.md`](agents/horizontal/researcher/ROLE.md) |
| Conductor | digests + routing | routing, escalation, daily/weekly digests, PM-tool sync | [`agents/horizontal/conductor/ROLE.md`](agents/horizontal/conductor/ROLE.md) |
| Auditor | gates work | per-work-product QA vs. current standard | [`agents/horizontal/auditor/ROLE.md`](agents/horizontal/auditor/ROLE.md) |
| Quality Control | convenes reviews | cross-job standard-setting (DMAIC); only role that edits `trust_tier` | [`agents/horizontal/quality-control/ROLE.md`](agents/horizontal/quality-control/ROLE.md) |
| Innovator | A3 proposals | scouts tech + internal patterns; proposes, never builds | [`agents/horizontal/innovator/ROLE.md`](agents/horizontal/innovator/ROLE.md) |
| Maintenance | weekly hygiene | 5S of the brain; never deletes/publishes | [`agents/horizontal/maintenance/ROLE.md`](agents/horizontal/maintenance/ROLE.md) |

The Historian/Researcher split is a **security boundary** (see `CONVENTIONS.md` §4). The Auditor/Quality-Control split is the **surgical M&M pattern** — the role that checks each operation is not the role that sets the standard.

## Parallel-agent worktree discipline (for building this repo)

When multiple AI agents work on this repo, do not share a checkout.

- Treat the main checkout as canonical for pulling, inspection, and creating worktrees.
- One git worktree per active agent/task. Descriptive folder + matching branch (`contrib/cleverwork/<task>`).
- **Start every agent task by naming the exact absolute path it owns. The assigned path is the boundary — not the chat.**
- Don't switch branches in the canonical repo while another agent may be working.
- Before staging: `git status --short`; stage only files belonging to the current task.
- After merge + clean worktree: `git worktree remove <path>`.

### Assignment template

```text
Repository worktree: /ABSOLUTE/PATH/TO/<task>-worktree
Branch:              contrib/cleverwork/<short-task-name>
Task:                <describe the exact work, naming the owned subtree>
```
