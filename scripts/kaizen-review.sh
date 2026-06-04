#!/usr/bin/env bash
# kaizen-review.sh — assemble the monthly Maintenance Kaizen Review packet.
# Gathers the month's observations and drafts an A3-lite for Chris + AM review.
# See agents/horizontal/maintenance/PLAYBOOK.md §4.4 and proposals/_playbook-evolution-template.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OBS="$ROOT/agents/horizontal/maintenance/kaizen_observations.md"
TEMPLATE="$ROOT/proposals/_playbook-evolution-template.md"
MONTH="$(date +%Y-%m)"
OUT="$ROOT/proposals/${MONTH}-maintenance-kaizen.md"

[[ -f "$OBS" ]] || { echo "no observations log at $OBS"; exit 1; }
[[ -f "$TEMPLATE" ]] || { echo "missing template $TEMPLATE"; exit 1; }

echo "▸ Assembling Maintenance Kaizen Review for $MONTH"
if [[ -f "$OUT" ]]; then
  echo "! $OUT already exists — leaving it untouched (edit by hand)"; exit 0
fi

{
  echo "# Maintenance Kaizen Review — $MONTH"
  echo ""
  echo "> Auto-assembled by scripts/kaizen-review.sh on $(date +%Y-%m-%d)."
  echo "> Review owners: Chris + Account Manager. Decisions: accept / defer / kill (see PLAYBOOK §4.4)."
  echo ""
  echo "## Observations this month (from kaizen_observations.md)"
  echo ""
  sed -n '/<!-- BEGIN OBSERVATIONS -->/,/<!-- END OBSERVATIONS -->/p' "$OBS" 2>/dev/null \
    || echo "_(paste the month's observation rows here)_"
  echo ""
  echo "## Proposed playbook changes (A3-lite)"
  echo ""
  cat "$TEMPLATE"
} > "$OUT"

echo "✓ Draft written: ${OUT#$ROOT/}"
echo "  Next: Maintenance fills the A3-lite, posts to #cleverwork-internal, Chris+AM decide."
