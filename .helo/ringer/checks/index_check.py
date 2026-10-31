#!/usr/bin/env python3
"""Usage: index_check.py <index_file> <glob_dir> <pattern> <outdir>. Every matching file must be linked in the index; every link must resolve; each entry needs a description."""
import sys,glob,os,re,shutil
idx,d,pat,out=sys.argv[1:5]
fail=[]
if not os.path.isfile(idx): print(f"FAIL: {idx} missing");sys.exit(1)
t=open(idx).read()
files=sorted(os.path.basename(f) for f in glob.glob(os.path.join(d,pat)) if os.path.basename(f)!=os.path.basename(idx))
links=re.findall(r'\]\(([^)#\s]+)\)',t)
base=os.path.dirname(idx) or "."
for f in files:
  if not any(os.path.basename(l)==f for l in links): fail.append(f"not listed: {f}")
for l in links:
  if l.startswith("http"): continue
  if not os.path.exists(os.path.normpath(os.path.join(base,l))): fail.append(f"broken link: {l}")
rows=[ln for ln in t.splitlines() if re.search(r'\]\([^)]+\)',ln)]
bare=[r for r in rows if len(re.sub(r'\[[^\]]*\]\([^)]*\)|[|\-*` ]','',r))<8]
if bare: fail.append(f"{len(bare)} entries lack a description, e.g. {bare[0][:80]}")
if fail: print("FAIL:\n"+"\n".join(fail[:40]));sys.exit(1)
os.makedirs(out,exist_ok=True);shutil.copy(idx,os.path.join(out,os.path.basename(d.rstrip('/'))+"__"+os.path.basename(idx)))
print(f"PASS: {len(files)} files indexed, {len(links)} links resolve");
