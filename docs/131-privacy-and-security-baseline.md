# 131 — Privacy and security baseline (2026-11-11)

Source: the privacy review of 2026-11-11 (Claude Doc "Privacy review of the Pro Exteriors stack"). Chris asked for all recommendations to be built in. This file records the decisions, the written policy, the retention schedule and the breach plan. **Drafts for Chris and counsel to confirm; not legal advice.**

```
browser ──HTTPS (HSTS)──> Cloudflare proxy* ──> Hetzner (Traefik) ──> cc / crm / hr / pm
                                                                    │
                                     server role only (no anon) ────┴──> Supabase (prod)
AI agents ──> agent_reader (read-only, no hr schema) ───────────────────> Supabase (prod)
* cc, crm, hr and staging-hr are still DNS-only; turning the proxy on is a Chris action.
```

## 1. What is built in code

| Recommendation | Where | State |
|---|---|---|
| Close anonymous reads (call list, two pricing tables) and anonymous fleet driver rights | `schemas/cleverwork-roofer/342-…` | Migration ready; apply to prod |
| Read-only agent role without HR access | `agent_reader` in mig 342 | Needs LOGIN + password set by a human |
| HSTS and browser protection headers on cc | `app/command-center/src/lib/security-headers.ts` | Ships with next cc deploy |
| HSTS on crm and hr; HR sensitive-field encryption, masking, read/export log; retention purge job | Clvrwrk/CRM_PWA (companion PR) | Draft PR |
| Secret scanning in CI | workflow file per repo | Needs Chris to add (agent tokens lack workflow scope) |

## 2. Information security policy (draft)

1. **Least access.** Browsers never hold service credentials. Anonymous (public key) access to any table holding personal data is forbidden; new tables default to no anon/authenticated grants. Agents use `agent_reader`, never service or owner credentials, for reads; writes go through the reviewed app paths.
2. **Sensitive personal data** (Social Security and tax IDs, bank account numbers, driver license numbers, birth dates, I-9 and E-Verify data, background check status, medical or injury information) is stored only where a feature needs it. Full tax IDs and bank numbers stay at the e-signature or accounting provider; hr keeps the last 4 digits and a reference. Anything stored is encrypted per field with a key in Supabase Vault, shown masked by default, and every reveal or export is logged.
3. **I-9 and medical records** are kept apart from the personnel file and readable only by the HR admin role.
4. **MFA** on every admin account: Supabase, WorkOS, Cloudflare, Hetzner, Coolify, GitHub, 1Password, Sentry.
5. **Secrets** live in 1Password and Supabase Vault only. No secrets, SSNs, pay or health details in code, tickets, Slack, Linear, Fast.io, Dropbox notes or agent memory.
6. **Processors** each have a signed data processing agreement on file before they receive personal data (list in section 5).
7. **Review** every six months and whenever a new kind of sensitive data is added.

## 3. Retention schedule (draft; counsel confirms)

| Record | Keep for | Then |
|---|---|---|
| Form I-9 | 3 years after hire or 1 year after separation, whichever is later | Destroy |
| E-Verify case data | Same as the I-9 | Destroy |
| Payroll and time records | 3 years (FLSA); tax records 4 years (IRS) | Destroy |
| Certified payroll (public work) | 3 years after project completion, or longer if the contract says so | Destroy |
| Background check reports | Stay at the vendor; hr keeps status and date only for the length of employment + 1 year | Delete status |
| MVR results | Length of driving approval + 1 year | Delete |
| Personnel file | Separation + 4 years | Destroy |
| Medical / injury records, OSHA 300 logs | OSHA logs 5 years; exposure records 30 years where they apply | Destroy |
| 1099 contractor W-9 reference, 1099 exports | 4 years after the tax year | Delete |
| Applicants not hired | 1 year (2 for federal contractors) | Delete |
| Prospect call lists (`call_priority_today`) | Replaced on each refresh | Overwrite |
| Backup and one-off tables (`_backup_*`, `t9_*_backfill`) | 90 days after creation | Archive off-database, then drop by reviewed migration |

The CRM_PWA companion PR adds `hr.retention_rules` with these rows and a **dry-run** purge report. Nothing is deleted automatically until Chris approves turning deletion on (hard rule 1 still applies to atoms).

## 4. Breach response plan (draft)

1. **Detect and contain (hour 0–4).** Whoever notices tells Chris at once. Rotate the exposed keys, close the access path, keep logs (Supabase, Sentry, Traefik, Cloudflare). Do not delete evidence.
2. **Assess (day 1–3).** What data, whose, how many people per state, was it encrypted. Call counsel and the cyber insurer before notifying anyone outside the company.
3. **Notify.** Florida and Colorado: affected people within 30 days of determining a breach (Florida AG if 500+; Colorado AG if 500+ Coloradans). Texas: people within 60 days, AG within 30 days if 250+ Texans. Georgia, Kansas, Missouri: without unreasonable delay (Missouri AG if 1,000+). Credit bureaus where the state threshold is met.
4. **Fix and record.** Root cause, fix, and a short write-up in `docs/`.

Contacts to fill in: Chris (decision owner), counsel, cyber insurer, Supabase support, Hetzner support.

## 5. Processors (data agreement on file?)

Supabase, Hetzner, Cloudflare, WorkOS, Sentry, Anthropic, Linear, Slack, Fast.io, Dropbox, Google Maps, FAL, KIE, AccuLynx, CompanyCam, JobTread, HighLevel, QuickBooks, ZoomInfo, ABC Supply, FrankCrum, and the future e-signature, background check and E-Verify vendors. Mark each one when its agreement is filed.

## 6. Actions only Chris can take

- Turn on the Cloudflare proxy for cc, crm, hr, staging-hr; then limit the Hetzner firewall on 80/443 to Cloudflare's address ranges.
- Move the two Pro Exteriors Supabase projects into their own organization; turn on MFA for all members; confirm the backup plan and point-in-time recovery; test one restore.
- Set `agent_reader` LOGIN with a 1Password-held password and point agent tools at it.
- Add the secret scanning workflow to each repo.
- Collect the data agreements; ask the broker about cyber insurance.
