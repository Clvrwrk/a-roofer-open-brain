#!/usr/bin/env bash
set -euo pipefail

[[ "$#" -eq 2 ]] || { echo "usage: create-transfer-archive.sh SOURCE_DIRECTORY ARCHIVE_PATH" >&2; exit 1; }

source_directory="$(realpath "$1")"
archive_parent="$(realpath "$(dirname "$2")")"
archive_path="${archive_parent}/$(basename "$2")"

[[ -d "$source_directory" ]] || { echo "source directory missing" >&2; exit 1; }
[[ ! -e "$archive_path" ]] || { echo "archive already exists" >&2; exit 1; }
[[ "$(node --version)" == v22.* ]] || { echo "Node.js 22 required" >&2; exit 1; }

node "${source_directory}/scripts/verify-package.mjs" >/dev/null
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$archive_path" -C "$source_directory" .

while IFS= read -r entry; do
  normalized="${entry#./}"
  case "$normalized" in
    .DS_Store|*/.DS_Store|._*|*/._*|__MACOSX|__MACOSX/*|*/__MACOSX/*)
      rm -f "$archive_path"
      echo "platform metadata entered transfer archive" >&2
      exit 1
      ;;
  esac
done < <(tar -tzf "$archive_path")

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$archive_path"
else
  shasum -a 256 "$archive_path"
fi
