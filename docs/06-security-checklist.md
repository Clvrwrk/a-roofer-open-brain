# Security Checklist — Pre-Go-Live Gate

> **What this is:** the gate a Cleverwork operator runs before a brain is considered live for a client. Every item below must be in the `confirmed` state before the first real job data enters the brain.
>
> **Credit:** The security principles and threat model described here are re-expressed from the Dynamous workshops security curriculum developed by Cole Medin (proprietary-community license; not reproduced — cited and re-expressed in Cleverwork's own words as applied to this brain's specific architecture).
>
> **Threat model summary:** this brain ingests untrusted external content (AccuLynx webhooks, Slack messages, debrief transcripts, web research results) AND has write access to a database and Slack workspace. A single malicious webhook or a carefully crafted debrief transcript could — without proper defenses — instruct an agent to exfiltrate client data or write incorrect atoms. The defenses below exist to break that chain at multiple independent layers.

---

## How to Use This Checklist

Work through each item. For each one, mark it `[ ]` (not checked), `[~]` (partial), or `[x]` (confirmed). Items marked **[CRITICAL]** must be `[x]` before go-live. Items marked **[IMPORTANT]** must be at least `[~]` before go-live and `[x]` within the first 30 days. **[NICE-TO-HAVE]** items improve security posture but do not block go-live.

Run `./scripts/verify-deployment.sh` first — it automates several of the checks below and reports results you can carry into this manual checklist.

---

## 1. Row Level Security (RLS) — Every Table, No Exceptions

### 1.1 RLS enabled on all public tables **[CRITICAL]**

Every table in the `public` schema must have RLS enabled with a `service_role`-only policy. The MCP container is the sole caller; no other role should be able to read or write directly.

**Verify:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Every row must show `rowsecurity = true`.

**Tables to check (minimum):** `thoughts`, `property`, `jurisdiction`, `regulatory_snapshot`, `job`, `client`, `insurance_claim`, `manufacturer_warranty`, `atom_access_log`, `consent_flags`, and any additional tables created by custom migrations.

**If any table shows `rowsecurity = false`:** the migration for that table did not apply correctly, or a manual `ALTER TABLE` was run that disabled RLS. Re-apply the relevant migration file. Do not add client data until this is confirmed.

- [ ] All `public.*` tables show `rowsecurity = true`

### 1.2 Service-role key is the only key with write access **[CRITICAL]**

The `SUPABASE_SERVICE_ROLE_KEY` is used only inside MCP containers. `PUBLIC_SUPABASE_ANON_KEY` is used only for the dashboard read path (read-only, restricted by RLS policies).

**Verify:**
- The service role key is stored only in the `brain-mcp` Coolify app env or vault, not in a committed file and not in the dashboard.
- The dashboard code references only `PUBLIC_SUPABASE_ANON_KEY` and `PUBLIC_SUPABASE_URL`. Grep the dashboard source for `SERVICE_ROLE` — if found outside of an MCP container, that is a credential leak.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored only in `brain-mcp` Coolify env / vault
- [ ] Dashboard source uses only `PUBLIC_SUPABASE_ANON_KEY`

---

## 2. Historian and Researcher Run as Separate Containers with Separate Keys

This is a non-negotiable architectural security boundary, not just an organizational convention. The Historian reads only from the client's brain and never touches the public internet. The Researcher reads only from outside and never reads from the client's brain. Running them as separate MCP containers with separate access keys closes a textbook prompt-injection exfiltration path: a malicious web page the Researcher visits cannot instruct it to "also look in the client's memory for X" because the Researcher's access key does not grant access to `public.thoughts`.

### 2.1 Historian and Researcher are separate MCP containers **[CRITICAL]**

**Verify:** Coolify shows separate `brain-mcp` and `researcher` resources, with separate public/internal URLs and separate env sets. `BRAIN_MCP_URL` and `RESEARCHER_MCP_URL` must not be the same URL.

- [ ] `brain-mcp` and `researcher` are separate deployed containers

### 2.2 Historian and Researcher have separate access keys **[CRITICAL]**

`OB_ACCESS_KEY_HISTORIAN` and `OB_ACCESS_KEY_RESEARCHER` must be different values, each generated independently.

