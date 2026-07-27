#!/usr/bin/env python3
import copy, hashlib, json, os, pathlib, pwd, grp, shutil, signal, subprocess, sys, time
from datetime import datetime, timezone

APPROVAL_EXPIRY = datetime(2026, 7, 26, 23, 30, tzinfo=timezone.utc)
UNIT = "roofing-ops-slack-listeners.service"
BASE = pathlib.Path("/mnt/kasm_profiles")
PROFILE = "2c589484-3521-41fc-bec6-ac785ae87dd7"
MUTABLE = {
    "alex": BASE / "alex.rivers@cc.proexteriorsus.net" / PROFILE / ".hermes/cron/jobs.json",
    "ops": BASE / "ops-conductor@cc.proexteriorsus.net" / PROFILE / ".hermes/cron/jobs.json",
}
NEGATIVE = [
    BASE / name / PROFILE / ".hermes/cron/jobs.json" for name in (
        "casey.morgan@cc.proexteriorsus.net", "jordan.price@cc.proexteriorsus.net",
        "lena.brooks@cc.proexteriorsus.net", "maya.chen@cc.proexteriorsus.net",
        "rowan.vale@cc.proexteriorsus.net", "sam.torres@cc.proexteriorsus.net",
    )
]
WRAPPER_MARKER = "/opt/openbrain/run-slack-listener-with-env.mjs"
CHILD_MARKER = "runtime/slack-socket-runtime.mjs"
PERSONAS = ("alex.rivers", "casey.morgan", "jordan-price", "lena.brooks", "maya.chen", "rowan.vale", "sam-torres", "ops-conductor")

def sh(*args, check=True):
    return subprocess.run(args, text=True, capture_output=True, check=check)

def digest_bytes(data): return hashlib.sha256(data).hexdigest()
def digest_file(path): return digest_bytes(path.read_bytes())
def cmdline(pid):
    return pathlib.Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace").strip()

def proc_tuple(pid):
    p = pathlib.Path(f"/proc/{pid}")
    stat = (p / "stat").read_text().split()
    argv = cmdline(pid)
    return {"pid": pid, "ppid": int(stat[3]), "uid": p.stat().st_uid,
            "start": stat[21], "exe": os.readlink(p / "exe"), "argv_hash": digest_bytes(argv.encode())}

def proc_state(pid): return pathlib.Path(f"/proc/{pid}/stat").read_text().split()[2]

def capture_targets():
    wrappers, children, gateway, kasm = [], [], [], []
    for item in pathlib.Path("/proc").iterdir():
        if not item.name.isdigit(): continue
        pid = int(item.name)
        try: argv = cmdline(pid)
        except (FileNotFoundError, PermissionError, ProcessLookupError): continue
        if WRAPPER_MARKER in argv: wrappers.append(proc_tuple(pid))
        elif CHILD_MARKER in argv and WRAPPER_MARKER not in argv: children.append(proc_tuple(pid))
        if "hermes_cli.main gateway restart" in argv: gateway.append(proc_tuple(pid))
        if "/dockerstartup/vnc_startup.sh hermes cron list --all" in argv: kasm.append(proc_tuple(pid))
    wrappers.sort(key=lambda x: x["pid"]); children.sort(key=lambda x: x["pid"])
    gateway.sort(key=lambda x: x["pid"]); kasm.sort(key=lambda x: x["pid"])
    if len(wrappers) != 8 or len(children) != 8 or len(gateway) != 1 or len(kasm) != 1:
        raise RuntimeError(f"target count mismatch wrappers={len(wrappers)} children={len(children)} gateway={len(gateway)} kasm={len(kasm)}")
    wpids = {x["pid"] for x in wrappers}
    if any(x["uid"] != 0 or x["ppid"] != 1 for x in wrappers): raise RuntimeError("wrapper identity mismatch")
    if any(x["uid"] != 0 or x["ppid"] not in wpids for x in children): raise RuntimeError("child ancestry mismatch")
    if {x["ppid"] for x in children} != wpids: raise RuntimeError("wrapper-child mapping mismatch")
    return {"wrappers": wrappers, "children": children, "gateway": gateway, "kasm": kasm}

def unit_state():
    out = sh("systemctl", "show", UNIT, "-p", "LoadState", "-p", "UnitFileState", "-p", "ActiveState", "-p", "SubState", "-p", "MainPID").stdout
    return dict(line.split("=", 1) for line in out.splitlines() if "=" in line)

def job_summary(path):
    data = json.loads(path.read_text())
    jobs = data.get("jobs")
    if not isinstance(data, dict) or not isinstance(jobs, list): raise RuntimeError("invalid jobs schema")
    return data, sum(j.get("enabled") is True for j in jobs)

