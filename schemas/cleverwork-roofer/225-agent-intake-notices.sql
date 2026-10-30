-- 225-agent-intake-notices.sql
-- Dedupe + audit ledger for Maya's "your email is now ticket PEC-xxx" outbound
-- (Chris, 2026-08-07): when Maya's mailbox intake opens a Linear ticket, the
-- requester gets a second email linking the ticket so they know it's tracked
-- and being worked. Sent by the `notices` phase of scripts/maya-gate.mjs —
-- one notice per intake issue, INTERNAL recipients only (outbound-guard
-- domain rules re-implemented host-side), from Maya's AgentMail service inbox.
-- Additive + idempotent. RLS: service_role only.
CREATE TABLE IF NOT EXISTS agent_intake_notices (
  issue_identifier text PRIMARY KEY,
  issue_title      text,
  issue_url        text,
  recipient_email  text NOT NULL,
  status           text NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','skipped_external','skipped_no_sender','failed','dry_run')),
  agentmail_thread text,
  note             text,
  sent_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_intake_notices ENABLE ROW LEVEL SECURITY;
