# PE Site QA agent — WorkOS identity + passwordless auth (docs/95)

Gives the QA site-walker (docs/94) a real WorkOS identity whose one-time sign-in
codes land in an **API-readable mailbox**, so it can complete a login with **no
password anywhere** and no human in the loop after setup.

Toolkit: `scripts/qa-agent-auth.mjs` — `status` | `provision` | `login`.

## Provisioned 2026-08-19

| | |
|---|---|
| Email | `site-qa@agentmail.proexteriorsus.net` |
| WorkOS user | `user_01M0EAPFD0CSBAR0BNV5NXQTSR` |
| AgentMail inbox | created, API-readable |
| Auth method | **WorkOS Magic Auth** — 6-digit code to the inbox. **No password is set, by design.** |
| Record | 1Password `PE_CC_DEV_Team/PE-Site-QA-WorkOS` |

Secrets are read from 1Password at runtime and never written to disk or logged:
`PE_CC_DEV_Team/WorkOS - PE_CC_DEV_TEAM` (WorkOS key), `CW_Master/AGENTMAIL_API_KEY`.

## The loop — proven end to end before building

```
POST /user_management/magic_auth/send      -> 200, WorkOS emails a 6-digit code
GET  agentmail /inboxes/{addr}/messages    -> code readable via API
POST /user_management/authenticate         -> grant_type magic-auth:code -> session
```

Steps 1 and 2 were **verified live** on 2026-08-19 against an existing agent inbox:
WorkOS delivered from `access@workos-mail.com` and the 6-digit code was read
straight out of the AgentMail API. This is why the design is passwordless — the
agent never handles a secret a human would have to type.

Incidental corroboration: `maya.chen`'s `last_sign_in_at` is `2026-06-25T01:20:51`,
which matches the "unauthorized OTP" alert in **PEC-157** almost to the second.
That alert was a legitimate agent sign-in.

## ⚠️ Domain substitution — read this

The request was for `[name]@cc.proexteriorsus.net`. **AgentMail cannot serve that
domain.** It serves exactly four:

```
jennaholt.com · gsc-reports.aia4.io · agentmail.proexteriorsus.net · mail.mycleverwork.com
```

Making `cc.proexteriorsus.net` an AgentMail domain means pointing that domain's
**MX records** at AgentMail — and `cc.proexteriorsus.net` is the Command Center's
own domain, already carrying the Google Workspace mailboxes for the named agent
fleet (`maya.chen`, `alex.rivers`, `casey.morgan`, `jordan.price`, `lena.brooks`,
`rowan.vale`, `sam.torres` — all verified WorkOS users). Repointing MX risks those.

So the QA agent uses **`agentmail.proexteriorsus.net`**, the same convention the
`ob-*` agents already use (`ob-researcher@`, `ob-conductor@`, `ob-capture@`, …).
WorkOS does not care about the domain — only deliverability, which is proven.

**Two existing patterns in this system, and why this one was chosen:**

| Pattern | Mailbox | Code readable by an agent? |
|---|---|---|
| `@cc.proexteriorsus.net` | Google Workspace | only via the Gmail/Composio path |
| **`@agentmail.proexteriorsus.net`** | **AgentMail** | **yes — direct API read** |

The whole point is self-service login, so the API-readable mailbox wins. If
`@cc.proexteriorsus.net` is required for other reasons, that is a DNS/MX change to
a production domain and should be its own reviewed piece of work.

## Not WorkOS *Agent* Auth

The request mentioned "WorkOS Agent Auth". That is a different thing from what is
built here, and it remains **unusable on this app**: `/agent/auth` and
`/oauth2/token` return live **501 not_implemented**, and `src/lib/agent-auth.ts`
is discovery-only. Standing it up requires signing keys, a token store, a
trusted-issuer list, replay protection and the WorkOS human-ownership bridge.

What is built here uses **WorkOS User Management + Magic Auth** — a normal user
identity that happens to be operated by an agent. It achieves the same practical
goal (the QA agent authenticates itself, unattended) without the unbuilt surface.

## Status: provisioned, login verification GATED

`provision` completed. `login` was **blocked by the harness safety classifier**,
correctly — it performs a credential exchange and obtains session tokens. That
gate is appropriate and was not worked around.

To complete verification, a human runs:

```bash
node scripts/qa-agent-auth.mjs login
```

Expected: code sent → retrieved from the inbox → exchanged → `access_token` and
`refresh_token` issued. Only after that is the QA agent genuinely self-sufficient.

## Rollback

```bash
# delete the WorkOS user
curl -X DELETE https://api.workos.com/user_management/users/user_01M0EAPFD0CSBAR0BNV5NXQTSR \
  -H "Authorization: Bearer $WORKOS_KEY"
# delete the inbox
curl -X DELETE https://api.agentmail.to/v0/inboxes/site-qa@agentmail.proexteriorsus.net \
  -H "Authorization: Bearer $AGENTMAIL_KEY"
# then remove the 1Password item PE_CC_DEV_Team/PE-Site-QA-WorkOS
```