def signal_exact(items, sig):
    for old in items:
        try: now = proc_tuple(old["pid"])
        except FileNotFoundError: continue
        if now != old: raise RuntimeError("process identity changed before signal")
        os.kill(old["pid"], sig)

def wait_gone(items, seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if all(not pathlib.Path(f"/proc/{x['pid']}").exists() for x in items): return []
        time.sleep(1)
    return [x for x in items if pathlib.Path(f"/proc/{x['pid']}").exists()]

def main():
    if os.geteuid() != 0: raise RuntimeError("must run as root")
    if datetime.now(timezone.utc) >= APPROVAL_EXPIRY: raise RuntimeError("approval expired")
    expected = {"LoadState":"loaded", "UnitFileState":"enabled", "ActiveState":"inactive", "SubState":"dead", "MainPID":"0"}
    if unit_state() != expected: raise RuntimeError("unit state mismatch")
    first = capture_targets(); time.sleep(5); second = capture_targets()
    if first != second: raise RuntimeError("process identity changed during preflight")
    if len(MUTABLE) != 2 or len(NEGATIVE) != 6 or any(not p.is_file() or p.is_symlink() for p in [*MUTABLE.values(), *NEGATIVE]):
        raise RuntimeError("job-store path mismatch")
    neg_hashes = {str(p): digest_file(p) for p in NEGATIVE}
    originals, candidates, total_enabled = {}, {}, 0
    for name, path in MUTABLE.items():
        data, enabled = job_summary(path); total_enabled += enabled
        originals[name] = data; candidate = copy.deepcopy(data)
        for job in candidate["jobs"]:
            if job.get("enabled") is True: job["enabled"] = False
        candidates[name] = candidate
    if total_enabled != 4 or job_summary(MUTABLE["alex"])[1] != 1 or job_summary(MUTABLE["ops"])[1] != 3:
        raise RuntimeError("enabled job count mismatch")

    run_id = "pec75-fence-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = pathlib.Path("/root") / run_id; run_dir.mkdir(mode=0o700)
    os.chmod(run_dir, 0o700)
    receipt = {"run_id":run_id, "approval_expiry":APPROVAL_EXPIRY.isoformat(), "preflight":"pass", "mutations":[], "observation":[]}
    for name, path in MUTABLE.items():
        backup = run_dir / f"{name}.rollback.private.json"
        shutil.copyfile(path, backup); os.chmod(backup, 0o600)
        if digest_file(backup) != digest_file(path) or json.loads(backup.read_text()) != originals[name]: raise RuntimeError("private backup verification failed")

    sh("systemctl", "disable", UNIT); receipt["mutations"].append("unit_disabled")
    for name, path in MUTABLE.items():
        st = path.stat(); tmp = path.with_name(path.name + f".{run_id}.tmp")
        raw = (json.dumps(candidates[name], indent=2, ensure_ascii=False) + "\n").encode()
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, st.st_mode & 0o777)
        with os.fdopen(fd, "wb") as f: f.write(raw); f.flush(); os.fsync(f.fileno())
        os.chown(tmp, st.st_uid, st.st_gid); os.chmod(tmp, st.st_mode & 0o777)
        parsed = json.loads(tmp.read_text())
        if sum(j.get("enabled") is True for j in parsed["jobs"]) != 0: raise RuntimeError("candidate still enabled")
        os.replace(tmp, path); receipt["mutations"].append(f"{name}_jobs_disabled")

    signal_exact(second["wrappers"], signal.SIGTERM)
    remaining = wait_gone(second["wrappers"] + second["children"], 60)
    if remaining: signal_exact(remaining, signal.SIGTERM); remaining = wait_gone(remaining, 30)
    if remaining: signal_exact(remaining, signal.SIGKILL); remaining = wait_gone(remaining, 5)
    if remaining: raise RuntimeError("Slack process did not terminate")
    for group in (second["gateway"], second["kasm"]):
        signal_exact(group, signal.SIGTERM); rem = wait_gone(group, 30)
        if rem: signal_exact(rem, signal.SIGTERM); rem = wait_gone(rem, 10)
        if rem: signal_exact(rem, signal.SIGKILL); rem = wait_gone(rem, 5)
        if rem: raise RuntimeError("stuck leaf did not terminate")
    receipt["mutations"].append("approved_processes_terminated")

    start = time.monotonic(); sample = 0
    while time.monotonic() - start < 600:
        if unit_state()["UnitFileState"] != "disabled": raise RuntimeError("unit re-enabled")
        current = capture_targets_allow_zero()
        if any(current.values()): raise RuntimeError("legacy target restarted")
        if any(digest_file(p) != h for p, h in [(pathlib.Path(k), v) for k, v in neg_hashes.items()]): raise RuntimeError("negative-control store changed")
        if any(job_summary(p)[1] != 0 for p in MUTABLE.values()): raise RuntimeError("job re-enabled")
        abc = sh("systemctl", "is-enabled", "openbrain-abc-sync.timer", check=False).stdout.strip()
        health = sh("curl", "-fsS", "--max-time", "10", "https://cc.proexteriorsus.net/healthz", check=False).returncode
        if abc not in {"enabled", "static"} or health != 0: raise RuntimeError("protected service postcheck failed")
        receipt["observation"].append({"sample":sample, "elapsed_s":int(time.monotonic()-start), "status":"clean"})
        sample += 1; time.sleep(min(30, max(0, 600-(time.monotonic()-start))))
    receipt["postcheck"] = "pass"; receipt["continuous_observation_seconds"] = 600
    receipt_path = pathlib.Path("/var/tmp") / f"{run_id}-value-free-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n"); os.chmod(receipt_path, 0o600)
    print(json.dumps({"run_id":run_id, "status":"PASS", "receipt":str(receipt_path), "samples":len(receipt["observation"])}))

