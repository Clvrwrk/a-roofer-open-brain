#!/usr/bin/env python3
import hashlib, json, os, pathlib, subprocess, sys
from datetime import datetime, timezone

BASE=pathlib.Path('/mnt/kasm_profiles'); P='2c589484-3521-41fc-bec6-ac785ae87dd7'
CURRENT={
 'alex':BASE/'alex.rivers@cc.proexteriorsus.net'/P/'.hermes/cron/jobs.json',
 'ops':BASE/'ops-conductor@cc.proexteriorsus.net'/P/'.hermes/cron/jobs.json'}
NEG=[BASE/n/P/'.hermes/cron/jobs.json' for n in ('casey.morgan@cc.proexteriorsus.net','jordan.price@cc.proexteriorsus.net','lena.brooks@cc.proexteriorsus.net','maya.chen@cc.proexteriorsus.net','rowan.vale@cc.proexteriorsus.net','sam.torres@cc.proexteriorsus.net')]
def sha(b): return hashlib.sha256(b).hexdigest()
def load(p): return json.loads(p.read_text())
def job_id(j):
 for k in ('id','job_id','name'):
  if isinstance(j.get(k),str) and j[k]: return j[k]
 raise RuntimeError('stable job identifier absent')
def meta(p):
 s=p.stat(); return {'uid':s.st_uid,'gid':s.st_gid,'mode':oct(s.st_mode&0o777),'size':s.st_size,'mtime_ns':s.st_mtime_ns,'inode':s.st_ino,'device':s.st_dev,'sha256':sha(p.read_bytes())}
def unit():
 o=subprocess.run(['systemctl','show','roofing-ops-slack-listeners.service','-p','LoadState','-p','UnitFileState','-p','ActiveState','-p','SubState','-p','MainPID'],text=True,capture_output=True,check=True).stdout
 return dict(x.split('=',1) for x in o.splitlines() if '=' in x)
def procs():
 markers=('run-slack-listener-with-env.mjs','slack-socket-runtime.mjs','hermes_cli.main gateway restart','/dockerstartup/vnc_startup.sh hermes cron list --all')
 c={m:0 for m in markers}
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit(): continue
  try:a=(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')
  except Exception:continue
  for m in markers:
   if m in a:c[m]+=1
 return list(c.values())
def main():
 dirs=sorted(pathlib.Path('/root').glob('pec75-fence-20260726T23*Z'))
 if not dirs: raise RuntimeError('rollback set missing')
 backups=sorted(dirs[-1].glob('*.rollback.private.json'))
 if len(backups)!=2: raise RuntimeError('rollback count mismatch')
 # Pair by original enabled counts, avoiding disclosure of paths or job identifiers.
 bdata=[load(x) for x in backups]
 pairs={}
 for d,p in zip(bdata,backups):
  enabled=sum(j.get('enabled') is True for j in d['jobs'])
  pairs['alex' if enabled==1 else 'ops']=(d,p)
 semantic={}; all_changed=[]
 for name,curp in CURRENT.items():
  old,bp=pairs[name]; new=load(curp)
  oldmap={job_id(j):j for j in old['jobs']}; newmap={job_id(j):j for j in new['jobs']}
  if set(oldmap)!=set(newmap): raise RuntimeError('stable ID set changed')
  changed=[]; invalid=[]
  for jid in sorted(oldmap):
   a=oldmap[jid]; b=newmap[jid]
   keys=set(a)|set(b)
   delta=[k for k in keys if a.get(k)!=b.get(k)]
   if delta:
    if delta==['enabled'] and a.get('enabled') is True and b.get('enabled') is False: changed.append(sha(jid.encode()))
    else: invalid.append({'id_hash':sha(jid.encode()),'fields':sorted(delta)})
  semantic[name]={'stable_id_set':'unchanged','changed_count':len(changed),'changed_id_hashes':changed,'invalid_deltas':invalid,'backup_meta':meta(bp),'current_meta':meta(curp),'backup_json':'valid','current_json':'valid'}
  all_changed+=changed
 result={
  'captured_utc':datetime.now(timezone.utc).isoformat(),
  'scope':'local-only_read-only',
  'current_fence':{'unit':unit(),'target_process_counts':procs(),'mutable_enabled':[sum(j.get('enabled') is True for j in load(p)['jobs']) for p in CURRENT.values()]},
  'semantic_delta':semantic,
  'semantic_summary':{'total_changed':len(all_changed),'unique_changed_hashes':len(set(all_changed)),'only_enabled_true_to_false':all(not v['invalid_deltas'] for v in semantic.values())},
  'rollback_container':{'uid':dirs[-1].stat().st_uid,'mode':oct(dirs[-1].stat().st_mode&0o777),'artifact_count':2,'artifact_uids':sorted({p.stat().st_uid for p in backups}),'artifact_modes':sorted({oct(p.stat().st_mode&0o777) for p in backups})},
  'negative_controls_now':[{'uid':p.stat().st_uid,'gid':p.stat().st_gid,'mode':oct(p.stat().st_mode&0o777),'inode':p.stat().st_ino,'device':p.stat().st_dev,'sha256':sha(p.read_bytes())} for p in NEG],
  'historical_classification':{
   'proven_from_survivors':['current fenced unit state','zero target processes','zero enabled mutable jobs','two private rollback artifacts with valid JSON','exact four stable jobs changed only enabled true-to-false','current negative-control metadata and hashes'],
   'violated_by_executor_source':['no exclusive host-local lock','no sealed host-local target manifest','no durable approval identifier/reviewer signature','leaf waits used 30s then 10s instead of 60s then 30s','endpoint queries occurred during observation','rollback artifacts and directory were not fsynced','no disposable atomic restore rehearsal'],
   'not_reconstructable':['exact signals delivered to every PID including whether SIGKILL was used','twice-resolved complete ancestry and denylist intersection for every target','pre-mutation negative-control inode/device/owner/mode baselines','absence of all Slack/email connection attempts or outbound effects','unit definition hash and concurrent deployment state at mutation instant','source/candidate/installed fsync completion']},
  'secret_policy':'no paths, job identifiers, job bodies, argv text, environment values, credentials, messages, or customer data emitted'
 }
 print(json.dumps(result,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as e: print(json.dumps({'status':'FAIL','reason':str(e)}),file=sys.stderr);sys.exit(1)
