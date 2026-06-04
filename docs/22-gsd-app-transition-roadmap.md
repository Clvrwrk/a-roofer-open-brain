# GSD App Transition Roadmap

Status: draft v0.1  
Owner: Chris / Cleverwork  
Related: `docs/15-prd-agent-platform.md`, `docs/17-frontend-command-center-spec.md`, `agents/horizontal/maintenance/FRONT-DESK.md`

## Decision

Use [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) as the development operating loop for this app and future extended projects.

GSD Core stays as a referenced toolchain, not vendored source, unless a later phase explicitly installs or vendors it with MIT attribution. The repo adopts its phase rhythm: Discuss, optional UI design, Plan, Execute, Verify, Ship. For Codex, the GSD command syntax is `$gsd-command-name` after the installer is run for this runtime.

## Current State

- The repo has a strong brain scaffold: agent charters, schema migrations, integrations, recipes, deployment docs, and the prototype dashboard.
- The canonical checkout also has raw copied project folders at the root. Some are nested Git repos and some likely contain sensitive client files.
- Other agents are working on the product file. Maintenance should not move or rewrite product materials until a reviewed move manifest exists.
- The current UI prototype lives under `deployment/remote/dashboard/`; the production target is an Astro SSR Command Center.

## Transition Goals

1. Stabilize the workspace so AI agents can orient cheaply.
2. Install or initialize GSD Core locally when the team is ready to run the first app phase.
3. Create a full app from the existing dashboard, product files, and imported project material.
4. Classify recurring work by department and cadence.
5. Wire recurring work to cron-backed agent runs with human approval gates.

## Recommended GSD Setup

Run this only after raw imports are either moved into `imports/` or explicitly left in place for the first map:

```bash
npx @opengsd/gsd-core@latest
```

Choose the Codex runtime and local install. Then run the brownfield onboarding sequence:

```text
$gsd-map-codebase
$gsd-new-project --auto @docs/15-prd-agent-platform.md
$gsd-discuss-phase 1
$gsd-ui-phase 1
$gsd-plan-phase 1 --mvp --tdd
```

Maintenance keeps `WORKSPACE-MAP.md` aligned with the GSD codebase map so future agents read the short map first and the generated GSD artifacts second.

## Milestones

| Milestone | Goal | Output |
| --- | --- | --- |
| M0 Workspace Stabilization | Make the repo navigable before app work expands. | Front desk docs, inventory tool, import manifest, workspace map. |
| M1 Walking Skeleton | Create the production app shell with auth boundary and agent monitoring stub. | `app/command-center/` scaffold, WorkOS route guard, `/healthz`, `/agents`. |
| M2 Dashboard Migration | Move current prototype views into the app. | Command Center, audits, agreements, territories, fleet, settings. |
| M3 Cadence Engine | Model department/cadence tasks and cron-backed runs. | Work definitions, schedules, run history, locks, audit log. |
| M4 Human Approval Loop | Make HITL approval first-class. | Review queues, approval actions, Slack/Command Center handoff. |
| M5 Agent Expansion | Add more autonomous agent workflows on the same rails. | Conductor/Capture/Researcher runtime expansion, dashboards, Sentry signals. |

## Phase 1 Candidate

**Goal:** Build the Command Center walking skeleton.

Scope:

- Create `app/command-center/` as the Astro SSR app home.
- Port shared brand tokens from `config/brand/DESIGN.md`.
- Add WorkOS placeholders and server-only environment conventions.
- Add `/`, `/agents`, `/healthz`, and a protected layout.
- Show static department/cadence queues from example config first; wire live data in a later phase.
- Keep the existing `deployment/remote/dashboard/` prototype intact until migration passes verification.

Acceptance criteria:

- App builds locally.
- No service-role credentials or agent credentials reach the browser.
- The first viewport is the working command surface, not a marketing page.
- `/agents` shows Hermes/Maintenance status and the next scheduled cadence jobs.
- README explains how to run the app.

## Import Integration Rule

Imported project material is not merged directly into app code. Each imported folder gets one of three outcomes:

- **Reference:** stays in `imports/` or off-repo and informs implementation.
- **Curated source:** moved into a target folder with a README and attribution/provenance.
- **Sanitized extract:** sensitive raw material becomes a non-sensitive schema, fixture, doc summary, or config example.

## GSD + Agent Workforce Mapping

| GSD role | This repo equivalent |
| --- | --- |
| Project/codebase mapper | Maintenance/Hermes workspace map and GSD codebase map. |
| Planner | Conductor plus task-specific Codex agents. |
| Executor | Task worktree agent on an owned branch/path. |
| Verifier | Auditor for work-product QA; tests for code. |
| Ship | Human-approved PR/merge path. |
| Long-term standard changes | Quality Control, not Auditor or Maintenance. |

GSD does not replace the 13-agent workforce. It gives the workforce a repeatable build rhythm.
