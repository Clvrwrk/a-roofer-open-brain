# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-19 11:35 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /project-handoff + /wrapup

---

## Accomplished This Session

### Fixes shipped to production
- `schemas/cleverwork-roofer/232-quarantine-blank-invoice-rows.sql` **(prod)**: quarantined the phantom $59,639.20 CSV-footer row into `abc_invoices_quarantine` (archived, not deleted) + a CHECK so a malformed import fails closed. ABC spend now reads the true **$2,197,424.94**. (PEC-215)
- `app/command-center/src/lib/price-agreement-management.ts`: chunked `.in()` — was paging **39,984** `v_branch_item_api_price` rows to serve ~593 items. **13.56s → 2.9s**. Equivalence proven in SQL across all 492 needed items, zero mismatches. (PEC-216)
- `app/command-center/src/pages/accounting/price-agreements/index.astro`: worksheet rows deferred to the client as JSON. **3.77 MB → 309 KB (12x)**. Propose-price handler moved to event delegation. (PEC-216)
- `app/command-center/src/scripts/invoice-audit-tree.ts`: guard against fetching detail for a blank invoice number.

### Site cleanup (PEC-217)
- Deleted 11 files: the whole `/data-quality/*` Price Foundation stack, Negotiated Catalog, Vendor Regions, and `lib/price-list.ts` (10 invented SKUs + 8 fake branches). Rationale + restore SHA in `docs/91`.
- Vendor Regions needed companion edits: it linked *from the territory map to itself*, and sat in the service-worker precache — **SW VERSION bumped** so installed workers evict the stale entry instead of serving a cached 404.
- Kept redirect stubs deliberately: deleting them would *create* broken links.

### Daily automation (Layer 2)
- `scripts/site-quality-sweep.mjs` + `deployment/remote/systemd/openbrain-site-sweep.{service,timer}` — 06:00 CT on the Hetzner agent host. Static (link graph, fabricated data, orphans) + live (`/healthz`, deploy drift, `/api/*` budgets). Docs `docs/92`.
- First draft emitted 2 errors + 21 warnings, **all false positives**; detectors tightened to a real baseline of 0 errors / 2 genuine warnings.

### Orgo QA desktop + site walker (PEC-220)
- Provisioned workspace `pro-exteriors-open-brain` (`ea96d7b0-…`) and desktop `pe-site-qa` (`725ce9d6-2bf7-4f4e-baac-f63b1390c117`, instance `073ff51e`). npm + playwright-core installed; chrome/xdotool/scrot present.
- `scripts/orgo-site-walker.mjs` — per-page speed, hangs, console errors, failed requests, click-through validation, and surface-level vulnerability checks. Docs `docs/94`.

### Credit-memo re-audit (PEC-221)
- All 53 open requests re-derived **three times by three independent models** (grok-4.6 / gpt-5.6-sol / claude-opus-5) under Ringer with an executed check. **Unanimous 3/3, zero splits.**
- **$4,738.22 → $4,653.76** (50 uphold, 1 adjust, 2 withdraw). Drafts in `.cm-reaudit/drafts/`. Docs `docs/93`.

## Git State
- **Branch:** `main` (== `origin/main`)
- **Last commit:** `b2f602f`
- **Uncommitted:** none (this handoff commits next)

## Task Cut Off
None mid-block. Two things are **staged but deliberately not actioned**: the credit-memo drafts (not sent, not written to `credit_memo_requests`) and the Orgo walker (waiting on a one-time human WorkOS sign-in).

## Next Task — Start Here

**Task:** One-time WorkOS sign-in on the Orgo QA desktop, then schedule the daily walk.

**Steps:**
1. Open https://www.orgo.ai/desktops/073ff51e
2. Launch Chrome with `--user-data-dir=/opt/pe-qa/chrome-profile` and sign in to WorkOS at `cc.proexteriorsus.net`. **An agent must not do this step.**
3. Copy `scripts/orgo-site-walker.mjs` to `/opt/pe-qa/` and run `node orgo-site-walker.mjs`.
4. Schedule it daily alongside the 06:00 CT sweep.

**If the walker reports `session expired`:** the profile lost its session — repeat step 2. It stops on purpose rather than reporting every page as broken.

**Prompt to use:** "Read docs/handoffs/current.md. I have signed in to WorkOS on the Orgo QA desktop. Deploy scripts/orgo-site-walker.mjs to /opt/pe-qa, run a full walk, and report every finding."

## Decisions Made This Session

