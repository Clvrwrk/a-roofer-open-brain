#!/usr/bin/env python3
"""
Write Hermes cron jobs.json into each agent's profile on the agent host.
Format: ~/.hermes/cron/jobs.json
"""
import json, uuid, subprocess
from datetime import datetime, timezone
from pathlib import Path

SSH_KEY  = Path("~/.ssh/a_roofers_open_brain_ed25519").expanduser()
IMAGE_ID = "2c589484-3521-41fc-bec6-ac785ae87dd7"
HOST     = "root@5.78.146.161"
NOW      = datetime.now(timezone.utc).isoformat()

def ssh(cmd, timeout=20):
    r = subprocess.run(
        ["ssh", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no",
         "-o", "ConnectTimeout=8", HOST, cmd],
        capture_output=True, text=True, timeout=timeout,
    )
    return r.stdout.strip(), r.returncode

def next_run(cron_expr):
    """Return a reasonable next_run_at — just set to now so scheduler picks it up."""
    return NOW

def make_job(name, schedule, prompt, skills, toolsets, deliver_channel):
    """Build a Hermes cron job record."""
    # Determine schedule kind
    if schedule.startswith("every ") or schedule[0].isdigit() and schedule[-1] in "mhd":
        kind = "interval"
        sched = {"kind": "interval", "expr": schedule, "display": schedule}
    else:
        kind = "cron"
        sched = {"kind": "cron", "expr": schedule, "display": schedule}

    return {
        "id": uuid.uuid4().hex[:12],
        "name": name,
        "prompt": prompt,
        "schedule": sched,
        "skills": skills,
        "enabled_toolsets": toolsets,
        "deliver": f"slack:{deliver_channel}",
        "repeat": {"times": None, "completed": 0},
        "state": "scheduled",
        "enabled": True,
        "next_run_at": NOW,
        "last_run_at": None,
        "last_status": None,
        "created_at": NOW,
        "model": {
            "model": "anthropic/claude-sonnet-4-20250514",
            "provider": "openrouter"
        },
        "context_from": [],
        "no_agent": False,
    }

# ── Agent → jobs mapping ──────────────────────────────────────────────────────
# (email_prefix, [job_definitions])

VENDOR_INTAKE  = "C0BCUF29G1H"
CREDIT_MEMOS   = "C0BD4EW4RU4"
CATALOG_REVIEW = "C0BCYNW98RL"

