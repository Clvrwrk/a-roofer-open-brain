# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-19 14:05 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /project-handoff + /wrapup

---

## ⚠️ Read first — a second session is committing to this repo

Six `PEC-221` commits landed from a **parallel session** during this shift, and its
`git add` swept one of my staged files into its commit `5c1348c`. Two sessions are
also both bumping `app/command-center/src/lib/version.ts`, which will collide.

**Before starting work:** confirm whether that session is still running. Have
whichever session continues stage **specific paths**, never `git add -A`.

Its work materially affects mine — see *Decisions* on the credit-memo re-audit.

## Accomplished This Session

### Orgo QA desktop — rebuilt into the correct project (PEC-220)
- Provisioned `PE Site QA` — computer `3480fa38-35c6-4b86-a5fe-f62d0fb8f028`, instance `dac62bd2`, in the **established `PE-open-brain` project** (`8cf44774-…`) alongside Maya. Console: https://www.orgo.ai/desktops/dac62bd2
- Deleted the first desktop, which I had wrongly built in a **new** project (`pro-exteriors-open-brain`) — that is why its console URL 404'd. The empty project remains: `DELETE /api/projects/{id}` is **405**, remove it in the dashboard.
- Deps installed under **`/home/orgo/pe-qa`** (Orgo guidance: keep the ~8 GB system disk for scratch). Credentials in 1Password `CW_Master/ORGO_PE_SITE_QA`.
- `scripts/orgo-site-walker.mjs` — per-page speed, hangs, console errors, failed requests, click-through validation, surface-level vulnerability checks.

### QA agent identity + passwordless sign-in (docs/95)
- `scripts/qa-agent-auth.mjs` — `status` | `provision` | `login`.
- Provisioned `site-qa@agentmail.proexteriorsus.net` (AgentMail inbox) + WorkOS user `user_01M0EAPFD0CSBAR0BNV5NXQTSR`. Record in 1Password `PE_CC_DEV_Team/PE-Site-QA-WorkOS`.
- **Mechanism proven end to end before building:** WorkOS Magic Auth delivers a 6-digit code to the inbox and the code is readable straight out of the AgentMail API.

### Corrections to my own earlier work
- **Retracted the "Maya's Orgo desktop is gone" finding.** Her desktop (`37b262e0-…` / instance `20ee4678`, project `PE-open-brain`) is **running**, up 16 days, with `maya-slack-listener` up 9 days. Her runtime was never down.
- **Fixed the walker's auth detection.** It reported gated pages as healthy 200s because WorkOS/AuthKit redirects to `<tenant>.authkit.app` with no `signin`/`workos` substring in the URL. Now checks title and body too — verified live as `GATED`.

## Git State
- **Branch:** `main` (== `origin/main`)
- **Last commit:** `5c1348c` — from the parallel session
- **Uncommitted changes:** none (this handoff commits next)

## Task Cut Off
None mid-block. One step is **deliberately unfinished**: the QA agent's first sign-in (below).

## Next Task — Start Here

**Task:** Complete the QA agent sign-in, then run the first full site walk.

**What to do:**
1. `node scripts/qa-agent-auth.mjs login`
   Expect: code sent → read from inbox → exchanged → `access_token` + `refresh_token` issued.
2. Sign in once on the QA desktop so the browser profile holds a session: open
   https://www.orgo.ai/desktops/dac62bd2, launch Chrome with
   `--user-data-dir=/home/orgo/pe-qa/chrome-profile`, sign in at `cc.proexteriorsus.net`.
3. Copy `scripts/orgo-site-walker.mjs` to `/home/orgo/pe-qa/` and run it.
4. Schedule daily alongside the 06:00 CT sweep (docs/92).

**If `login` fails with `invalid_client`:** the `client_id` is wrong. The live app uses
`client_01KTF450QBY957ASEZ8JXZKMV4` — **none** of the three values in 1Password match it.
Override with `WORKOS_CLIENT_ID=…` rather than "fixing" it back to a stored value.

**If the walker reports `session expired`:** repeat step 2. It stops on purpose rather
than reporting every page as broken.

**Prompt to use:** "Read docs/handoffs/current.md. The QA agent sign-in is done and I have signed in to WorkOS on the Orgo desktop. Deploy scripts/orgo-site-walker.mjs to /home/orgo/pe-qa, run a full walk, and report every finding."

## Decisions Made This Session

- **QA agent email uses `agentmail.proexteriorsus.net`, not `cc.proexteriorsus.net`.** AgentMail serves only four domains and `cc.*` is not one. Making it one means repointing the **MX of the Command Center's own domain**, which already carries the Google Workspace mailboxes for the named agent fleet. The agentmail subdomain is also the *only* option where the agent can **read its own code** — which is the entire point. Same convention the `ob-*` agents already use.
- **This is WorkOS User Management + Magic Auth, NOT WorkOS Agent Auth.** The latter still returns live **501 not_implemented** (`/agent/auth`, `/oauth2/token`); `src/lib/agent-auth.ts` is discovery-only. Standing it up needs signing keys, a token store, a trusted-issuer list, replay protection and the human-ownership bridge — a security-critical build, not a provisioning step.
- **No password is set for the QA agent, by design.** Magic Auth means no secret a human must type and none stored to leak.
- **`GET /api/workspaces` is not an inventory endpoint.** It returned 0 while three projects existed. I acted on that twice — it produced both a false outage report and a desktop in the wrong project. Probe `GET /api/computers/{id}`; use `GET /api/projects` for inventory.
- **The credit-memo re-audit result may now be stale.** I withdrew two credits *because* the Wichita quote was not an in-force agreement. The parallel session's `22f7a58 accept the SRS Wichita quote as the governing price agreement` changes that premise — **re-run the re-audit before acting on the drafts**.

