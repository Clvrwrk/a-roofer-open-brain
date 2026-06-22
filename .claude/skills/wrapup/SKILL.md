---
name: wrapup
description: End-of-session handoff for a-roofers-open-brain. Use when the user says "wrapup", "wrap up", "handoff", "end of session", "tie off", or runs /wrapup — or when context usage reaches ~50%. Finishes the current block, cleans the working tree to empty, updates memory + daily log, converges the contrib branch into the canonical branch and pushes, then reports next-task state. Goal: next session starts clean on a current main and knows exactly where work left off.
---

# Wrap-up / Handoff

The invokable entry point for the **Handoff / Wrap-up** checklist in `CLAUDE.md`. That section is the source of truth; this skill runs it. Execute the steps **in order** and do not stop until the tree is clean and converged.

## Steps

1. **Finish the block.** Never stop mid-function/migration/component. Complete it, then commit completed work with a clear message ending in the `Co-Authored-By:` trailer.

2. **Clean the tree — `git status --short` must end empty.**
   - Run `git status --short` and triage every entry.
   - **Scratch/log/byproduct** (`*.log`, scratch `*.txt`, `.playwright-mcp/`, `outputs/`, tool dot-files, `* 2.*` editor/sync duplicate copies) → add to `.gitignore`.
   - **Tracked file that should be ignored** (a log, build output) → `git rm --cached <file>` (keeps the local copy), then ignore it.
   - **Empty/accidental files or nested temp dirs** → inspect, then delete.
   - **Real content** (docs, reference assets) → `git add` and commit.
   - **Client data / anything that may hold PII** (accounting files, price agreements, raw dumps) → **ignore, never commit** (hard rule 2).
   - When a non-scratch file's fate is unclear, **ask the user** rather than ignoring or deleting it.
   - Commit the hygiene changes (`.gitignore`, untrackings, real content) so the tree is genuinely clean.

3. **Update memory.**
   - Write today's session block to `context/memory/{YYYY-MM-DD}.md` (Goal / Deliverables / Decisions / Open threads).
   - Update `context/MEMORY.md` (≤2,500 chars — `wc -c` first) and `context/USER.md` (≤1,375 chars) **only if** something durable changed. Route curated writes through the `meta-memory-write` skill.

4. **Converge (Live ⇄ Dev alignment).**
   - `git fetch origin` and confirm the canonical/live branch — **do not assume `main`** (see CLAUDE.md "Live ⇄ Dev alignment").
   - Merge the current `contrib/cleverwork/<task>` branch into the canonical branch and **push to origin**.
   - If `main` is canonical, end with the work merged into `main` and `main == origin/main`. Never strand work on an unpushed side branch.

5. **Report and stop.** Send one message:
   - Branch + last commit (hash — message)
   - `tree clean ✓` (or exactly what remains and why)
   - Accomplished this session (bullets)
   - **Next task** (exact, actionable)
   - Blockers needing the user (or "none")
   - To resume: start a new session on `main`.

   Then **stop** — do not begin the next task.

## Rules

- The working tree **must** be empty at the end (`git status --short` returns nothing) — that is the whole point: no branch-switch nag, clean start next session.
- Never commit secrets, service-role keys, or raw customer PII (hard rule 2). Ignore those buckets.
- Additive only — never destructive git/SQL during wrap-up.
- Do not announce routine memory writes; just do them.
