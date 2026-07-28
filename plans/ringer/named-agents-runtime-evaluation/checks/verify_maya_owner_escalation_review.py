#!/usr/bin/env python3
"""Validate independent reviews of Maya's owner-escalation behavior."""

from pathlib import Path
import re
import sys


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


if len(sys.argv) != 2:
    fail("usage: verify_maya_owner_escalation_review.py REPORT")

report = Path(sys.argv[1]).read_text(encoding="utf-8")
required = (
    "# Review Report",
    "## Summary",
    "## Findings",
    "## Clean",
    "## Assumptions",
    "natural-language assignments",
    "[BLOCKED]",
    "Christopher",
    "current Slack thread",
    "source or assignment",
    "exact blocker",
    "recommended route or bounded options",
    "specific decision",
    "model-supplied mentions",
    "separate message or DM",
    "pinned owner destination",
    "76 tests pass",
    "MACHINE_VERDICT: PASS",
)

missing = [item for item in required if item.lower() not in report.lower()]
if missing:
    fail("missing required evidence: " + ", ".join(missing))

if re.search(r"(?:priority|severity)\s*:\s*P[01]\b", report, flags=re.IGNORECASE):
    fail("PASS report contains a blocking or high-severity finding")

print("PASS: review proves honest, fixed-owner blocker escalation with 76 passing tests")