## Blockers Requiring Human Action

1. **QA agent sign-in** — `node scripts/qa-agent-auth.mjs login`. The harness safety classifier blocks me from performing a credential exchange; that gate is correct and was not worked around.
2. **One-time WorkOS sign-in on the QA desktop** — step 2 above. An agent must not do this.
3. **Three stale WorkOS client IDs in 1Password** — `PROEXTERIORS_WORKOS_PRODUCTION_CLIENT_ID`, `PROEXTERIORS_WORKOS_CLIENT_ID`, `WORKOS_CLIENT_ID`. None match the live app. Anything else reading them will fail the same way.
4. **Credit-memo drafts** (`.cm-reaudit/drafts/`) — re-run the re-audit first given decision 5 above, then decide whether to supersede in the ledger and send. Nothing has been sent.
5. **Parallel-session collision** — see the banner at the top.
6. **`master.env` is malformed** — lines 1317/1320 are executed as shell commands (`command not found: Morrison`, `permission denied: /`). Likely an unquoted multi-line value; anything after it may not be loading.
7. Carried over: PEC-213 Wichita coverage · PEC-111 (IKO office?) · PEC-177 (Titan quote) · PEC-149…158 (6/6 provisioning confirm — note `maya.chen.last_sign_in_at` = `2026-06-25T01:20:51` matches PEC-157 almost exactly, so those were legitimate agent sign-ins) · PEC-172 (Billy Cowell access) · PEC-203 (fire the export).

## Verification Commands
1. `git status --short` — empty
2. `git rev-list --left-right --count HEAD...origin/main` — `0	0`
3. `node scripts/qa-agent-auth.mjs status` — inbox EXISTS, WorkOS user EXISTS
4. `node scripts/site-quality-sweep.mjs --static` — 0 errors, 2 warnings
5. `curl -s https://cc.proexteriorsus.net/healthz` — `status: ok`

## Full Context

### What was built across ALL sessions
See `docs/handoffs/archive/`. **This session adds:** the Orgo QA desktop rebuilt into `PE-open-brain`; the page-by-page site walker; the QA agent's WorkOS identity with passwordless Magic Auth sign-in; and corrections to two of my own earlier findings.

### Architecture decisions
- **Agent mailboxes: two patterns.** `@cc.proexteriorsus.net` → Google Workspace (named fleet; codes reachable only via the Gmail/Composio path). `@agentmail.proexteriorsus.net` → AgentMail (**API-readable**, so an agent can self-serve its own sign-in code). Choose by whether the agent must read its own mail.
- **Never trust a URL alone to detect an auth wall.** WorkOS/AuthKit returns **200** at `<tenant>.authkit.app`. Check title and body.
- **`/user_management/authenticate` is a token endpoint** — `client_id` + `client_secret` go in the **body**; a Bearer header alone yields `invalid_client`.
- **Orgo:** API base is `/api` (not `/api/v1` — those 404). No `GET /computers` list (405). Bash calls cap at ~590s, so long installs must be backgrounded on the box.
- **Quarantine is the pattern for malformed ingest rows** — archive the atom, add a CHECK so ingest fails closed, never delete.

### Key invariants (never violate)
- Silo doctrine: agreement = (vendor, PE office); unknown office ⇒ No-Price, fail closed.
- UOM: compare only in the vendor's pricing UOM via `price_per_uom` + `v_item_uom_map`.
- Additive migrations; archive never delete; QBO prod read-only; no secrets in the repo.
- **A fix isn't fixed until verified through the LIVE call path.**
- Agents do not create accounts, enter passwords, or close security alerts on inference.
- **Verify before reporting an outage.** Two confident wrong calls this session both came from trusting a single API signal.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | cc.proexteriorsus.net via Coolify from origin/main (`/healthz` buildCommit) |
| Supabase (prod) | rnhmvcpsvtqjlffpsayu — schemas through **232** |
| Hetzner agent host | PE-US-AGENTS 178.156.203.23 — abc-sync 03:30 ET, maya-gate /15min, jt-sentinel 10:00 PT, qbo/wip Thursday, site-sweep 06:00 CT |
| Orgo project | **`PE-open-brain`** `8cf44774-2b46-4089-8bfe-4deb1b078e46` |
| Orgo — Maya | `Maya Chen` `37b262e0-…` · instance `20ee4678` · **running**, listener up since 8/10 |
| Orgo — QA | `PE Site QA` `3480fa38-…` · instance `dac62bd2` · https://www.orgo.ai/desktops/dac62bd2 |
| WorkOS | client_id **`client_01KTF450QBY957ASEZ8JXZKMV4`** (live; 1P copies are stale). Key: 1P `PE_CC_DEV_Team/WorkOS - PE_CC_DEV_TEAM` |
| QA agent identity | `site-qa@agentmail.proexteriorsus.net` · user `user_01M0EAPFD0CSBAR0BNV5NXQTSR` · 1P `PE_CC_DEV_Team/PE-Site-QA-WorkOS` |
| AgentMail | 4 domains; `cc.proexteriorsus.net` **not** among them. Key: 1P `CW_Master/AGENTMAIL_API_KEY` |
| Linear | PE-CC-DevTeam — PEC-220 (corrected), PEC-221 (CM re-audit + parallel session's work) |
