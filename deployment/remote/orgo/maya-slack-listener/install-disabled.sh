#!/usr/bin/bash
set -euo pipefail

umask 077
[[ "$(/usr/bin/id -u)" == "0" ]] || { echo "root required" >&2; exit 1; }

readonly source_dir="/root/pec78-maya-slack-listener-staging"
readonly release_parent="/opt/pe-cc-agents"
readonly release_dir="${release_parent}/maya-slack-listener"
readonly incoming_dir="${release_parent}/.maya-slack-listener.incoming"
readonly hermes_home="${release_parent}/maya-hermes-home"
readonly agent_home="/home/orgo/maya-agent"
readonly rollback_dir="${release_parent}/rollback"
readonly supervisor_config="/etc/supervisor/conf.d/maya-slack-listener.conf"
readonly log_dir="/var/log/pe-cc-agents"
readonly log_file="${log_dir}/maya-slack-listener.log"

backup_dir=""
rollback_armed=0
had_release=0
had_config=0
had_hermes_home=0
release_hash=""
config_hash=""
hermes_hash=""
hermes_lock_mode=""
supervisor_output=""
supervisor_rc=0

capture_supervisor_status() {
  if supervisor_output="$(/usr/bin/supervisorctl status maya-slack-listener 2>&1)"; then
    supervisor_rc=0
  else
    supervisor_rc=$?
  fi
}

require_supervisor_status() {
  /usr/bin/node "$source_dir/supervisor-status.mjs" "$1" "$supervisor_rc" "$supervisor_output"
}

rollback_on_error() {
  readonly exit_code="$?"
  trap - ERR
  rollback_failed=0
  if [[ "$rollback_armed" != "1" || -z "$backup_dir" ]]; then
    echo "installation failed before release replacement; the prior release was not changed" >&2
    exit "$exit_code"
  fi
  if [[ "$rollback_armed" == "1" && -n "$backup_dir" ]]; then
    if [[ -d "$release_dir" ]]; then
      /usr/bin/mv "$release_dir" "$backup_dir/failed-release" || rollback_failed=1
    fi
    if [[ "$had_release" == "1" && -d "$backup_dir/release" ]]; then
      /usr/bin/mv "$backup_dir/release" "$release_dir" || rollback_failed=1
    fi
    if [[ -d "$hermes_home" ]]; then
      /usr/bin/mv "$hermes_home" "$backup_dir/failed-hermes-home" || rollback_failed=1
    fi
    if [[ "$had_hermes_home" == "1" && -d "$backup_dir/hermes-home" ]]; then
      /usr/bin/mv "$backup_dir/hermes-home" "$hermes_home" || rollback_failed=1
    fi
    if [[ -n "$hermes_lock_mode" ]]; then
      /usr/bin/chmod "$hermes_lock_mode" /usr/local/lib/hermes-agent/venv/.lock || rollback_failed=1
    fi
    if [[ "$had_config" == "1" && -f "$backup_dir/maya-slack-listener.conf" ]]; then
      /usr/bin/install -o root -g root -m 0644 \
        "$backup_dir/maya-slack-listener.conf" "$supervisor_config" || rollback_failed=1
    else
      /usr/bin/rm -f "$supervisor_config" || rollback_failed=1
    fi
    if ! /usr/bin/supervisorctl reread >/dev/null 2>&1; then rollback_failed=1; fi
    if ! /usr/bin/supervisorctl update >/dev/null 2>&1; then rollback_failed=1; fi
    capture_supervisor_status
    restored_expected="absent"
    if [[ "$had_config" == "1" ]]; then restored_expected="stopped"; fi
    release_hash_arg="${release_hash:--}"
    config_hash_arg="${config_hash:--}"
    hermes_hash_arg="${hermes_hash:--}"
    if ! /usr/bin/node "$source_dir/install-restoration.mjs" \
      "$release_dir" "$release_hash_arg" "$supervisor_config" "$config_hash_arg" \
      "$hermes_home" "$hermes_hash_arg" /usr/local/lib/hermes-agent/venv/.lock \
      "$hermes_lock_mode" "$restored_expected" "$supervisor_rc" "$supervisor_output"; then
      rollback_failed=1
    fi
  fi
  if [[ "$rollback_failed" == "1" ]]; then
    echo "installation failed and rollback is incomplete; artifacts remain in $backup_dir" >&2
    exit 70
  fi
  echo "installation failed; prior stopped state was restored and artifacts remain in $backup_dir" >&2
  exit "$exit_code"
}

trap rollback_on_error ERR

[[ "$(/usr/bin/stat -c '%u:%g:%a' "$source_dir")" == "0:0:700" ]] || {
  echo "staging directory trust check failed" >&2
  exit 1
}
/usr/bin/find "$source_dir" -type l -print -quit | /usr/bin/grep -q . && {
  echo "staging directory contains a symbolic link" >&2
  exit 1
}
/usr/bin/find "$source_dir" \( ! -user root -o ! -group root -o -perm /022 \) -print -quit | \
  /usr/bin/grep -q . && {
    echo "staging directory ownership or mode check failed" >&2
    exit 1
  }

/usr/bin/node "$source_dir/installer-preflight.mjs"

capture_supervisor_status
preinstall_expected="absent"
if [[ -f "$supervisor_config" ]]; then preinstall_expected="stopped"; fi
if ! require_supervisor_status "$preinstall_expected"; then
  echo "refusing replacement without exact stopped-state proof" >&2
  exit 1
