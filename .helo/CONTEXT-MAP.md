# CONTEXT-MAP: where to look, which source wins, and when to load it

| Source | What it holds | Authority | Load when |
|---|---|---|---|
| `.helo/CURRENT.md` | Current state | Wins for "now" | Always, first |
| `.helo/DECISIONS.md` | Chris rulings and past decisions | Wins over memory or chat recall | Before re-deciding or proposing anything |
| `.helo/journal.md` + GitHub issue #50 | Dated work log | Factual record | You need what happened when |
| GitHub PRs (`gh pr list`) | #47, #48, #55 open; #49, #51–#54 merged | Live truth for code state | Before any branch or merge talk |
| Linear PE-DEV-TEAM (CC/CRM/HR/PM/ADMIN), labels `needs-chris`, `lane:*` | Work queue | Live truth for tasks | Picking or routing work |
| Fast.io `Sub-Vaults/grok-world/helo-dev-pair/` | Helo vault: proposals, working-context copies | **Source of truth for Helo** (Chris, 2026-10-30) | Long-term recall. Read `index.md` → `_MAP` first |
| Fast.io `.../proposals/{linear-routing,uiux-team,exec-dashboard,ringer-ob1}/2026-10-30/` | Design proposals (MD/HTML/Excalidraw) | Proposals only, not approvals | Working on that topic |
| Coolify (Command Center app) | Runtime env and deploys | Live prod; changes need Chris's OK | Deploy and env questions (read-only) |
| Latitude (Cleverwork workspace) | Agent telemetry | Observability | Agent behaviour and cost |
| 1Password `Helo_Dev` / box `.env` | Credentials, **by name only** | n/a | Only when a tool needs a key; never print one |
| `docs/` (numbered), `AGENTS.md`, `CONVENTIONS.md` | Repo architecture and rules | Repo law | Before code changes |
| `/workspace/ringer-src` + `~/.config/ringer/config.toml` | Ringer orchestrator | Tool | Running swarms (`./ringer.py run`, `lint`, `models`) |

**Exclusions:** don't load old chat transcripts wholesale, and don't grep the box's own transcript files. Don't load archived Linear issues unless you're asked to.
**Conflicts:** if sources disagree, flag the conflict to Chris instead of picking one.
