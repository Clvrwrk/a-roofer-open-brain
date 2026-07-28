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

required_evidence = {
    "production rejection reason": r"malformed_attachment_container",
    "nullable files field": r"files[^\n]{0,80}null|null[^\n]{0,80}files",
    "nullable attachments field": r"attachments[^\n]{0,80}null|null[^\n]{0,80}attachments",
    "implementation citation": r"core\.mjs",
    "regression-test citation": r"core\.test\.mjs",
    "bot/self protection": r"bot(?:/|\s*(?:or|and)\s*)self|bot_or_self",
    "subtype protection": r"subtype|message_subtype",
    "executed test count": r"\b71\b[^\n]{0,40}\bpass|\bpass[^\n]{0,40}\b71\b",
}
for label, pattern in required_evidence.items():
    if not re.search(pattern, text, re.IGNORECASE):
        errors.append(f"missing {label}")

if not re.search(r"^MACHINE_VERDICT: PASS\s*$", text, re.MULTILINE):
    errors.append("MACHINE_VERDICT must be PASS")
if re.search(r"(?:\*\*Priority:\*\*|Priority:)\s*P[01]\b", text, re.IGNORECASE):
    errors.append("P0/P1 finding remains")
if len(text.splitlines()) < 25:
    errors.append("review is not substantive")

if errors:
    print("nullable Slack review failed: " + "; ".join(errors))
    raise SystemExit(1)
print("nullable Slack review passed with production-shape evidence and 71-test proof")
