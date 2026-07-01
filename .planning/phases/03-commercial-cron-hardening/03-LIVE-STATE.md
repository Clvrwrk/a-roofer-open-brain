# Phase 3 — Live-DB Ground Truth (Wave 0)

**Captured:** 2026-06-30 via Supabase MCP against prod `rnhmvcpsvtqjlffpsayu` (shared dev+prod).
**Scope:** read-only introspection only (no mutations this wave — hard rule 1).
**Purpose:** resolve RESEARCH.md Open Questions 1–4 so downstream migrations (172–180) target real objects and cannot fail mid-phase. No raw secret/token/DSN value appears in this file — only env var NAMES and (non-secret) channel IDs.

---

## OQ1 — Current pg_cron acculynx job + trigger function

`select jobid, jobname, schedule, command from cron.job order by jobname;`

| jobid | jobname | schedule | command |
|------|---------|----------|---------|
| 1 | `acculynx-sync-daily` | `15 8 * * *` (daily 08:15 UTC) | `SELECT public.trigger_acculynx_sync('["users","jobs"]'::jsonb);` |
| 2 | `acculynx-geoid-match-daily` | `45 8 * * *` | `SELECT public.match_crm_pipeline_geoids();` |
| 3 | `pvp_refresh_nightly` | `0 7 * * *` | (unrelated — product_vendor_pricing) |
| 4 | `top20_refresh_quarterly` | `0 11 1 1,4,7,10 *` | (unrelated) |

`trigger_acculynx_sync(p_resources)` body (source):
- Reads vault secret **`acculynx_sync_auth_jwt`** for the Bearer.
- Calls `net.http_post(url=.../functions/v1/acculynx-sync, body := jsonb_build_object('resources', p_resources), timeout_milliseconds := 170000)`.
- Logs a breadcrumb to `crm_sync_log`.
- **The body is `{"resources": [...]}` — it does NOT emit `multiAccount`.** The current cron passes `["users","jobs"]`, so the edge function takes the **legacy** single-account path.

**→ Cutover IS required (mig 172).** The sync jobname to `cron.unschedule` is exactly **`acculynx-sync-daily`**. `acculynx-geoid-match-daily` (jobid 2) is a separate downstream job — leave it unless the cutover intentionally reschedules it.

## OQ2 — RLS status + grants on `acculynx_*`

`relrowsecurity`: **all 22 `acculynx_*` tables already have RLS ENABLED (`relrowsecurity = true`).**

Grants (`information_schema.role_table_grants`): **`anon` AND `authenticated` currently hold FULL privileges** — `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` — on **every** `acculynx_*` table (the default public-schema grant was never revoked). `service_role` holds the same (correct).

**→ D-14 (mig 177) is AUDIT + REVOKE-ONLY, not enable.** RLS enable is already done (idempotent no-op). The real fix is `REVOKE ALL ON <each acculynx_* table> FROM anon, authenticated;` (house pattern: migs 76/148), keeping `GRANT ... TO service_role`. Dashboard reads use `service_role` (`app/command-center/src/lib/supabase.server.ts`) which bypasses RLS — unaffected.

## OQ3 — Watermark `last_api_count`

`select account_key, resource_type, last_api_count, last_modified_date, last_sync_at from acculynx_sync_watermark;`

| account_key | resource_type | last_api_count |
|-------------|---------------|----------------|
| kansas_city | jobs | **1** ← bug confirmed live |
| wichita | contacts | 1312 (real) |
| wichita | estimates / invoices / job_financials / job_insurance / job_milestone_history / users | NULL (never swept) |

Only 8 watermark rows exist; there is **no `wichita/jobs` row and no `kansas_city/contacts` row** yet.

**→ last_api_count fix needs NO `jobs.ts` code change.** `(kansas_city, jobs) = 1` is the legacy-path signature; the Phase-2 `resources/jobs.ts::syncJobs` already captures the real `apiCount`. The cutover (mig 172 → `multiAccount:true`) fixes it. **Verify after the first hourly multiAccount run** that `(kansas_city, jobs).last_api_count` becomes a real total (not 1).

## OQ3b — NULL provenance across ALL 9 tables mig 178 will constrain

`account_key IS NULL` counts:

| table | null account_key | total |
|-------|------------------|-------|
| acculynx_contacts | **3** | 135 |
| acculynx_job_contacts | **3** | 3 |
| acculynx_job_financials | **1** | 1 |
| acculynx_job_insurance | **1** | 1 |
| acculynx_jobs | 0 | 1450 |
| acculynx_estimates | 0 | 0 (empty) |
| acculynx_invoices | 0 | 0 (empty) |
| acculynx_invoice_lines | 0 | 0 (empty) |
| acculynx_job_milestone_history | 0 | 0 (empty) |

