#!/usr/bin/env bash
# agent-tick.sh — headless Hermes cron tick for one agent profile (doc 56 / dev plan).
#
# Usage: bash scripts/agent-tick.sh <email-prefix>
# Example: bash scripts/agent-tick.sh pe-cc-agents
#
# On the agent host, systemd invokes:
#   bash /opt/openbrain/scripts/agent-tick.sh pe-cc-agents
set -euo pipefail

EMAIL_PREFIX="${1:?email prefix required (e.g. pe-cc-agents)}"
EMAIL="${EMAIL_PREFIX}@cc.proexteriorsus.net"
IMAGE_ID="${HERMES_IMAGE_ID:-2c589484-3521-41fc-bec6-ac785ae87dd7}"
IMAGE_TAG="${HERMES_IMAGE_TAG:-openbrain-hermes-chrome:1.18.0-20260606}"
PROFILE_ROOT="${KASM_PROFILE_ROOT:-/mnt/kasm_profiles}"

PROFILE="${PROFILE_ROOT}/${EMAIL}/${IMAGE_ID}/.hermes"
if [ ! -d "$PROFILE" ]; then
  echo "agent-tick: profile missing for ${EMAIL}" >&2
  exit 1
fi

docker run --rm \
  -v "${PROFILE}:/home/kasm-user/.hermes" \
  -e HOME=/home/kasm-user \
  "${IMAGE_TAG}" \
  hermes cron tick
