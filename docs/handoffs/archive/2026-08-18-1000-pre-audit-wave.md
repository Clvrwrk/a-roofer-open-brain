# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-11 21:35 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /wrapup

---

## Accomplished This Session

### Maya intake wave — walkthrough + dispositions (PEC-206..209)

- Linear `PEC-206`: closed Done, Chris-verified (Lucinda's manual SRS 7/29–7/31 QBO upload = the missing PEC-203 gap week); resolution comment + dedupe warning for next QB export; Lucinda closure email drafted in Chris's Gmail (draft r-3173330038746053537, unsent fallback); Maya reply task queued via Agent Todo.
- Linear `PEC-207`: reprocessed from ledger evidence — attached "invoice" 2012600520-001 is a credit memo that reverses 2012558082-001's OSB line (99 SH @ $16.99) and rebills at $12.00 = ABC-honored DFW contract price; OSB 50MI71648 absent from ALL office agreements; 9 more DFW invoices since 1/6/26 at $16–16.99 (~$700–750 recovery). Better-ticket rewrite delivered in chat; pending comment + moved to Agent Todo for Maya's own-mailbox reprocess.
- Linear `PEC-208`: hypothesis documented — invoice 2012635922-001 is a Commercial-account row (ship-to "Commercial", PO 25-1535) so QB export's Check No=job# / Description=client-name rules break on Commercial rows; pending comment + Agent Todo for Maya reprocess vs Lucinda's screenshot.
- Linear `PEC-209`: full forensic audit delivered in chat (see Decisions + Next Task).

### Slack owner-notice path — FIXED end-to-end

- Root cause: #pe-cc-dev-team (C0BNVF99Y74) is a **private** channel; Maya's bot was never invited (bots cannot self-join private channels). Chris invited @maya_chen_accounting + @openbrain; verified live — Maya posted ts `1786499981.979699`.

### Canonical internal-domain rule (Chris 2026-08-11)

- `deployment/remote/orgo/maya-slack-listener/policy.mjs`: ACKNOWLEDGEMENT_DOMAINS → the four apexes `proexteriorsus.com, proexteriorsus.net, cleverwork.io, aia4.io` (+ true subdomains; was missing proexteriorsus.net + cleverwork.io).
- `mailbox-hermes.mjs`, `capability-agent.mjs`, `SOUL.md`: prompt-text domain lists aligned.
- `test/mailbox.test.mjs`: assertions updated (cleverwork.io now internal); 121/121 pass. Commit `4d6a87f`.
- Already-correct, unchanged: `app/command-center/src/lib/outbound-guard.ts`, `scripts/maya-gate.mjs`.

### Orgo listener ship kit

- `scripts/orgo-ship-maya-listener.sh` (commit `de0e24e`): full release ship over Orgo API bash transport (`POST /api/computers/{id}/bash` — no SSH exists) — git-HEAD payload, chunked base64 + sha256 verify, root staging at `/root/pec78-maya-slack-listener-staging`, runs release's own `install-disabled.sh` (hash-pinned, auto-rollback, verified-stopped), starts supervisord, verifies deployed policy + tree hash. Supports `SHIP_STEP=probe|upload|stage|install|start|verify`.

## Git State
- **Branch:** main (== origin/main)
- **Last commit:** `de0e24e` — "feat(deploy): Orgo ship script for Maya listener release (API bash transport, sha256-verified, installer-driven)"
- **Uncommitted changes:** memory/handoff files from this wrap-up (committed as part of wrap-up commit)

## Task Cut Off
None — session ended at a clean boundary. Listener ship is prepared but NOT executed (blocked on credential permission, see Blockers).

## Next Task — Start Here

**Task:** Ship the Orgo listener release, then verify Maya's reprocess results.
**What to check / do:**
1. Confirm ship ran (Chris runs: `export ORGO_API_KEY="$(op read 'op://CW_Master/ORGO_API_KEY_MASTER/password')" && bash scripts/orgo-ship-maya-listener.sh`). Expect "installed and verified stopped" then RUNNING status + tree hash; policy grep must show cleverwork.io.
2. Check PEC-206/207/208: claimant claimed all three at 02:06–02:16Z (Agent Working) under the OLD release — read Maya's findings comments in Agent Review. PEC-206 email task should be [BLOCKED] (linear-work mode has sends removed) — Chris's Gmail draft is the fallback for Lucinda.
3. Then PEC-209 remediation (Chris approved "process as noted"): (a) additive migration — resolve pricing office from servicing branch (`branch_number_extracted` → `vendor_branches.pricing_territory_office_id`), ship-to home branch as tiebreaker only, fail closed on disagreement; (b) widen `agent_intake_notices` status CHECK to add `'ack_in_thread'` + backfill PEC-206/207 failed rows; (c) re-audit sweep: 38 invoices ~$135K wrong-office (6 Wichita $65K incl. 2009034778-001 $32.5K; 7 Denver $38K; 21 unmapped $30K); (d) no-benchmark accept threshold → human review above $ cap.

**If the ship's install step times out** (Orgo API limit vs npm ci): rerun with `SHIP_STEP=install`, or run the same commands from Maya's Orgo dashboard terminal (https://www.orgo.ai/desktops/c681e86d).

**Prompt to use:** "Read docs/handoffs/current.md. Verify the Orgo listener ship + Maya's PEC-207/208 reprocess comments, then start PEC-209 remediation (a)-(d)."

## Decisions Made This Session

- **#pe-cc-dev-team is private — bot invites are a human step.** Do not re-investigate `channel_not_found` as a token issue; verify membership first.
- **Agent Todo is THE execution gate.** The Orgo listener's claimant polls every 5 min and claims only CAT-linked `[MAYA]` children in exactly Agent Todo; all work terminates in Agent Review. No central orchestrator exists; Linear authority is pinned server-side in `/api/agent/linear-orchestration`.
- **Linear-work mode cannot send email** (sends + financial mutations removed) — Maya's only sanctioned sends are intake-time receipts. A Chris-approved closure-reply capability would be a deliberate A3, not a config flip.
- **Maya's Gmail = Composio OAuth API, not the Orgo desktop.** Verified in code; "from her Workspace account" is true in identity, API in mechanism.
- **`TOOL_VERSION` is a Composio tool pin, NOT a release stamp — never bump it for releases.** A separate deployed-release stamp/heartbeat is still needed.
- **PEC-209 root cause:** `v_invoice_pricing_office` resolves via ship-to **home branch** (account default = br 11 Fort Worth → Richardson) instead of the invoice's servicing branch (113 Wichita). Also the 6/30 backfill audit failed open (no benchmark → accept-nochallenge on a $19.9K line).
- **Email-context skill (Maya) is drafted but NOT codified** — held per Chris until Maya's own-runtime reprocess of 207/208 is graded.

## Blockers Requiring Human Action

1. **Run the listener ship** — needs `ORGO_API_KEY` from 1Password; the harness classifier blocked agent access to the master key + remote exec. Either Chris runs the one-liner above, or grants a Bash permission rule for `op read` on ORGO_* + curl to www.orgo.ai and tells the agent to drive.
2. **Send (or discard) the Lucinda draft** in Chris's Gmail — Maya's queued reply task will come back [BLOCKED].

## Verification Commands
1. `git log origin/main -1 --oneline` — `de0e24e feat(deploy): Orgo ship script…`
2. `cd deployment/remote/orgo/maya-slack-listener && node --test 2>&1 | tail -3` — `# pass 121 / # fail 0`
3. After ship: `SHIP_STEP=verify bash scripts/orgo-ship-maya-listener.sh` (with ORGO_API_KEY) — policy grep shows the four apex domains + tree hash prints.

## Full Context

### What was built across ALL sessions (complete feature list)
See `docs/handoffs/archive/` chain + PEC-199/202 session reports. This session adds: Slack owner-notice path live, canonical internal-domain rule (4 apexes) across all 5 definition sites, Orgo ship kit, PEC-209 forensic findings, PEC-206 closure, Maya reprocess tasks queued through the Agent Todo gate.

### Architecture decisions
- Maya runtime = single supervisord process on Orgo desktop pe-maya-chen (`f914c60c-c7c0-4a5e-b9dd-dd8b9df825f6`, instance c681e86d): Slack conversation loop + mailbox cadence (UTC half-hours) + Linear claimant (5-min). Gmail/Linear/Slack effects via pinned Composio accounts.
- Release lives root-owned at `/opt/pe-cc-agents/maya-slack-listener`; installer demands root:root:700 staging, no symlinks, verified-stopped supervisor; `tree-integrity.mjs` computes the pinned hash.
- maya-gate.mjs (Hetzner, 15-min cron) = notices audit + Phase A diagnosis only. Known bug: writes status `ack_in_thread` that mig-225's CHECK rejects (23514) → false `failed` rows that also block dedup retry.

### Key invariants (never violate)
- Silo doctrine: price agreement = (vendor, PE office); unknown office ⇒ No-Price; fail closed.
- Additive migrations only; QBO prod read-only; no secrets in repo; agents never email externally.
- A fix isn't fixed until verified through the LIVE call path.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | cc.proexteriorsus.net via Coolify from origin/main (`/healthz` buildCommit) |
| Supabase (prod, shared dev/live) | rnhmvcpsvtqjlffpsayu |
| Maya Orgo desktop | computer f914c60c…, instance c681e86d, dashboard https://www.orgo.ai/desktops/c681e86d |
| Orgo API | https://www.orgo.ai/api (`POST /computers/{id}/bash`); keys in 1P CW_Master (ORGO_API_KEY_MASTER etc.) |
| Slack | #pe-cc-dev-team C0BNVF99Y74 (private; maya_chen_accounting + openbrain invited 2026-08-11) |
| Hetzner agent host | PE-US-AGENTS 178.156.203.23 (`~/.ssh/hetzner_office`) — runs maya-gate.mjs cron |
