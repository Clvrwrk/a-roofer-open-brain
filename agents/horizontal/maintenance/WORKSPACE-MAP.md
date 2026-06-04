# Workspace Map

Read this before broad search. Its job is to keep agent orientation cheap.

## Start Here

| Need | Read |
| --- | --- |
| Workforce roster and worktree discipline | `AGENTS.md` |
| Shared repo rules | `CONVENTIONS.md` |
| Full app transition plan | `docs/22-gsd-app-transition-roadmap.md` |
| Department cadence and cron model | `docs/23-agent-task-cadence-and-cron.md` |
| Maintenance front desk rules | `agents/horizontal/maintenance/FRONT-DESK.md` |
| Production platform PRD | `docs/15-prd-agent-platform.md` |
| Frontend Command Center spec | `docs/17-frontend-command-center-spec.md` |

## Core Folders

| Path | What lives here |
| --- | --- |
| `agents/` | The 13-agent workforce charters and IO contracts. |
| `config/` | Client config, env examples, and brand/design tokens. |
| `deployment/remote/dashboard/` | Current prototype dashboard slated for Astro SSR migration. |
| `docs/` | Architecture, product, security, UI, integration, and transition docs. |
| `integrations/bridges/` | External system bridge contracts and handlers. |
| `recipes/` | Repeatable business workflows used by agents. |
| `schemas/` | OB1 base and roofer-specific SQL migrations. |
| `scripts/` | Repo automation, verification, and maintenance tools. |
| `server/` | Deno MCP/server runtime. |
| `skills/` | Agent skills and metadata. |
| `standards/` | QC-owned standards, including design-system rules. |

## Planned Folders

| Path | Purpose |
| --- | --- |
| `app/command-center/` | Future production UI once the dashboard migrates out of `deployment/remote/dashboard/`. |
| `data/` | Sanitized seed/reference data only. |
| `imports/` | Gitignored raw import inbox for copied projects. |
| `private/` | Gitignored client-private working files. |

## Do Not Treat As Source Of Truth

- `node_modules/`, `dist/`, `.astro/`, caches, zips, logs, and generated exports.
- Raw copied folders at repo root until they are inventoried and moved through a manifest.
- Nested `.git` folders inside imported projects; those are separate histories and need a deliberate import decision.

## Current App Direction

The app target is a human-in-the-loop Command Center:

- Departments: Accounting, Operations, Sales, Marketing, Executive, plus horizontal system agents.
- Cadences: daily, weekly, monthly, quarterly, annual, and ad hoc.
- Agent work states: proposed, needs review, approved, queued, running, blocked, done, audited.
- Humans approve external or irreversible actions; agents can prepare, recommend, and execute only inside their trust tier.

The development operating loop should follow GSD Core: Discuss, optional UI design, Plan, Execute, Verify, Ship.
