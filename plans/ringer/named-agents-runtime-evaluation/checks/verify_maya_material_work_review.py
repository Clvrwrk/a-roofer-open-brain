#!/usr/bin/env python3
"""Verify the independent review of Maya's new durable context and email rule."""

from pathlib import Path
import re
import sys


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


if len(sys.argv) != 2:
    fail("usage: verify_maya_material_work_review.py REPORT")

report = Path(sys.argv[1]).read_text(encoding="utf-8")
required = (
    "# Review Report",
    "## Summary",
    "## Findings",
    "## Clean",
    "## Assumptions",
    "Vehicle Master List",
    "WEX",
    "VIN",
    "unit number",
    "license plate",
    "admin@cc.proexteriorsus.net",
    "does not widen",
    "73",
    "MACHINE_VERDICT: PASS",
)

missing = [item for item in required if item.lower() not in report.lower()]
if missing:
    fail("missing required evidence: " + ", ".join(missing))

if re.search(r"(?:priority|severity)\s*:\s*P[01]\b", report, flags=re.IGNORECASE):
    fail("PASS report contains a blocking or high-severity finding")

if not re.search(r"73\s+(?:tests?\s+)?pass", report, flags=re.IGNORECASE):
    fail("report does not state that all 73 tests passed")

print("PASS: review covers fleet/WEX memory, non-widening CC policy, and 73 passing tests")
