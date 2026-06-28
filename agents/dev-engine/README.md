# agents/dev-engine — Open Engine (DevTeam plane)

**Open Engine** is the on-demand orchestration layer for the **DevTeam** — the AI runtimes that
*build and maintain* the brain. It is **not** for the roofing operational agents (Alex, Maya, Casey,
Jordan, Sam, Rowan, Lena), which run on the scheduled Hermes cron cadence. See the full contract in
[`docs/58-dev-vs-ops-agent-delineation.md`](../../docs/58-dev-vs-ops-agent-delineation.md).

## What lives here

One **private-context** file per dev runtime: `pe-cc-<runtime>/SKILL.md` for
`claude`, `codex`, `cursor`, `hermes`, `warp`, `agents`. Each defines that runtime's identity,
its Linear wiring (team `PE-CC-DevTeam`, project `PE-CC-DevEngine`, label `agent-instructions`,
ledger `PEC-2`, standing `PEC-1`, optional-skills `PEC-3`), the **queue runner** (claim one Linear
issue titled `[agent instructions][pe-cc-<runtime>][task]` in *Agent Todo* → do the scoped work →
post a receipt → update the ledger → stop), and its safety boundaries.

## Hard boundaries (why this is a separate plane)

- **No brain access.** DevTeam runtimes never hold the roofing Supabase service token
  (`no_supabase_service_role: true`). They build the system; they do not read/write roofing data.
- **Linear, not the dashboard.** Dev work is tracked in Linear + receipts — never in
  `dashboard_action_log` (that is the roofing-ops surface).
- **The `pe-cc-hermes` seam.** Hermes-the-runtime is used in BOTH planes. The dev Hermes profile
  (here) is brain-less and Linear-driven; the roofing **Maintenance/Hermes** profile is a *separate*
  profile with brain access + crons. Same binary, two isolated homes — never one shared `.env`.

## Tracking

The `pe-cc-*/SKILL.md` context files **are** version-controlled (shared team infra; paths are
repo-relative, no secrets — Linear UUIDs only). Runtime byproducts (smoke tests, claimed-task working
files, local ledger state) are gitignored — see the `agents/dev-engine/**` rules in `.gitignore`.
