# 58 — DevTeam vs Roofing-Ops agent delineation

**Date:** 2026-06-28
**Status:** Contract agreed (this session). `open-engine/` → `agents/dev-engine/` committed; Hermes-seam + enforcement = build tasks below.
**Owner:** Chris (Cleverwork)
**Related:** [`docs/56`](56-headless-agent-scheduler-design.md) (roofing headless scheduler), [`docs/57`](57-alex-rivers-sops.md) (roofing SOPs), `agents/dev-engine/` (Open Engine), `agents/profiles/dev-team-profiles.yaml`, `agents/cadences/dev-team-architecture.yaml`, `agents/cadences/roofing-agent-master-cadence.yaml`.

---

## 1. Why this exists

Two different kinds of agent live in this repo and must NOT bleed into each other:

- **DevTeam** — the AI runtimes that **build and maintain the brain** (code review, security, bug
  triage, infra, repo hygiene). Orchestrated **on-demand** via **Open Engine** + Linear.
- **Roofing Ops** — the 7 personas that **run the roofing business** (pricing, intake, vendor comms,
  finance, QA, research, marketing). Orchestrated on a **scheduled Hermes cron cadence**.

`open-engine/` appeared as untracked infra on 2026-06-28; this doc draws the line so Open Engine is
scoped to the DevTeam only, and the roofing agents stay on their own plane.

## 2. The two planes

| Dimension | **DevTeam plane** (Open Engine) | **Roofing-Ops plane** |
| --- | --- | --- |
| Purpose | builds & maintains the brain | runs the roofing business |
| Members | dev runtimes `pe-cc-{claude,codex,cursor,hermes,warp,agents}`; dev agents (`dev-conductor`, `code-reviewer`, `security-guardian`, `bug-triager`, `sentry-analyst`, `uptime-monitor`, `integration-specialist`, `red-team`, `repo-janitor`, `skills-manager`, `tool-manager`, `memory-clerk`) | personas: Alex, Maya, Casey, Jordan, Sam, Rowan, Lena |
| Orchestration | **Open Engine** → Linear queue, claim-one-task, on-demand | **Hermes cron cadence** → scheduled SOPs (docs/56/57) |
| Work tracking | **Linear** (`PE-CC-DevTeam`) + receipts | **Command Center** (`dashboard_action_log`) + Slack |
| Brain access | **NONE** — `no_supabase_service_role: true` | Yes — Supabase service token (Rowan excluded, external-only) |
| Slack | dev workspace `T0B8QEGPVQW` | roofing channels (`#accounting-*`, etc.) |
| Repo home | `agents/dev-engine/` + `agents/profiles/dev-team-profiles.yaml` + `agents/cadences/dev-team-architecture.yaml` | `agents/profiles/{persona}.yaml` + `agents/cadences/roofing-agent-master-cadence.yaml` + `agents/horizontal` + `agents/vertical` |

## 3. Boundary rules (the contract)

1. **DevTeam never touches the roofing brain.** Every dev profile carries
   `no_supabase_service_role: true`; no dev runtime is given the roofing `SUPABASE_SERVICE_TOKEN`.
2. **Roofing never uses Open Engine / Linear.** Roofing agents are scheduled-cron only; their work
   is tracked in the Command Center + Slack, never as Linear issues.
3. **Separate tracking surfaces.** Dev work = Linear issues + receipts (`AGENT CLAIMED/DONE/…`).
   Roofing work = `dashboard_action_log` rows + Slack. Neither writes to the other's surface.
4. **Open Engine claims are runtime-scoped.** A `pe-cc-<runtime>` only claims Linear issues titled
   `[agent instructions][pe-cc-<runtime>][task]` — it cannot pick up another plane's work.

## 4. The `pe-cc-hermes` seam — RESOLVED: separate profiles per plane

Hermes-the-runtime is used in BOTH planes, which is the only real overlap. Resolution:

- **Dev Hermes** = the `agents/dev-engine/pe-cc-hermes/SKILL.md` profile — **brain-less**
  (`no_supabase_service_role: true`), Linear-driven, does dev tasks. Its Hermes home `.env` carries
  NO roofing Supabase token.
- **Roofing Hermes / Maintenance** = a **separate** Hermes profile (the brain librarian, `agents/horizontal/maintenance`) with brain access + the 5S crons.
- **Same binary, two isolated homes.** Never one shared `.env`/profile. A `provision-agent-env.sh`-style
  check should assert the dev Hermes profile has no `SUPABASE_SERVICE_TOKEN`.

## 5. Repo structure decision

- `open-engine/` → **`agents/dev-engine/`** (sits beside the roofing agents, clearly the dev plane).
- Context files **normalized** (machine-specific absolute `local_context_path` → repo-relative) and
  **committed** as shared team infra (Linear UUIDs are config, not secrets).
- Runtime byproducts (smoke tests, claimed-task working files, local ledger state) **gitignored**
  (`agents/dev-engine/**` rules). See `agents/dev-engine/README.md`.

## 6. Enforcement & build backlog

1. **Dev Hermes profile** — create the brain-less Linear-driven Hermes home, distinct from the
   roofing Maintenance profile; assert no `SUPABASE_SERVICE_TOKEN`.
2. **Provisioning guard** — extend `scripts/provision-agent-env.sh` (or a sibling) to verify the
   plane boundary: dev profiles get NO brain token; roofing profiles do (Rowan excepted).
3. **Membership map** — a single source listing each agent → plane (so a new agent is unambiguous).
4. **No-Linear-for-roofing check** — roofing personas have no Linear wiring; dev runtimes have no
   roofing channel/token.

## 7. Open items
- Map each `pe-cc-<runtime>` to which named dev agents it executes (runtime vs. dev-agent identity).
- Confirm the dev Slack workspace (`T0B8QEGPVQW`) is separate from the roofing Slack.
- Decide whether `agents/cadences/dev-team-architecture.yaml` (scheduled dev tasks) coexists with
  Open Engine's on-demand model, or is subsumed by it.
