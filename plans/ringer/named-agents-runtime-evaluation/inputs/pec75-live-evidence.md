# PEC-75 Sanitized Live Evidence

Captured: 2026-07-26, read-only.

## Orgo

- Full Master environment contains exactly one `ORGO_API_KEY_MASTER` assignment.
- Expected non-secret prefix check passed; complete value was not recorded.
- Live `GET /api/workspaces` returned HTTP 200.
- Workspace ID: `8cf44774-2b46-4089-8bfe-4deb1b078e46`
- Workspace name/status: `PE-open-brain` / `active`
- Workspace membership: 1
- Desktop ID: `37b262e0-a915-47e6-8c3b-f180a32ab6fe`
- Desktop name/status: `Maya Chen` / `running`
- Desktop is always-on; SSH is disabled.
- Resources: 1 CPU, 4 GB RAM, 8 GB disk.
- Declared terminal: `hermes-agent`.
- No other workspace or desktop was returned.

API response fields containing network endpoints, encrypted values, and template
tokens were deliberately excluded. Ringer workers must not seek or reproduce them.

## Linear program

- Project: `Named Agent Runtime Program — Ringer Governed`
- Human authority: Christopher Hussey is the sole human approver.
- PEC-75 is the active read-only inventory.
- PEC-76 is blocked by PEC-75.
- Maya chain: PEC-75 through PEC-89.
- Serial persona chain: PEC-90 through PEC-95.
- Specialist branches: PEC-96 and PEC-97, separately gated after PEC-76.
- Existing named Slack app personas are operator-confirmed; live token/socket health
  remains unverified.
- Target mailbox behavior is one fenced check every 30 minutes, decision recorded in
  Command Center, and contact only to Christopher through the named Slack persona or
  `admin@cc.proexteriorsus.net`. No sender reply in the initial operating phase.

## Authorization

This evidence supports read-only inventory only. It authorizes no Orgo creation,
Hermes/eve installation, scoped-key creation, mailbox access, Slack activation,
schedule activation, external message, database change, or deployment.

## Command Center and legacy agent host

Captured after the initial Ringer inventory, read-only:

- `https://cc.proexteriorsus.net/healthz` returned HTTP 200 with service
  `open-brain-command-center`, status `ok`, and build commit
  `a08c18563f6fee0708c13f8ed71c7a43271b4efa`.
- The health response exposed no per-agent component checks, so it does not prove
  Slack, Gmail, Hermes, scheduler, lease, or receipt-sink health.
- Read-only SSH to the configured agent host succeeded; hostname `pe-ob-agents`.
- `roofing-ops-slack-listeners.service` is enabled but inactive/dead with no main PID.
- Despite that unit state, eight per-persona wrapper processes and eight child
  `slack-socket-runtime.mjs` processes have run as root since 2026-06-29. Their
  wrappers are parented by PID 1, outside the inactive unit's control.
- Personas represented: Alex, Casey, Jordan, Maya, Lena, Rowan, Sam, and Ops
  Conductor. Process existence does not prove authenticated Slack sockets or safe
  effect behavior.
- Five localhost Hermes dashboard processes have run since 2026-06-14. A descendant
  `gateway restart` process and a Kasm `hermes cron list --all` command have remained
  present for weeks, indicating stuck/orphaned control activity.
- Root and Hermes user crontabs are empty.
- Systemd shows only the independent nightly ABC sync timer among relevant timers;
  the named-agent tick timer was not listed.
- Eight Hermes cron stores exist. Enabled jobs: Alex 1 of 4; Ops Conductor 3 of 3;
  all other persona stores 0 enabled. No host tick evidence proves those enabled jobs
  actually execute.
- One Hermes/Chrome workload container and the Kasm platform remain running. This
  confirms the legacy Kasm era is still present and not fenced from the target Orgo
  architecture.
- No logs, environment values, message contents, tokens, browser sessions, or
  customer data were read.
