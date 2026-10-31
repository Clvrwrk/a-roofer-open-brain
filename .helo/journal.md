
## 2026-10-30 17:05 PDT — Linear app token, assignment guard, Linear webhook (branch feat/linear-app-token-webhook)
- Agents now act as the **PE Dev Agents** Linear app via client_credentials (cached ~30d token, refreshed 24h before expiry), falling back to LINEAR_API_KEY.
- Guard: agent mutations can't assign Chris unless the issue has `needs-chris` (Maya accounting review issues now carry the label).
- New `POST /api/dev/webhooks/linear` (HMAC `linear-signature` + 60s replay window): an @PE Dev Agents comment or newly added `agent-go` routes to the issue's single `lane:*` label and enqueues a `dashboard_work_items` row (department=system, workflow=linear-agent-dispatch). lane:cw-cursor / lane:cw-codex are queue-only (no paid session).
- Tests: 58 files / 560 passing; astro build OK. Not merged; no Coolify/env change. Needs Chris: webhook in Linear settings + 3 env vars in Coolify.

## 2026-10-30 17:30 PDT, Helo working context (branch chore/helo-working-context)
- Added `.helo/README.md`, `CURRENT.md`, `CONTEXT-MAP.md` and `DECISIONS.md`, following the Working Context Starter Kit, with copies in Fast.io `helo-dev-pair/working-context/2026-10-30/`. No secrets.

## 2026-10-30 17:30 PT: Workflow catalog v0 + AIA4 dev workflow spec (proposal only)
- Request: Chris t52u/t53u. Two separate tracks.
- (A) AIA4/Cleverwork Concierge/Records/QA dev-workflow spec + Excalidraw. Spec only, no bots created.
- (B) Roofing SMB workflow catalog. About 71 workflows were found in code: CRM ~16, PM ~11, HR ~21, CC ~20, ADMIN ~3. It includes a gap list (with research cited) and demo-mode design notes.
- Fast.io: BSG_GROK_WORLD/Sub-Vaults/grok-world/helo-dev-pair/proposals/workflow-catalog/2026-10-30/{aia4-dev-workflow,roofing-smb-catalog}/. 10 new files, all sha-verified.
- Nothing spent, merged, or sent outside the team.
