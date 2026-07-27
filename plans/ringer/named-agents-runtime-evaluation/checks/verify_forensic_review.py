#!/usr/bin/env python3
from pathlib import Path
import re,sys
p=Path.cwd()/"review.md"; e=[]
if not p.is_file():e.append("missing review.md")
else:
 t=p.read_text()
 for h in ("Verdict","Proven","Violated","Unprovable","Risk Decision","Next Gate"):
  if not re.search(rf"^## {h}$",t,re.M):e.append(f"missing heading: {h}")
 if not re.search(r"^\s*\*\*(PASS_WITH_EXCEPTIONS|BLOCKED|FAIL)\b",t,re.I|re.M):e.append("missing explicit verdict")
 for x in ("four","enabled","host-local lock","sealed","30-second","10-second","fsync","restore rehearsal","SIGKILL","Slack/email","current fence"):
  if x.lower() not in t.lower():e.append(f"missing finding: {x}")
 if re.search(r"sk_live_[A-Za-z0-9]{8,}|xox[baprs]-",t):e.append("secret-like value present")
if e:
 print("Forensic review failed:");[print(f"- {x}") for x in e];sys.exit(1)
print("Forensic review structurally valid.")
