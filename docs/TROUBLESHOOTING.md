# Troubleshooting

> Work through the symptom → likely cause → fix structure. Each section names the symptom, the one or two most likely causes, and the specific fix with commands or file paths.
>
> Run `./scripts/verify-deployment.sh` first. It catches the most common issues automatically and reports them with actionable output.

---

## Schema Migration Errors

### Symptom: `verify-deployment.sh` reports missing tables or `ERROR: relation "public.thoughts" does not exist`

**Likely cause:** OB1 spine migrations were not applied before the roofer-extension migrations. The roofer extensions depend on `public.thoughts` and other OB1 tables; if those are absent, every extension migration fails.

**Fix:**

1. Check what tables exist:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   ```
2. If `thoughts` is missing, apply the OB1 spine first (all five files in order):
   ```bash
   supabase db push schemas/ob1-base/00-core-thoughts.sql
   supabase db push schemas/ob1-base/enhanced-thoughts.sql
   supabase db push schemas/ob1-base/provenance-chains.sql
   supabase db push schemas/ob1-base/typed-reasoning-edges.sql
   supabase db push schemas/ob1-base/agent-memory.sql
   ```
3. Then apply the roofer extensions in order (`10-` through `50-`):
   ```bash
   supabase db push schemas/cleverwork-roofer/10-property-jurisdiction.sql
   # ... continue through 50-consent-access-log.sql
   ```
4. All migration files are idempotent (`IF NOT EXISTS` / `IF NOT EXISTS` guards throughout). Safe to re-run.

---

### Symptom: `ERROR: column "property_id" of relation "thoughts" does not exist` when querying

**Likely cause:** `schemas/cleverwork-roofer/40-atom-extensions.sql` was not applied. This file adds the roofer-specific columns to `public.thoughts`.

**Fix:** Apply `40-atom-extensions.sql`:
```bash
supabase db push schemas/cleverwork-roofer/40-atom-extensions.sql
```

Then verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'thoughts' AND column_name = 'property_id';
```

---

### Symptom: Migration applies but RLS policies are missing (`rowsecurity = false`)

**Likely cause:** The migration ran but the Postgres user executing it did not have the rights to enable RLS, or the migration was applied against the wrong database (e.g. a local dev database instead of the Supabase project).

**Fix:**
1. Confirm you are connected to the correct Supabase project: `supabase status`.
2. Manually enable RLS on the affected table and add the service-role policy:
   ```sql
   ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "service_role_only" ON public.<table_name>
     USING (auth.role() = 'service_role');
   ```
3. Re-run the relevant migration file to restore the full policy set — it is idempotent.

---

## Slack Bot Silent

### Symptom: Mentioning `@ob-ops` in Slack produces no response

**Likely cause 1 — Bot not invited to the channel.** The bot user must be explicitly invited to each channel where it should respond.

**Fix:** In Slack: `/invite @ob-ops` in the relevant channel.

**Likely cause 2 — `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` is wrong or not set in the relevant Coolify app env.**

**Fix:**
1. In Coolify, open the app that handles Slack events and verify `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_APP_TOKEN`.
2. If missing or wrong, update the app env from your vault.
3. Redeploy from the Coolify UI or trigger the configured deploy hook.
4. Test: in Slack, mention `@ob-ops` in a channel where it is invited.

**Likely cause 3 — Socket Mode App Token expired or not set.**

**Fix:** In the Slack API console (api.slack.com/apps → your app → Socket Mode), generate a new App Token. Update `SLACK_APP_TOKEN` in Coolify app env and redeploy.

**Likely cause 4 — MCP container errors visible in logs.**
Check the Slack handler container logs in Coolify. If errors appear, they will identify the root cause (authentication failure, JSON parse error, missing environment variable). Fix the specific error reported.

---

## AccuLynx Webhook Not Firing

### Symptom: Closing a job in AccuLynx does not trigger a debrief scheduling message in Slack; the `acculynx-bridge` Coolify logs show no recent events

**Likely cause 1 — Webhook not registered in AccuLynx.**

**Fix:** In AccuLynx → Settings → API → Webhooks, verify the webhook exists and the endpoint URL is correct (`$ACCULYNX_BRIDGE_URL`). If missing, re-register it following the steps in `docs/01-onboard-a-roofer.md` §Step 7.

**Likely cause 2 — MCP container not deployed.**
In Coolify, confirm the `acculynx-bridge` app exists, is running, and has a public HTTPS domain. If absent, create it from this repo and add its URL to `.env` as `ACCULYNX_BRIDGE_URL`.