- **Phantom row archived, not deleted** — moved to `abc_invoices_quarantine` with its full `raw` payload (hard rule 1). Fixed at the data source rather than in views, because every consumer reads `abc_invoices` and view edits would still leave raw `SUM()` wrong.
- **Redirect stubs kept** while orphaned pages were deleted — removing them would create the broken links the audit exists to prevent.
- **Credit memos: nothing sent, nothing written to the ledger.** Four dataset defects surfaced in one corpus; the numbers want human eyes first.
- **Two invoices withdrawn** (2009034778-001, 2009557754-001) because item `0150080102` has no in-force Wichita agreement price. An earlier hand analysis valued one at $40.26 using a **quote**; the verification used in-force **agreements** only. A quote is not an agreement — the fail-closed answer is the defensible one.
- **WorkOS Agent Auth deferred, not attempted.** `/agent/auth` and `/oauth2/token` return live **501**; `agent-auth.ts` is discovery-only. Standing it up means building signing keys, a token store, a trusted-issuer list, replay protection and the human-ownership bridge — a security-critical project guarding a financial app, not a provisioning step.

## Blockers Requiring Human Action

1. **Orgo WorkOS sign-in** — step 2 above. Everything else is ready.
2. **Credit-memo drafts** — review `.cm-reaudit/drafts/`, then decide: supersede in the ledger and send, or adjust.
3. **PEC-220 Maya's Orgo desktop is GONE** — 0 workspaces on the account and her documented desktop 404s. Her Slack loop, mailbox cadence and Linear claimant have been **down**. Decide whether to rebuild.
4. **All `ORGO_*_ID` secrets are stale** — the account was rebuilt; ids don't survive. Re-verify every one in 1Password `CW_Master`.
5. **PEC-213 Wichita coverage** — SRS expired 7/23, ABC 7/31; still the root cause of the No-Price rate and of the two withdrawn credits.
6. Carried over: PEC-111 (IKO office?), PEC-177 (Titan quote), PEC-149…158 (6/6 provisioning confirm), PEC-172 (Billy Cowell access), PEC-203 (fire the export).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz | python3 -c "import sys,json;print(json.load(sys.stdin)['buildCommit'][:7])"` — matches `origin/main`
2. `git status --short` — empty
3. `cd app/command-center && npx vitest run` — **309 passed**
4. `node scripts/site-quality-sweep.mjs --static` — 0 errors, 2 warnings
5. `select count(*) from abc_invoices where coalesce(btrim(invoice_number),'')='';` — **0**
6. `select round(sum(total_amount),2) from abc_invoices;` — **2197424.94**

## Full Context

### What was built across ALL sessions
See `docs/handoffs/archive/` chain. **This session adds:** migration 232 (phantom-row quarantine + fail-closed CHECK); PEC-216 completed both halves; PEC-217 deletion of 11 orphaned/dead files; the Layer 2 daily sweep on Hetzner; the Orgo QA desktop + page-by-page walker; and the three-model credit-memo re-audit.

### Architecture decisions
- **Quarantine is now the pattern for malformed ingest rows** — `abc_invoices_quarantine` joins `crm_pipeline_orphan_quarantine`. Archive the atom, add a CHECK so the ingest fails closed, never delete.
- **Sandboxed workers can only write inside their task dir.** Ringer deliverables must land there and be harvested; pointing them elsewhere fails good work.
- **Never trust a URL alone to detect an auth wall.** WorkOS/AuthKit returns 200 at `<tenant>.authkit.app` with no telltale substring — check title and body too.
- **The daily sweep cannot see the HTML dashboards** (WorkOS-gated, no agent session). That gap is why the Orgo desktop exists.

### Key invariants (never violate)
- Silo doctrine: agreement = (vendor, PE office); unknown office ⇒ No-Price, fail closed.
- UOM: compare only in the vendor's pricing UOM via `price_per_uom` + `v_item_uom_map`.
- Additive migrations; archive never delete; QBO prod read-only; no secrets in repo.
- **A fix isn't fixed until verified through the LIVE call path.**
- **Never promote a price from an email figure alone**; a quote is not an in-force agreement.
- Agents do not create accounts, enter passwords, or close security alerts on inference.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | cc.proexteriorsus.net via Coolify from origin/main (`/healthz` buildCommit) |
| Supabase (prod) | rnhmvcpsvtqjlffpsayu — schemas through **232** |
| Dev server | port 4399 (`.claude/launch.json`) |
| Hetzner agent host | PE-US-AGENTS 178.156.203.23 — abc-sync 03:30 ET, maya-gate /15min, jt-sentinel 10:00 PT, qbo/wip Thursday, **site-sweep 06:00 CT (new)** |
| Orgo QA desktop | `pe-site-qa` 725ce9d6-… · instance 073ff51e · https://www.orgo.ai/desktops/073ff51e |
| Orgo workspace | `pro-exteriors-open-brain` ea96d7b0-… (created this session; account had ZERO before) |
| 1Password | `op` CLI authorised; `CW_Master/ORGO_API_KEY_MASTER`, `ORGO_API_BASE` |
| Slack | #pe-cc-dev-team C0BNVF99Y74 |
| Linear | PE-CC-DevTeam — this session: PEC-215/216/217 fixed, PEC-219/220/221 opened |
