#!/usr/bin/env python3
from pathlib import Path
import re,subprocess,sys
e=[];p=Path.cwd()/"review.md"
if not p.is_file():e.append("missing review.md")
else:
 t=p.read_text()
 for h in ("Verdict","Registry Coverage","Mismatch Tests","P0/P1 Findings","Authorization Boundary","Next Gate"):
  if not re.search(rf"^## {re.escape(h)}$",t,re.M):e.append(f"missing heading: {h}")
 if not re.search(r"^\s*\*\*(PASS|BLOCKED|FAIL|GO|NO-GO)\b",t,re.I|re.M):e.append("missing explicit verdict")
 for x in ("Maya","Alex","Casey","Jordan","Sam","Rowan","Lena","Ops Conductor","Slack","Google","Orgo","Command Center","runtime","fallback","unknown"):
  if x.lower() not in t.lower():e.append(f"missing finding: {x}")
root=Path.cwd().parents[5]
for cmd in (["node",str(root/"agents/registry/validate-named-agent-principals.mjs")],["node",str(root/"agents/registry/validate-profile-registry-drift.mjs")],["node","--test",str(root/"agents/registry/validate-named-agent-principals.test.mjs")]):
 r=subprocess.run(cmd,text=True,capture_output=True)
 if r.returncode:e.append(r.stdout+r.stderr)
if e:
 print("PEC-77 review failed:");[print(f"- {x}") for x in e];sys.exit(1)
print("PEC-77 registry and review valid.")
