#!/usr/bin/env python3
from pathlib import Path
import argparse
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--mode", choices=("security", "operations", "workflow"), required=True)
parser.add_argument("--repo", type=Path, required=True)
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()

repo = args.repo.resolve()
runtime = repo / "deployment/remote/orgo/maya-slack-listener"
errors = []

def read(relative):
    path = repo / relative
    if not path.is_file():
        errors.append(f"missing source file: {relative}")
        return ""
    return path.read_text(encoding="utf-8")

def require(text, pattern, label):
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"missing invariant: {label}")

def forbid(text, pattern, label):
    if re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"forbidden invariant: {label}")

test_run = subprocess.run(
    ["npm", "test"], cwd=runtime, text=True,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=60,
)
if test_run.returncode != 0:
    errors.append("listener npm test failed")
require(test_run.stdout, r"# tests 99\b", "exact 99-test count")
require(test_run.stdout, r"# pass 99\b", "all tests pass")
require(test_run.stdout, r"# fail 0\b", "zero failures")

report = args.report.read_text(encoding="utf-8") if args.report.is_file() else ""
require(report, r"^MACHINE_VERDICT: PASS\s*$", "report PASS verdict")
for phrase in ("Composio", "Gmail", "Linear", "Slack", "99/99"):
    require(report.lower(), re.escape(phrase.lower()), f"report evidence {phrase}")

policy = read("deployment/remote/orgo/maya-slack-listener/policy.mjs")
executor = read("deployment/remote/orgo/maya-slack-listener/capability-executor.mjs")
agent = read("deployment/remote/orgo/maya-slack-listener/capability-agent.mjs")
mailbox = read("deployment/remote/orgo/maya-slack-listener/mailbox-executor.mjs")
state = read("deployment/remote/orgo/maya-slack-listener/mailbox-state.mjs")
core = read("deployment/remote/orgo/maya-slack-listener/core.mjs")
listener = read("deployment/remote/orgo/maya-slack-listener/listener.mjs")
readme = read("deployment/remote/orgo/maya-slack-listener/README.md")
tests = read("deployment/remote/orgo/maya-slack-listener/test/capability.test.mjs")
profile = read("agents/profiles/maya-chen.yaml")
# Production sources are scanned for live credential shapes. The test file
# deliberately contains credential prefixes only as negative-match fixtures.
all_changed = "\n".join((policy, executor, agent, mailbox, state, core, listener, readme, profile))
forbid(all_changed, r"(?:sk_live_|xox[bep]-|lin_api_|ak_[A-Za-z0-9])", "credential material")

if args.mode == "security":
    for literal in ("gmailConnectedAccountId", "linearConnectedAccountId", "sendConnectedAccountId", "linearTeamId"):
        require(policy, rf"\b{literal}\b", f"pinned {literal}")
    require(listener, r"allowTracking:\s*false", "Composio telemetry disabled")
    require(profile, r"auth_provider:\s*\"composio\"", "Composio-only Google auth profile")
    require(profile, r"composio_env_key:\s*\"COMPOSIO_API_KEY\"", "Composio runtime credential reference")
    forbid(profile, r"(?:FAL|FIRECRAWL|EXA|TAVILY)_API_KEY", "non-Composio tool credentials in Maya profile")
    require(executor, r"OWNER_EMAIL\s*=\s*\"admin@cc\.proexteriorsus\.net\"", "mandatory owner CC")
    require(executor, r"withOwnerCc", "code-owned CC insertion")
    require(executor, r"UNKNOWN|unknown capability action", "closed action catalog")
    forbid(executor, r"GMAIL_DELETE_(?:MESSAGE|THREAD)|LINEAR_DELETE_LINEAR_ISSUE|SLACKBOT_DELETES_A_MESSAGE", "permanent destructive tools")
    require(executor, r"protected credential language", "outbound secret filter")
    require(agent, r"provider-confirmed", "provider-evidence boundary")
    require(core, r"recordAction", "Slack action receipt append")
    require(state, r"recordAction", "mailbox action receipt append")

if args.mode == "operations":
    require(agent, r"MAX_CAPABILITY_STEPS", "bounded tool loop")
    require(agent, r"repeated an identical action", "loop repetition stop")
    require(executor, r"AbortSignal\.any", "operator shutdown combined with timeout")
    require(mailbox, r"millisecondsUntilNextHalfHour", "30-minute mailbox cadence")
    require(mailbox, r"slackAttempted = true", "no fallback effect after multi-action ambiguity")
    require(listener, r"createSerialQueue", "serialized Slack work")
    require(tests, r"write without provider confirmation stops", "ambiguous-write regression")

if args.mode == "workflow":
    for name in ("gmail_search", "gmail_get_attachment", "gmail_reply", "gmail_send", "linear_search", "linear_create", "linear_update", "linear_comment", "slack_search", "slack_send"):
        require(executor, rf"\"{name}\"", f"capability {name}")
    require(mailbox, r"capabilityAgent", "mailbox delegates material work")
    require(agent, r"one tool action per turn", "iterative planning contract")
    require(executor, r"team_id:\s*expected\.linearTeamId", "PE-CC-Dev issue pin")
    require(executor, r"attributedEmailSubject|attributedBody|attributedSlack|attributedLinear", "Maya attribution")
    require(readme, r"PEC-113 removes the old intake-only", "honest promoted scope")
    require(readme, r"Permanent\s+deletion, payment execution", "honest residual limits")

if errors:
    print(f"{args.mode} gate failed: " + "; ".join(errors))
    raise SystemExit(1)
print(f"{args.mode} gate passed: 99/99 tests and deterministic capability invariants")
