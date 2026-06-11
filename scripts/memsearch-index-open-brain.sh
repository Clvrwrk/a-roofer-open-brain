#!/usr/bin/env bash
set -euo pipefail

if ! command -v memsearch >/dev/null 2>&1; then
  echo "memsearch is not installed or is not on PATH." >&2
  echo "Install with: uv tool install 'memsearch[onnx]'" >&2
  exit 1
fi

# NOTE: "context" already includes context/memory/ and context/transcripts/ —
# do not list subpaths again or files get walked twice (duplicate recall hits).
# .memsearch/memory/ lives OUTSIDE context/: it holds the MemSearch plugin's
# auto-captured per-turn summaries (CLI sessions), so it is added explicitly.
paths=("context")

if [ -d ".memsearch/memory" ]; then
  paths+=(".memsearch/memory")
fi

memsearch index "${paths[@]}" --collection open_brain_memory "$@"
