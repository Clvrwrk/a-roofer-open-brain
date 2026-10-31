
## 2026-10-30 17:05 PDT — Linear app token, assignment guard, Linear webhook (branch feat/linear-app-token-webhook)
- Agents now act as the **PE Dev Agents** Linear app via client_credentials (cached ~30d token, refreshed 24h before expiry), falling back to LINEAR_API_KEY.
- Guard: agent mutations can't assign Chris unless the issue has `needs-chris` (Maya accounting review issues now carry the label).
- New `POST /api/dev/webhooks/linear` (HMAC `linear-signature` + 60s replay window): an @PE Dev Agents comment or newly added `agent-go` routes to the issue's single `lane:*` label and enqueues a `dashboard_work_items` row (department=system, workflow=linear-agent-dispatch). lane:cw-cursor / lane:cw-codex are queue-only (no paid session).
- Tests: 58 files / 560 passing; astro build OK. Not merged; no Coolify/env change. Needs Chris: webhook in Linear settings + 3 env vars in Coolify.

## 2026-10-30 17:30 PDT, Helo working context (branch chore/helo-working-context)
- Added `.helo/README.md`, `CURRENT.md`, `CONTEXT-MAP.md` and `DECISIONS.md`, following the Working Context Starter Kit, with copies in Fast.io `helo-dev-pair/working-context/2026-10-30/`. No secrets.

## 2026-10-30 17:45 PDT, Ringer pilot set up (branch chore/ringer-pilot-docs)
- Ringer installed on the box (`/workspace/ringer-src`). Grok Build CLI 1.0.70 installed, with a `[engines.grok]` lane configured.
- `.helo/ringer/swarm.json` has 3 docs-only chores (docs/INDEX.md, scripts/README.md, agents/README.md), each with a worktree, `max_attempts: 1` and a check that exports its deliverable.
- Lint is clean except the known "relative deliverable in a worktree" note; the checks copy each deliverable out.
- **Blocked:** the Grok Build device login needs Chris. OpenRouter has 0 credits, so that lane is not used. Cost so far: $0.

## 2026-10-30 17:40 PDT, Ringer pilot run (Grok Build lane, model grok-4.7-build-fast)
- Run 1 failed in about 1s: my config used a stale model id (`grok-composer-2.5-fast`). Fixed to `grok-4.7-build-fast`, no tokens used.
- Run 2 (`aroofer-docs-pilot-20261031T002915Z`, 1 attempt each):
  - **agents-readme: PASS** (8 SOUL files listed). Reviewed and committed `agents/README.md`.
  - **docs-index: FAIL.** 9 docs/ subfolders were not linked. The spec said "every file", but the check also required folders, so this is a spec/check mismatch on my side.
  - **scripts-readme: FAIL.** 6 scripts/ folders were not linked, though the spec required folders.
- Grok reported about $6.51 of notional usage (1.79 + 1.95 + 2.77), billed to the SuperGrok plan. OpenRouter: $0.

## 2026-10-30 17:50 PDT, Ringer pilot rerun (run aroofer-docs-pilot-20261031T004335Z)
- Fixed the docs-index spec to index files and folders, and added a run-the-check-before-finishing step to both specs. One attempt each.
- **docs-index: PASS** and **scripts-readme: PASS**. Reviewed and committed `docs/INDEX.md` and `scripts/README.md`. All 3 pilot chores now pass.
- Grok reported about $7.35 of notional usage, inside the SuperGrok quota (Chris: 39% used, no real dollars). OpenRouter: $0.
