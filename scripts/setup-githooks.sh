#!/usr/bin/env bash
# Point this repo at tracked hooks in .githooks/ (version bump, etc.).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

echo "Git hooksPath → .githooks (pre-commit: auto app version bump)"
echo "Skip once: SKIP_VERSION_BUMP=1 git commit …"
echo "Skip in message: [skip version]"
