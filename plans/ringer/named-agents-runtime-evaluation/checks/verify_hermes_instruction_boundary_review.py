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

required = {
    "normal-request behavior": r"normal user request",
    "exact short reply behavior": r"exact short reply",
    "identity boundary": r"identity",
    "safety boundary": r"safety rules?",
    "tool boundary": r"tool limits?",
    "protected-information boundary": r"credentials?|hidden policy|protected information",
    "prior failure phrase removal": r"never instructions",
    "runner citation": r"hermes-runner\.mjs",
    "persona citation": r"SOUL\.md",
    "test citation": r"lifecycle\.test\.mjs",
    "executed suite": r"\b72\b[^\n]{0,40}\bpass|\bpass[^\n]{0,40}\b72\b",
}
for label, pattern in required.items():
    if not re.search(pattern, text, re.IGNORECASE):
        errors.append(f"missing {label}")

if not re.search(r"^MACHINE_VERDICT: PASS\s*$", text, re.MULTILINE):
    errors.append("MACHINE_VERDICT must be PASS")
if re.search(r"(?:\*\*Priority:\*\*|Priority:)\s*P[01]\b", text, re.IGNORECASE):
    errors.append("P0/P1 finding remains")
if len(text.splitlines()) < 25:
    errors.append("review is not substantive")

if errors:
    print("Hermes instruction-boundary review failed: " + "; ".join(errors))
    raise SystemExit(1)
print("Hermes instruction-boundary review passed with behavior and safety evidence")
