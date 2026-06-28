# DevTeam host deployment (Hetzner 5.78.146.161)

Install Open Brain dev-plane automation alongside roofing agent ticks.

## One-time setup

```bash
# On agent host as root
mkdir -p /opt/openbrain/scripts
# Sync repo scripts: agent-tick.sh, open-engine-queue-runner.mjs, uptime-check.sh, provision-dev-agent-env.sh

cp deployment/remote/systemd/openbrain-dev-tick@.service /etc/systemd/system/
cp deployment/remote/systemd/openbrain-dev-tick@.timer /etc/systemd/system/
cp deployment/remote/systemd/openbrain-open-engine.service /etc/systemd/system/
cp deployment/remote/systemd/openbrain-open-engine.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now openbrain-dev-tick@pe-cc-agents.timer
systemctl enable --now openbrain-open-engine.timer
```

## Environment

Create `/opt/openbrain/dev-plane.env`:

```bash
LINEAR_API_KEY=...
OPEN_ENGINE_AGENT_CODE=pe-cc-agents
HERMES_IMAGE_TAG=openbrain-hermes-chrome:1.18.0-20260606
```

Run `bash scripts/provision-dev-agent-env.sh --apply` from operator machine (never commit secrets).

## Cron jobs

```bash
python3 scripts/deploy-dev-crons.py --apply   # when SSH to host available
```

Job definitions: [`agents/cadences/dev-team-cron-jobs.json`](../../agents/cadences/dev-team-cron-jobs.json)

## Webhooks (Command Center)

- GitHub → `POST https://cc.proexteriorsus.net/api/dev/webhooks/github`
- Sentry → `POST https://cc.proexteriorsus.net/api/dev/webhooks/sentry`

Configure `GITHUB_WEBHOOK_SECRET` and `SENTRY_WEBHOOK_SECRET` in Coolify env.

## Verification

```bash
node scripts/open-engine-preflight.mjs
bash scripts/uptime-check.sh && echo OK || echo FAIL
journalctl -u openbrain-open-engine.service -n 20
```
