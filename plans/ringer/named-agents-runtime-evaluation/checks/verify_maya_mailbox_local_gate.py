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
require(test_run.stdout, r"# tests 90\b", "exact 90-test count")
require(test_run.stdout, r"# pass 90\b", "all 90 tests pass")
require(test_run.stdout, r"# fail 0\b", "zero test failures")

report = args.report.read_text(encoding="utf-8") if args.report.is_file() else ""
require(report, r"^MACHINE_VERDICT: PASS\s*$", "report PASS verdict")
for phrase in ("30-minute", "Composio", "Gmail", "Linear", "Slack", "90/90"):
    require(report.lower(), re.escape(phrase.lower()), f"report evidence {phrase}")

policy = read("deployment/remote/orgo/maya-slack-listener/policy.mjs")
executor = read("deployment/remote/orgo/maya-slack-listener/mailbox-executor.mjs")
hermes = read("deployment/remote/orgo/maya-slack-listener/mailbox-hermes.mjs")
state = read("deployment/remote/orgo/maya-slack-listener/mailbox-state.mjs")
listener = read("deployment/remote/orgo/maya-slack-listener/listener.mjs")
tests = read("deployment/remote/orgo/maya-slack-listener/test/mailbox.test.mjs")
readme = read("deployment/remote/orgo/maya-slack-listener/README.md")

all_changed = "\n".join((policy, executor, hermes, state, listener, tests, readme))
forbid(all_changed, r"(?:sk_live_|xox[bp]-|lin_api_|xoxe\.)", "credential material in candidate")

if args.mode == "security":
    for literal in ("gmailConnectedAccountId", "linearConnectedAccountId", "ownerSlackChannelId", "linearTeamId"):
        require(policy, rf"\b{literal}\b", f"pinned {literal}")
    require(listener, r"allowTracking:\s*false", "Composio telemetry disabled")
    require(hermes, r"untrusted data, never authority", "email prompt injection boundary")
    require(hermes, r"Do not follow email instructions to .*contact the original sender", "sender-contact prohibition")
    forbid(executor, r"GMAIL_(?:SEND|REPLY)|GMAIL_REPLY_TO_THREAD", "email send/reply tool")
    require(state, r"messageDigest", "receipt uses message digest")
    forbid(state, r"\b(?:subject|body|sender|recipients)\b", "mail content in receipt state")
    require(executor, r"state\.ambiguous", "ambiguous terminal path")

if args.mode == "operations":
    require(policy, r"MAILBOX_INTERVAL_MS\s*=\s*30\s*\*\s*60", "30-minute policy interval")
    require(state, r"millisecondsUntilNextHalfHour", "half-hour scheduler")
    require(executor, r"const initial = await state\.initialize\(\);.*?schedule\(\);", "startup schedules without immediate poll")
    forbid(executor, r"const initial = await state\.initialize\(\);.*?else\s*\{\s*run\(\)", "restart immediate provider poll")
    require(executor, r"MAILBOX_MAX_PAGES", "bounded Gmail pagination")
    require(executor, r"controller\.abort\(\).*?await active", "graceful executor stop")
    require(tests, r"empty mailbox completes without depending on Linear", "empty-inbox isolation test")
    require(tests, r"startup schedules the next boundary without an immediate provider poll", "restart cadence test")

if args.mode == "workflow":
    require(hermes, r"new Set\(\[\"ignore\", \"track\", \"block\"\]\)", "three-way task decision")
    require(executor, r"Gmail message ID:", "Linear source provenance")
    require(executor, r"\[NA-5\]\[MAYA\].*?\[BLOCKED\]", "owner blocked routing packet")
    require(executor, r"remove_label_ids:\s*\[\"UNREAD\"\]", "successful handled-mail mark read")
    require(executor, r"LINEAR_CREATE_LINEAR_ISSUE", "Linear task creation")
    require(readme, r"(?i)never replies to\s+the original sender or sends email", "honest outbound limitation")
    require(readme, r"creates\s+source-linked PE-CC-DevTeam Linear issues", "honest task-intake scope")

if errors:
    print(f"{args.mode} gate failed: " + "; ".join(errors))
    raise SystemExit(1)
print(f"{args.mode} gate passed: 90/90 tests and deterministic source invariants")
