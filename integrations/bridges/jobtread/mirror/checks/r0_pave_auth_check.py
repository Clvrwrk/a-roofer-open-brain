#!/usr/bin/env python3
"""R0 check: Pave auth probe must prove live access to org 22PazeRM5FCH.

Fails loudly with WHY. Also guards against the grant key leaking into
any deliverable file.
"""
import json
import re
import sys

OUTPUT = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror/r0-pave-auth/r0-probe-output.json"
TRANSCRIPT = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror/r0-pave-auth/r0-probe-transcript.md"
MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
EXPECTED_ORG_ID = "22PazeRM5FCH"

failures = []

# --- load deliverables ---
try:
    raw = open(OUTPUT).read()
    data = json.loads(raw)
except FileNotFoundError:
    print(f"FAIL: missing output file {OUTPUT}")
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"FAIL: {OUTPUT} is not valid JSON: {e}")
    print(f"first 500 chars: {open(OUTPUT).read()[:500]}")
    sys.exit(1)

try:
    transcript = open(TRANSCRIPT).read()
except FileNotFoundError:
    print(f"FAIL: missing transcript {TRANSCRIPT}")
    sys.exit(1)

# --- secret-leak guard ---
key_val = None
for line in open(MASTER_ENV):
    m = re.match(r"^JT_SUPABASE_MIRROR_GRANT_KEY=(.+)$", line.strip())
    if m:
        key_val = m.group(1).strip().strip('"').strip("'")
        break
if not key_val:
    failures.append("could not locate JT_SUPABASE_MIRROR_GRANT_KEY in master.env (check env name)")
else:
    for path, content in ((OUTPUT, raw), (TRANSCRIPT, transcript)):
        if key_val in content:
            failures.append(f"SECRET LEAK: grant key value appears in {path} — deliverable must be scrubbed")

# --- substance: currentGrant + user + expected org ---
blob = json.dumps(data)
cg = data.get("currentGrant") if isinstance(data, dict) else None
if cg is None:
    failures.append(f"response has no 'currentGrant' key; top-level keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
else:
    user = cg.get("user") or {}
    if not user.get("id"):
        failures.append(f"currentGrant.user.id missing; currentGrant keys: {list(cg.keys())}")
if EXPECTED_ORG_ID not in blob:
    failures.append(f"expected org id {EXPECTED_ORG_ID} (Pro Exteriors) not found anywhere in response")

# --- transcript substance ---
low = transcript.lower()
for section in ("probe goal", "commands run", "verdict"):
    if section not in low:
        failures.append(f"transcript missing a '{section}' section")
if "pass" in low.split("verdict")[-1][:200] and EXPECTED_ORG_ID not in blob:
    failures.append("transcript claims pass but org id not proven in output")

if failures:
    print("FAIL — R0 Pave auth probe:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

org_names = re.findall(r'"name"\s*:\s*"([^"]+)"', blob)
print(f"PASS — currentGrant.user proven, org {EXPECTED_ORG_ID} accessible; names seen: {org_names[:5]}")
