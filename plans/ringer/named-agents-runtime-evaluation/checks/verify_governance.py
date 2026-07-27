#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[4]
governance = root / "docs/74-named-agent-runtime-ringer-governance.md"
linear_map = root / "plans/ringer/named-agents-runtime-evaluation/LINEAR-EXECUTION-MAP.md"
review = Path.cwd() / "review.md"

failures = []
for path in (governance, linear_map, review):
    if not path.exists():
        failures.append(f"missing required file: {path}")

if not failures:
    gov = governance.read_text()
    mapping = linear_map.read_text()
    report = review.read_text()
    required_gov = [
        "Ringer is the delivery gate", "A worker's claim of completion is never evidence",
        "ORGO_API_KEY_MASTER", "third-party-agent-tool gate", "three separate clean days",
        "Current authorization boundary", "first-try pass rate"
    ]
    required_map = [
        "Maya named-agent runtime pilot", "Serial named-agent rollout",
        "Specialist adjuncts", "Universal child-issue template", "Completion rule",
        "planning-only"
    ]
    required_report = [
        "## Verdict", "## Blocking Findings", "## Evidence Coverage",
        "## Linear Readiness", "## Authorization Boundary"
    ]
    for value in required_gov:
        if value not in gov:
            failures.append(f"governance missing: {value}")
    for value in required_map:
        if value not in mapping:
            failures.append(f"Linear map missing: {value}")
    for value in required_report:
        if value not in report:
            failures.append(f"review missing section: {value}")
    verdict = report.split("## Blocking Findings", 1)[0]
    if "FAIL" in verdict.upper():
        failures.append("independent reviewer returned FAIL")
    elif "PASS" not in verdict.upper():
        failures.append("review must give an explicit PASS verdict")
    if any(token in gov + mapping + report for token in ("sk_live_", "ORGO_API_KEY_MASTER=")):
        failures.append("secret-looking value or assignment found in artifacts")

if failures:
    print("Governance verification failed:")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print("Governance verification passed: Ringer gate, Linear structure, secret hygiene, and authorization boundary are explicit.")