AGENTS = {
    "maya.chen@cc.proexteriorsus.net": [
        make_job("maya-gmail-poll", "every 2m",
            "You are Maya Chen, Pro Exteriors document intake agent. Poll Gmail for all 7 aliases (invoices, ap, creditmemos, priceagreement, ar, hr, payroll) using in:anywhere. For each unread: classify by alias, extract vendor/invoice/amount/date, flag SPAM-labeled for human review, escalate HR/Payroll without extracting. Post brief notification to #accounting-vendor-intake. Silent when nothing new.",
            ["google-workspace", "nepq-agent-communication"], ["web", "file"], VENDOR_INTAKE),
        make_job("maya-morning-audit", "0 7 * * 1-5",
            "You are Maya Chen. Check Command Center work queue for unprocessed invoices. Post NEPQ morning audit to #accounting-vendor-intake: count by category, flag >30 day items, flag prior-day HR/Payroll. Max 5 bullets. 90-second read.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("maya-daily-summary", "0 17 * * 1-5",
            "You are Maya Chen. Post end-of-day NEPQ summary to #accounting-vendor-intake. Format: WHAT HAPPENED (documents processed, work items created) → WHAT IT MEANS (patterns) → NEEDS YOUR ATTENTION (specific items or 'Nothing today ✅'). Never list everything — only surface what matters.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("maya-vendor-aging", "0 8 * * 1",
            "You are Maya Chen. Pull all open invoice work items. Group by vendor. Age: 0-30/31-60/61-90/90+. Flag vendors >60 days. Post aging summary to #accounting-vendor-intake. CFMA: DSO target <45 days.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("maya-doc-quality-audit", "0 9 * * 5",
            "You are Maya Chen. Review this week's work items for extraction quality patterns. Which vendors had low-confidence extractions? Which document types caused failures? Post findings to #accounting-vendor-intake. Tag Sam Torres if >2 failure patterns.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("maya-vendor-onboarding", "0 9 1 * *",
            "You are Maya Chen. Monthly: check work items for first-time vendors this month. List new vendors. Flag any without price agreements to #accounting-product-catalog-review. Post summary to #accounting-vendor-intake.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
    ],

    "alex.rivers@cc.proexteriorsus.net": [
        make_job("alex-morning-abc-sync", "0 7 * * 1-5",
            "You are Alex Rivers, pricing variance analyst. Review invoice work items since yesterday 5pm. For each line item: resolve SKU against ABC Supply catalog, apply UOM conversion, match to active price agreement (check date range), calculate variance. Flag >$50/line or >$200/invoice. Post NEPQ pricing report to #accounting-product-catalog-review. Silent if nothing flagged.",
            ["abc-supply-api", "nepq-agent-communication"], ["web", "file"], CATALOG_REVIEW),
        make_job("alex-abc-catalog-sync", "0 6 * * 1",
            "You are Alex Rivers. Weekly ABC Supply catalog sync. Pull full catalog via API (paginate all pages). Flag: new SKUs, price changes >5%, SKUs on invoices with no catalog match. Post to #accounting-product-catalog-review.",
            ["abc-supply-api", "nepq-agent-communication"], ["web", "file"], CATALOG_REVIEW),
        make_job("alex-price-agreement-expiry", "0 8 * * 1",
            "You are Alex Rivers. Check all price agreements for expiration. Flag: expiring in 30 days, already expired. Calculate dispute exposure for expired agreements. Alert #accounting-product-catalog-review and #accounting-vendor-intake (urgent) if expired.",
            ["nepq-agent-communication"], ["web", "file"], CATALOG_REVIEW),
        make_job("alex-vendor-scorecard", "0 9 2 * *",
            "You are Alex Rivers. Monthly vendor performance scorecard. Score each vendor: A(>95%), B(90-95%), C(85-90%), D(<85%) pricing accuracy. Flag D-grade to Casey. Submit to Sam Torres for QA. Post to #accounting-product-catalog-review.",
            ["nepq-agent-communication"], ["web"], CATALOG_REVIEW),
    ],

    "casey.morgan@cc.proexteriorsus.net": [
        make_job("casey-draft-status", "0 8 * * 1-5",
            "You are Casey Morgan, vendor communications specialist. Check Gmail drafts for unsent dispute letters. Check for vendor replies. Check work queue for new credit_memo_candidate items. Post NEPQ daily status to #accounting-credit-memos: drafts pending, vendor replies, needs attention. Only surface what needs action.",
            ["google-workspace", "nepq-agent-communication"], ["web", "file"], CREDIT_MEMOS),
        make_job("casey-dispute-pipeline", "0 9 * * 5",
            "You are Casey Morgan. Weekly dispute pipeline review. Compile: open disputes by vendor/amount/age, close rate this week, average resolution time, disputes >30 days (flag for escalation). Post to #accounting-credit-memos. Escalate 30-day items with NEPQ consequence framing.",
            ["nepq-agent-communication"], ["web"], CREDIT_MEMOS),
    ],

    "jordan.price@cc.proexteriorsus.net": [
        make_job("jordan-weekly-finance", "0 7 * * 1",
            "You are Jordan Price, finance and P&L agent. Pull from Command Center: invoices processed by Maya last week (total AP), credit memos accepted by Casey (recovery). Calculate net vendor spend. Post NEPQ finance packet to #accounting-vendor-intake. CFMA: weekly job cost review differentiates profitable companies.",
            ["nepq-agent-communication"], ["web", "file"], VENDOR_INTAKE),
        make_job("jordan-ar-aging", "0 8 * * 3",
            "You are Jordan Price. Weekly AR aging. Pull outstanding receivables. Age: current/31-60/61-90/90+. Calculate DSO (target <45 days). Flag 90+ day receivables with consequence framing. Post to #accounting-vendor-intake.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("jordan-month-end", "0 6 28 * *",
            "You are Jordan Price. Month-end finance packet (28th of month). Total AP by category, credit memo recovery, insurance supplement status (ACV received/RCV pending), DSO trend. Post to #accounting-vendor-intake. KatzAbosch CPA: WIP schedules by 5th business day after month-end.",
            ["nepq-agent-communication"], ["web", "file"], VENDOR_INTAKE),
    ],

    "sam.torres@cc.proexteriorsus.net": [
        make_job("sam-midweek-qa", "0 9 * * 3",
            "You are Sam Torres, QA and accuracy monitor. Sample 10% of this week's work items from Command Center. Spot-check vendor names, amounts, variance calculations for accuracy. Post mid-week QA to #accounting-vendor-intake: sample size, issues, accuracy estimate. Taskade 2026: 10-15% sampling, <85% triggers process review.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
        make_job("sam-weekly-compliance", "0 16 * * 5",
            "You are Sam Torres. Weekly compliance digest to #accounting-vendor-intake. Compile: accuracy estimate, vendor disputes (sent/accepted/pending), work queue depth (target <50), items >7 days old (flag >5), emerging patterns. NEPQ format: SYSTEM HEALTH → EMERGING PATTERNS → NEEDS YOUR DECISION.",
            ["nepq-agent-communication"], ["web"], VENDOR_INTAKE),
    ],

    "rowan.vale@cc.proexteriorsus.net": [
        make_job("rowan-storm-monitor", "0 6 * * *",
            "You are Rowan Vale, external research scout (external-only network — never access internal systems). Check weather.gov for Texas severe weather alerts. Check for NOAA storm events in Travis County + Williamson County TX. If storm detected: POST IMMEDIATELY to #accounting-product-catalog-review with NEPQ alert: situation, what it means, recommendation to begin canvassing. IBHS: 48-hour first-mover advantage = 3x conversion. Silent if no storms.",
            ["nepq-agent-communication"], ["web", "browser"], CATALOG_REVIEW),
        make_job("rowan-abc-price-monitor", "0 6 * * 2",
            "You are Rowan Vale. Monitor for ABC Supply material price movements via public sources. Flag any material category with >5% price movement (shingles, underlayment, metal). Cross-reference with active price agreements. Alert Alex Rivers if agreement prices now below market. Post to #accounting-product-catalog-review only if changes detected.",
            ["nepq-agent-communication"], ["web"], CATALOG_REVIEW),
        make_job("rowan-cert-monitor", "0 8 * * 3",
            "You are Rowan Vale. Check GAF Master Elite and Owens Corning Platinum Preferred certification status for Pro Exteriors. Flag: certification expired/suspended, renewal within 90 days, CE hours needed. GAF Master Elite = 3% of contractors — protect it. Post to #accounting-product-catalog-review only if action needed.",
            ["nepq-agent-communication"], ["web", "browser"], CATALOG_REVIEW),
        make_job("rowan-carrier-bulletins", "0 9 * * 4",
            "You are Rowan Vale. Search for insurance carrier bulletin updates affecting Texas roofing claims: State Farm, Allstate, USAA, Farmers. Check Xactimate price list publication dates. IAS Solutions 2026: use current regional price list always. Post to #accounting-product-catalog-review only if significant changes. Include source URL and retrieved_at.",
            ["nepq-agent-communication"], ["web", "browser"], CATALOG_REVIEW),
        make_job("rowan-code-updates", "0 9 1 * *",
            "You are Rowan Vale. Monthly: check for building code updates in Austin TX and Round Rock TX. IRC roofing provisions R905.x, wind uplift, fastener requirements. Post to #accounting-product-catalog-review only if changes found. Include: jurisdiction, code section, effective date, impact on current jobs.",
            ["nepq-agent-communication"], ["web", "browser"], CATALOG_REVIEW),
    ],

    "lena.brooks@cc.proexteriorsus.net": [
        make_job("lena-eeat-harvest", "0 9 * * 2",
            "You are Lena Brooks, EEAT and reputation agent. Review recently closed jobs. Identify content-worthy moments (exceptional scope, unique challenge, customer outcome). Draft 1-2 project stories (300-500 words): job specifics (neighborhood, scope, product), what made it notable. Include schema.org markup structure. Post to #accounting-product-catalog-review for approval. Google EEAT 2024: job-specific details required for EEAT signals.",
            ["nepq-agent-communication"], ["web", "file"], CATALOG_REVIEW),
        make_job("lena-reputation-monitor", "0 8 * * 5",
            "You are Lena Brooks. Check for new reviews: Google Business Profile, Yelp, BBB, Angi. For positive: draft thank-you response with specific detail. For negative: draft de-escalating response (acknowledge → validate → take offline). Post review summary to #accounting-product-catalog-review. Route drafts to Conductor for human approval. amraandelma 2026: respond within 24 hours.",
            ["nepq-agent-communication"], ["web", "browser"], CATALOG_REVIEW),
        make_job("lena-review-velocity", "0 10 5 * *",
            "You are Lena Brooks. Monthly review velocity report: reviews this month vs last, average star rating trend, response rate, platform breakdown. Post to #accounting-product-catalog-review: WHAT HAPPENED → WHAT IT MEANS → NEEDS YOUR ATTENTION.",
            ["nepq-agent-communication"], ["web"], CATALOG_REVIEW),
        make_job("lena-content-calendar", "0 9 5 * *",
            "You are Lena Brooks. Plan next month's content calendar: 4 project stories (mapped to specific neighborhoods), 1 neighborhood page, 1 FAQ. Base on completed jobs this month and target keywords. Post calendar to #accounting-product-catalog-review for approval. OneClickCode 2024: neighborhood-specific pages are top local SEO driver for roofing.",
            ["nepq-agent-communication"], ["web", "file"], CATALOG_REVIEW),
    ],
}

# Deploy jobs.json to each agent
print("Deploying cron jobs to agent host...")
total_deployed = 0

for email, jobs in AGENTS.items():
    jobs_data = {"jobs": jobs, "_version": 1}
    jobs_json = json.dumps(jobs_data, indent=2)

    # Write to temp file, scp to host, move to correct location
    tmp_path = f"/tmp/jobs-{email.split('@')[0].replace('.', '-')}.json"
    remote_cron_dir = f"/mnt/kasm_profiles/{email}/{IMAGE_ID}/.hermes/cron"

    # Write temp file locally
    Path(tmp_path).write_text(jobs_json)

    # SCP to host
    scp = subprocess.run(
        ["scp", "-q", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no",
         tmp_path, f"{HOST}:{tmp_path}"],
        capture_output=True, timeout=15,
    )

    if scp.returncode != 0:
        print(f"  ❌ {email}: SCP failed")
        continue

    # Move to correct location on host
    out, rc = ssh(f"""
mkdir -p {remote_cron_dir} && \
mv {tmp_path} {remote_cron_dir}/jobs.json && \
chown 1000:1000 {remote_cron_dir}/jobs.json && \
chmod 600 {remote_cron_dir}/jobs.json && \
echo "OK:{email}:$(wc -c < {remote_cron_dir}/jobs.json)bytes"
""")

    if "OK:" in out:
        n = len(jobs)
        total_deployed += n
        print(f"  ✅ {email}: {n} jobs deployed ({out.split(':')[2]})")
    else:
        print(f"  ❌ {email}: {out[:80]}")

    Path(tmp_path).unlink(missing_ok=True)

print(f"\n{'='*55}")
print(f"Total cron jobs deployed: {total_deployed}")

# Verify by listing from one agent
out, _ = ssh(
    f"python3 -c \""
    f"import json; d=json.load(open('/mnt/kasm_profiles/maya.chen@cc.proexteriorsus.net/{IMAGE_ID}/.hermes/cron/jobs.json')); "
    f"print('Maya jobs:', len(d['jobs'])); [print(' -', j['name']) for j in d['jobs']]\""
)
print(f"\nVerification:\n{out}")
