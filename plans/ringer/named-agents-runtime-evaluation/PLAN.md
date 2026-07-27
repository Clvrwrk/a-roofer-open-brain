# Named Agents Runtime Evaluation — Ringer Plan

Status: evaluation complete; implementation planning approved. Three Ringer rounds
completed on 2026-07-26 with all eight tasks passing. No production runtime changes
have been authorized or made.

## Decision to make

Choose the smallest reliable runtime change that makes Alex, Maya, Casey, Jordan,
Sam, Rowan, and Lena usable through their named Slack identities and able to triage
their assigned email, while preserving Command Center/Supabase as the operational
system of record.

The decision set is deliberately asymmetric:

1. Stabilize the existing Hermes + Slack + AgentMail/Google Workspace design.
2. Pilot Vercel eve as the durable orchestration layer for one named agent.
3. Use Cursor Cloud Agents only for the separate DevTeam/code-maintenance plane.
4. Use Devin only for browser-only workflows that cannot be made API-first.

This is not authorization to migrate production, send messages, read real inboxes,
or install third-party tooling. Any pilot must first pass the repository's
third-party-agent-tool gate and receive human approval.

## What the audit established

- Linear has no per-persona issues for the seven named agents. That is intentional:
  PEC-1 says the Roofing-Ops agents do not use Open Engine or Linear.
- PEC-8, PEC-12, and PEC-14 collectively describe the unfinished shared runtime.
  PEC-14 contains the critical unclosed gaps: Slack intake does not reliably create
  Command Center work items, escalation titles are not claimable by a runtime, and
  there is no durable runner status.
- The repository contains two partially overlapping systems: DevTeam runtimes use
  Linear/Open Engine, while named Roofing-Ops personas are intended to use isolated
  Hermes profiles, Slack, Command Center, AgentMail, and Google Workspace.
- Maya already has a dedicated Orgo Chrome desktop and an authenticated Google
  Workspace session. Her Orgo credential is stored as
  `ORGO_PE_CC_MAYA_API_KEY` in the operator's Master environment. The local Mac mini
  is explicitly out of Maya's runtime path.
- Repository documentation disagrees about whether Slack is a single read-only app
  or multiple two-way named-agent apps. Live Hetzner runtime health could not be
  independently verified with the available SSH identity.
- Email is split too: ten service-role AgentMail inboxes exist, while the seven named
  personas have planned Google Workspace identities and planned Orgo desktops.

See `inputs/linear-and-runtime-evidence.md` for the evidence packet supplied to the
workers.

## Working recommendation

First establish a measured Hermes-on-Orgo baseline for Maya. Orgo's official
documentation explicitly supports installing Hermes inside a persistent computer as
a 24/7 runtime. Configure Maya's existing computer with her isolated Hermes home,
persona, skills, Command Center API access, one synthetic Gmail intake, one test
Slack route, health reporting, and all outbound actions approval-gated.

Maya is the canonical deployment template for every named agent: Alex, Casey,
Jordan, Sam, Rowan, and Lena each receive the same isolated runtime shape, with only
persona, permissions, skills, schedules, Slack identity, Google Workspace identity,
and data boundary varying by role. Jordan and Sam are no longer treated as
workspace-only identities in the target architecture; they receive dedicated Orgo
computers before their runtime is activated.

Only after that baseline passes should a bounded Vercel eve pilot reproduce the same
synthetic workflow in isolation. Eve and Hermes must not simultaneously own Maya's
production schedules or Slack events. The comparison should select one control plane:
either Hermes runs inside Orgo, or eve owns orchestration and treats Orgo strictly as
a computer-use tool. Keep Supabase and Command Center as the source of truth in both
variants. Devin remains a fallback for browser workflows Orgo cannot satisfy; Cursor
Cloud belongs on the development plane, not behind the customer-facing identities.

After the Maya decision gate, replicate the winning control-plane pattern one agent
at a time. Never bulk-enable all seven. Each agent must independently pass identity,
scope, Slack, email, recording, restart, approval, and rollback tests before the next
agent is activated.

The repository's current Orgo provisioner expects the conventional `ORGO_API_KEY`,
while the operator's canonical secret name is `ORGO_PE_CC_MAYA_API_KEY`. Orgo does
not require that literal environment-variable name; it requires the value as an
Authorization Bearer token. The runtime should map Maya's canonical variable into
the client without renaming or duplicating the stored secret. It must discover/reuse
Maya's existing desktop rather than provisioning another.

