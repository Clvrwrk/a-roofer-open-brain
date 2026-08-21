# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-21 00:05 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /project-handoff + /wrapup

---

## Accomplished This Session

### UI/UX Phase 1 — the items needing no design decision (`b7e8410`)

- `src/scripts/theme-pref.ts`: **new.** One shared light/dark preference (`cc.theme`) with migration off the legacy keys.
- `src/scripts/{invoice-audit-tree,order-audit-tree,agreement-builder-tree,estimate-audit}.ts`, `pages/accounting/friday-wip.astro`: five copies of the toggle collapsed onto it. They ran on **two** different keys (`ivTheme`, `eaTheme`), so dark reset when you walked between tabs.
- `pages/accounting/invoice-audit.astro` + `scripts/invoice-audit-tree.ts`: buttons name their destination ("Chase in Weekly CM"); `"No data available — report empty"` replaced with why a control is inactive. **Both** the server template and the client re-render path — changing one reverts the labels on refresh.

### Phase 2 — money truth (`b18b196`, `a7a7bca`)

- `schemas/246-settle-received-credit-memo-lines.sql`: a received credit memo now settles its claim lines (`credit-received`). at_risk **$4,676.63 → $3,679.58**, credit_memo_amount **$0.00 → $997.05**, actionable **$3,485.13 → $2,692.08**.
- `src/pages/api/credit-memos/disposition.ts`: `mark-received` writes the settle rows so future receipts maintain themselves.
- `schemas/247-docs93-reaudit-writeback.sql`: docs/93 verdict written back — $84.45 withdrawn across 2 requests. The one "adjust" **deliberately not applied**.
- `schemas/248-srs-reaudit-provenance.sql`: 11 SRS discrepancy lines re-cited, new `provenance` column marks them `rederived`.
- `docs/99-credit-memo-money-truth-2026-08-20.md`: the write-up.

### Layer 2 sweep — DB tier + it now actually runs (`993ccb5`, `0e168d6`, `aa46711`)

- `scripts/site-quality-sweep.mjs`: 5 money-truth DB checks, counts via PostgREST `Content-Range` (never lists — a truncated select under-reports the thing being watched).
- `scripts/site-sweep.sh`: **new.** The unit's `EnvironmentFile` pointed at `/opt/openbrain/master.env`, which does not exist on the host — and the leading `-` made that silent. Env is sourced from the repo `.env` by wrapper instead.
- **The sweep had never run.** No unit file, no timer. Now installed and enabled; verified on the host, DB tier fires.

### Maya QA (`e08a7a5`, `8bf7ee9`, `320bdbc`, `3681a80`, `eeb51d5`)

- `scripts/chaos-forensic-assign.mjs`: **new.** One page a day, no repeat until all have had a turn.
- `scripts/orgo-forensic-page.mjs`: **new.** Every control on that page, with a 3-layer write guard (ALLOW / DENY / abort every non-GET at the network layer).
- `scripts/maya-qa-orchestrate.mjs`, `scripts/maya-qa.sh`, `deployment/remote/systemd/openbrain-maya-qa.{service,timer}`: **new.** 04:30 CT.
- `scripts/qa-agent-auth.mjs`: new `mint` command — SDK magic-auth → sealed `wos-session`, no browser.
- `scripts/orgo-{site-walker,forensic-page}.mjs`: inject the minted cookie.

### Other

- `scripts/upload-agreement-pdf.mjs`: **new.** Nothing in the repo could write to the `agreements` bucket.
- Artifact "Invoice Audit Teardown" revised twice (number defects, then the $997.05 contaminant).

## Git State
- **Branch:** `main` (== `origin/main`)
- **Last commit:** `eeb51d5` — "fix(qa): one minted session must survive both passes"
- **Deployed:** `eeb51d5`, `/healthz` status ok
- **Uncommitted changes:** none (this handoff commits next)

