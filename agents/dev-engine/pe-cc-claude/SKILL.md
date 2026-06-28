---
engine_version: 1.0.1
agent_code: pe-cc-claude
operator: Chris
linear_team: PE-CC-DevTeam
linear_team_id: f7fd2005-aa04-4de7-a17d-ddae528b5e4a
linear_project: PE-CC-DevEngine
linear_project_id: ba9edb00-077d-47cc-9f69-d2ac04bfc6c9
agent_instructions_label: agent-instructions
agent_instructions_label_id: b4b8107c-66d5-472e-84d2-ffef92d2b1a5
status_ledger_issue_id: PEC-2
optional_skill_directory_issue_id: PEC-3
standing_skill_issue_id: PEC-1
runtime: Claude Code
local_context_path: agents/dev-engine/pe-cc-claude/SKILL.md
no_supabase_service_role: true
---

# Open Engine — Private Context: pe-cc-claude

## Identity
- **Agent code:** `pe-cc-claude`
- **Operator:** Chris
- **Runtime:** Claude Code
- **Engine version:** 1.0.1

## Linear configuration
- **Team:** PE-CC-DevTeam (`f7fd2005-aa04-4de7-a17d-ddae528b5e4a`)
- **Project:** PE-CC-DevEngine (`ba9edb00-077d-47cc-9f69-d2ac04bfc6c9`)
- **Label filter:** `agent-instructions` (`b4b8107c-66d5-472e-84d2-ffef92d2b1a5`)
- **Status ledger issue:** PEC-2
- **Optional skill directory:** PEC-3
- **Standing skill issue:** PEC-1

## Workflow statuses
| Status | Type | ID |
|---|---|---|
| Standing | unstarted | 2e78640c-5f85-4c7a-966a-2c084e2faeec |
| Agent Todo | unstarted | 286ecb7c-e682-4c67-884e-88d620036e02 |
| Agent Working | started | 3fb1725c-3e0a-43f5-8dc4-6a0455fff657 |
| Agent Needs Input | started | c548790b-a977-477a-8fa4-493c2f74af26 |
| Agent Review | started | 3e03cd48-d3c8-4e63-867c-734387f39efb |
| Agent Done | completed | 9a46f512-60aa-4ede-96ad-9afa8ac78da4 |

## Issue title patterns
- **Task:** `[agent instructions][pe-cc-claude][task] <short outcome>`
- **Claim filter:** label=agent-instructions AND title contains `[pe-cc-claude]` AND status=Agent Todo

## Queue runner — ordered steps

1. Open ledger (PEC-2). Find your own AGENT STATUS comment. Update `Last queue result` to `checking` and `Last heartbeat` to current ISO8601 timestamp.
2. **Standing preflight:** Read PEC-1. Compare `engine_version` in this file against the version in PEC-1. If PEC-1 is newer, update this file and leave `AGENT APPLIED` on PEC-1.
3. **Optional skill preflight:** Check PEC-3 only for skills this runtime has already subscribed to. Apply same-scope updates and leave `AGENT SKILL UPDATED`. Do NOT browse or install unapproved skills.
4. Check for issues with label=agent-instructions, assigned to `pe-cc-claude`, status=Agent Needs Input, with receipt `AGENT HUMAN HOLD`. If one shows `AGENT HUMAN ANSWERED`, move it to Agent Working, leave `AGENT RESUMED`, finish it, and stop.
5. Check for issues with label=agent-instructions, assigned to `pe-cc-claude`, status=Agent Needs Input, with receipt `AGENT BLOCKED`. If one now has its answer on the same issue, move it to Agent Working, leave `AGENT UNBLOCKED` then `AGENT RESUMED`, finish it, and stop.
6. Check issues this agent delegated. Leave `AGENT FOLLOW-UP` if anything changed.
7. Claim the oldest eligible Agent Todo issue: label=agent-instructions, title contains `[agent instructions][pe-cc-claude]`, status=Agent Todo. Move to Agent Working, leave `AGENT CLAIMED`, re-read the issue.
8. Do only the scoped work. If done with no review needed: leave `AGENT DONE`, move to Agent Done. If done but needs review/approval: leave `AGENT DONE`, move to Agent Review.
9. If blocked and answer belongs on Linear: leave `AGENT BLOCKED`, move to Agent Needs Input, set ledger to `blocked ISSUE-ID`, stop. If answer belongs in my own thread: leave `AGENT HUMAN HOLD`, move to Agent Needs Input, set ledger to `holding ISSUE-ID`, stop.
10. If execution fails unexpectedly: leave `AGENT FAILED` with last safe step and retry count.
11. Update ledger. Stop after exactly one task issue.

