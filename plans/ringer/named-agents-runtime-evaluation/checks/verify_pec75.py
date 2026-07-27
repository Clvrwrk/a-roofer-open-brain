#!/usr/bin/env python3
from pathlib import Path
import re, sys

report = Path.cwd() / "inventory.md"
failures = []
if not report.is_file():
    failures.append("missing inventory.md")
else:
    text = report.read_text()
    for heading in ("Verdict", "Observed Inventory", "Trigger Ownership", "Conflicts and Unknowns", "Freeze and Fencing", "Next Gate"):
        if not re.search(rf"^## {re.escape(heading)}$", text, re.M):
            failures.append(f"missing heading: {heading}")
    verdict = text.split("## Observed Inventory", 1)[0].upper()
    if "PASS" not in verdict and "BLOCKED" not in verdict:
        failures.append("verdict must be PASS or BLOCKED")
    for token in ("PEC-75", "PEC-76", "Christopher Hussey", "read-only"):
        if token not in text:
            failures.append(f"missing evidence token: {token}")
    if re.search(r"sk_live_[A-Za-z0-9]{8,}|vnc_password|desktopApiToken", text):
        failures.append("secret-like value or prohibited API field present")
    if len(re.findall(r"\b[\w'-]+\b", text)) < 350:
        failures.append("inventory is too shallow; require at least 350 words")

if failures:
    print("PEC-75 verification failed:")
    for failure in failures: print(f"- {failure}")
    sys.exit(1)
print("PEC-75 inventory verification passed.")
