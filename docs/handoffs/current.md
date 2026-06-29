# Project Handoff — a-roofers-open-brain (Command Center)
**Project:** Roofer Open Brain — Command Center (Invoice Audit + Alex accounting agent)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify auto-builds `origin/main`)
**Date:** 2026-06-28 17:29 PDT
**Agent:** Lead Orchestrator
**Reason:** End of session (user-requested /project-handoff)

---

## Accomplished This Session

### docs/59 Invoice Audit rebuild — COMPLETE & DEPLOYED (Tasks 5–6 + Gate 7 + 2 polish rounds)
- `app/command-center/src/lib/invoice-audit.ts`: `attributeAuditActor()` (Alex/Maya/human/system) + per-line `actorLabel/actorKind/actorPersona`; `hasWork` flag; date-window defaults = oldest-open→today (`todayDateStr()`); `thirdPriceDate`; `loadDecisionDetailCsv()` (Deliverable 2).
- `app/command-center/src/scripts/invoice-audit-tree.ts`: agent/human badges; "↩ Go back" reset button (all open+unpaid worked invoices, incl. credit memos); category-collapse deselect; "Most Recent/Org Inv Date" column; `.iv-tablewrap` scroll; Manage "Decision detail (CSV)" link.
- `app/command-center/src/pages/api/invoice-audit/reset.ts`: WorkOS-gated per-invoice reset (calls `invoice_audit_reset` RPC).
- `app/command-center/src/pages/api/invoice-audit/batch/[batchId].csv.ts`: `?kind=detail` → decision-detail CSV; `batches.ts`: `detailUrl` per batch.
- `app/command-center/src/pages/api/invoice-audit/invoice.ts`: try/catch + `Sentry.captureException` + JSON 500 (was unhandled HTML 500).
- `app/command-center/src/layouts/AppShell.astro` + `styles/global.css` + `src/lib/version.ts`: app version line under runtime pill (`v0.6.0 · 2026-06-28`); sidebar-overlap fix.
- Migrations applied to prod: **154–161** (158 reset fn, 159 benchmark date + CM reset, 160 reset-all-lines + $0→100% variance + CM org price from `v_invoice_lines_complete`, **161 cascade perf-fix** revert `recent`→`abc_invoice_lines`).

### Alex first full trial run — DONE (docs/57 §7–8)
- 17 actionable invoices dispositioned per `morning_abc_sync` v3 (simulated Mon–Fri 2026-06-22→26): 6 HELD→Casey credit memos ($563.37), 11 approved→to-be-paid, 38 coverage gaps→Jordan, 9 service-fee lines auto-approved (new rule), 12 in 3–6% weekly tier.
- **Process run** (Chris clicked): batch `8cd6f354-6b26-4760-8a91-c1a9ed6f7bad`, 11 invoices, **$15,580.12**; pay CSV + decision-detail CSV both in Manage.
- **Slack delivery LIVE**: dedicated app **"Open Brain Command Center"** (`A0BDVCB4ZGC`, bot **@openbrain**) created via Manifest API in workspace **pe-command-center T0B8QEGPVQW**; **all 13 trial messages posted to #accounting-invoice-processing** (`C0BDRFACQ4S`). `src/lib/slack.server.ts` `postSlackMessage()` = canonical agent→Slack path.
- SOP amendments locked (docs/57 §7): service-fee auto-approve+weekly; weekly review Fri 11am CST (Lucinda/Roberto/Chris); inter-agent comms routed Chris↔Conductor (queued, no Slack).

## Git State
- **Branch:** `main` (== `origin/main`, deployed)
- **Last commit:** `d88e551` — "docs(memory): Slack app delivery + cascade perf fix (daily log)"
- **Uncommitted changes:** none (tree clean). `config/.env` holds Slack secrets — **gitignored, never committed** (verified).

## Task Cut Off
None — session ended at a clean boundary. All code committed/pushed; trial complete except the follow-ups below (none mid-block).

## Next Task — Start Here

**Task:** Fix the weekly-package Slack download links (they 401).
**What to check / do:**
1. The Slack weekly-package message links point at `cc.proexteriorsus.net/api/invoice-audit/batch/<id>.csv?...` — these are **WorkOS-gated**, so clicking them while not logged in returns `{"error":"unauthorized"}` (Chris hit this).
2. Options: (a) link to the dashboard **Manage** page (where a logged-in session downloads them) instead of the raw API; (b) generate short-lived signed download URLs; (c) document "log into the Command Center first."
3. Recommended: change `postSlackMessage` weekly-package text to link the Manage panel deep-link, not the raw CSV API.

**If the link still 401s after login:** confirm the WorkOS session cookie is sent (same-site) and the batch endpoint accepts it.

