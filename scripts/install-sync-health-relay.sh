#!/usr/bin/env bash
# Run only after the exact PR has human merge approval, on the approved agent host.
# Copy the EXISTING auditor token within this host into systemd's encrypted store.
# The relay itself runs as a dynamic user and cannot read the root environment.
set -euo pipefail
ROOT=/opt/openbrain/a-roofers-open-brain
[ "$(id -u)" = 0 ] || { echo 'root is required for service installation' >&2; exit 1; }
cd "$ROOT"
# Isolated official runtime: do not change /usr/bin/node or other host jobs.
NODE=/opt/openbrain/runtimes/node-v22.23.4-linux-x64/bin/node
if [ ! -x "$NODE" ]; then
  RUNTIME_TMP=$(mktemp -d /tmp/openbrain-relay-node.XXXXXX)
  trap 'rm -rf "$RUNTIME_TMP"' EXIT
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --max-time 120 \
    https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz -o "$RUNTIME_TMP/node.tar.xz"
  printf '%s  %s\n' 1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce "$RUNTIME_TMP/node.tar.xz" | sha256sum --check --status
  install -d -m 0755 /opt/openbrain/runtimes
  tar -xJf "$RUNTIME_TMP/node.tar.xz" -C /opt/openbrain/runtimes
fi
"$NODE" -e 'if(process.versions.node!=="22.23.4"||process.versions.undici!=="6.29.1")process.exit(1)'
install -d -m 0700 /etc/credstore.encrypted
"$NODE" --input-type=module - <<'JS' | systemd-creds encrypt --name=auditor - /etc/credstore.encrypted/openbrain-sync-health-relay
import {readFileSync} from 'node:fs';
import {relayToken} from './scripts/sync-health-relay.mjs';
const token=relayToken(readFileSync('.env','utf8'));
if(!token)throw Error('existing auditor credential missing');
process.stdout.write(token);
JS
chmod 0600 /etc/credstore.encrypted/openbrain-sync-health-relay
install -m 0644 deployment/remote/systemd/openbrain-sync-health-relay.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now openbrain-sync-health-relay.timer
systemctl start openbrain-sync-health-relay.service
systemctl is-active openbrain-sync-health-relay.timer
