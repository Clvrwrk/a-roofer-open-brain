# PEC-755 sync follow-through — 2026-10-23

## Changes

Dedicated oldest-first WIP financial and invoice-header reads refresh money without repeatedly walking contacts, notes, history and invoice lines. Financial freshness advances only after both validated source responses and durable writes succeed. Account scopes and global dispatch lease remain enforced; no provider financial writes or QBO writes occur.

Migrations 336–339 add append-only source receipts for scheduler, host and AccuLynx worker outcomes, including timestamp ties and late commits. Every source failure gets a durable event; later recovery cannot erase it. Existing historical outcomes were inspected before receipt initialization. First failure alerts remain immediate; bounded transient AccuLynx retries begin after three failures, with at most two attempts, 15-minute cooldown and no retries after five failures. Auth, schema and mapping failures require intervention.

Alert delivery requires provider acceptance plus durable acknowledgement. The endpoint returns 503 for rejected/failed acknowledgements or an aged outbox. Database monitoring detects an old queue and absent GitHub watchdog. GitHub Actions uses its ephemeral repository token for an independent deduplicated delivery incident, and supplies the main commit attestation; no persistent GitHub PAT is required in the app. The private Supabase probe uses the app's existing server role instead of treating an RLS denial for an anonymous caller as an outage.

JobTread is retired: registry and provisioning obligations removed, sentinel no-op and network guard added, systemd units conditioned off, production timer disabled, no root cron fallback. Mirrors and audit history remain intact.

## Brain MCP decision

Do not deploy `server/index.ts`. It is an uncommissioned knowledge scaffold for `upsert_thought`, `search_thoughts_text` and `property_history_for`, whose required RPCs are absent in production. Current Command Center routes and ingestion use server-side Supabase and scoped provider/edge adapters, without a live consumer of this MCP. Neither inspected production host has a commissioned brain MCP service. The template no longer deploys or requires it; local compose makes it opt-in. Future deployment needs an actual consumer, implemented RPC contracts, scoped credentials, authentication and egress review, per-call telemetry and deployment verification. Older deployment claims in server documentation are explicitly superseded.

## Verification

Deno sync/webhook suite: 232 passed. Financial pass tests cover valid source, malformed source and incomplete invoices. PostgreSQL fixture proves failure/recovery between polls, timestamp ties, late commit, source deduplication, retirement, condition recovery, alert backlog, oldest-first financial queue, reused pg_net IDs and stale watchdog. App tests cover restricted relay authorization, delivery acceptance/acknowledgement, API key headers, and fresh commit attestation. Production build passes.

Live recovery requests 2499 and 2504 completed successfully. Request 2505 refreshed the remaining Colorado backlog. Live population: 352 WIP jobs across eight offices, zero financial records older than two hours at 19:15 UTC. Additional live deployment and alert receipts follow below.

## Limits

The stale SRS/QXO manual invoice import remains an input gap; monitoring does not fabricate missing vendor source records. Existing estate-wide advisory findings remain separately documented in the complete gap review. This change is not a claim that all systems satisfy every security standard. Better Stack credential replacement requires the specifically requested source-to-destination transfer approval.

## Live receipts at 19:18 UTC

Production `/healthz` matched cb824f3998c9556c5c425f776c987fa6bcd6535a. Watchdog run [40010347387](https://github.com/Clvrwrk/a-roofer-open-brain/actions/runs/40010347387) passed: 65 components, two remaining failures, zero pending alerts, fresh GitHub main commit attestation. Supabase private REST and GitHub probes are green. Live WIP API (same page loader) confirms MC-80 collected $199,500, outstanding $465,500, billed AR $0; computed 19:15 UTC. Recovery request2505 completed successfully. All eight financial schedules are active. Thirteen recovered/retired Sentry incidents resolved and linked Linear issues moved to Agent Done; the manual vendor feed and Better Stack incidents remain open. Full app-wide per-call acceptance remains PEC-761.

Additional database regression: latest third transient failure dispatches one bounded recovery; five failures committed before polling dispatch none; a committed later success suppresses retry of an old third failure. Migration339 applies this latest-outcome guard. Both disposable test containers were removed with their anonymous volumes.

Approved BetterStack-GlobalAPI_PE_CC_DEV item has no credential value (CLI and app verified). No transfer occurred. Testing/using the alternate BetterStack_PE_CC_DEV_API item was blocked by automatic approval review because the source differs; a specific approval request is pending. No alternate credential has been used or copied.

Rollback validation: saved follow-through rollback was executed successfully against a fresh synthetic PostgreSQL fixture, including disabling only the new financial schedules before restoring the older trigger. Three saved function definitions now have statement terminators. No production rollback was performed.