### Open branch not on main — PR #9 (draft)
`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**250-253** (already applied to prod, all additive) plus `docs/100`. It is 0 behind main and
kept merged with it. **It is not merged and not deployed.** Numbering note: parallel sessions
claimed 245-248 and `docs/99` while it was in flight, so it yielded twice — its applied
Supabase labels still read `245_`/`246_`/`248_`/`249_`, which is cosmetic (Supabase keys on
timestamp; all four applied before the files numbered 246-248 existed).

## Task Cut Off

None mid-block. One thing is **diagnosed but unproven**: the nightly QA walk injects its minted cookie and is still redirected to sign-in. See Next Task.

## Next Task — Start Here

**Task:** Prove or disprove the `WORKOS_COOKIE_PASSWORD` mismatch, then get one clean Maya QA run.

**What to check / do:**
1. In Coolify, open the **command-center** app (uuid `lu5txzhyoza7uuz0scwpobv7`) and hash its `WORKOS_COOKIE_PASSWORD`:
   `printf %s 'VALUE' | shasum -a 256 | cut -c1-16`
2. Compare to the host's: **`fd3c44ecfbd83140`** (len 64). Different ⇒ that is the bug — copy the app's value into `/opt/openbrain/a-roofers-open-brain/.env`.
3. Trigger the unit: `systemctl start openbrain-maya-qa.service`, then `journalctl -u openbrain-maya-qa.service -f`.
4. Once green: delete the PE Site QA desktop (`3480fa38-…` / instance `dac62bd2`).

**If the hashes MATCH:** the diagnosis is wrong and the cause is cookie handling, not the key. Check the injected cookie's domain/attributes against what the app expects (`wos-session`, path `/`, httpOnly, secure, SameSite Lax) before changing anything else.

**Prompt to use:** "Read docs/handoffs/current.md. The WORKOS_COOKIE_PASSWORD hashes [match / do not match]. Get one clean Maya QA run and report every finding."

## Decisions Made This Session

- **`credit_memo_amount` was not a mis-written predicate.** 233's model was right; the lifecycle step was missing. The tempting one-line repair (repoint at `disputed`, $253.19) would have made it a strict subset of `at_risk` — double-counting the same dollars in two money columns.
- **Patch a live view via `pg_get_viewdef()`, never restate it from an old migration file.** Rebuilding from 233 would have silently reverted 238 and 244.
- **No CHECK constraint on discrepancy provenance.** The live add-line path can legitimately insert a null `agreement_id` (65 priced lines have none). Fail closed against data you control; detect on data you don't.
- **The forensic pass is read-only by three layers, the last independent of the others.** This app's buttons include Process / Approve & Send / Export — a naive click-everything bot would fire vendor emails nightly.
- **Chaos is bounded, not uniform.** No page repeats until all have had a turn; uniform random never reaches the long tail, which is where docs/84 found the rot.
- **Mint a session per run rather than bootstrapping one by hand.** The AuthKit sign-in page sits behind **WorkOS's own Cloudflare** (`server: cloudflare` on every hop) — not ours, nothing on our side disables it. And a hand-bootstrapped cookie expires silently, first symptom being a report claiming the whole site is down.
- **QA identity, not Maya's.** `site-qa@agentmail.proexteriorsus.net` has an API-readable inbox; Maya's is Google Workspace, so her code would not be machine-readable and a human would be back in the loop.
- **Did NOT delete the PE Site QA desktop.** Deleting the only staged fallback before its replacement has ever completed a run is backwards.
- **Narrow pull, not full.** Host HEAD stays `2838bcf`; only sweep/QA scripts checked out. Maya's runtime code untouched.

## Blockers Requiring Human Action

1. **`WORKOS_COOKIE_PASSWORD` comparison** — step 1 above. I was blocked from reading the app's env out of Coolify (correct gate).
2. **Live credential exchanges** — the harness blocks me from running `qa-agent-auth.mjs mint`. Chris ran the first one successfully; the orchestrator now mints its own per run, so this should not recur.
3. **Colorado SRS price sheets** — `Pro Exteriors Colorado Price Sheet 8-13.pdf` (PEC-211) and `Pro Exteriors Colorado Pricing 8-14.pdf` (PEC-222) are in **no** store. Export them from the accounting mailbox; `scripts/upload-agreement-pdf.mjs` puts them away. Colorado still prices off quote `0049345641`, **expired 2026-06-27**.
   - **Related, and worse than the expiry** (PR #9, mig 253): the office-ring path cannot reach `0049345641` *at all*, so `v_office_vendor_inheritance` reports `priced_items = 0` for Denver x SRS while the line-level path prices 11 of its 34 lines. **The two pricing paths disagree.** Cause: `v_office_vendor_branch` still joins agreements to branches by branch-number TEXT — the last survivor of what mig 244 removed — and SRS South Denver exists as two rows, `AMSDE` (no address, no geom, holds the book) and `SBP-SOUTHDENVER` (geocoded, 6.1 mi, holds nothing). Fresh sheets will not fix this by themselves.
4. **Denver x SRS branch identity — needs Chris** (PR #9). Confirm `AMSDE` and `SBP-SOUTHDENVER` are the same physical branch so the agreement can be repointed, **or** approve repointing the agreement join to `vendor_branch_id` with mig 244's equivalence proof. Deliberately not decided by an agent: mig 240's rule is that a guess cannot become a fact. `v_agreement_unreachable` shows all three live SRS agreements (136 items) are ring-unreachable; Richardson and Wichita only reach via *archived duplicate* rows, so tidying those would silently unprice 114 more items.
5. **A3 owed** — the nightly QA loop is a new agent capability (hard rule 9).
6. **Two unidentified desktops** in PE-open-brain (`c5a0c869`, `5a9542cf`), both running — not touched.
7. **`~/.config/cleverwork/master.env` is malformed** on Chris's Mac, lines 1317/1320 execute as shell commands. (Distinct from the Hetzner path, which simply does not exist.)
8. Carried over: PEC-213 Wichita · PEC-111 · PEC-177 · PEC-172 · PEC-203.

## Verification Commands
1. `git status --short` — empty
2. `git rev-list --left-right --count HEAD...origin/main` — `0	0`
3. `curl -s https://cc.proexteriorsus.net/healthz` — `status: ok`, buildCommit `eeb51d5`
4. `npm --prefix app/command-center test` — 309 passed
5. `systemctl list-timers openbrain-maya-qa.timer openbrain-site-sweep.timer` (on host) — both listed, 04:30 and 06:00 CT

