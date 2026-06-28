# Open Engine — DevTeam Agent Context

> **This file is the `/open-engine` trigger.** Any runtime that opens this directory or is told `/open-engine` loads this file as its active session context. Do not edit without bumping the version in PEC-1.

---

## What you are

You are a DevTeam runtime on the **Open Engine** work queue. You build and maintain the Pro Exteriors Open Brain. You do NOT touch the roofing business (no Supabase service token, no roofing Slack channels, no `dashboard_action_log`).

## Your identity

Look up your agent code in the table below by matching your runtime. Then read your private context file at the path shown.

| Runtime | Agent code | Private context file |
|---|---|---|
| Hermes | `pe-cc-hermes` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-hermes/SKILL.md` |
| Claude Code | `pe-cc-claude` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-claude/SKILL.md` |
| Codex | `pe-cc-codex` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-codex/SKILL.md` |
| Cursor | `pe-cc-cursor` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-cursor/SKILL.md` |
| Warp | `pe-cc-warp` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-warp/SKILL.md` |
| Hetzner autonomous | `pe-cc-agents` | `/Users/chussey/Documents/a-roofers-open-brain/agents/dev-engine/pe-cc-agents/SKILL.md` |

Read your private context file now before continuing.

---

## Linear workspace

| Setting | Value |
|---|---|
| Team | `PE-CC-DevTeam` (`f7fd2005-aa04-4de7-a17d-ddae528b5e4a`) |
| Project | `PE-CC-DevEngine` (`ba9edb00-077d-47cc-9f69-d2ac04bfc6c9`) |
| Label filter | `agent-instructions` (`b4b8107c-66d5-472e-84d2-ffef92d2b1a5`) |
| Status ledger | `PEC-2` |
| Standing setup | `PEC-1` |
| Optional skills | `PEC-3` |

## Workflow statuses

| Status | Type | ID |
|---|---|---|
| Standing | unstarted | `2e78640c-5f85-4c7a-966a-2c084e2faeec` |
| Agent Todo | unstarted | `286ecb7c-e682-4c67-884e-88d620036e02` |
| Agent Working | started | `3fb1725c-3e0a-43f5-8dc4-6a0455fff657` |
| Agent Needs Input | started | `c548790b-a977-477a-8fa4-493c2f74af26` |
| Agent Review | started | `3e03cd48-d3c8-4e63-867c-734387f39efb` |
| Agent Done | completed | `9a46f512-60aa-4ede-96ad-9afa8ac78da4` |

---

## Queue runner — run this loop every heartbeat

Stop after exactly one task issue.

1. Open `PEC-2`. Find your own `AGENT STATUS` comment. Update `Last queue result` to `checking` and `Last heartbeat` to now (ISO8601). Update **in place** — never post a new comment.
2. **Standing preflight:** Read `PEC-1`. Compare `engine_version` in your private context file. If PEC-1 is newer, update locally and leave `AGENT APPLIED` on PEC-1.
3. **Optional skill preflight:** Check `PEC-3` for skills you are already subscribed to. Apply same-scope updates, leave `AGENT SKILL UPDATED`. Do NOT browse or install unapproved skills.
4. Check: label=`agent-instructions`, your agent code, status=`Agent Needs Input`, receipt=`AGENT HUMAN HOLD`. If one shows `AGENT HUMAN ANSWERED` → move to `Agent Working`, leave `AGENT RESUMED`, finish it, stop.
5. Check: label=`agent-instructions`, your agent code, status=`Agent Needs Input`, receipt=`AGENT BLOCKED`. If answer now on issue → move to `Agent Working`, leave `AGENT UNBLOCKED` + `AGENT RESUMED`, finish it, stop.
6. Check delegated issues. Leave `AGENT FOLLOW-UP` if anything changed.
7. Claim oldest eligible `Agent Todo`: label=`agent-instructions`, title contains `[agent instructions][<your-agent-code>]`, status=`Agent Todo`. Move to `Agent Working`, leave `AGENT CLAIMED`, re-read the issue.
8. Do only the scoped work. Done, no review needed → leave `AGENT DONE`, move to `Agent Done`. Done, needs review → leave `AGENT DONE`, move to `Agent Review`.
9. Blocked, answer belongs on Linear → leave `AGENT BLOCKED` (one question only), move to `Agent Needs Input`, set ledger to `blocked ISSUE-ID`, stop. Answer belongs in agent thread → leave `AGENT HUMAN HOLD`, move to `Agent Needs Input`, set ledger to `holding ISSUE-ID`, stop.
10. Unexpected failure → leave `AGENT FAILED` with last safe step + retry count.
11. Update ledger. Stop.

---

## Receipts

| Token | When |
|---|---|
| `AGENT CLAIMED` | Right after moving to Agent Working — the claim lock |
| `AGENT DONE` | Scoped work finished |
| `AGENT BLOCKED` | Answer needed on Linear issue; one question only |
| `AGENT UNBLOCKED` | Answer arrived on blocked issue; post before AGENT RESUMED |
| `AGENT HUMAN HOLD` | Answer needed in agent's own thread/app |
| `AGENT HUMAN ANSWERED` | Human answered the hold in their thread |
| `AGENT RESUMED` | Continuing after UNBLOCKED or HUMAN ANSWERED |
| `AGENT FAILED` | Unrecoverable failure; last safe step + retry count |
| `AGENT APPLIED` | Standing context version installed/adapted locally |
| `AGENT SKILL SUBSCRIBED` | Human approved first install of optional skill |
| `AGENT SKILL INSTALLED` | Optional skill installed locally |
| `AGENT SKILL UPDATED` | Subscribed optional skill received same-scope update |
| `AGENT SKILL DECLINED` | Human declined optional skill |
| `AGENT FOLLOW-UP` | Delegated issue state changed |
| `AGENT STATUS` | Single ledger comment — update in place forever |

---

## AGENT STATUS format (update in place on PEC-2)

```
AGENT STATUS
Agent: <agent-code>
Human/operator: Chris
Runtime: <Codex | Claude | Cursor | Warp | Hermes | other>
Automation: <automation name or manual>
Automation state: <installed | manual-required | blocked | paused>
Last heartbeat: <ISO8601 timestamp>
Last queue result: <checking | none | claimed ISSUE-ID | completed ISSUE-ID | blocked ISSUE-ID | holding ISSUE-ID | resumed ISSUE-ID | failed ISSUE-ID>
Last successful run: <ISO8601 timestamp or unknown>
Local context: <engine version>; <routing map version>
Optional skills: <none or skill-id@version subscribed>
Notes: <none or short blocker>
```

---

## Plane boundary (doc 58) — enforced always

- `no_supabase_service_role: true` — this profile has NO `SUPABASE_SERVICE_TOKEN`
- Do NOT post to roofing Slack channels (`#accounting-*`, `#ops-*`, etc.)
- Do NOT write to `dashboard_action_log`
- Do NOT claim issues not addressed to your own agent code

---

## Safety boundaries — enforced always

- Ask Chris before publishing, emailing, or posting anywhere public
- Ask Chris before deploying, deleting data, changing billing, or changing credentials
- Ask Chris before any customer-facing change
- External or destructive actions need explicit issue-level approval on the Linear issue
- Never install an optional standing skill without explicit approval from Chris

---

## First-run checklist (new runtime onboarding)

If this is your first time loading this file:

1. ✅ Confirm your Linear MCP connection is live (list PE-CC-DevTeam issues)
2. ✅ Read your private SKILL.md at the path in the table above
3. ✅ Post your first `AGENT STATUS` comment on `PEC-2` (top-level only, never a reply)
4. ✅ Read `PEC-1` and leave `AGENT APPLIED` confirming local context is at v1.0.1
5. ✅ Run smoke test 1: create `[agent instructions][<your-code>][task] Say hello from the queue`

---

*Open Engine v1.0.1 — agents/dev-engine/AGENTS.md*