def capture_targets_allow_zero():
    result = {"wrappers":[], "children":[], "gateway":[], "kasm":[]}
    for item in pathlib.Path("/proc").iterdir():
        if not item.name.isdigit(): continue
        try: argv = cmdline(int(item.name))
        except Exception: continue
        if WRAPPER_MARKER in argv: result["wrappers"].append(item.name)
        elif CHILD_MARKER in argv: result["children"].append(item.name)
        if "hermes_cli.main gateway restart" in argv: result["gateway"].append(item.name)
        if "/dockerstartup/vnc_startup.sh hermes cron list --all" in argv: result["kasm"].append(item.name)
    return result

def resume_after_reparent():
    if os.geteuid() != 0 or datetime.now(timezone.utc) >= APPROVAL_EXPIRY: raise RuntimeError("resume not authorized")
    state = unit_state()
    if state != {"LoadState":"loaded", "UnitFileState":"disabled", "ActiveState":"inactive", "SubState":"dead", "MainPID":"0"}:
        raise RuntimeError("partial unit state mismatch")
    if any(job_summary(p)[1] != 0 for p in MUTABLE.values()): raise RuntimeError("partial job state mismatch")
    rollback_dirs = sorted(pathlib.Path("/root").glob("pec75-fence-20260726T23*Z"))
    if not rollback_dirs: raise RuntimeError("private rollback directory missing")
    backups = sorted(rollback_dirs[-1].glob("*.rollback.private.json"))
    if len(backups) != 2 or any((p.stat().st_mode & 0o777) != 0o600 for p in backups): raise RuntimeError("private rollback artifacts invalid")
    if sorted(sum(j.get("enabled") is True for j in json.loads(p.read_text())["jobs"]) for p in backups) != [1, 3]:
        raise RuntimeError("private rollback contents invalid")
    neg_hashes = {str(p): digest_file(p) for p in NEGATIVE}
    first = capture_targets_allow_zero(); time.sleep(5); second = capture_targets_allow_zero()
    if first != second or first["wrappers"] or len(first["children"]) != 8 or len(first["gateway"]) != 1 or len(first["kasm"]) != 1:
        raise RuntimeError("partial process graph mismatch")
    targets = {}
    for key in ("children", "gateway", "kasm"):
        targets[key] = [proc_tuple(int(pid)) for pid in first[key]]
    if any(x["uid"] != 0 or x["ppid"] != 1 for x in targets["children"]): raise RuntimeError("reparented child identity mismatch")
    for key in ("children", "gateway", "kasm"):
        signal_exact(targets[key], signal.SIGTERM)
        rem = wait_gone(targets[key], 60 if key == "children" else 30)
        if rem: signal_exact(rem, signal.SIGTERM); rem = wait_gone(rem, 30 if key == "children" else 10)
        if rem: signal_exact(rem, signal.SIGKILL); rem = wait_gone(rem, 5)
        if rem: raise RuntimeError(f"{key} did not terminate")
    run_id = "pec75-fence-resume-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    receipt = {"run_id":run_id, "approval_expiry":APPROVAL_EXPIRY.isoformat(), "preflight":"pass_partial_resume", "mutations":["approved_remaining_processes_terminated"], "observation":[]}
    start = time.monotonic(); sample = 0
    while time.monotonic() - start < 600:
        if unit_state()["UnitFileState"] != "disabled" or any(capture_targets_allow_zero().values()): raise RuntimeError("legacy target restarted")
        if any(digest_file(pathlib.Path(k)) != v for k, v in neg_hashes.items()): raise RuntimeError("negative-control store changed")
        if any(job_summary(p)[1] != 0 for p in MUTABLE.values()): raise RuntimeError("job re-enabled")
        abc = sh("systemctl", "is-enabled", "openbrain-abc-sync.timer", check=False).stdout.strip()
        health = sh("curl", "-fsS", "--max-time", "10", "https://cc.proexteriorsus.net/healthz", check=False).returncode
        if abc not in {"enabled", "static"} or health != 0: raise RuntimeError("protected service postcheck failed")
        receipt["observation"].append({"sample":sample, "elapsed_s":int(time.monotonic()-start), "status":"clean"})
        sample += 1; time.sleep(min(30, max(0, 600-(time.monotonic()-start))))
    receipt["postcheck"]="pass"; receipt["continuous_observation_seconds"]=600
    receipt_path = pathlib.Path("/var/tmp") / f"{run_id}-value-free-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2)+"\n"); os.chmod(receipt_path, 0o600)
    print(json.dumps({"run_id":run_id,"status":"PASS","receipt":str(receipt_path),"samples":len(receipt["observation"])}))

