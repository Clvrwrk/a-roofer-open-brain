# PEC-755 — sync repair and app-wide coverage validation

Production: `rnhmvcpsvtqjlffpsayu`, Command Center `cc.proexteriorsus.net`. Validated 2026-10-23. Parent: [PEC-755](https://linear.app/cleverwork/issue/PEC-755).

## MC-80 outcome

Authenticated live WIP API returned **collectedRevenue 199500**, **outstandingAr 465500**, **billedAr 0**, billedTotal 199500. Original AccuLynx financials, paid invoice MC-80-1 and payment receipt agree. Receipt: `mc80-live-wip.json`. This verifies the live report data endpoint; the WorkOS human-only HTML screen was not used as an agent bypass.

The root cause was request-ID reuse after pg_net restarted: the scheduler built `crm_sync_log` identity from a reusable numeric HTTP request ID. Duplicate-key errors rolled back the transaction before HTTP dispatch. New runs have UUID identities and independently reconciled outcomes. Raw archives and accounting sources are retained; no QBO/company-file writes occurred.

## Security and behavior

- Dispatcher validates canonical account scope; globally bounded overlap lease, random single-use capability hashed at rest, 3-minute claim expiry, atomic replay prevention, matching run UUID + response timestamp. The existing platform JWT remains required.
- Ordinary/public roles cannot trigger/claim/read operational tables. Existing protected backend webhook and approved mirror-refresh callers retain service-role RPC access. SECURITY DEFINER functions pin search_path. RLS intentionally has no end-user policies on service-only tables.
- Bad financial payloads cannot overwrite trusted money or advance freshness. Missing contact parents are read from the same tenant's authoritative endpoint before retrying links; foreign keys remain enforced. Incomplete contact dependencies remain eligible for another pass. Three Florida job freshness markers were invalidated for authoritative retry after discovering errors from pre-fix passes; no financial amounts were edited manually.
- Fixed actual `crm_sync_log` CHECK contract (`incremental`, `partial`); a missing audit insert now fails before pulling upstream data. HTTP 200 partial results are recorded as failure, not success.
- New Sentry telemetry allowlists component, incident UUID, count and failure code. No customer payload, provider secrets or arbitrary event destination is accepted by the auditor relay. GitHub receives only the existing auditor token, after Chris explicitly approved that credential transfer; it retains the auditor's existing scope. DB admin credentials remain outside CI.
- These are scoped controls, not a certification of every cybersecurity rule. Existing backend service-role privileges remain broad. Platform full backup/PITR status could not be verified with the stale management credential; the prechange manifest covers affected definitions only.

WIP now reuses the existing refresh function every five minutes (`wip-ar-sync-refresh`), so a successful mirror pull reaches the report without waiting for the nightly projection. That schedule is independently monitored too; its first automatic run succeeded at 18:20Z in 1.8 seconds. A subsequent authenticated live MC-80 receipt confirms the recomputed report.

## Routine monitor and safe recovery

`integration-sync-health` runs every minute independently of the dispatch transaction. It reads **every current pg_cron result**, every `v_runtime_job_latest` outcome (including unregistered reporters), expected schedule/heartbeat cadence and per-job WIP financial age by office. Disabled/missing jobs and silent stops generate failures too.

GitHub `sync-health.yml` runs every five minutes, exercises declared read-only probes and relays the durable outbox to the pinned Sentry project. First failure is retained; events escalate at failures 3 and 5. A stale DB monitor or unavailable app endpoint alerts from GitHub independently. GitHub schedules can be delayed; this is a five-minute target, not a guaranteed real-time pager SLA.

Only AccuLynx transient transport/upstream/rate-limit/timeout failures permit automatic retries: after 3 consecutive failures, maximum 2 extra attempts, 15-minute cooldown, stop at 5. Authentication/schema/mapping/partial-result failures require investigation. No automatic permission, credential, schema, code or upstream-accounting changes. Fix proposals still require human merge. PostHog stays deferred under docs/127.

Reviewed dry run: Actions 40001340528, five distinct component signatures, zero writes. Live run: [40001439274](https://github.com/Clvrwrk/a-roofer-open-brain/actions/runs/40001439274), watcher delivered 13 events, 64 health rows; triage created PEC-756 through PEC-760. Sentry ingestion and corresponding Linear issues were verified, not inferred from an SDK flush.

## App-wide coverage and gaps

| Boundary | Evidence / current coverage | Remaining limitation |
|---|---|---|
| Database schedules | All discovered outcomes + known cadence expectations; real hourly dispatch succeeded 18:13Z; job-walk dispatch succeeded 18:16Z; normal schedules restored | Scheduler success is dispatch success; worker partial outcomes are checked separately |
| Host syncs: ABC, QBO, CompanyCam, JobTread and other reported jobs | Every runtime outcome plus heartbeat absence; QBO remains read-only | JobTread sentinel has a real failed run (PEC-760); Maya QA/site sweep report warning exit codes |
| External services | 14 declared provider probes exercised on schedule | Several test reachability only; HTTP 401 can be expected and does not prove credential validity or data sync |
| App surfaces | 10 declared route probes, public health build commit | Does not execute every API path or make destructive/provider writes |
| Data feeds | 6 declared feed contracts; per-office WIP job financial freshness | SRS/QXO manual invoice feed stale since Sept 22 (PEC-756); recovery backlog remains visible by office |
| Credentials/observability | Sanitized Sentry + deduped Linear, external watcher | Supabase anon probe credential rejected (PEC-758); GitHub/Better Stack app probe credentials absent (PEC-757/759). Service-role data reads work; no RLS weakening was used to hide the probe failure |
| Edge functions | AccuLynx sync completion contract verified; existing webhook verified ingress retained | Four other registry entries lack outcome telemetry; CompanyCam webhook is absent from registry |
| Brain MCP / other bridges | Source audit of server/index.ts and PostgREST client; 15 bridge metadata files inventoried | No configured/deployed brain MCP endpoint found on inspected host; no per-call outcome wrapper. Metadata conflicts with live ABC/AccuLynx jobs, CenterPoint has no declared job, GHL state unspecified. Tracked in [PEC-761](https://linear.app/cleverwork/issue/PEC-761) |

Snapshots: `runtime-before.json` and `runtime-after.json`. Last snapshot includes in-flight worker state and is timestamped; it is not a universal green certificate. Lab/disabled adapters were not activated. External tools attached to Codex are not application-owned sync workers and are not asserted healthy by these probes.

The targeted Florida v58 retry completed with 38 successful job observations, CRM writes for those 38 jobs, and audit error_count=0. The all-account job-walk completed at18:18Z; recovery backlog in other offices remains visible.

## Test evidence

Original duplicate-key failure was reproduced on isolated synthetic Postgres before the fix. SQL suites verified request-ID reuse, wrong/replayed/expired capability, overlap, scope/role denial, response correlation, partial/non-JSON responses, first-failure outbox, duplicate observations, thresholds 3/5, cooldown, auth refusal, auto-discovery, stopped/disabled schedules and one stale job hidden behind a newer office timestamp. All pass.

Deno: 228 sync + webhook tests passed, then the added contact-dependency freshness regression passed separately. Command Center: 5 focused authorization/relay tests and production build passed. Node: 2 component-signature tests passed. `deno check` and diff whitespace check passed. Development used synthetic data, remote Docker on cleverwork-docker and caches on M4. The new regression initially had fixture/type errors; these were corrected and its final run passed. Do not describe first attempts as failure-free.

## Security validation boundary

Controls were checked against [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) and [authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). After migration, the new service-only tables appear only under the informational [RLS enabled / no policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), which is intentional deny-by-default for end users. Existing estate-wide advisories remain: 1 public-table RLS error, 62 mutable-search-path warnings, and other legacy function grants. Those were not represented as cleared by this scoped repair. Operational tests and a guarded sync are not a whole-estate compliance certification.

## Operations / rollback

Disable GitHub switches `SYNC_HEALTH_ENABLED` and `SYNC_HEALTH_TRIAGE_ENABLED` to stop external polling/triage. Disable automatic retries with `UPDATE public.integration_sync_health SET recovery_enabled=false WHERE component_key='acculynx-worker'`.

For a worker incident, pause only `acculynx-hourly-sync` and `acculynx-job-walk`; preserve runs, outbox, logs and raw archives. Revert source to a reviewed known commit and redeploy the worker with JWT verification still enabled. The exact original v54 worker matches Git d74e630b8e3d0a271e2f1a076cc20d2c0d87620a; original SQL definitions are in `rollback-schema.sql`. Do not restore insecure legacy ingress while pulls are active. Monitor cadence addition can be reverted to function body in migration 332 without deleting incident history. The additional WIP refresh can be stopped with `cron.unschedule('wip-ar-sync-refresh')` while retaining the original nightly job. Never roll back accounting data to hide a stale-sync symptom.
