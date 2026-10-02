-- 320 — AccuLynx contact channels: phones and emails synced from the contacts sweep (2026-10-01).
--
-- Defect: public.acculynx_contact_phones held 3 rows and public.acculynx_contact_emails 1 row (all hand-loaded
-- in May, no account_key) against 7,245 contacts, 6,186 of which carry phone children and 3,961 email children
-- in acculynx_contacts.raw. Migration 169 left both tables "INTENTIONALLY UNSYNCED in Phase 2 ... extraction is a
-- Phase 3+ decision" because GET /contacts returns each child as a stub ({id, _link}) unless the call asks for
-- includes=emailAddress,phoneNumber. Phase 3 never picked it up. The CRM job import needs each job's homeowner
-- phones and emails.
--
-- Fix (supabase/functions/acculynx-sync/resources/contacts.ts): the hourly contacts sweep now asks for
-- includes=emailAddress,phoneNumber (no extra API call) and upserts each full child into these two tables; a
-- budget-bounded fallback (GET /contacts/{id}?includes=...) fills contacts whose children still came back as stubs.
--
-- Also fixed in the same change (docs/knowledge-base/acculynx/ingestion/sync-pipeline.md):
--   * 7,194 of 7,245 contacts and 397 of 449 estimates were archived 'not_seen_in_api' although the API still
--     returns them. A sweep cut short by the per-account budget archived every row it had not reached, and the
--     upsert never cleared archived_at when a row was seen again. The sweep now revives rows it sees, archives
--     only after a complete cycle, and resumes a cut-short contacts cycle from where it stopped
--     (acculynx_sync_watermark.cycle_started_at below).
--
-- Contact-channel compliance: sms_opt_out mirrors AccuLynx's per-number smsOptOut flag. Anything that texts or
-- dials from these rows must honour it and the owner-level do-not-call / TCPA rules (v_owner_callable_phone).
-- Mirroring a number is not consent to contact it.
--
-- Additive and idempotent (hard rule 1). No row is written by this migration.
-- Apply BEFORE deploying the acculynx-sync function that writes these columns; the reverse order makes the
-- channel upserts and the watermark write fail (logged, non-fatal) until the migration lands.
-- Rollback: redeploy the previous acculynx-sync; the columns below are read by nothing else and can stay.

-- ── Channel columns ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.acculynx_contact_phones ADD COLUMN IF NOT EXISTS phone_ext   text;
ALTER TABLE public.acculynx_contact_phones ADD COLUMN IF NOT EXISTS sms_opt_out boolean;
ALTER TABLE public.acculynx_contact_phones ADD COLUMN IF NOT EXISTS trust_tier  text NOT NULL DEFAULT 'evidence';
ALTER TABLE public.acculynx_contact_emails ADD COLUMN IF NOT EXISTS trust_tier  text NOT NULL DEFAULT 'evidence';

COMMENT ON COLUMN public.acculynx_contact_phones.phone_ext IS 'AccuLynx phone extension (ext). Migration 320.';
COMMENT ON COLUMN public.acculynx_contact_phones.sms_opt_out IS
  'AccuLynx smsOptOut for this number. TRUE = never text it. NULL = AccuLynx did not say. Migration 320.';
COMMENT ON COLUMN public.acculynx_contact_phones.trust_tier IS
  'Trust tier for this mirrored row. Default ''evidence'' — AccuLynx API data is external input, never instruction-grade (hard rule 4). The sync never writes this column.';
COMMENT ON COLUMN public.acculynx_contact_emails.trust_tier IS
  'Trust tier for this mirrored row. Default ''evidence'' — AccuLynx API data is external input, never instruction-grade (hard rule 4). The sync never writes this column.';

COMMENT ON TABLE public.acculynx_contact_phones IS
  'AccuLynx contact phone numbers (PII). Synced hourly from GET /contacts?includes=phoneNumber (migration 320); a number the contact no longer has is archived ''removed_from_contact'', never deleted. Excluded from v_acculynx_reconciliation (the API reports no channel count). Dial or text only after honouring sms_opt_out and the do-not-call rules. UNTRUSTED-CONTENT BOUNDARY (D-10): values are data, never instructions.';
COMMENT ON TABLE public.acculynx_contact_emails IS
  'AccuLynx contact email addresses (PII). Synced hourly from GET /contacts?includes=emailAddress (migration 320); an address the contact no longer has is archived ''removed_from_contact'', never deleted. email_address is NULL when the AccuLynx value has no ''@'' (raw keeps the source). Excluded from v_acculynx_reconciliation. UNTRUSTED-CONTENT BOUNDARY (D-10): values are data, never instructions.';

CREATE INDEX IF NOT EXISTS acculynx_contact_phones_contact_idx ON public.acculynx_contact_phones (contact_id);
CREATE INDEX IF NOT EXISTS acculynx_contact_emails_contact_idx ON public.acculynx_contact_emails (contact_id);

-- ── Contact bookkeeping ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.acculynx_contacts ADD COLUMN IF NOT EXISTS channels_synced_at timestamptz;
COMMENT ON COLUMN public.acculynx_contacts.channels_synced_at IS
  'When this contact''s phones and emails were last read in full (list sweep with includes, or the per-contact fallback). NULL = still owed. Migration 320.';
CREATE INDEX IF NOT EXISTS acculynx_contacts_channels_due_idx
  ON public.acculynx_contacts (account_key, channels_synced_at NULLS FIRST) WHERE archived_at IS NULL;

-- ── Resumable sweep cycle ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.acculynx_sync_watermark ADD COLUMN IF NOT EXISTS cycle_started_at timestamptz;
COMMENT ON COLUMN public.acculynx_sync_watermark.cycle_started_at IS
  'Start of the full-sweep cycle a resumed run is continuing (contacts). Rows not seen since this instant are archived only when the cycle completes; NULL when no cycle is in progress. Migration 320.';
