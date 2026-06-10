---
name: meta-memory-write
description: >
  Saves durable facts to context/MEMORY.md (curated working memory) or
  context/USER.md (user profile), the files read at session start.
  Triggers on "remember this", "remember that", "note that", "save this
  to memory", "update memory", "log this", "forget about", "remove from
  memory". Three actions: add (append under the correct section after
  dedup check), replace (substring match + swap), remove (confirm with
  user first). Enforces hard caps — 2,500 chars for MEMORY.md, 1,375 for
  USER.md — with consolidation when over. Does NOT trigger for daily
  session logging (handled by the Daily Log discipline in CLAUDE.md).
---

# Memory Write

Saves durable facts to `context/MEMORY.md` or `context/USER.md` — the curated files loaded at session start as a frozen snapshot.

## Outcome

- A durable fact is added to, updated in, or removed from the right file
- Character caps enforced (`MEMORY.md` 2,500 / `USER.md` 1,375) — consolidate before breaching
- Confirmation message shown: `Saved — will be active from next session.`

## Step 1: Determine Action And Target

| User phrasing | Action |
|---------------|--------|
| "remember this", "note that", "save this", "log this" | **add** |
| "update memory about X", "X is now Y" | **replace** |
| "forget about X", "remove X from memory" | **remove** |

Target file:

- Facts about Chris, the team, roles, or working preferences → `context/USER.md`
- Everything else (threads, environment, decisions) → `context/MEMORY.md`

If ambiguous, ask before proceeding.

## Step 2: Read The Target File In Full

`MEMORY.md` sections: `## Active Threads`, `## Environment Notes`, `## Pending Decisions`.
`USER.md` sections: `## About`, `## Preferences`, `## Working Style`.

Do not create new sections. If a fact fits nowhere, ask.

## Step 3: Dedup Check

Scan for substring matches against the new fact:

- **Exact match** → skip the write, reply `Already saved — no change needed.`
- **Similar entry** → prefer **replace** over **add**, even if the user said "remember this"
- **No match** → proceed

## Step 4: Cap Check

`wc -c < context/MEMORY.md` (cap 2,500) or `wc -c < context/USER.md` (cap 1,375).

If the write would breach the cap:

1. Consolidate: merge similar lines, drop resolved threads, tighten verbose entries
2. Re-check the count
3. If still over, ask: "Memory is full. Which entry should I drop to make room?"

## Step 5: Write

Use the Edit tool with precise old_string/new_string. One line per fact, `- ` bullet prefix.

- **remove** → first show the exact line and ask "Remove this?" Delete only after explicit confirmation.

Never store secrets, service-role keys, or raw customer PII — reference env var names only (e.g., `ABC_SUPPLY_CLIENT_ID in .env`, never the value). This is CLAUDE.md hard rule 2 and the Memory Budget policy.

## Step 6: Confirm

Reply exactly: `Saved — will be active from next session.` (or `Removed — ...`). Mid-session writes persist to disk but only load on the next session — say so if the user expects immediate effect.

## Rules

*Updated when the user flags issues. Read before every run.*

- Never breach the caps. Consolidate first; then ask what to drop.
- Always dedup before adding. Prefer replace over add for updates.
- Never quote secret values or customer PII.
- Always confirm before remove — show the exact line.
- Do not create new sections in either file.

## Self-Update

If the user flags a mistake — wrong section, missed dedup, bad consolidation — update the `## Rules` section above immediately with the correction and today's date.
