#!/usr/bin/env python3
import sys,os,re,glob,shutil
idx,out=sys.argv[1:3]
if not os.path.isfile(idx): print("FAIL: agents/README.md missing");sys.exit(1)
t=open(idx).read();fail=[]
for d in sorted(x for x in os.listdir("agents") if os.path.isdir(f"agents/{x}")):
  if f"{d}/" not in t: fail.append(f"subfolder not documented: agents/{d}/ (link it as ({d}/))")
souls=sorted(glob.glob("agents/**/SOUL.md",recursive=True))
for s in souls:
  rel=os.path.relpath(s,"agents")
  if rel not in t: fail.append(f"SOUL not listed: {rel}")
for l in re.findall(r'\]\(([^)#\s]+)\)',t):
  if not l.startswith("http") and not os.path.exists(os.path.join("agents",l)): fail.append(f"broken link: {l}")
if fail: print("FAIL:\n"+"\n".join(fail[:40]));sys.exit(1)
os.makedirs(out,exist_ok=True);shutil.copy(idx,f"{out}/agents__README.md");print(f"PASS: {len(souls)} SOUL files listed")