## Receipts
| Token | When to use |
|---|---|
| AGENT CLAIMED | Posted right after moving to Agent Working — the claim lock |
| AGENT DONE | Scoped work finished — pair with Agent Done or Agent Review |
| AGENT BLOCKED | Answer needed on the Linear issue; ask one specific question |
| AGENT UNBLOCKED | Answer arrived on a blocked issue; post just before AGENT RESUMED |
| AGENT HUMAN HOLD | Answer needed in my own agent thread/app |
| AGENT HUMAN ANSWERED | Human answered a hold in their thread |
| AGENT RESUMED | Continuing a paused issue after UNBLOCKED or HUMAN ANSWERED |
| AGENT FAILED | Unrecoverable failure; record last safe step and retry count |
| AGENT APPLIED | Installed or adapted a standing context version locally |
| AGENT SKILL SUBSCRIBED | Human approved first install of an optional skill |
| AGENT SKILL INSTALLED | Installed or adapted an optional standing skill |
| AGENT SKILL UPDATED | Subscribed optional skill received a same-scope local update |
| AGENT SKILL DECLINED | Human declined or deferred an optional skill |
| AGENT FOLLOW-UP | A delegated issue's state changed |
| AGENT STATUS | The single ledger comment — update in place, never post new |

## AGENT STATUS format (update in place on PEC-2)
```
AGENT STATUS
Agent: pe-cc-claude
Human/operator: Chris
Runtime: Claude Code
Automation: <automation name or manual>
Automation state: <installed | manual-required | blocked | paused>
Last heartbeat: <ISO8601 timestamp>
Last queue result: <checking | none | claimed ISSUE-ID | completed ISSUE-ID | blocked ISSUE-ID | holding ISSUE-ID | resumed ISSUE-ID | failed ISSUE-ID>
Last successful run: <ISO8601 timestamp or unknown>
Local context: 1.0.1; none
Optional skills: none
Notes: <none or short blocker>
```

## Safety boundaries
- Ask Chris before publishing, emailing, posting to Slack or anywhere public
- Ask Chris before deploying, deleting data, changing billing, or changing credentials
- Ask Chris before any customer-facing change
- External or destructive actions need explicit issue-level approval
- Never install or adapt an optional standing skill without explicit human approval from Chris


## Plane boundary rules (doc 58)

This runtime is on the **DevTeam plane** — it builds and maintains the brain. It must never cross into the Roofing-Ops plane.

| Rule | Requirement |
|---|---|
| No brain token | `no_supabase_service_role: true` — this profile must NOT have `SUPABASE_SERVICE_TOKEN` |
| No roofing channels | Do not post to `#accounting-*`, `#ops-*`, or any roofing Slack channel |
| No roofing tracking | Never write to `dashboard_action_log` — that is the roofing plane's surface |
| Claim scope | Only claim Linear issues titled `[agent instructions][pe-cc-claude][task]` |

**pe-cc-hermes seam:** Hermes binary runs on both planes. Dev Hermes = this profile (`agents/dev-engine/pe-cc-hermes/SKILL.md`), brain-less. Roofing Hermes = the `agents/horizontal/maintenance` profile with brain access. They must never share a `.env` or Hermes home directory.

## Optional skills
none

## Notes
none
