#!/usr/bin/bash

readonly pec78_env_file="$1"
readonly pec78_private_jwk_loader="$2"
readonly pec78_node_bin="$3"
pec78_private_jwk_raw=""
if ! pec78_private_jwk_raw="$("$pec78_node_bin" "$pec78_private_jwk_loader" "$pec78_env_file")"; then
  /usr/bin/printf 'invalid DPoP credential JSON\n' >&2
  return 1
fi
readonly pec78_private_jwk_raw

set -a
# shellcheck disable=SC1090
. "$pec78_env_file"
set +a

PEC78_MAYA_PRIVATE_JWK="$pec78_private_jwk_raw"
export PEC78_MAYA_PRIVATE_JWK