## Full Context

### What was built across ALL sessions
See `docs/handoffs/archive/`. **This session adds:** the shared theme preference; destination-labelled buttons; migrations 246/247/248 (settle-on-receive, docs/93 write-back, SRS provenance); the sweep's DB tier and its first ever installation; the chaos scheduler; the deep forensic pass with a write backstop; the Maya QA orchestrator on a 04:30 timer; non-interactive session minting; and an upload path to the `agreements` bucket.

### Architecture decisions
- **ESM ignores `NODE_PATH`.** Bit twice — once with playwright locally, once with the WorkOS SDK on the host. `@workos-inc/node` is installed at the **repo root** so `scripts/*.mjs` resolve it by walking up.
- **Orchestration splits by capability, not preference.** Hetzner has the repo (routes, assignment, alerting); the Orgo desktop has Chrome and the session (walking). No repo clone on the desktop — private, would need a deploy key.
- **Maya's mailbox intake stores attachment FILENAMES only.** `lib/agent-intake.ts` types them `string[]`; no download, no upload. The Slack path has a real processor, Gmail does not.
- **`maya-gate` cannot execute free-form work.** `findNewIntakes()` permanently skips any issue with an `agent_fix_approvals` row, and `PLAN_EXECUTORS` has exactly one entry (`mirror_refresh`). The "move to Agent Todo" line in intake descriptions is boilerplate the deployed gate does not implement.
- **Run it, don't read it.** The forensic pass had four bugs that only surfaced by running: stamped attributes wiped by client re-render (1/42 → 29/42), self-inflicted console errors, 1,188 `<details>` opened on a data tree, and a 10-minute hang.

### Key invariants (never violate)
- Silo doctrine: agreement = (vendor, PE office); unknown office ⇒ No-Price, fail closed.
- UOM: compare only in the vendor's pricing UOM via `price_per_uom` + `v_item_uom_map`.
- Additive migrations; archive never delete; QBO prod read-only; no secrets in the repo.
- **A fix isn't fixed until proven through the LIVE call path** — build+tests green is how dead code lands.
- Agents do not sign in, create accounts, enter credentials, or satisfy bot challenges.
- **Fail closed against data you control; detect on data you don't.**

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | cc.proexteriorsus.net via Coolify from origin/main; app uuid `lu5txzhyoza7uuz0scwpobv7` |
| Coolify | https://coolify.proexteriorsus.net — key in 1P `CW_Master/coolify.proexteriorsus.net - Root API` |
| Supabase (prod) | rnhmvcpsvtqjlffpsayu — schemas through **248** |
| Hetzner host | PE-US-AGENTS 178.156.203.23 — **SSH key: 1P `CW_Master/SSH — a-roofers-open-brain (agent host)`** (`fw7zqw2yp5znobiwfv6sds3wki`); use `-o IdentitiesOnly=yes` |
| Host repo | `/opt/openbrain/a-roofers-open-brain`, HEAD `2838bcf` (narrow-pulled scripts only); env at its own `.env` |
| Host timers | maya-gate /15min · **maya-qa 04:30 CT** · **site-sweep 06:00 CT** · abc-sync · jt-sentinel · qbo-thursday · wip-pack |
| Orgo project | `PE-open-brain` `8cf44774-2b46-4089-8bfe-4deb1b078e46` |
| Orgo — Maya | `37b262e0-a915-47e6-8c3b-f180a32ab6fe` · inst `20ee4678` · running · QA home `/opt/pe-cc-agents/maya-qa` |
| Orgo — QA (to delete) | `3480fa38-35c6-4b86-a5fe-f62d0fb8f028` · inst `dac62bd2` · **hold until Maya's first run is green** |
| WorkOS | client_id `client_01KTF450QBY957ASEZ8JXZKMV4`; AuthKit host `graceful-square-64.authkit.app` (behind **WorkOS's** Cloudflare) |
| QA identity | `site-qa@agentmail.proexteriorsus.net` · user `user_01M0EAPFD0CSBAR0BNV5NXQTSR` · mint proven 2026-08-20 (2023 bytes sealed) |
