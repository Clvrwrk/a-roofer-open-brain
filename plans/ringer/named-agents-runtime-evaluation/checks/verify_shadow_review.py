from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(f"missing review: {path}")
text = path.read_text()
required = ["# Review Report", "## Summary", "## Findings", "## Clean", "## Assumptions", "MACHINE_VERDICT:"]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"missing sections: {missing}")
if not re.search(r"MACHINE_VERDICT:\s*(PASS|FAIL)", text):
    raise SystemExit("missing parseable MACHINE_VERDICT")
for marker in ("Priority: P0", "Priority: P1"):
    if marker in text and "MACHINE_VERDICT: FAIL" not in text:
        raise SystemExit(f"{marker} requires FAIL")
if "MACHINE_VERDICT: PASS" in text and "No findings for this surface." not in text:
    priorities = re.findall(r"Priority:\s*(P[0-3])", text)
    if any(p in {"P0", "P1"} for p in priorities):
        raise SystemExit("PASS contains P0/P1")
print(f"shadow review valid: {path}")