**8 NULL-account_key rows total, in exactly 4 tables** (matches the Phase-2 "8 legacy rows" figure — it was the true count, not just a minimum). The other 5 tables are clean.

`market IS NULL` counts (checked because `market` exists on all 9):

| table | null market | total |
|-------|-------------|-------|
| acculynx_jobs | **191** | 1450 |
| acculynx_contacts | 135 | 135 (all) |
| acculynx_job_contacts | 3 | 3 |
| acculynx_job_financials | 1 | 1 |
| acculynx_job_insurance | 1 | 1 |
| (empty tables) | 0 | 0 |

**→ `market` is widely and legitimately NULL** (a derived enrichment field, unresolved for 191/1450 jobs and all contacts). **mig 178 must SET NOT NULL on `account_key` ONLY — NOT on `market`.** Constraining `market` would fail outright and is not what D-11 requires (provenance = `account_key`).

## OQ3c — pg_net / pg_cron versions + TTL

- `pg_net` **0.20.0** (TTL-respecting; the #80/#81 TTL bug is long fixed) · `pg_cron` **1.6.4**.
- `pg_net.ttl` = **6 hours**.

**→** The reconcile cron at `*/10` min (mig 174) copies `net._http_response` outcomes into the owned `acculynx_cron_dispatch` table (mig 173) with ~36× margin before TTL purge. Design is sound.

## OQ4 — Alert channel + identities (D-05)

- **Slack alert channel: `#cc-proexteriors` (`C0BCUJV0MLY`).** Confirmed as the existing Sentry Slack-integration channel (Sentry integration id `443674`, workspace CleverWork) per `.claude/skills/sentry/SKILL.md`. RESEARCH's recommendation is correct — reuse it so cron alerts land where humans already watch Sentry alerts.
- **Bot posting identity:** shared `openbrain` bot via env var **`SLACK_BOT_TOKEN`** (public channel — bot self-joins via `conversations.join`, per `.claude/skills/slack-agents/SKILL.md`). Alternatively route SQL-side alerts through the Sentry Slack integration.
- **Sentry wiring:** env vars **`SENTRY_DSN`** / **`PUBLIC_SENTRY_DSN`** (capture) and **`SENTRY_PERSONAL_TOKEN`** (alert-rule CRUD). Values live in Coolify / root `.env` — never in code (hard rule 2).

---

## Downstream impact (decisions for plans 02/03/04)

1. **mig 172 cron cutover — REQUIRED.** Update `trigger_acculynx_sync` to emit `{"multiAccount": true}` in the POST body (currently `{"resources": p_resources}`), `cron.unschedule('acculynx-sync-daily')`, `cron.schedule(...)` hourly `0 * * * *`. Vault secret name `acculynx_sync_auth_jwt` is unchanged.
2. **jobs `last_api_count` — NO code change.** Fixed by the cutover; verify `(kansas_city,jobs)` flips off `1` after the first hourly multiAccount run.
3. **mig 177 RLS — REVOKE-ONLY (audit).** RLS already enabled everywhere; add `REVOKE ALL ... FROM anon, authenticated` on all `acculynx_*` tables; keep the enable statements idempotent.
4. **mig 180 triage — 8 rows in 4 tables** (`acculynx_contacts` 3, `acculynx_job_contacts` 3, `acculynx_job_financials` 1, `acculynx_job_insurance` 1). Keep the `WHERE account_key IS NULL` idempotent scan across all 9 tables (safe no-op on the 5 clean ones).
5. **mig 178 NOT NULL — `account_key` ONLY, all 9 tables** (safe once mig 180 clears the 8 rows). **Do NOT constrain `market`** — legitimately nullable (191 jobs + all contacts NULL).
6. **mig 173/174 reconciliation — TTL 6h, pg_net 0.20.0.** `*/10` reconcile cron is safe.
7. **D-05 alerts → `#cc-proexteriors` (`C0BCUJV0MLY`)**, Slack via `SLACK_BOT_TOKEN` / Sentry integration 443674; Sentry via `SENTRY_DSN` + `SENTRY_PERSONAL_TOKEN`.

*No raw secret, token, JWT, or DSN value is recorded above — only env var / vault-secret NAMES and non-secret channel IDs.*