fi

if ! /usr/bin/getent group maya-agent >/dev/null; then
  /usr/sbin/groupadd --system maya-agent
fi
if ! /usr/bin/id maya-agent >/dev/null 2>&1; then
  /usr/sbin/useradd --system --home-dir "$agent_home" --gid maya-agent --groups orgo --shell /usr/sbin/nologin maya-agent
fi

/usr/bin/install -d -o root -g root -m 0755 "$release_parent"
/usr/bin/install -d -o root -g root -m 0700 "$rollback_dir"
/usr/bin/install -d -o root -g root -m 0750 "$log_dir"
/usr/bin/install -o root -g root -m 0640 /dev/null "$log_file"
/usr/bin/install -d -o maya-agent -g maya-agent -m 0700 \
  "$agent_home" "$agent_home/secrets" "$agent_home/runtime" "$agent_home/state" \
  "$agent_home/state/receipts"

if [[ -e "$incoming_dir" || -L "$incoming_dir" ]]; then
  echo "stale incoming release requires operator review: $incoming_dir" >&2
  exit 1
fi
/usr/bin/install -d -o root -g root -m 0755 "$incoming_dir"
/usr/bin/find "$source_dir" -maxdepth 1 -type f -exec /usr/bin/cp --preserve=mode,timestamps {} "$incoming_dir/" \;
(
  cd "$incoming_dir"
  /usr/bin/npm ci --omit=dev --ignore-scripts
)
if [[ -d "$incoming_dir/node_modules/.bin" ]]; then
  /usr/bin/rm -rf "$incoming_dir/node_modules/.bin"
fi
/usr/bin/find "$incoming_dir" -type l -print -quit | /usr/bin/grep -q . && {
  echo "release contains a symbolic link" >&2
  exit 1
}
/usr/bin/chown -R root:root "$incoming_dir"
/usr/bin/find "$incoming_dir" -type d -exec /usr/bin/chmod 0755 {} +
/usr/bin/find "$incoming_dir" -type f -exec /usr/bin/chmod 0644 {} +
/usr/bin/chmod 0755 "$incoming_dir/start-listener.sh" "$incoming_dir/hermes-no-file-logging.py"

if [[ -d "$release_dir" ]]; then
  had_release=1
  release_hash="$(/usr/bin/node "$source_dir/tree-integrity.mjs" "$release_dir")"
fi
if [[ -f "$supervisor_config" ]]; then
  had_config=1
  config_hash="$(/usr/bin/sha256sum "$supervisor_config")"
  config_hash="${config_hash%% *}"
fi
if [[ -d "$hermes_home" ]]; then
  had_hermes_home=1
  hermes_hash="$(/usr/bin/node "$source_dir/tree-integrity.mjs" "$hermes_home")"
fi
hermes_lock_mode="$(/usr/bin/stat -c '%a' /usr/local/lib/hermes-agent/venv/.lock)"
backup_dir="$(/usr/bin/mktemp -d "${rollback_dir}/install.XXXXXXXX")"
rollback_armed=1
if [[ "$had_release" == "1" ]]; then
  /usr/bin/mv "$release_dir" "$backup_dir/release"
fi
if [[ "$had_config" == "1" ]]; then
  /usr/bin/install -o root -g root -m 0600 "$supervisor_config" \
    "$backup_dir/maya-slack-listener.conf"
fi
if [[ "$had_hermes_home" == "1" ]]; then
  /usr/bin/mv "$hermes_home" "$backup_dir/hermes-home"
fi
/usr/bin/mv "$incoming_dir" "$release_dir"
/usr/bin/install -d -o root -g root -m 0755 "$hermes_home"
/usr/bin/install -o root -g root -m 0644 "$release_dir/SOUL.md" "$hermes_home/SOUL.md"
/usr/bin/install -o root -g root -m 0644 "$release_dir/config.yaml" "$hermes_home/config.yaml"
/usr/bin/install -d -o root -g root -m 0755 \
  "$hermes_home/cron" "$hermes_home/cron/output" \
  "$hermes_home/sessions" "$hermes_home/logs" "$hermes_home/logs/curator" \
  "$hermes_home/memories" "$hermes_home/pairing" "$hermes_home/hooks" \
  "$hermes_home/image_cache" "$hermes_home/audio_cache" "$hermes_home/skills"
/usr/bin/chmod 0644 /usr/local/lib/hermes-agent/venv/.lock
/usr/bin/env -i \
  PATH="/usr/local/lib/hermes-agent/venv/bin:/usr/bin:/bin" \
  PYTHONPATH="/usr/local/lib/hermes-agent" \
  PYTHONDONTWRITEBYTECODE="1" \
  /usr/local/lib/hermes-agent/venv/bin/python3 \
  "$release_dir/verify-hermes-no-tools.py" "$hermes_home/config.yaml"
/usr/bin/install -o root -g root -m 0644 "$release_dir/maya-slack-listener.conf" \
  "$supervisor_config"
/usr/bin/supervisorctl reread
/usr/bin/supervisorctl update
capture_supervisor_status
if ! require_supervisor_status stopped; then
  echo "installed-disabled invariant failed without exact stopped-state proof" >&2
  false
fi
rollback_armed=0
trap - ERR

echo "Maya Slack listener installed and verified stopped; rollback: $backup_dir"
