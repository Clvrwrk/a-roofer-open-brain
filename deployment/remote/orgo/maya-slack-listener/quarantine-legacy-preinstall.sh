#!/usr/bin/bash
set -euo pipefail

umask 077
[[ "$(/usr/bin/id -u)" == "0" ]] || { echo "root required" >&2; exit 1; }

readonly source_dir="/home/orgo/maya-agent"
readonly release_parent="/opt/pe-cc-agents"
readonly rollback_dir="${release_parent}/rollback"
readonly supervisor_parser="/root/pec78-maya-slack-listener-staging/supervisor-status.mjs"
readonly transaction="/root/pec78-maya-slack-listener-staging/legacy-quarantine-transaction.mjs"
readonly stamp="$(/usr/bin/date -u +%Y%m%dT%H%M%SZ)"
readonly quarantine_dir="${rollback_dir}/legacy-maya-agent.${stamp}"
readonly evidence_file="${quarantine_dir}.sha256"

[[ "$(/usr/bin/stat -c '%F %u:%g:%a' /home/orgo)" == "directory 1001:1001:750" ]] || {
  echo "untrusted /home/orgo boundary" >&2
  exit 1
}
[[ "$(/usr/bin/stat -c '%F %u:%g:%a' "$source_dir")" == "directory 1001:1001:755" ]] || {
  echo "legacy source identity changed" >&2
  exit 1
}
[[ ! -L "$source_dir" ]] || { echo "legacy source may not be a symbolic link" >&2; exit 1; }
if /usr/bin/mountpoint -q "$source_dir"; then
  echo "legacy source may not be a mount point" >&2
  exit 1
fi
if /usr/bin/id maya-agent >/dev/null 2>&1; then
  echo "refusing quarantine after maya-agent identity creation" >&2
  exit 1
fi

readonly actual_top_level="$(
  /usr/bin/find "$source_dir" -xdev -mindepth 1 -maxdepth 1 -printf '%f\n' | /usr/bin/sort
)"
readonly expected_top_level=$'node_modules\npackage-lock.json\npackage.json'
[[ "$actual_top_level" == "$expected_top_level" ]] || {
  echo "legacy source contains an unexpected top-level entry" >&2
  exit 1
}
[[ -d "$source_dir/node_modules" && ! -L "$source_dir/node_modules" ]] || {
  echo "legacy node_modules boundary changed" >&2
  exit 1
}
for manifest in package.json package-lock.json; do
  [[ -f "$source_dir/$manifest" && ! -L "$source_dir/$manifest" ]] || {
    echo "legacy manifest boundary changed: $manifest" >&2
    exit 1
  }
done

supervisor_output=""
supervisor_rc=0
if supervisor_output="$(/usr/bin/supervisorctl status maya-slack-listener 2>&1)"; then
  supervisor_rc=0
else
  supervisor_rc=$?
fi
/usr/bin/node "$supervisor_parser" absent "$supervisor_rc" "$supervisor_output" >/dev/null

for target in "$release_parent" "$rollback_dir"; do
  if [[ -e "$target" || -L "$target" ]]; then
    expected_mode=755
    [[ "$target" == "$rollback_dir" ]] && expected_mode=700
    [[ "$(/usr/bin/stat -c '%F %u:%g:%a' "$target")" == "directory 0:0:${expected_mode}" ]] || {
      echo "untrusted quarantine parent: $target" >&2
      exit 1
    }
    [[ ! -L "$target" ]] || { echo "quarantine parent may not be a symbolic link" >&2; exit 1; }
  fi
done
[[ ! -e "$quarantine_dir" && ! -L "$quarantine_dir" ]] || {
  echo "quarantine destination already exists" >&2
  exit 1
}
[[ ! -e "$evidence_file" && ! -L "$evidence_file" ]] || {
  echo "quarantine evidence path already exists" >&2
  exit 1
}

/usr/bin/install -d -o root -g root -m 0755 "$release_parent"
/usr/bin/install -d -o root -g root -m 0700 "$rollback_dir"
[[ "$(/usr/bin/stat -c '%d' "$source_dir")" == "$(/usr/bin/stat -c '%d' "$rollback_dir")" ]] || {
  echo "quarantine requires a same-filesystem atomic rename" >&2
  exit 1
}
/usr/bin/node "$transaction" "$source_dir" "$quarantine_dir" "$evidence_file" "$rollback_dir"