def resume_after_gateway_zombie():
    if os.geteuid()!=0 or datetime.now(timezone.utc)>=APPROVAL_EXPIRY: raise RuntimeError("resume not authorized")
    if unit_state() != {"LoadState":"loaded","UnitFileState":"disabled","ActiveState":"inactive","SubState":"dead","MainPID":"0"}: raise RuntimeError("unit mismatch")
    if any(job_summary(p)[1] for p in MUTABLE.values()): raise RuntimeError("job state mismatch")
    neg_hashes={str(p):digest_file(p) for p in NEGATIVE}
    first=capture_targets_allow_zero(); time.sleep(5); second=capture_targets_allow_zero()
    if first!=second or first["wrappers"] or first["children"] or len(first["gateway"]) not in {0,1} or len(first["kasm"])!=1: raise RuntimeError("partial graph mismatch")
    if first["gateway"] and proc_state(int(first["gateway"][0]))!="Z": raise RuntimeError("gateway is not reaped or a non-executing zombie")
    kasm_target=[proc_tuple(int(first["kasm"][0]))]
    signal_exact(kasm_target,signal.SIGTERM); rem=wait_gone(kasm_target,30)
    if rem: signal_exact(rem,signal.SIGTERM); rem=wait_gone(rem,10)
    if rem: signal_exact(rem,signal.SIGKILL); rem=wait_gone(rem,5)
    if rem and any(proc_state(x["pid"])!="Z" for x in rem): raise RuntimeError("Kasm leaf still executing")
    run_id="pec75-fence-final-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    receipt={"run_id":run_id,"approval_expiry":APPROVAL_EXPIRY.isoformat(),"preflight":"pass_zombie_aware_resume","mutations":["approved_kasm_leaf_terminated"],"observation":[]}
    start=time.monotonic(); sample=0
    while time.monotonic()-start<600:
        cur=capture_targets_allow_zero()
        live_gateway=[int(pid) for pid in cur["gateway"] if proc_state(int(pid))!="Z"]
        live_kasm=[int(pid) for pid in cur["kasm"] if proc_state(int(pid))!="Z"]
        if unit_state()["UnitFileState"]!="disabled" or cur["wrappers"] or cur["children"] or live_gateway or live_kasm: raise RuntimeError("legacy target restarted")
        if any(digest_file(pathlib.Path(k))!=v for k,v in neg_hashes.items()): raise RuntimeError("negative-control changed")
        if any(job_summary(p)[1] for p in MUTABLE.values()): raise RuntimeError("job re-enabled")
        abc=sh("systemctl","is-enabled","openbrain-abc-sync.timer",check=False).stdout.strip()
        health=sh("curl","-fsS","--max-time","10","https://cc.proexteriorsus.net/healthz",check=False).returncode
        if abc not in {"enabled","static"} or health!=0: raise RuntimeError("protected service postcheck failed")
        receipt["observation"].append({"sample":sample,"elapsed_s":int(time.monotonic()-start),"status":"clean"}); sample+=1
        time.sleep(min(30,max(0,600-(time.monotonic()-start))))
    receipt["postcheck"]="pass"; receipt["continuous_observation_seconds"]=600; receipt["gateway_leaf_state"]="non-executing_zombie_or_reaped"
    receipt_path=pathlib.Path("/var/tmp")/f"{run_id}-value-free-receipt.json"; receipt_path.write_text(json.dumps(receipt,indent=2)+"\n"); os.chmod(receipt_path,0o600)
    print(json.dumps({"run_id":run_id,"status":"PASS","receipt":str(receipt_path),"samples":len(receipt["observation"])}))

if __name__ == "__main__":
    try:
        if len(sys.argv) == 2 and sys.argv[1] == "--resume-after-reparent": resume_after_reparent()
        elif len(sys.argv) == 2 and sys.argv[1] == "--resume-after-gateway-zombie": resume_after_gateway_zombie()
        else: main()
    except Exception as exc:
        print(json.dumps({"status":"ABORTED", "reason":str(exc)}), file=sys.stderr)
        raise
