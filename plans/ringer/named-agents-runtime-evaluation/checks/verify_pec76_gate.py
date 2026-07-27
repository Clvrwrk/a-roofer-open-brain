#!/usr/bin/env python3
from pathlib import Path
import re,sys
p=Path.cwd()/"review.md";e=[]
if not p.is_file():e.append("missing review.md")
else:
 t=p.read_text()
 for h in ("Verdict","P0/P1 Findings","Gate Coverage","Authorization Boundary","Next Gate"):
  if not re.search(rf"^## {re.escape(h)}$",t,re.M):e.append(f"missing heading: {h}")
 if not re.search(r"^\s*\*\*(PASS|BLOCKED|FAIL|GO|NO-GO)\b",t,re.I|re.M):e.append("missing explicit verdict")
 for x in ("Orgo","Hermes","eve","SkillSpector","curl | bash","latest","local MCP","rollback","scoped","synthetic"):
  if x.lower() not in t.lower():e.append(f"missing gate finding: {x}")
 if re.search(r"sk_live_[A-Za-z0-9]{8,}|xox[baprs]-",t):e.append("secret-like value present")
if e:
 print("PEC-76 review failed:");[print(f"- {x}") for x in e];sys.exit(1)
print("PEC-76 review structurally valid.")
