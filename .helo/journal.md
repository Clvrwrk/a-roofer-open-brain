
## 2026-10-30 17:05 PDT — Linear app token, assignment guard, Linear webhook (branch feat/linear-app-token-webhook)
- Agents now act as the **PE Dev Agents** Linear app via client_credentials (cached ~30d token, refreshed 24h before expiry), falling back to LINEAR_API_KEY.
- Guard: agent mutations can't assign Chris unless the issue has `needs-chris` (Maya accounting review issues now carry the label).
- New `POST /api/dev/webhooks/linear` (HMAC `linear-signature` + 60s replay window): an @PE Dev Agents comment or newly added `agent-go` routes to the issue's single `lane:*` label and enqueues a `dashboard_work_items` row (department=system, workflow=linear-agent-dispatch). lane:cw-cursor / lane:cw-codex are queue-only (no paid session).
- Tests: 58 files / 560 passing; astro build OK. Not merged; no Coolify/env change. Needs Chris: webhook in Linear settings + 3 env vars in Coolify.
