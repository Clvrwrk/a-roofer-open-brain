#!/usr/bin/env python3
import hashlib, json, os, pathlib, subprocess, sys, time
from datetime import datetime, timezone

EXPIRY=datetime(2026,7,27,0,15,tzinfo=timezone.utc)
UNIT="roofing-ops-slack-listeners.service"
BASE=pathlib.Path("/mnt/kasm_profiles"); PROFILE="2c589484-3521-41fc-bec6-ac785ae87dd7"
MUTABLE=[BASE/"alex.rivers@cc.proexteriorsus.net"/PROFILE/".hermes/cron/jobs.json",BASE/"ops-conductor@cc.proexteriorsus.net"/PROFILE/".hermes/cron/jobs.json"]
NEGATIVE=[BASE/n/PROFILE/".hermes/cron/jobs.json" for n in ("casey.morgan@cc.proexteriorsus.net","jordan.price@cc.proexteriorsus.net","lena.brooks@cc.proexteriorsus.net","maya.chen@cc.proexteriorsus.net","rowan.vale@cc.proexteriorsus.net","sam.torres@cc.proexteriorsus.net")]
MARKERS=("run-slack-listener-with-env.mjs","slack-socket-runtime.mjs","hermes_cli.main gateway restart","/dockerstartup/vnc_startup.sh hermes cron list --all")

def sh(*a,check=True): return subprocess.run(a,text=True,capture_output=True,check=check)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def unit():
    o=sh("systemctl","show",UNIT,"-p","LoadState","-p","UnitFileState","-p","ActiveState","-p","SubState","-p","MainPID").stdout
    return dict(x.split("=",1) for x in o.splitlines() if "=" in x)
def jobs(p):
    d=json.loads(p.read_text()); js=d.get("jobs")
    if not isinstance(js,list): raise RuntimeError("invalid job schema")
    return len(js),sum(x.get("enabled") is True for x in js)
def proc_counts():
    c={m:0 for m in MARKERS}
    for p in pathlib.Path("/proc").iterdir():
        if not p.name.isdigit(): continue
        try: a=(p/"cmdline").read_bytes().replace(b"\0",b" ").decode(errors="replace")
        except Exception: continue
        for m in MARKERS:
            if m in a: c[m]+=1
    return c
def protected():
    dashboards=0
    for p in pathlib.Path("/proc").iterdir():
        if not p.name.isdigit(): continue
        try: a=(p/"cmdline").read_bytes().replace(b"\0",b" ").decode(errors="replace")
        except Exception: continue
        if ("hermes_cli.main" in a and " dashboard " in a) or "hermes dashboard" in a: dashboards+=1
    docker=sh("docker","ps","--format","{{.ID}} {{.Image}} {{.Status}}",check=False)
    docker_hash=hashlib.sha256(docker.stdout.encode()).hexdigest() if docker.returncode==0 else "unavailable"
    abc=sh("systemctl","is-enabled","openbrain-abc-sync.timer",check=False).stdout.strip()
    h=sh("curl","-fsS","--max-time","5","https://cc.proexteriorsus.net/healthz",check=False)
    health=False
    if h.returncode==0:
        try:
            d=json.loads(h.stdout); health=d.get("status")=="ok" and d.get("service")=="open-brain-command-center"
        except Exception: pass
    return {"dashboards":dashboards,"docker_hash":docker_hash,"abc":abc,"command_center":health}
def rollback():
    ds=sorted(pathlib.Path("/root").glob("pec75-fence-20260726T23*Z"))
    if not ds: raise RuntimeError("rollback directory missing")
    d=ds[-1]; fs=sorted(d.glob("*.rollback.private.json"))
    counts=sorted(jobs(p)[1] for p in fs)
    return {"directory_owner":d.stat().st_uid,"directory_mode":oct(d.stat().st_mode&0o777),"artifact_count":len(fs),"artifact_owners":sorted({p.stat().st_uid for p in fs}),"artifact_modes":sorted({oct(p.stat().st_mode&0o777) for p in fs}),"original_enabled_counts":counts,"json_parse":"pass"}
def full_sample(elapsed,base_neg,base_protected):
    expected={"LoadState":"loaded","UnitFileState":"disabled","ActiveState":"inactive","SubState":"dead","MainPID":"0"}
    pc=proc_counts(); mut=[jobs(p)[1] for p in MUTABLE]; nh=[sha(p) for p in NEGATIVE]; pr=protected()
    ok=unit()==expected and all(v==0 for v in pc.values()) and mut==[0,0] and nh==base_neg and pr==base_protected
    return {"elapsed_ms":int(elapsed*1000),"wall_utc":datetime.now(timezone.utc).isoformat(),"status":"clean" if ok else "fail","unit":"fenced" if unit()==expected else "mismatch","process_counts":list(pc.values()),"mutable_enabled":mut,"negative_controls":"unchanged" if nh==base_neg else "changed","protected":"unchanged" if pr==base_protected else "changed"}
def main():
    if datetime.now(timezone.utc)>=EXPIRY: raise RuntimeError("approval expired before start")
    base_neg=[sha(p) for p in NEGATIVE]; base_protected=protected(); rb=rollback()
    if base_protected["dashboards"]!=5 or base_protected["abc"] not in {"enabled","static"} or not base_protected["command_center"] or base_protected["docker_hash"]=="unavailable": raise RuntimeError("protected baseline mismatch")
    if rb!={"directory_owner":0,"directory_mode":"0o700","artifact_count":2,"artifact_owners":[0],"artifact_modes":["0o600"],"original_enabled_counts":[1,3],"json_parse":"pass"}: raise RuntimeError("rollback metadata mismatch")
    start=time.monotonic(); samples=[]; n=0
    while True:
        target=n*25.0
        delay=target-(time.monotonic()-start)
        if delay>0: time.sleep(delay)
        elapsed=time.monotonic()-start; s=full_sample(elapsed,base_neg,base_protected); samples.append(s)
        if s["status"]!="clean": raise RuntimeError("predicate sample failed")
        if elapsed>=600: break
        n+=1
    gaps=[samples[i]["elapsed_ms"]-samples[i-1]["elapsed_ms"] for i in range(1,len(samples))]
    if max(gaps)>30000 or samples[-1]["elapsed_ms"]<600000: raise RuntimeError("cadence or endpoint failure")
    print(json.dumps({"run_id":"pec75-readonly-postcheck-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),"status":"PASS","approval_expiry":EXPIRY.isoformat(),"sample_count":len(samples),"first_elapsed_ms":samples[0]["elapsed_ms"],"final_elapsed_ms":samples[-1]["elapsed_ms"],"max_gap_ms":max(gaps),"samples":samples,"rollback":rb,"protected_baseline":{"dashboards":base_protected["dashboards"],"abc":base_protected["abc"],"command_center":base_protected["command_center"],"container_inventory":"unchanged_hash"}}))
if __name__=="__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"status":"FAIL","reason":str(e)}),file=sys.stderr); sys.exit(1)
