# Roofing-Ops Runtime Status — 2026-06-29

## Completed

- Hermes Agent v0.17.0 installed on `pe-ob-agents`.
- Open Brain repo/docs/skills synced to `/opt/openbrain/a-roofers-open-brain`.
- Node 22 installed under `/opt/node22`.
- Command Center app dependencies installed under `/opt/openbrain/a-roofers-open-brain/app/command-center`.
- Per-agent Hermes homes created under `/opt/openbrain/hermes-homes/<agent>`.
- Per-agent `.env`, `SOUL.md`, and `config.yaml` installed.
- Slack `xapp` Socket Mode tokens merged for all named agents.
- Runtime identity set via `ROOFING_OPS_RUNTIME_AGENT` for each listener.
- Eight Slack Socket Mode listeners started:
  - maya
  - alex
  - casey
  - jordan
  - sam
  - rowan
  - lena
  - ops
- Systemd unit installed/enabled: `roofing-ops-slack-listeners.service`.

## Runtime paths

- Listener start script: `/opt/openbrain/start-roofing-ops-slack-listeners.sh`
- Env loader: `/opt/openbrain/run-slack-listener-with-env.mjs`
- Logs: `/var/log/openbrain/roofing-ops-slack/*.log`
- PID files: `/var/run/openbrain/roofing-ops-slack/*.pid`
- Repo/docs: `/opt/openbrain/a-roofers-open-brain`
- Hermes homes: `/opt/openbrain/hermes-homes/<agent>`

## Behavior now wired

Slack event → Socket Mode listener → agent runtime identity → Hermes CLI invocation with per-agent `HERMES_HOME` → Slack threaded reply.

The runtime still uses conservative routing:

- in-channel ambient messages answer only when clearly in SOP;
- out-of-domain requests are ignored;
- overlapping requests route to Ops Conductor;
- undefined SOP / unsupported operational file/request routes to Ops Conductor and Linear payload path;
- Rowan research stays approval-gated;
- human DMs to named apps are allowed;
- bot/agent-to-agent DMs are ignored by bot-event guard.

## Validation still needed

A human-originated Slack test is required because bot-originated Slack messages do not reliably trigger app events.

Use `docs/roofing-ops-human-validation-request.md`.

Start with one quick test:

1. DM Maya: `Maya, quick runtime test — can you confirm you can see Open Brain docs and tell me your intake lane?`
2. Wait up to ~2 minutes for Hermes response.
3. If no response, inspect `/var/log/openbrain/roofing-ops-slack/maya.log`.
