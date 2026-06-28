#!/usr/bin/env python3
"""
Deploy DevTeam cron jobs to Hermes profiles on the agent host.
Mirrors deploy-crons.py for the dev plane — NO roofing brain workflows.
"""
import json
import subprocess
import sys
from pathlib import Path

SSH_KEY = Path("~/.ssh/a_roofers_open_brain_ed25519").expanduser()
HOST = "root@5.78.146.161"
IMAGE_ID = "2c589484-3521-41fc-bec6-ac785ae87dd7"

DEV_CRON_JOBS = [
    {
        "name": "dev-uptime-heartbeat",
        "schedule": "*/15 * * * *",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": [],
        "skills": [],
        "no_agent": True,
        "prompt": "Run scripts/uptime-check.sh on the host. Post to #ob-dev-incidents only if output non-empty.",
        "channel": "ob-dev-incidents",
    },
    {
        "name": "dev-sentry-digest",
        "schedule": "0 7 * * *",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "web"],
        "skills": ["nepq-agent-communication", "sentry"],
        "prompt": """You are Sentry Analyst. Pull daily error digest from Sentry.
File Linear issues [agent instructions][pe-cc-agents][task] for P1/P2 patterns.
Post summary to #ob-dev-team. Silent if no actionable items.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-security-weekly",
        "schedule": "0 5 * * 1",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "file"],
        "skills": ["nepq-agent-communication", "gsd-secure-phase", "coolify"],
        "prompt": """Security Guardian weekly scan: npm audit in app/command-center,
review docs/59-endpoint-auth-matrix.md drift, file Linear tasks for HIGH/CRITICAL.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-red-team-watchlist",
        "schedule": "0 10 * * 3",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "file", "web"],
        "skills": ["nepq-agent-communication", "gsd-verify-work", "workos-agent-auth"],
        "prompt": """Red Team: pick random watchlist item from docs/59-red-team-milestone-protocol.md.
Run one adversarial cycle; post RED TEAM CYCLE receipt on Linear milestone.
P0 guardrail failure → #ob-dev-incidents.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-memory-clerk",
        "schedule": "0 22 * * *",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["file", "terminal"],
        "skills": ["nepq-agent-communication", "meta-memory-write"],
        "prompt": """Memory Clerk: check context/MEMORY.md and USER.md caps, contradictions.
File Linear memory-drift issues; never auto-write curated memory.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-repo-janitor",
        "schedule": "0 8 * * 1",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "file"],
        "skills": ["nepq-agent-communication", "wrapup"],
        "prompt": """Repo Janitor: stale branches, old TODOs, memsearch index reminder.
File Linear cleanup tasks; never delete without Dev Conductor approval.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-seo-weekly",
        "schedule": "0 6 * * 1",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "web"],
        "skills": ["nepq-agent-communication", "pagespeed-95-gate", "indexing-sitemap-health"],
        "prompt": """SEO Engineer weekly audit (see docs/knowledge-base/runbooks/seo-weekly-audit.md):
1) PageSpeed 95 gate on seo-maintenance.config.json criticalPages (PSI primary).
2) DataForSEO Lighthouse fallback: node scripts/seo-dataforseo-lighthouse.mjs
3) GSC URL Inspection: node scripts/seo-gsc-url-inspect.mjs — report confirmedGoogleIndexScore.
4) indexing-sitemap-health for robots/sitemap/noindex.
File seo-regression Linear issues for sub-95 categories or GSC not-indexed critical URLs.""",
        "channel": "ob-dev-team",
    },
    {
        "name": "dev-session-analyst",
        "schedule": "0 8 * * *",
        "agent": "pe-cc-agents@cc.proexteriorsus.net",
        "toolsets": ["terminal", "web"],
        "skills": ["nepq-agent-communication", "sentry", "ssr-page-audit"],
        "prompt": """Session Analyst: GET /api/dev/activity-summary with dev service token.
Cross-check Sentry replay friction; file ux-friction Linear issues when thresholds exceeded.""",
        "channel": "ob-dev-team",
    },
]


def ssh(cmd, timeout=30):
    r = subprocess.run(
        ["ssh", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no", HOST, cmd],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return r.stdout.strip(), r.stderr.strip(), r.returncode


def main():
    dry = "--dry-run" in sys.argv
    print(f"DevTeam cron deploy ({len(DEV_CRON_JOBS)} jobs) dry_run={dry}")
    payload = json.dumps(DEV_CRON_JOBS, indent=2)
    out_path = Path("agents/cadences/dev-team-cron-jobs.json")
    out_path.write_text(payload + "\n")
    print(f"Wrote {out_path}")
    if dry:
        print("Dry run — not pushing to host.")
        return
    # Host push is operator-run when SSH available
    print("Apply on host: copy dev-team-cron-jobs.json and merge into Hermes state per deploy-crons.py pattern.")


if __name__ == "__main__":
    main()
