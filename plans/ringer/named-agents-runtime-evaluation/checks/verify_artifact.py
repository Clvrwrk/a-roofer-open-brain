#!/usr/bin/env python3
"""Fail-closed structural checker for named-agent runtime plan artifacts."""

import argparse
from pathlib import Path
import re
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    parser.add_argument("--headings", nargs="+", required=True)
    parser.add_argument("--min-words", type=int, default=500)
    parser.add_argument("--require-url", action="store_true")
    parser.add_argument("--require-local-evidence", action="store_true")
    args = parser.parse_args()

    path = Path(args.artifact)
    if not path.is_file():
        print(f"FAIL: missing {path}")
        return 1
    text = path.read_text(encoding="utf-8")
    words = re.findall(r"\b[\w'-]+\b", text)
    failures = []
    for heading in args.headings:
        if not re.search(rf"^##\s+{re.escape(heading)}\s*$", text, re.MULTILINE):
            failures.append(f"missing heading: {heading}")
    if len(words) < args.min_words:
        failures.append(f"only {len(words)} words; need {args.min_words}")
    if args.require_url and not re.search(r"https://", text):
        failures.append("no HTTPS source URL")
    if args.require_local_evidence and not re.search(
        r"(?:docs/|deployment/|app/command-center/|PEC-\d+)", text
    ):
        failures.append("no local path or Linear issue evidence")
    if re.search(r"\b(?:TODO|TBD|PLACEHOLDER)\b", text, re.IGNORECASE):
        failures.append("contains unfinished placeholder")
    if failures:
        print("FAIL: " + "; ".join(failures))
        return 1
    print(f"PASS: {path} ({len(words)} words)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
