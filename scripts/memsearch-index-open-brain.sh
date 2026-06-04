#!/usr/bin/env bash
set -euo pipefail

if ! command -v memsearch >/dev/null 2>&1; then
  echo "memsearch is not installed or is not on PATH." >&2
  echo "Install with: uv tool install 'memsearch[onnx]'" >&2
  exit 1
fi

paths=("context")

if [ -d ".memsearch/memory" ]; then
  paths+=(".memsearch/memory")
fi

if [ -d "context/transcripts" ]; then
  paths+=("context/transcripts")
fi

memsearch index "${paths[@]}" --collection open_brain_memory "$@"
