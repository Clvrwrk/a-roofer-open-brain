# 2026-10-07 (evening, US) / 2026-10-08 UTC — top-of-hour DB load

## Session 1

**Goal**: find and fix the :00 Supabase load that took the CRM Jobs page down at 05:00 UTC (Sentry PWA-CRM-Z/-10/-24..-28).
**Deliverables**: docs/125; mig 326 (applied to prod, ledger 20261008052422, sha = file); `prewarm.server.ts` (no :00, jitter, sequential, human-gated, `COMMAND_CENTER_PREWARM=off`); territory cache 10 min + invalidate on assign; agent-host timers :08/:38 and :06/15; branch `contrib/cleverwork/top-of-hour-db-load`.
**Decisions**: the cause is 9 unrouted old CC containers (cc-crm-* ×7, cc-production-e4344d8 ×2, node 22.23.0, up since 2026-09-08). With no human traffic, their daily warm defaults to 05:00:00 UTC, all at once, running 7 loaders in parallel: ~540 requests, 39 s average wait, every day. Nothing heavy is left at :00. The CRM read-retry is a proposal only (docs/125 §5), Chris decides.
**Open threads**: Chris stops the 9 containers and installs the 2 agent timers (docs/125 §4); the next CRM release relaunches the /sales mirror with `COMMAND_CENTER_PREWARM=off`; verify 05:00 UTC 2026-10-09 is quiet (edge logs show no 22.23.0 burst, no pwa-crm transport events).
