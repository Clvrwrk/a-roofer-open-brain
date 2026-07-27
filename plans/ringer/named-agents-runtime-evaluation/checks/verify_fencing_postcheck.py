#!/usr/bin/env python3
from pathlib import Path
import re, sys

p = Path.cwd() / "review.md"
errors=[]
if not p.is_file(): errors.append("missing review.md")
else:
    t=p.read_text()
    for h in ("Verdict","Evidence","Protected Systems","Exceptions","Next Gate"):
        if not re.search(rf"^## {h}$",t,re.M): errors.append(f"missing heading: {h}")
    m=re.search(r"^\s*\*\*(PASS|BLOCKED|FAIL)\b",t,re.I|re.M)
    if not m: errors.append("review must contain an explicit PASS, BLOCKED, or FAIL verdict")
    for token in ("600","20 clean samples","disabled","zero wrappers","zero runtime children","Alex","Ops Conductor","negative controls","Command Center","ABC sync","Kasm","rollback"):
        if token not in t: errors.append(f"missing evidence: {token}")
    if re.search(r"sk_live_[A-Za-z0-9]{8,}|xox[baprs]-",t): errors.append("secret-like value present")
if errors:
    print("Postcheck review failed:")
    for e in errors: print(f"- {e}")
    sys.exit(1)
print("Postcheck review passed.")
