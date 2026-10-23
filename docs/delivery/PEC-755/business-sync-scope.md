# Business sync scope — Chris, 2026-10-23

HailRecon · CompanyCam · AccuLynx · QuickBooks Online · National Weather Service / NOAA feed the shared, authorized backend used by Command Center (CC), CRM, HR, Project Management (PM) and Admin. These app areas are consumers of shared records, not five independently authoritative copies of the same provider data.

| Provider | Current evidence | Remaining acceptance |
|---|---|---|
| HailRecon | Existing IHM signed webhook is active. `ihm_hail_alerts`: 27,934 rows, latest accepted alert 2026-10-23 13:21 UTC. Vendor [HailRecon page](https://www.interactivehailmaps.com/hail-recon/) and [API docs](https://apidocs.interactivehailmaps.com/) establish the product alias. | Per-call failure telemetry, all webhook types and app readback still need acceptance; a quiet event-driven feed is not a missed scheduled pull. The older GHL Stormwatch script is not the active source connection. |
| CompanyCam | Production metadata sweep and photo-copy timers are active; deployed webhook exists. Read-only source mirror. | Per-call completeness and module propagation receipts remain in PEC-761. |
| AccuLynx | Scheduled multi-account ingestion, webhooks, hourly office financial passes, five-minute WIP refresh, source receipts and bounded retries. MC-80 live WIP payment verified. | Extend readback acceptance to each consuming module. |
| QBO | Active read-only mirror timer. Production company file remains read-only; no financial source writes. | Verify every mirror entity and consuming module, beyond API reachability. |
| National Weather Service / NOAA | NOAA/hail historical data has 71,048 rows, last loaded 2026-05-29; no named live weather refresh job found on the inspected hosts/database registry. | Provider confirmed by Chris; commission a live refresh contract and prove app readback. Historical hail rows are not a live forecast. |

The runtime board shows exactly these five business connections. HailRecon is mapped to its existing IHM ingestion receipt; Weather remains unknown/uncommissioned, not green from a guessed URL. Receipt availability is not proof that every webhook call and app readback succeeds. The live weather connection is an explicit coverage gap, not a fabricated production outage. The restricted health API includes the five destinations and coverage gaps.

Supabase, WorkOS, Sentry, GitHub, Linear, Coolify, Better Stack and required communications services are platform/security dependencies. Keep their health checks; moving them out of the business list must not weaken monitoring or revoke credentials. The pending Better Stack credential question is separate from business connector scope.

JobTread is retired. GHL, CenterPoint, StartInfinity, EagleView and enrichment/lab adapters are not in the approved business provider catalog. Historical source and mirrored records are retained. Source catalog changes do not by themselves prove that every legacy remote caller has stopped; inventory and retire those paths with deployment evidence before declaring the retirement complete.

Chris explicitly confirmed that ABC Supply and SRS/QXO invoice imports must remain. Their current accounting surfaces depend on them. Do not disable imports or suppress the stale-feed alert merely to make the five-service scope look green.

CC production WIP readback is verified. CRM uses a separate app deployment on the same production database; its current readback must be verified independently. No independent HR/PM/Admin propagation receipt has been verified in this task. Keep these limits visible until each has an expected source version, ingestion receipt, projection receipt and authorized app readback, with no extra cross-module privilege grants.

## HailRecon security and failure handling

Production IHM v17 calculated signature validity but did not reject invalid signatures. Last7days:143 real receipts, all verified=true; IHM_WEBHOOK_SECRET is configured. The replacement rejects missing/invalid signatures before parsing or any privileged database write. It preserves the existing trimmed-body HMAC contract. Unit tests cover valid signatures, actual body tampering, another secret, truncated signatures and missing credentials. A test initially assumed raw trailing whitespace changes the signature; that assumption was corrected to preserve the proven provider contract.

All five typed writes now check database errors. Successful projection requires a durable processed acknowledgement. If either fails, keep the archived raw event unprocessed and emit a failure through the existing private health RPC/outbox; if that recording fails during a DB outage, deliver a fixed sanitized Sentry event directly. The provider still receives a receipt acknowledgement after raw archival, with processed=false when quarantined, preventing unsafe automatic replay. No HailRecon automatic retry or data deletion is introduced. The runtime board checks pending signed raw events older than five minutes so a newer successful alert cannot conceal the backlog.

Tests:42 focused app tests,9 HailRecon auth/observability tests, Deno type check and Command Center production build. No schema or credential changes. After deployment, verify unsigned/forged requests return401 before JSON parsing, accepted receipts remain intact, the business group contains exactly the five approved providers, and all platform/supplier monitors remain active. End-to-end receipt of a new genuine provider event is distinct from negative authentication testing and remains pending until one arrives.

Replay/idempotency contracts and signed-payload freshness windows still need provider-specific validation before automated replay is enabled. Current app readback acceptance beyond CC WIP remains tracked in PEC-761. These controls are not a whole-estate compliance certification.

The deployed health RPC deliberately accepts only int/feed/api/page/site component prefixes and generic probe codes. HailRecon per-call health uses the fixed int.hailrecon-webhook component and the existing probe_failed code, with detailed fixed failure codes in sanitized function logs. The RPC contract was checked against production and regression-tested; no privilege widening or new RPC was introduced.
