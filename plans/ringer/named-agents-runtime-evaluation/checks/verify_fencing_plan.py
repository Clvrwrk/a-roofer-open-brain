#!/usr/bin/env python3
from pathlib import Path
import re, sys

path = Path.cwd() / "plan.md"
failures = []
if not path.is_file(): failures.append("missing plan.md")
else:
    text = path.read_text()
    for h in ("Verdict", "Exact Targets", "Protected Exclusions", "Preflight Evidence", "Action Sequence", "Rollback", "Postchecks", "Stop Conditions"):
        if not re.search(rf"^## {re.escape(h)}$", text, re.M): failures.append(f"missing heading: {h}")
    verdict_section = text.split("## Exact Targets",1)[0]
    verdict_match = re.search(r"^\s*\*\*(PASS|BLOCKED|FAIL)\b", verdict_section, re.I | re.M)
    verdict = verdict_match.group(1).upper() if verdict_match else ""
    if verdict in {"BLOCKED", "FAIL"}:
        failures.append("preflight verdict is blocked or failed")
    elif verdict != "PASS":
        failures.append("preflight must explicitly PASS")
    for token in ("roofing-ops-slack-listeners.service", "SIGTERM", "jobs.json", "10 minutes", "Kasm", "ABC sync", "Command Center"):
        if token not in text: failures.append(f"missing control: {token}")
    if "Alex and Ops Conductor only" not in text: failures.append("must limit JSON mutation to Alex and Ops Conductor only")
    if "value-free receipt" not in text or "private rollback artifact" not in text: failures.append("must separate value-free receipts from private rollback artifacts")
    if re.search(r"sk_live_[A-Za-z0-9]{8,}|xox[baprs]-", text): failures.append("secret-like value present")
if failures:
    print("Fencing preflight failed:")
    for f in failures: print(f"- {f}")
    sys.exit(1)
print("Fencing preflight verification passed.")
