#!/usr/bin/bash
set -euo pipefail

umask 077
readonly agent_home="/home/orgo/maya-agent"
readonly secrets_dir="${agent_home}/secrets"
readonly env_file="${secrets_dir}/listener.env"
readonly release_dir="/opt/pe-cc-agents/maya-slack-listener"
readonly verifier="${release_dir}/verify-trust-chain.mjs"
readonly expected_uid="$(/usr/bin/id -u)"
readonly expected_gid="$(/usr/bin/id -g)"

require_owned_path() {
  local path="$1"
  local kind="$2"
  local mode="$3"
  [[ ! -L "$path" ]] || return 1
  if [[ "$kind" == "directory" ]]; then
    [[ -d "$path" ]] || return 1
  else
    [[ -f "$path" ]] || return 1
  fi
  [[ "$(/usr/bin/stat -c '%u:%g:%a' "$path")" == "${expected_uid}:${expected_gid}:${mode}" ]]
}

require_owned_path "$agent_home" directory 700
require_owned_path "$secrets_dir" directory 700
require_owned_path "$env_file" file 600

require_static_path() {
  local path="$1"
  local kind="$2"
  local mode="$3"
  [[ ! -L "$path" ]] || return 1
  if [[ "$kind" == "directory" ]]; then
    [[ -d "$path" ]] || return 1
  else
    [[ -f "$path" ]] || return 1
  fi
  [[ "$(/usr/bin/stat -c '%u:%g:%a' "$path")" == "0:0:${mode}" ]]
}

for path in / /usr /usr/bin /opt /opt/pe-cc-agents "$release_dir"; do
  require_static_path "$path" directory 755
done
require_static_path /usr/bin/node file 755
require_static_path /usr/bin/bash file 755
require_static_path /usr/bin/id file 755
require_static_path /usr/bin/stat file 755
require_static_path "$verifier" file 644
/usr/bin/node "$verifier"

set -a
# shellcheck disable=SC1091
. "$env_file"
set +a

: "${COMPOSIO_API_KEY:?missing Composio credential}"
: "${OPENROUTER_API_KEY:?missing inference credential}"

exec /usr/bin/env -i \
  HOME="$agent_home" \
  HERMES_HOME="/opt/pe-cc-agents/maya-hermes-home" \
  PATH="/usr/local/bin:/usr/bin:/bin" \
  NODE_ENV="production" \
  COMPOSIO_API_KEY="$COMPOSIO_API_KEY" \
  OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
  /usr/bin/node /opt/pe-cc-agents/maya-slack-listener/listener.mjs
