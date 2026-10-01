#!/usr/bin/bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "install-paused requires root" >&2; exit 1; }
[[ "$#" -eq 1 ]] || { echo "usage: install-paused.sh SOURCE_DIRECTORY" >&2; exit 1; }

source_directory="$(realpath "$1")"
release_root="/opt/cleverwork/maya-runtime-v1"
agent_root="/var/lib/cleverwork/maya-agent-v1"
supervisor_config="/etc/supervisor/conf.d/maya-runtime-v1.conf"
node_binary="/usr/local/bin/node"

[[ -f "${source_directory}/manifest.yaml" ]] || { echo "manifest missing" >&2; exit 1; }
[[ -z "$(find "$source_directory" -type l -print -quit)" ]] || { echo "symbolic links prohibited" >&2; exit 1; }
[[ -x "$node_binary" ]] || { echo "pinned Node.js runtime missing" >&2; exit 1; }
node_version="$($node_binary --version)"
[[ "$node_version" == "v22.22.3" ]] || { echo "pinned Node.js runtime mismatch" >&2; exit 1; }
"$node_binary" "${source_directory}/scripts/verify-package.mjs"

getent passwd maya-agent >/dev/null || /usr/sbin/useradd --system --home-dir "$agent_root" --shell /usr/sbin/nologin maya-agent
/usr/bin/install -d -o root -g root -m 0755 /opt/cleverwork
/usr/bin/install -d -o root -g root -m 0755 /var/lib/cleverwork
/usr/bin/install -d -o maya-agent -g maya-agent -m 0700 "$agent_root" "$agent_root/state" "$agent_root/gates"
/usr/bin/install -d -o root -g root -m 0750 /var/log/cleverwork

incoming="$(mktemp -d /opt/cleverwork/.maya-runtime-v1.incoming.XXXXXX)"
trap 'rm -rf "$incoming"' EXIT
/usr/bin/cp -a "${source_directory}/." "$incoming/"
/usr/bin/chown -R root:root "$incoming"
find "$incoming" -type d -exec chmod 0755 {} +
find "$incoming" -type f -exec chmod 0644 {} +
chmod 0755 "$incoming/runtime/install-paused.sh"

if [[ -e "$release_root" ]]; then
  echo "release already exists; use the versioned rollback runbook" >&2
  exit 1
fi
/usr/bin/mv "$incoming" "$release_root"
trap - EXIT
/usr/bin/install -o root -g root -m 0644 "$release_root/runtime/maya-runtime-v1.conf" "$supervisor_config"
/usr/bin/supervisorctl reread
/usr/bin/supervisorctl update
