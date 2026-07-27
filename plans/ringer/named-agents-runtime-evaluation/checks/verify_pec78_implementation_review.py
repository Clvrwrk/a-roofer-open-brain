#!/usr/bin/env python3
from pathlib import Path
import re, sys

errors=[]
p=Path.cwd()/"review.md"
if not p.is_file(): errors.append("missing review.md")
else:
 text=p.read_text()
 for heading in ("Verdict","Scope Reviewed","Executed Evidence","Findings","Phase Decision","Required Next Actions"):
  if not re.search(rf"^#{{1,2}} {re.escape(heading)}$",text,re.M): errors.append(f"missing heading: {heading}")
 for term in ("installed-disabled","middleware","healthz","RLS","migration","P0","P1","Maya"):
  if term.lower() not in text.lower(): errors.append(f"missing review term: {term}")
 if not re.search(r"default[- ]deny", text, re.I): errors.append("missing review term: default-deny")
 if not re.search(r"\b(PASS|FAIL|CONDITIONAL_PASS)\b", text): errors.append("missing machine-readable verdict")
 if re.search(r"(?:sk_live_|xox[baprs]-|eyJ[A-Za-z0-9_-]{20,})",text): errors.append("possible secret")
if errors:
 print("PEC-78 implementation review failed:")
 for error in errors: print(f"- {error}")
 sys.exit(1)
print("PEC-78 implementation review valid")
