---
phase: 03-commercial-cron-hardening
plan: 03
completed: 2026-07-01
status: partial
verdict: code+infra shipped and deployed; Slack delivery proof pending 2 human Slack/Vault steps
requirements: [REQ-07]
---

# Plan 03-03 Summary — Alerting (Slack + Sentry)

## What was built & shipped

- **`lib/alerts.ts`** — `postSlackAlert(botToken, channel, message)` (chat.postMessage, the repo's bot-token pattern) + `captureSentryError(dsn, error, context)` (Sentry envelope). Fire-and-forget, never throws; `redact()` scrubs Bearer/sk-/xoxb/sntrys tokens; context keys matching `/key|token|authorization|secret|.../i` are stripped. **6/6 unit tests green**, incl. no-secret-in-payload.
- **`index.ts`** — alert hooks at the partial_success and hard-failure choke points, env-guarded (`SLACK_BOT_TOKEN` + `ACCULYNX_ALERT_SLACK_CHANNEL`; `ACCULYNX_SENTRY_DSN`). Type-checks. **Deployed to prod** (new version, supabase functions deploy).
- **Migration 176** — `check_acculynx_alerts()` (all four D-05 conditions: failed dispatch ≥400, stale watermark >3h excluding never-started backfill per Pitfall 4, reconciliation delta_pct>2 [jobs excluded, see 03-02 follow-up], unreconciled pg_net >30min) + `acculynx-alert-check` cron `*/15`. Posts via chat.postMessage using the **Vault** secret `acculynx_alert_slack_bot_token` + channel default `C0BDF8QRF8A`. **Applied to prod; cron live; detector proven** (`check_acculynx_alerts()` → breach_count=2 on current backfill state, no post since Vault secret unset = safe).

## Prod state

- Edge fn redeployed with alert hooks; edge secrets set: `SLACK_BOT_TOKEN`, `ACCULYNX_ALERT_SLACK_CHANNEL=C0BDF8QRF8A` (via CLI, values never echoed).
- mig 176 applied; `acculynx-alert-check` cron at `*/15 * * * *`.

## Deviations / findings (important)

1. **Slack transport = bot token, not incoming webhook.** RESEARCH/plan assumed an incoming webhook (`ACCULYNX_ALERT_SLACK_WEBHOOK`); the repo posts via bot token (`SLACK_BOT_TOKEN` → chat.postMessage). Reworked alerts.ts + mig 176 to the bot-token pattern per user decision.
2. **Workspace mismatch — `#cc-proexteriors` is unreachable by the bot.** The `openbrain` bot lives in the **pe-command-center** workspace (auth.test: team `pe-command-center`); `#cc-proexteriors` (C0BCUJV0MLY) is in the **CleverWork** workspace (Sentry's). RESEARCH conflated the two. Alert channel changed to **ob-ops-conductor (C0BDF8QRF8A)** in the bot's workspace (user decision).
3. **ob-ops-conductor is a PRIVATE channel** — the bot returns `channel_not_found` until a human invites it (`conversations.join` is public-only). This is a required human step.
4. **Vault secret cannot be set from here without exposing the token.** No `psql`/DB URL is available; the only DB path is the Supabase MCP, and putting the token in an `execute_sql` call would leak it into the session transcript (violates the phase's secret-hygiene mandate). So the Vault insert is a human step.
5. **Sentry edge capture** (`ACCULYNX_SENTRY_DSN` edge secret) not yet set — additive/optional; Sentry already receives app errors via existing instrumentation. Can be added later.

## Remaining to fully close 03-03 (human Slack/Vault steps — become the runbook alert-verification procedure, plan 04 D-15)

1. **Invite the `openbrain` bot to ob-ops-conductor** (private channel) in the pe-command-center workspace.
2. **Provision the Vault secret** (Supabase SQL editor / dashboard, so the token never transits an agent tool):
   `select vault.create_secret('<the openbrain xoxb bot token>', 'acculynx_alert_slack_bot_token');`
3. **Prove delivery:** seed a synthetic condition, e.g.
   `update acculynx_sync_watermark set last_sync_at = now() - interval '4 hours' where account_key='kansas_city' and resource_type='jobs';`
   then `select public.check_acculynx_alerts();` → confirm ob-ops-conductor receives the message; restore the watermark.
4. (Optional) set `ACCULYNX_SENTRY_DSN` edge secret to enable edge-side Sentry capture.

## Self-Check: PARTIAL

- Code + migration + deploy: DONE and verified (tests green, type-check, cron live, detector returns real breach counts).
- Delivery proof: BLOCKED on the two human Slack/Vault steps above (bot channel membership + Vault token) — not performable from this session without leaking the token or Slack dashboard access.

## key-files
- created: `supabase/functions/acculynx-sync/lib/alerts.ts`
- created: `supabase/functions/acculynx-sync/lib/alerts.test.ts`
- modified: `supabase/functions/acculynx-sync/index.ts`
- created: `schemas/cleverwork-roofer/176-acculynx-alert-check-fn.sql`
