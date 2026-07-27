#!/usr/bin/env python3
from pathlib import Path
import re, sys

errors=[]
p=Path.cwd()/"design.md"
if not p.is_file(): errors.append("missing design.md")
else:
 text=p.read_text()
 for heading in ("Verdict","Versioned Contract","Maya Identity","Ingress and Work","Lease and Schedule","Approval and Effect","Receipt and Health","Persistence and Migration","Kill Switch and Rollback","Tests","Production Gate"):
  if not re.search(rf"^## {re.escape(heading)}$",text,re.M): errors.append(f"missing heading: {heading}")
 for term in ("maya-chen","pec78-runtime-authorization-v1","default-deny","idempot","30 minutes","admin@cc.proexteriorsus.net","Slack","receipt","lease","revocation","RLS","service role","rollback","health"):
  if term.lower() not in text.lower(): errors.append(f"missing contract term: {term}")
 if re.search(r"(?:sk_live_|xox[baprs]-|eyJ[A-Za-z0-9_-]{20,})",text): errors.append("possible secret in design")
if errors:
 print("PEC-78 design failed:"); [print(f"- {e}") for e in errors]; sys.exit(1)
print("PEC-78 design valid")