**Verify:** The `brain-mcp` Coolify env contains `OB_ACCESS_KEY_HISTORIAN`; the `researcher` Coolify env contains `OB_ACCESS_KEY_RESEARCHER`; confirm they are not the same value.

- [ ] `OB_ACCESS_KEY_HISTORIAN` != `OB_ACCESS_KEY_RESEARCHER` (confirmed different values)

### 2.3 Historian path has no outbound external retrieval **[CRITICAL]**

The Historian MCP container source must not contain any `fetch()` calls to external URLs. It reads from the Supabase database only.

**Verify:** Review `server/` and the `brain-mcp` container entrypoint. It may call Supabase PostgREST, but it must not call public web/search/scrape APIs.

- [ ] `brain-mcp` source contains no public-web retrieval path

### 2.4 Researcher container has no database read access **[CRITICAL]**

The Researcher container must not use `SUPABASE_SERVICE_ROLE_KEY` or any key that grants access to `public.thoughts`. It calls external APIs only.

**Verify:** The `researcher` Coolify env does not contain `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, or any database credential. Its source does not initialize a Supabase database client.

- [ ] Researcher container has no Supabase database credential

---

## 3. No Secrets in Git History

### 3.1 `.env` is git-ignored and has never been committed **[CRITICAL]**

**Verify:**
```bash
git log --all --full-history -- .env
git log --all --full-history -- "*.env"
```

Both commands should return empty. If not: rotate every key that was committed, remove the file from git history using `git filter-repo` or `BFG Repo Cleaner`, and force-push.

- [ ] `.env` has never appeared in git history

### 3.2 No credentials in any committed file **[CRITICAL]**

**Verify:**
```bash
git log --all -p | grep -E "(xoxb-|sk-ant-|sbp_|eyJ)" | head -20
```

These patterns catch Slack bot tokens, Anthropic API keys, Supabase service role JWTs, and base64-encoded credentials. If any matches are found, rotate the affected key and clean history.

- [ ] No credential patterns found in git history

### 3.3 `.gitignore` covers all secret files **[IMPORTANT]**

The repo's `.gitignore` must include: `.env`, `*.env`, `*.pem`, `*.key`, `*_rsa`, `*.p12`, `.supabase/`.

- [ ] `.gitignore` covers all secret file patterns

---

## 4. Input Sanitization — Untrusted Content Handling

The brain ingests content from AccuLynx webhooks, Slack messages, debrief transcripts, and external web research. Any of these can carry injection attempts. Defense is multi-layer.

### 4.1 External data is tagged before entering agent context **[CRITICAL]**

Every piece of external content that passes through an MCP container and into an agent prompt must be wrapped in trust-boundary tags (e.g. `<external_data source="acculynx" trust="untrusted">...</external_data>`) with an explicit instruction to the agent that content inside these tags is data, not instructions.

**Verify:** Grep the Capture and Researcher container source for the trust-boundary wrap function.

- [ ] Trust-boundary wrapping present in Capture container
- [ ] Trust-boundary wrapping present in Researcher container

### 4.2 Webhook payloads are signature-validated before processing **[CRITICAL]**

AccuLynx and Slack both sign their webhook payloads with a secret (HMAC-SHA256). The MCP container must validate this signature before acting on the payload. A missing or failed signature check means any HTTP caller can trigger brain actions.

**Verify:** Grep the AccuLynx bridge and Slack handler container source for HMAC signature validation.

- [ ] AccuLynx webhook signature validation present
- [ ] Slack event signature validation present

### 4.3 Injected closing-tag attacks are escaped **[IMPORTANT]**

External text that contains the closing trust-boundary tag pattern (e.g. `</external_data>`) must be escaped before it is wrapped. Otherwise an attacker can break out of the trust boundary by including the closing tag in their payload.

- [ ] Closing-tag escape present in trust-boundary wrap function

---

## 5. Consent Defaults Reviewed

### 5.1 `consent.cross_client_default` discussed with client **[CRITICAL]**

This value controls whether property atoms are shared across Cleverwork clients in different trades. The client must understand what this means before their first job is closed and debriefed. Document the conversation.

- [ ] Cross-client consent default discussed and confirmed with client
- [ ] Value in `config/roofer.config.yaml` matches client's stated preference

### 5.2 `publishable_external_default: false` confirmed **[IMPORTANT]**

The default for EEAT external publication is `false` — atoms are not published externally without explicit per-atom approval through the Marketing → client approval flow. Confirm this default has not been changed unless intentional.

- [ ] `consent.publishable_external_default` is `false` (or explicitly confirmed if changed)

---

## 6. Backup and Restore Verified

### 6.1 First backup completed and encrypted **[CRITICAL]**

```bash
./scripts/brain-backup.sh
```

Confirm a backup file exists in the configured backup location, is encrypted (file is not plaintext SQL), and the backup timestamp is recent.

- [ ] First encrypted backup completed

### 6.2 Restore tested in a sandbox **[CRITICAL]**

A backup you have never tested restoring is not a backup. Before go-live:

1. Create a second Supabase project (free tier is fine).
2. Restore the backup to that project: `./scripts/brain-restore.sh --target <sandbox-project-ref>`.
3. Run `./scripts/brain-smoke-test.sh --target <sandbox-project-ref>`.
4. Confirm atom count matches the source brain.
5. Delete the sandbox project.

- [ ] Restore to sandbox completed and smoke test passed
- [ ] Sandbox project deleted after test

---

## 7. Access Keys — Rotation Plan Documented

### 7.1 All keys are rotatable **[IMPORTANT]**

For every key in `config/.env.example`, there must be a documented procedure for revoking the old key and generating a new one. This does not need to be elaborate — a one-line note per integration ("AccuLynx: Settings → API → Revoke + New") is sufficient. Document it in `deployment/remote/key-rotation.md` or the client's password-manager record.

- [ ] Key rotation procedure documented for all active integrations

### 7.2 Each per-container access key is unique **[IMPORTANT]**

`OB_ACCESS_KEY_HISTORIAN`, `OB_ACCESS_KEY_RESEARCHER`, and `OB_ACCESS_KEY_CAPTURE` must each be generated independently (use `openssl rand -hex 32` for each). A shared key means a compromised container exposes more than one boundary.

- [ ] Three unique access keys generated and stored only in the appropriate Coolify env / vault entries

---

## 8. Slack Rate Limiting and Allowlist

### 8.1 Slack bot allowlist is fail-closed **[IMPORTANT]**

The Slack event handler must have an allowlist of permitted user IDs or workspace IDs. An empty or misconfigured allowlist must default to blocking all access, not permitting all access.

**Verify:** Read the Slack handler source. Confirm that the allowlist check returns `false` (deny) when the allowlist is empty or the user is not on it.

- [ ] Slack allowlist is fail-closed (empty allowlist = all blocked)

### 8.2 No external Slack commands accept unvalidated input as brain instructions **[CRITICAL]**

Any Slack slash command or bot mention that accepts free-text input from users must wrap that input in trust-boundary tags before it reaches an agent. Users who can message the Slack bots are not automatically trusted to give the brain instructions — even internal team members.

- [ ] Slack input is trust-boundary-tagged before reaching agents

---

## Pre-Go-Live Summary

Before handing the brain to the first live job:

| Gate | Status |
| --- | --- |
| RLS on all tables | [ ] |
| Service role key only in `brain-mcp` Coolify env / vault | [ ] |
| Historian/Researcher separation confirmed | [ ] |
| No secrets in git history | [ ] |
| Webhook signature validation present | [ ] |
| Consent defaults confirmed with client | [ ] |
| First backup completed and restore tested | [ ] |
| `verify-deployment.sh` all-pass | [ ] |

All rows must be checked before the brain is live.

---

## Ongoing Security Cadence

Once live, security is not a one-time gate — it is a recurring practice:

| Cadence | Action |
| --- | --- |
| Weekly | Review MCP container on Hetzner logs for unexpected error patterns or unusual request volumes |
| Monthly | Maintenance Standardize phase audits `atom_access_log` for anomalous cross-client access patterns |
| Quarterly | Rotate all access keys proactively (or immediately on any team member offboarding) |
| Quarterly | Run the disaster-recovery drill (restore from backup, validate, document time-to-recovery) |
| On any incident | Rotate all keys for affected integrations; review audit logs for the 30 days preceding the incident |
