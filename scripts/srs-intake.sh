#!/usr/bin/env bash
# srs-intake.sh — run the SRS manual intake with credentials from 1Password.
#
#   bash scripts/srs-intake.sh --file="<SRSICORP_...csv>" [--pdf-dir="<folder>"] [--preflight-only]
#
# The Supabase key is resolved by `op run` from config/srs-intake.env.tpl and exists only
# in the child process's environment. It is never written to disk and never printed.
# Full procedure and the judgement steps that follow: .claude/skills/srs-intake/SKILL.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TPL="$ROOT/config/srs-intake.env.tpl"

command -v op >/dev/null 2>&1 || { echo "1Password CLI (op) not found. Install it or sign in first." >&2; exit 1; }
command -v pdftotext >/dev/null 2>&1 || { echo "pdftotext not found (brew install poppler)." >&2; exit 1; }
[ -f "$TPL" ] || { echo "missing $TPL" >&2; exit 1; }

cd "$ROOT"
exec op run --env-file="$TPL" -- node scripts/invoice-audit-v2/srs-intake.mjs "$@"
