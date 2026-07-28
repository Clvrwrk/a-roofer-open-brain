#!/usr/bin/env python3
from pathlib import Path
import re
import sys

path = Path(sys.argv[1]) if len(sys.argv) == 2 else Path("report.md")
text = path.read_text(encoding="utf-8") if path.is_file() else ""
errors = []

for section in ("# Review Report", "## Summary", "## Findings", "## Clean", "## Assumptions"):
    if section not in text:
        errors.append(f"missing {section}")
for phrase in ("30-minute", "Composio", "Gmail", "Linear", "Slack", "91/91"):
    if phrase.lower() not in text.lower():
        errors.append(f"missing required evidence phrase: {phrase}")
if not re.search(r"^MACHINE_VERDICT: PASS\s*$", text, re.MULTILINE):
    errors.append("MACHINE_VERDICT must be PASS")
if re.search(r"(?:\*\*Priority:\*\*|Priority:)\s*P[01]\b", text, re.IGNORECASE):
    errors.append("P0/P1 finding remains")
if len(text.splitlines()) < 24:
    errors.append("review is not substantive")

if errors:
    print("mailbox review failed: " + "; ".join(errors))
    raise SystemExit(1)
print("mailbox review passed with required evidence and no P0/P1")
