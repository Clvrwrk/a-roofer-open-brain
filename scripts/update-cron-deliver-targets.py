#!/usr/bin/env python3
"""
update-cron-deliver-targets.py
Updates all cron job deliver targets to route through #ob-agents-internal.
Run after creating the private channels and getting their IDs.

Usage: python update-cron-deliver-targets.py <ob-agents-internal-channel-id>
"""
import json, sys
from pathlib import Path

IMAGE_ID = "2c589484-3521-41fc-bec6-ac785ae87dd7"

# Channel ID for #ob-agents-internal (private — Conductor reads this, Chris does NOT)
# Default to placeholder until channel is created
AGENTS_INTERNAL_CH = sys.argv[1] if len(sys.argv) > 1 else "PLACEHOLDER_OB_AGENTS_INTERNAL"

agents = [
    "maya.chen", "alex.rivers", "casey.morgan",
    "jordan.price", "sam.torres", "rowan.vale", "lena.brooks"
]

total_updated = 0
for agent in agents:
    jfile = Path(f"/mnt/kasm_profiles/{agent}@cc.proexteriorsus.net/{IMAGE_ID}/.hermes/cron/jobs.json")
    if not jfile.exists():
        print(f"  ⚠️  {agent}: jobs.json not found at {jfile}")
        continue

    with open(jfile) as f:
        d = json.load(f)

    updated = 0
    for job in d.get("jobs", []):
        old_deliver = job.get("deliver", "")
        # Route ALL cron job outputs to agents-internal channel
        # Conductor reads this and decides what reaches Chris
        job["deliver"] = f"slack:{AGENTS_INTERNAL_CH}"
        if old_deliver != job["deliver"]:
            updated += 1

    with open(jfile, "w") as f:
        json.dump(d, f, indent=2)

    total_updated += updated
    print(f"  ✅ {agent}: {updated} deliver targets updated → #ob-agents-internal")

print(f"\nTotal: {total_updated} jobs rerouted to slack:{AGENTS_INTERNAL_CH}")
print("Agents no longer post directly to shared accounting channels.")
print("Ops Conductor will filter and forward to Chris via #ob-ops-conductor.")
