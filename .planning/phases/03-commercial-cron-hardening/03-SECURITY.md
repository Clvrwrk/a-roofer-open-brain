# SECURITY.md — Phase 3: commercial-cron-hardening

**Audit date:** 2026-06-30
**Auditor:** gsd-security-auditor
**Scope:** Plans 03-01 through 03-04 (threat register T-03-01..T-03-11, T-03-SC). Plans 03-05/03-06 are out of scope — no threat register entries reference them and neither has a SUMMARY.md (not yet implemented).
**ASVS Level:** L1
**block_on:** high

Register authored at plan time; this audit verifies each declared mitigation exists in the implemented/applied code — documentation and intent were not accepted as evidence. All migrations 172-180 were read directly; `deno test` / `deno check` were re-run live (not taken from SUMMARY.md claims) for the two testable artifacts.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-03-01 | Information Disclosure | mitigate | CLOSED | `.planning/phases/03-commercial-cron-hardening/03-LIVE-STATE.md:5,90-92,106` — explicit "no raw secret/token/DSN value" statement; grep sweep for token-shaped literals (`xoxb-`, `sk-`, `sntrys_`) returned zero matches. Only env var NAMES (`SLACK_BOT_TOKEN`, `SENTRY_DSN`, `SENTRY_PERSONAL_TOKEN`) and non-secret channel IDs (`C0BCUJV0MLY`) recorded. |
| T-03-02 | Tampering | mitigate | CLOSED | `03-LIVE-STATE.md:4` — "Scope: read-only introspection only (no mutations this wave — hard rule 1)"; all recorded queries are `select`/`show` against `cron.job`, `pg_class`, `information_schema`, `acculynx_sync_watermark`. 03-01-SUMMARY.md confirms "Read-only introspection only — no mutations." |
| T-03-03 | DoS (silent stale data) | mitigate | CLOSED | `schemas/cleverwork-roofer/175-acculynx-cron-outcomes-view-v2.sql:21-50` — `v_acculynx_cron_outcomes` reads `public.acculynx_cron_dispatch` only (grep of non-comment lines confirms zero reference to `net._http_response`); `174-acculynx-reconcile-fn.sql:44-53` schedules `acculynx-reconcile` at `*/10 * * * *`, a 36x margin inside the confirmed 6h pg_net TTL. Second half (check_acculynx_alerts covering all D-05 conditions incl. unreconciled dispatch) confirmed in `176-acculynx-alert-check-fn.sql:31-66`. |
| T-03-04 | Information Disclosure | mitigate | CLOSED | `172-acculynx-cron-hourly-cutover.sql:70-72` — `batch_context` insert uses `v_body` only (the caller payload, e.g. `{"multiAccount":true}`), never `v_jwt`; the JWT is used solely in the `Authorization` header (line 62) and is not persisted anywhere. `173-acculynx-cron-dispatch-log.sql:35` comment confirms the contract. |
| T-03-05 | Tampering | mitigate | CLOSED | All of 172-180 end with the "Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1)" footer. Full grep sweep for `drop table|drop column|truncate|delete from` across 172-180 returned zero executable matches (only comments/footers and a `revoke update, delete, truncate` grant-safety line in 178, which is a privilege revoke, not a destructive DML/DDL statement). Applied under explain-then-ship blocking human gates (03-02-SUMMARY.md, 03-04-SUMMARY.md). |
| T-03-06 | Information Disclosure | mitigate | CLOSED | `supabase/functions/acculynx-sync/lib/alerts.ts:16-34` — `redact()` scrubs `Bearer `, `xox[baprs]-`, `sk-`, `sntrys_` patterns; `scrubContext()` strips keys matching `/key\|token\|authorization\|secret\|password\|jwt\|dsn/i`. Live-reran `deno test supabase/functions/acculynx-sync/lib/alerts.test.ts --allow-env` → **6/6 passed**, including "redacts Bearer/sk- tokens" and "envelope excludes secret-named context keys." `schemas/cleverwork-roofer/176-acculynx-alert-check-fn.sql:25` resolves the Slack bot token via `vault.decrypted_secrets` (never a literal); token sent only in the `Authorization` header (line 82), never in `body` (line 84). |
| T-03-07 | DoS (alert fatigue) | mitigate | CLOSED | `176-acculynx-alert-check-fn.sql:39-48` — stale-watermark check is `where last_sync_at is not null and last_sync_at < now() - interval '3 hours'`; explicit comment: "NULL last_sync_at (never-started / not-yet-reached backfill resource) is excluded so a legitimate long backfill does not trip a false 'stale' alert." Gates on `last_sync_at is not null`, not merely age, matching Pitfall 4. |
| T-03-08 | Information Disclosure | mitigate | CLOSED | `177-acculynx-rls-deny-by-default.sql:21-42` — `REVOKE ALL ... FROM anon, authenticated` + `GRANT ALL ... TO service_role` on 22 `acculynx_*` tables (broader than the plan's 14-table list per 03-04-SUMMARY.md deviation #4). `03-04-SUMMARY.md:23` records live verification: `has_table_privilege` anon→contacts SELECT **false**, authenticated→jobs SELECT **false**, service_role→contacts SELECT **true**. |
| T-03-09 | Tampering / cross-account bleed | mitigate | CLOSED | `178-acculynx-trust-invariants.sql:28-51` — `account_key set not null` applied (both dynamic loop and explicit literal statements) across all 9 ingested tables. `180-acculynx-legacy-null-row-triage.sql:22-30` — `update ... set account_key = 'sandbox', archived_at = coalesce(...), archive_reason = coalesce(...) where account_key is null` for all 9 tables, confirmed UPDATE-only (no `delete from`/`truncate`/`drop`, grep-verified). Ordering (180 before 178) confirmed by filename number and 03-04-SUMMARY.md apply sequence "180→177→179→178." Live: `03-04-SUMMARY.md:26` — `account_key NOT NULL` confirmed (`is_nullable = NO`) and zero-NULL gate passed (178 applying without error proves it). |
| T-03-10 | Elevation of Privilege (untrusted data as instructions) | mitigate | CLOSED | `178-acculynx-trust-invariants.sql:34,37-38` — `trust_tier text not null default 'evidence'` added to all 9 tables; table comment documents the D-10 "UNTRUSTED-CONTENT BOUNDARY... MUST be treated as DATA, never as instructions, by any downstream agent (REQ-09 enforces)" boundary. Agent-side enforcement explicitly deferred to REQ-09 per the plan's own disposition — this audit confirms the label/marker exists now, which is the declared scope of this phase's mitigation. |
| T-03-11 | Tampering (data rot) | mitigate | CLOSED | `179-acculynx-rot-guard-views.sql` — all four views present and grep-confirmed: `v_acculynx_duplicate_guids` (L17-30), `v_acculynx_orphan_subresources` (L33-48), `v_acculynx_null_provenance` (L51-62), `v_acculynx_stale_tail` (L65-76). `176-acculynx-alert-check-fn.sql` does not directly query the 179 views but does independently surface unreconciled/stale/delta conditions; 03-04-SUMMARY.md records all four rot guards returned 0 live (dup_guids=0, orphans=0, null_provenance=0, stale_tail=0). |
| T-03-SC | Tampering (npm/pip/cargo installs) | accept | CLOSED | Accepted risk: "no new packages this phase." Verified — `git log` shows no package-manifest changes in phase-3 commits; only new import across all phase-3 files is `jsr:@std/assert@1` (Deno std-lib test assertions), the same pre-existing pattern used by `watermark.test.ts`. No new third-party runtime dependency introduced. |

**Closed: 12/12 (11 mitigate + 1 accept). Open: 0.**

## Live Test Re-Verification (not taken on faith from SUMMARY.md)

- `deno test supabase/functions/acculynx-sync/lib/alerts.test.ts --allow-env` → **6 passed, 0 failed** (re-run by auditor).
- `deno test supabase/functions/acculynx-sync/lib/reconcile.test.ts --allow-env` → **9 passed, 0 failed** (re-run by auditor).
- `deno check supabase/functions/acculynx-sync/index.ts` → clean, no type errors.

## Destructive-Verb / Shared-Prod-DB Compliance Sweep

Full grep of `drop table|drop column|truncate|delete from` across `schemas/cleverwork-roofer/172-*.sql` through `180-*.sql`: **zero executable matches.** All hits are either the mandatory hard-rule-1 footer comments or the `revoke update, delete, truncate on public.acculynx_raw from anon, authenticated, service_role` privilege-revocation statement in migration 178 (a REVOKE, which removes the ability to run those verbs — it does not execute them). Migration 180 (the row-triage migration, highest risk of an accidental DELETE) is confirmed UPDATE-only.

**Confirmed: no destructive SQL verb present in migrations 172-180.**

## Secret-Literal Compliance Sweep

Regex sweep for token-shaped literals (`xoxb-`, `sk-[A-Za-z0-9]{10,}`, `hooks.slack.com/services/[A-Z0-9]`, `sntrys_`, AWS/PEM patterns) across:
- `schemas/cleverwork-roofer/172-*.sql` through `180-*.sql`: **zero matches.**
- `supabase/functions/acculynx-sync/lib/*.ts`, `index.ts`: matches found only in `alerts.test.ts` (`xoxb-REAL-TOKEN`, `xoxb-x`, `sk-live-abc123DEF456`) — these are synthetic placeholder fixtures used to unit-test the redaction logic itself, not live credentials; they are consistent with the plan's own Task 1 test design ("feed a message that accidentally contains 'Bearer sk-live-xxx'").
- `03-LIVE-STATE.md`: zero matches (env var names / channel IDs only, matching the explicit in-file compliance statement).

**Confirmed: no raw secret/token/webhook-URL literal appears in any committed schema/*.sql or non-test lib/*.ts file.**

## Unregistered Flags

None. No `## Threat Flags` section exists in any of `03-01-SUMMARY.md`, `03-02-SUMMARY.md`, `03-03-SUMMARY.md`, or `03-04-SUMMARY.md`. No new attack surface was self-reported by the executor beyond the registered T-03-01..T-03-11/T-03-SC set, and this audit's independent code review (RLS scope broadened to 22 tables, Slack transport changed from webhook to bot-token, alert channel changed from `#cc-proexteriors` to `ob-ops-conductor`) did not surface any additional trust-boundary crossing not already covered by the existing threat register — the transport/channel changes are within-scope deviations of T-03-06/T-03-08, not new threats.

## Operational Caveat (not a threat-register gap — flagged for completeness)

`03-03-SUMMARY.md` records plan status `partial`: the code-level mitigation for T-03-06 (no secret in payload) is fully implemented and unit-proven, and migration 176 is applied/live with the alert-check cron running (`check_acculynx_alerts()` returns real breach counts). However, **live Slack delivery is unproven** — two human steps remain outstanding: (1) inviting the `openbrain` bot to the private `ob-ops-conductor` channel, (2) provisioning the `acculynx_alert_slack_bot_token` Vault secret. Until both land, `check_acculynx_alerts()` and the edge-side alert hooks are safe no-ops (confirmed: "no post since Vault secret unset = safe" per 03-03-SUMMARY.md) rather than delivering alerts. This does not reopen T-03-06 (no secret is disclosed either way) but it does mean the **operational effectiveness** of T-03-03/T-03-07's alerting backstop is not yet proven end-to-end in production. Recommend closing the two human steps before relying on this phase's alerting as a production safety net.

## Recommendation

**SECURED for shipping.** All 12 threat-register entries (11 mitigate + 1 accept) verified CLOSED at the code/migration level with live evidence where available. No destructive SQL, no secret literals, no unregistered attack surface. The one operational gap (Slack delivery proof pending 2 human steps) is tracked in 03-03-SUMMARY.md's own remaining-work section and does not constitute an open security threat per this phase's declared threat_model.