Orgo keys are account-wide or workspace-scoped—not computer-scoped. Confirm Maya's
key is workspace-scoped and that her workspace contains no computers she should not
control. A variable named for Maya is not, by itself, an authorization boundary.
Apply this invariant to every agent: one dedicated workspace per named agent and one
workspace-scoped key stored as `ORGO_PE_CC_<AGENT>_API_KEY`. Do not place multiple
agents' computers in a shared workspace if their keys are meant to enforce persona
isolation.

Read-only verification on 2026-07-26 confirmed the temporary master key can list the
current Orgo environment: one `PE-open-brain` workspace and one running `Maya Chen`
computer. A read of a nonexistent workspace returned `404 Project not found`, not
Orgo's documented `403 workspace_scope_mismatch`; this supports the inference that
the key is account-wide. Use `ORGO_API_KEY_MASTER` only for provisioning the seven
workspaces and generating or assigning scoped integration keys. Never install it
inside an agent computer. Rotate the temporary master key before production
activation.

## Canonical named-agent template

| Layer | Per-agent requirement |
| --- | --- |
| Orgo | Dedicated workspace and persistent computer; reuse by stable ID/name |
| Credential | Workspace-scoped `ORGO_PE_CC_<AGENT>_API_KEY`; never account-wide in runtime |
| Identity | Dedicated `@cc.proexteriorsus.net` Google Workspace account |
| Hermes | Isolated `~/.hermes`; persona, memory, skills, logs, and schedules never shared |
| Slack | Dedicated app/bot identity and approved channel allowlist |
| Command Center | Least-privilege service identity; all work receipted and attributable |
| Control plane | Exactly one owner of schedules and Slack events: Hermes or eve |
| Browser use | API-first; Orgo GUI only when an API path is unavailable or inadequate |
| Outbound actions | Draft/propose by default; human approval for external sends and writes |
| Operations | Heartbeat, last/next run, queue depth, trace, retry state, kill switch, rollback |

Role-specific restrictions remain stronger than the common template. In particular,
Rowan remains external-only and receives no internal brain or Supabase service-role
credential; Sam's audit role does not gain authority to change Quality Control trust
tiers; no named agent receives administrative, DNS, billing, payment, or approval
authority merely because it has a desktop.

The complete Hermes configuration and cost-routing contract is defined in
`HERMES-NAMED-AGENT-TEMPLATE.md`. It replaces the current assumption that every job
should use one Sonnet-class model. Each task class is benchmarked, assigned to T0/T1/T2,
and promoted only when its cheaper tier fails a measurable acceptance check.

## Swarm structure

Round 1 independently verifies the evidence and vendor fit. Round 2 attacks the
provisional recommendation from architecture, security, and operations angles.
Round 3 synthesizes a go/no-go decision, pilot design, rollback, and Linear issue
tree. Each round is a separate manifest because later rounds consume prior outputs.

Run only after explicit approval:

```sh
python3 /Volumes/M4\ Application\ SSD/Projects/Cleverwork/ringer/ringer.py run \
  plans/ringer/named-agents-runtime-evaluation/manifest-round1.json
```

Round 2 reads the accepted Round 1 task artifacts in place, and Round 3 reads both
prior rounds in place. Review those outputs before starting the dependent manifest.

## Required pilot gates

- One synthetic Slack mention creates exactly one Command Center work item.
- The named agent can reply in the originating thread and the action is receipted.
- One synthetic Google Workspace email is classified through Maya's existing Orgo
  identity without exposing unrelated mailbox content.
- Outbound Slack/email actions remain approval-gated until explicitly promoted.
- Every run exposes durable status, trace, retry state, and an operator kill switch.
- A rollback disables eve and restores the single Hermes owner without data
  migration, desktop replacement, or DNS changes.
- No credential is copied into prompts, source control, logs, or worker artifacts.
- The current third-party tool gate is completed before production credentials are
  connected.
- The template is proven on Maya, then rolled out serially with an independent go/no-go
  gate for Alex, Casey, Jordan, Sam, Rowan, and Lena.
- Every enabled job names a validated model tier, token ceiling, timeout, acceptance
  check, and escalation rule; daily and monthly spend circuit breakers are live.

## Exit decision

Approve eve only if it materially reduces runtime glue and operational toil while
meeting every gate above. Otherwise stabilize Hermes for Slack/API work and use a
separate, narrowly scoped browser worker only where necessary.
