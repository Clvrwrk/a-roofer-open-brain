#!/usr/bin/env bash
# check-harness-alignment.sh — verify every harness instruction file carries the
# session wrap-up contract (CONVENTIONS.md §13). Used as a Claude Code Stop hook
# so a session cannot quietly end with the harness files out of sync.
#
# Exit codes:
#   0  all harness files carry the wrap-up marker (silent)
#   2  one or more files are missing it — BLOCKING for a Stop hook; the reason on
#      stderr is fed back to the agent so it propagates the change before stopping
#
# Run standalone any time:  bash scripts/check-harness-alignment.sh

set -uo pipefail

# Resolve repo root regardless of where the hook invokes us from.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")"
cd "$ROOT" || exit 0   # if we can't even cd, don't block the session

# A file is "aligned" if it contains the wrap-up marker (case-insensitive).
MARKER='wrap-up\|wrapup'

# Fixed harness files + every Cursor rule file.
FILES=(CLAUDE.md AGENTS.md CONVENTIONS.md)
while IFS= read -r f; do FILES+=("$f"); done < <(ls .cursor/rules/*.mdc 2>/dev/null)

missing=()
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    # CLAUDE.md/AGENTS.md/CONVENTIONS.md are required; a missing one is drift.
    case "$f" in
      .cursor/rules/*) : ;;                 # optional — only checked if present
      *) missing+=("$f (file missing)") ;;
    esac
    continue
  fi
  if ! grep -qi "$MARKER" "$f"; then
    missing+=("$f")
  fi
done

if (( ${#missing[@]} > 0 )); then
  {
    echo "Harness alignment drift detected — these instruction files are missing the"
    echo "session wrap-up contract (CONVENTIONS.md §13):"
    for m in "${missing[@]}"; do echo "  - $m"; done
    echo
    echo "Propagate the wrap-up section to every harness file (CLAUDE.md, AGENTS.md,"
    echo "CONVENTIONS.md §13 = source of truth, .cursor/rules/*.mdc) so they match,"
    echo "then commit the alignment. See /wrapup step 5 (Agent alignment)."
  } >&2
  exit 2
fi

exit 0