**Likely cause 3 — Webhook signature validation failing.** The MCP container rejects payloads with invalid signatures (correct behavior). If `ACCULYNX_WEBHOOK_SECRET` does not match the secret set in AccuLynx, every webhook fires and is immediately rejected.

**Fix:** Confirm the secret values match:
- AccuLynx: Settings → API → Webhooks → your webhook entry → Secret field.
- Coolify bridge app env / vault: `ACCULYNX_WEBHOOK_SECRET`.
If they differ, update one to match the other in Coolify or AccuLynx and redeploy.

**Likely cause 4 — AccuLynx API plan does not include webhook access.** Some AccuLynx tiers gate webhook functionality. Verify with AccuLynx support that your client's account tier includes outbound webhooks.

---

## Embeddings Failing / Empty Search Results

### Symptom: `match_thoughts()` returns zero results even for queries that should match; or `verify-deployment.sh` reports `embeddings: FAIL`

**Likely cause 1 — Embeddings provider API key is invalid or not set.**

**Fix:**
Confirm `EMBEDDINGS_API_KEY` is set in the `brain-mcp` or Capture container env in Coolify. If missing or expired, obtain a new key from your embeddings provider, update Coolify env from the vault, and redeploy the affected container.

**Likely cause 2 — Atoms were written without embeddings (embedding column is null).** This happens if the embeddings API call failed silently during Capture.

**Check:**
```sql
SELECT count(*) FROM public.thoughts WHERE embedding IS NULL;
```
If this returns > 0 for non-trivial atoms, trigger a re-embedding run:
```bash
./scripts/reembed-missing.sh   # re-embeds all atoms with null embedding
```

**Likely cause 3 — Mismatch between embedding model used for writes and the model active for search.** If you changed `model_tiers.embeddings` or switched from `managed` to `ollama`, all existing embeddings are in the vector space of the old model and will not match searches using the new model.

**Fix:** Re-embed all atoms:
```bash
./scripts/reembed-all.sh   # may take hours on a large brain; run overnight
```

---

## RLS Permission Denied

### Symptom: Queries from the dashboard or an agent return `ERROR: new row violates row-level security policy` or `permission denied for table thoughts`

**Likely cause 1 — Agent is calling the database directly instead of through the internal MCP container.**

This is a configuration problem. All database access must go through the internal `brain-mcp` container, which authenticates to Supabase with `SUPABASE_SERVICE_ROLE_KEY`. Direct database access from an agent (bypassing the MCP) uses the anon key, which does not have write permissions under the RLS policies.

**Fix:** Review the failing agent's tool calls. Calls to `match_thoughts`, `write_thought`, or any Supabase operation must go through the MCP, not a direct database client.

**Likely cause 2 — The MCP server is using the anon key instead of the service role key.**

**Fix:** In `server/functions/`, confirm that all database operations use the service role key:
```bash
grep -r "SUPABASE_ANON_KEY" server/functions/
```
Any occurrence in a write or admin path is a bug. The anon key is for dashboard read-only access only.

**Likely cause 3 — RLS policy is incorrectly defined.** Re-applying the migration for the affected table restores the correct policy:
```bash
supabase db push schemas/cleverwork-roofer/<affected-migration>.sql
```

---

## Cross-Client History Returns Nothing (Consent)

### Symptom: `@ob-historian` is queried about a property that other Cleverwork clients have worked on, but returns no prior-contractor history

**Likely cause 1 — Source client opted out of cross-client sharing.**

`consent.cross_client_default = "opt_out"` in the source client's config means their atoms have `consent_flags.cross_client_shareable = false`. The cross-client read path correctly returns nothing.

There is no fix for this — it is working as intended. The source client's data sovereignty choice is respected. You can note for the current client that no cross-client history is available for this property.

**Likely cause 2 — Trade restriction is blocking the result.**

Both clients are roofers. The `consent_flags.trade_restriction = ["roofing"]` default means roofers never share with other roofers. Check:
- What trade is the source client? (`company.trades` in their config)
- What trade is the querying client?
If they are the same trade, no cross-client sharing is permitted by design.

**Likely cause 3 — The property record in the source client's brain has a different `property_id` than the one being queried.**

Property matching relies on address normalization. If AccuLynx stored the address with a slightly different format (e.g. "847 Ridgeline Dr" vs. "847 Ridgeline Drive"), two distinct property records were created.

**Fix:** Identify the canonical `property_id` for the address in each client's brain and merge the records:
```sql
-- In source client's brain: find both records
SELECT id, address FROM property WHERE address ILIKE '%847%ridgeline%';
-- Update atoms referencing the variant ID to point to the canonical ID
UPDATE public.thoughts SET property_id = '<canonical-id>' WHERE property_id = '<variant-id>';
-- Archive the variant property record
UPDATE property SET active = false WHERE id = '<variant-id>';
```

