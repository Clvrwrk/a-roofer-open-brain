#!/usr/bin/env bash
# lint-design.sh — validate a DESIGN.md against the DESIGN.md format spec.
#
# Wraps the @google/design.md CLI (Google Labs, Apache-2.0; spec vendored at
# standards/design/vendor/design.md/). Enforces standards/design/v1.md DSN-001:
# the brand file must lint with ZERO errors before any change ships.
#
# Usage:
#   scripts/lint-design.sh                       # lints config/brand/DESIGN.md
#   scripts/lint-design.sh path/to/DESIGN.md     # lints a specific file
#
# Exit code is the CLI's: 1 if errors are found, 0 otherwise.
set -euo pipefail

# Pin the CLI version so lint results are reproducible across machines/CI.
DESIGNMD_VERSION="${DESIGNMD_VERSION:-latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/config/brand/DESIGN.md}"

if [[ ! -f "$TARGET" ]]; then
  echo "lint-design: no DESIGN.md at '$TARGET'" >&2
  exit 2
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "lint-design: npx (Node.js) is required but not on PATH" >&2
  exit 2
fi

echo "lint-design: linting $TARGET (npx @google/design.md@$DESIGNMD_VERSION)" >&2
exec npx --yes "@google/design.md@${DESIGNMD_VERSION}" lint "$TARGET"