**Prompt to use:** "Read docs/handoffs/current.md. Fix the weekly-package Slack links that 401 — point them at the Manage panel or signed URLs instead of the gated CSV API."

## Decisions Made This Session
- **Slack via a dedicated app, not the MCP connector** — the MCP is bound to `mycleverwork` (wrong workspace → silent self-DM); the agents live in `pe-command-center`. Bot token (`xoxb`) obtained via OAuth install (the one unavoidable human step).
- **Cascade `recent` reverted to `abc_invoice_lines`** (mig 161) — sourcing from `v_invoice_lines_complete` (mig 160) ran 2 subqueries × every line and blew the 8s API statement timeout (detail 500s). CM `org_inv` stays on the complete view (CM-only, low volume).
- **$0 benchmark → 100% variance** (mig 160) — an unpriceable original flags at 100% and routes into the ≥6% hold/escalation.
- **Service fees auto-approved** (validated: a $650 DELIVERYBR would've been a false hold).
- **Backdated decided_at NOT used** — dispositions use `now()` so they win the current-audit `DISTINCT ON`; the Mon–Fri cadence lives in the Slack text + action-log payload.

## Blockers Requiring Human Action
1. **ROTATE the Slack app config token** — it was pasted in plaintext in chat. (api.slack.com → Your App Configuration Tokens.) It's in gitignored `config/.env`, never committed, but treat the pasted one as burned.
2. **Host scheduler (#9)** — Alex runs only as a manual hand-run; autonomous dailies/weekly need a host timer (AI is classifier-blocked from launching autonomous agents / running the prod payment export).
3. **Slack auto-posting** — to have Alex post from the running app, add `SLACK_BOT_TOKEN` + channel IDs to Coolify env and call `postSlackMessage()` from Alex's comms (inert until #9).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'],d['buildCommit'][:7])"` — should return `ok d88e551` (or later).
2. `git rev-parse --short main origin/main` — both equal (converged).
3. In Slack (pe-command-center) → **#accounting-invoice-processing** — 13 OpenBrain messages present.
4. Dashboard → Invoice Audit → expand a held invoice (e.g. 2008479396-001) — detail loads in <1s (no "network error"); Awaiting Payment → Manage shows batch `8cd6f354` with pay-file + decision-detail downloads.

## Full Context

### What was built across ALL sessions (invoice-audit arc)
- Invoice Audit dashboard: PE Office→Vendor/Branch→Invoice→Line drilldown over live ABC invoices; negotiated/agreement variance; UOM-normalized pricing (migs 119–122, docs/46).
- docs/59 rebuild: benchmark cascade view `v_invoice_audit_line_cascade` (negotiated→API→recent/org-inv→none) w/ dates + $0→100%; open+60d actionable scope; date filter + "Show all"; Alex/Maya/human attribution badges; per-invoice append-only "Go back" reset RPC; QuickBooks pay-CSV export (Process→Manage→Confirm/Return) + decision-detail CSV.
- docs/57 Alex SOPs: `morning_abc_sync` v3 (gross $25 floor; ≥6%→hold+Casey credit memo; 3–6%→weekly digest; no-agreement→Jordan; service-fees auto-approve); daily summary; weekly package (2 CSVs); Fri 11am review.
- Slack: Open Brain Command Center app + `postSlackMessage()`.
- Concurrent (not mine): DevTeam/Open-Engine + SEO workstream (agents/dev-engine, /api/dev/*, migs 155/156) — landed earlier this milestone.

### Key invariants (never violate)
- Additive/idempotent migrations only; never delete atoms (append-only audit ledger). Reset = append `pending` rows, never delete.
- Compare prices in ABC pricing UOM = `price_per_uom`; align via `v_item_uom_map`. Never raw quantity/unit_price.
- Credit-memo lines live in `v_invoice_lines_complete`, not `abc_invoice_lines`.
- No secrets committed — `config/.env` is gitignored; placeholders in `config/.env.example`.
- LIVE = `origin/main` (Coolify). Branch from `origin/main`, converge back, push. Confirm HEAD via `/healthz` buildCommit.
- AI cannot run the prod payment export or launch autonomous agents (classifier-blocked) — a human clicks.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | cc.proexteriorsus.net (Coolify app `og0rmt02rff8qti9nlfk3nr7`, builds `origin/main`) |
| Supabase | `rnhmvcpsvtqjlffpsayu`; schemas mirrored through **161** |
| Slack app | "Open Brain Command Center" `A0BDVCB4ZGC`, bot @openbrain, ws `T0B8QEGPVQW` (pe-command-center) |
| Slack channel | #accounting-invoice-processing `C0BDRFACQ4S` (+ credit-memos C0BD4EW4RU4, vendor-intake C0BCUF29G1H, product-catalog-review C0BCYNW98RL) |
| Secrets | gitignored `config/.env` (Slack bot/config tokens, app creds) |