---

## Dashboard Blank

### Symptom: The Coolify dashboard URL loads but shows no data, or shows a loading spinner that never resolves

**Likely cause 1 — `PUBLIC_SUPABASE_ANON_KEY` is not set in the Coolify environment.**

**Fix:** In the Coolify dashboard app → Settings → Environment Variables, confirm `PUBLIC_SUPABASE_ANON_KEY` and `PUBLIC_SUPABASE_URL` are present and correct. Redeploy after adding them.

**Likely cause 2 — The Supabase project is paused (free tier hibernation after inactivity).**

**Fix:** In the Supabase dashboard, confirm the project is active (not paused). Free-tier projects pause after inactivity. Resume the project and wait 30–60 seconds for it to warm up.

**Likely cause 3 — CORS policy is blocking the dashboard's API calls.** Check the browser console for CORS errors.

**Fix:** In Supabase → Project Settings → API → CORS allowed origins, confirm the Coolify deployment URL is listed.

---

## Debrief Not Triggering on Job Close

### Symptom: A job is marked closed in AccuLynx, the AccuLynx webhook fires (visible in bridge logs), but Conductor never sends a debrief-scheduling message in Slack

**Likely cause 1 — Conductor is not processing the `job.closed` event from the AccuLynx bridge.** Check the Conductor container logs in Coolify. If the event arrived at the AccuLynx bridge but the Conductor logs show nothing, the bridge is not routing `job.closed` events to Conductor.

**Fix:** Confirm `integrations.acculynx.webhook: true` in `config/roofer.config.yaml` and redeploy the AccuLynx bridge from Coolify or its deploy hook.

**Likely cause 2 — Conductor's Slack posting is failing (missing token or channel ID).**

**Fix:**
1. Confirm `SLACK_BOT_TOKEN` is set in the Conductor/Slack app env in Coolify.
2. Confirm the Conductor container has the correct channel ID configured for debrief scheduling messages.
3. Check Conductor container logs for a Slack API error.

**Likely cause 3 — The `job.closed` event is arriving but the job record in the brain is missing a `client_id` or `property_id`, causing the debrief scheduler to skip it.**

**Fix:** Check the job record:
```sql
SELECT id, client_id, property_id FROM job WHERE acculynx_id = '<job-id-from-acculynx>';
```
If `client_id` or `property_id` is null, the bridge's property-resolution step failed. This usually means the AccuLynx job has an address format that does not match any existing property record. Create the property record manually and re-associate:
```sql
-- Create the property if needed
INSERT INTO property (address, ...) VALUES (...);
-- Update the job
UPDATE job SET property_id = '<new-property-id>' WHERE id = '<job-id>';
```
Then manually trigger the debrief scheduling via Conductor.

---

## Duplicate Atoms

### Symptom: The same knowledge appears as two or more near-identical atoms; search results return duplicates; Maintenance reports high duplicate count

**Likely cause 1 — The same debrief transcript was processed twice.** This happens if the AccuLynx bridge fires twice for the same `job.closed` event (AccuLynx can fire duplicate webhooks on certain plan tiers), or if the transcript was uploaded manually after the automatic capture had already run.

**Likely cause 2 — The fingerprint-dedup recipe is not running.** OB1's `content-fingerprint-dedup` recipe uses `content_fingerprint` on `public.thoughts` to detect semantic duplicates. If this is not scheduled, duplicates accumulate.

**Fix:**

1. Run the dedup recipe manually:
   ```bash
   # Run the fingerprint-dedup recipe/container or scheduled SQL job for this client.
   ```
   This marks duplicate atoms with `cold_archive_status = archived` (the lower-confidence duplicate is archived; the higher-confidence or older one is kept).

2. To prevent recurrence, confirm the `fingerprint-dedup` recipe is scheduled in Supabase cron:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'fingerprint-dedup';
   ```
   If absent, add it (daily at 2 AM is a good default):
   ```sql
   SELECT cron.schedule('fingerprint-dedup', '0 2 * * *', $$SELECT fingerprint_dedup_run()$$);
   ```

3. For webhook-duplicate prevention, the AccuLynx bridge uses idempotency keys based on `acculynx_event_id`. Check that the bridge is storing processed event IDs:
   ```sql
   SELECT count(*) FROM atom_access_log WHERE source = 'acculynx-bridge' AND metadata->>'event_type' = 'job.closed' AND metadata->>'acculynx_job_id' = '<job-id>';
   ```
   If the same job ID appears more than once, the idempotency check in the bridge is not working. Review `integrations/bridges/acculynx/handler.ts` for the dedup logic.
