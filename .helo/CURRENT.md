# CURRENT (as of 2026-10-30 17:30 PT): replace, never append

## Outcome now
Get the dev-agent workforce running under its own identity (the PE Dev Agents Linear app) on a capped budget. Chris should only see `needs-chris` items, and Helo should run from files instead of one long chat.

## Actual state
- **Runtime:**
  - The AI SDK agent runtime (PR #51, `fc22fd35`) replaced Hermes. Personas (#52), least-privilege read-only tools (#53) and the OpenRouter provider option (#54) are merged and deployed on Coolify (Command Center app). HTTP 200, Slack socket up.
  - Runtime provider is `AGENT_MODEL_PROVIDER=openai`, model `gpt-5.4-mini`, with Latitude telemetry on.
- **PR #55 (open, not merged):** the PE Dev Agents app token (client_credentials), a guard so agents never assign Chris without `needs-chris`, and the `POST /api/dev/webhooks/linear` lane dispatch. 560 tests pass.
- **Linear:**
  - Team PE-DEV-TEAM has the projects CC, CRM, HR, PM and ADMIN.
  - The `needs-chris` label is on 39 issues.
  - Chris was unassigned from 408 issues, which now carry `lane:*` labels. He has 37 open assigned issues.
  - The PE Dev Agents OAuth app exists, and its client secret is in Helo_Dev.
- **OpenRouter:**
  - The PE-DEV account key has a $25/month limit, stored by name: `OPENROUTER_API_KEY` (Coolify) and `OPENROUTER_PE_CC_AGENTS_CRON_KEY` (box .env).
  - **The account has 0 credits, so live calls fail.** Buying credits is Chris's call.
- **Registry:** deny-by-default. Maya is inventory-only and ops-conductor is revoked. "Authorize all" is blocked by the PEC-75 validator, which needs a design decision.
- **Ringer pilot:**
  - Approved 2026-10-30, with Helo as planner, a Grok Build lane, and OpenRouter only if it has credits.
  - Installed on the box. Grok Build is waiting on Chris's device-code login.

## Hard constraints
- No money spent without Chris's OK. No messages outside the Grok team: drafts only.
- No merges to main, deploys, prod env, DNS, billing, new vendors or cancellations without Chris's own words.
- Never show secrets. Copy keys; never move them.
- Deliverables to Chris are MD and HTML only, with Excalidraw (SVG plus .excalidraw). Share them by Fast.io path, as new files in helo-dev-pair only.

## Open questions / pending Chris decisions
1. PR #55: merge, plus Coolify env `LINEAR_AGENT_CLIENT_ID/SECRET` and `LINEAR_WEBHOOK_SECRET`, the Linear webhook, and the `agent-go` label.
2. Buy OpenRouter credits (spending).
3. Slack reply switch: all 8 agents, Maya first, or hold. Also PEC-818, the Slack reinstall.
4. PEC-203 vs PEC-208. Add the CAT team to P-PEC-175. PEC-817 (cc-sales exec dashboard): what "collected" and "job type" mean, and whether reps see only their own jobs.
5. UI/UX pilot: CRM only? Browserbase is a new vendor. HR/PM/Admin URLs and logins. A human on the committee?
6. Delete the auto-created $100 OpenRouter key?
7. PEC-75 registry design (a separate slack-reply authorization field).

## Next checkpoint
Chris completes the Grok Build login, then the Ringer pilot runs and its PR opens. After that, a decision on PR #55.

## Routines in play
- **Cain "Library intake":** copies chat files into Fast.io `raw/intake/` 4 times a day (7:27 AM, 12:27, 5:27 and 10:27 PM PT).
- **Latitude v2 check:** due before 2026-10-31.
- No Helo-owned cron routines are confirmed yet. The cron agents on OpenRouter are waiting on credits.

## Stop condition
Done when PE Dev Agents acts in Linear as the app (not Chris), Chris's inbox holds only `needs-chris` items, and one verified Ringer swarm has landed as a PR.
