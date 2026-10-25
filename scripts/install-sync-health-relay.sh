#!/usr/bin/env bash
# Run only after the exact PR has human merge approval, on the approved agent host.
# Copy the EXISTING auditor token within this host into systemd's encrypted store.
# The relay itself runs as a dynamic user and cannot read the root environment.
set -euo pipefail
ROOT=/opt/openbrain/a-roofers-open-brain
[ "$(id -u)" = 0 ] || { echo 'root is required for service installation' >&2; exit 1; }
cd "$ROOT"
install -d -m 0700 /etc/credstore.encrypted
/usr/bin/node --input-type=module - <<'JS' | systemd-creds encrypt --name=auditor - /etc/credstore.encrypted/openbrain-sync-health-relay
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
