# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify `/healthz` `buildCommit`)
**Date:** 2026-08-09 19:30 (CT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup + full Linear documentation

> Prior handoff archived: `archive/2026-08-08-0210-cursor-wrap-maya-gate.md`.
> Linear this session: **PEC-189** cleanup (Done) · **PEC-190** multi-vendor pill (Done) · **PEC-191** SRS parity epic (In Progress) · **PEC-192** QB bank CSV (Done) · project **Multi-Vendor Agreement Builder & Price Surfaces** with **PEC-193…198** (Backlog).

---

## Accomplished This Session (2026-08-09)

### 1 · Invoice-processing catch-up (PEC-189, Done — data only, no code)
- 1,033 pending ABC No-Price lines (263 inv, $323.9k ext) approved as **Chris Hussey** (admin@cc), append-only `invoice_line_audit`, note cites the directive. ABC pending No-Price → **0**.
- 47 approved CM requests ($1,920.42) → **sent** (`sent_by='Chris Hussey'`, follow-up +14d) — the email was physically sent by Chris.
- 15 QXO No-Price lines auto-approved as **System** (Chris: QXO passes through, zero agreements).
- SRS's 177 pending No-Price lines intentionally untouched (their disposition = PEC-195 Alex automation).
- Trace: `dashboard_action_log` `work_key=invoice-audit-cleanup-2026-08-09`.

### 2 · Multi-vendor Credit Memo pill (PEC-190, deployed)
- `app/command-center/src/lib/cm-vendor-roster.ts`: `CM_VENDORS` — THE single seam (ABC/SRS live, QXO coming_soon) with inline future-agent instructions.
- `pages/accounting/invoice-audit.astro`: per-vendor pill buttons; zero-CM live vendors grey w/ "No credit memos exist for this weekly run" tooltip; QXO grey "Coming Soon"; `.iv-vendor-off` keeps hover so tooltips work.
- `pages/accounting/credit-memos/weekly.astro` + `api/credit-memos/weekly-csv.ts`: `?vendor=<slug>` scoping (requests, receipts, downloads, filenames).
- `docs/88-multi-vendor-credit-memo-pill.md`: mechanism + "adding vendor N+1".

### 3 · QB bank-ledger CSV export (PEC-192, deployed; mig 226 applied)
- `schemas/cleverwork-roofer/226-qb-bank-export.sql`: `qb_bank_export_log` (unique vendor/kind/doc — each row reaches QB once).
- `api/accounting/qb-bank-csv.ts`: `?vendor=&mode=preview|export&since=` (default since **2026-08-01**; pass earlier for backfill). Rows: `ACRONYM-INV#n` (Spent) · `CM-TBD-INV#n` (Received = requested credit; the arrives-QA line) · `CMINV#cm-OriginalINV#orig` (Received). Check No `job#-LastName` (21-char cap; name-only fallback; blank if unmatched). ABC jobs via `v_invoice_acculynx_match` (matched only); SRS/QXO via `po_number → acculynx_jobs` (28/30 SRS matched).
- `pages/accounting/qb-bank-export.astro` + nav entry. Human loads into QB; **QBO stays read-only (rule 13)**.
- Verified live: SRS 30 rows (`CO-356-Nanney,SRS-INV#0049707508-001,13561.33`), ABC 117 rows incl. exactly 47 CM-TBD.

### 4 · SRS ⇄ ABC parity (PEC-191 epic; migs 227/227b applied; commit `2d808d3`)
- 24-gap audit (subagent, file:line evidence in epic). **Fixed:** srs_2026-08-05 run (242 lines/$3,329.54) restamped `abc-supply`→`srs`; `invoice_audit_reset` vendor-scoped (mig 227; 227b dropped the ambiguous 4-arg overload); vendor scoping in approve/pending/add-line/disposition/weekly/weekly-csv/verify-paid/receipt-review/PDF route (collisions now 409 `ambiguous_vendor`, disposition refuses non-ABC received CMs `vendor_not_supported`).
- **Remaining: G1–G10 in the epic** (G1 SRS claim generator = blocks new SRS CMs; G3/G6 carry ABC-breakage matview/view risk notes — read them before touching).
- `docs/89-srs-vendor-state-of-the-world.md`: consolidated SRS state — **read before ANY SRS work**.
- Tests 293/293 · `silo_assertions()` = 0.

### 5 · Evening directive captured (project + PEC-193…198, Backlog)
- Project **Multi-Vendor Agreement Builder & Price Surfaces**: PEC-193 price-list button audit (High) · PEC-194 stuck to-audit progress (High) · PEC-195 Alex No-Price automation (2+/yr per vendor+office → Agreement Builder; A3 required, rule 9) · PEC-196 Agreement Builder/Price Agreements/Price List Review multi-vendor rebuild (known hardcodes listed) · PEC-197 realtime pill refresh · PEC-198 KPI redesign proposal (7 task-first pills; **awaiting Chris's approval**).

## Git State
- **Branch:** `main` == `origin/main` (contrib branch merged + pushed)
- **Last commit (pre-handoff):** `f53e7f0` + memory commits — this handoff commits after
- **Uncommitted changes:** only this handoff (committed as part of wrapup)
- Migrations applied this session: **226, 227, 227b**. Deployed `buildCommit f53e7f0` verified via /healthz.

## Task Cut Off
None — clean boundary. Evening directive fully captured in Linear, zero code started on it (context limit; deliberate).

## Next Task — Start Here

**Task:** PEC-194 (stuck "to audit" progress) then PEC-193 (price-list buttons) — both High, both bugs Lucinda/Chris hit daily.
**What to check / do (PEC-194):**
1. Read the ticket — root-cause leads included: `review-line.ts` stamps `invoice_line_audit` only when `claim.line_id` is non-null (rows without line_id stay "to audit" forever); check disputed-vs-passed counting in `buildLineProgressByInvoice` + the fallback math; 30s summary cache staleness.
2. Repro on SRS `0049707508-001` (screenshot in ticket: Shingles "1 to audit" with all 3 lines decided).
3. Fix data path first (append-only backfill stamps), then client count refresh (pairs with PEC-197).
**If the repro doesn't show:** the hourly sync or another session may have healed it — check `invoice_line_reaudit` rows for that invoice with `line_id IS NULL`.

**Prompt to use:** "Read docs/handoffs/current.md, then fix PEC-194 (read the Linear ticket first) — verify on SRS invoice 0049707508-001 through the live call path, then continue to PEC-193."

## Decisions Made This Session

- **`CM_VENDORS` roster = the single vendor seam** for CM surfaces; new vendor = one entry, `coming_soon` until proven live. Same pattern mandated for the agreement surfaces (PEC-196).
- **Greyed buttons keep pointer events** — `pointer-events:none` kills tooltips; use `.iv-vendor-off`.
- **QB export: humans load CSVs; QBO read-only stands.** `qb_bank_export_log` dedupes so a row reaches QB exactly once; CM-TBD lines are the QA proof requested credits arrive.
- **Fail closed on cross-vendor number collisions** (409 `ambiguous_vendor`) — never guess ABC.
- **Mig-223's `DEFAULT 'abc-supply'` stamped foreign rows** — the SRS run was mis-vendored; when adding a vendor_slug column, backfill by JOIN to the true source, never by default.
- **CREATE OR REPLACE with a new DEFAULT param creates an ambiguous overload** (42725) — drop the old signature in the same migration (227b).
- **KPI principle (PEC-198):** every pill = a work queue with a button; context numbers demote to subtext.

## Blockers Requiring Human Action

1. **Chris: approve/edit PEC-198** (KPI pill set) — build is blocked on your yes.
2. **Chris: `APPROVE PEC-186`** in #pe-cc-dev-team (Maya gate live test — carried since 8/8).
3. Carried: Amex CVV redaction in Dropbox; local `.env` fixes (stale `SUPABASE_ACCESS_TOKEN`, line-214 `SLACK_APP_ID_ROWAN`).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `origin/main` HEAD.
2. SQL: `select count(*) from silo_assertions();` — **0**.
3. SQL: `select vendor_slug, count(*) from invoice_line_reaudit group by 1;` — abc-supply 1799 / srs 242.
4. SQL: `select status,count(*),round(sum(expected_credit),2) from credit_memo_requests where request_kind='requested' group by 1;` — sent 47 / $1,920.42 (+ cancelled).
5. `curl` (agent token) `/api/accounting/qb-bank-csv?vendor=srs&mode=preview&since=2026-01-01` — 30 rows, Check No `CO-356-Nanney` style.

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine; property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens; AccuLynx→JobTread gated write queue; QuickBooks read-only mirror (docs/74); Slack agent identities; AgentMail; Maya accounting inbox + CAT-first runtime; Invoice Audit v2 (docs/81, migs 197–203); docs/82 remediation R1–R6; docs/83 Price Agreement Management; docs/84 GUI audit; Friday WIP/AR live board (docs/85, migs 215–216) + nightly Excel pack; PE-US-AGENTS host, QBO nightly sync w/ token-rotation persistence; office silo (migs 217/222); vendor payment memos (docs/86, mig 218); CM receipt reconciliation (mig 220); SRS/QXO in Invoice Audit (mig 221); vendor-silo re-key (mig 223) + nightly silo_assertions(); AccuLynx job-walk wrap fix (PEC-187); Maya diagnose→Slack-approved repair gate (migs 224/225, 15-min timer) + ticket-opened notices; **multi-vendor CM pill (docs/88, roster seam); QB bank-ledger CSV export (mig 226); SRS parity fixes wave 1 (migs 227/227b) + docs/89 SRS consolidation.**

### Architecture decisions
- All prior handoff decisions stand (pricing silo, money-table keying, 15-min crons, job-walk D-15/D-16/wrap, WIP/AR column ownership, agent_fix_approvals ledger).
- **Vendor roster pattern:** UI vendor surfaces iterate a single typed roster (`cm-vendor-roster.ts`); DB truth = `vendors.slug`. PEC-196 extends this to agreement surfaces.
- **QB export ledger:** `qb_bank_export_log` unique `(vendor_slug,row_kind,doc_number)`; export stamps, preview never does.
- ABC agreements = `abc_price_agreements` (int ids) vs generic `price_agreements` (uuid) — the split is why SRS CM lines can't name agreements yet (epic G2).

### Key invariants (never violate)
- Additive/idempotent migrations; archive, never delete. Price agreement = (vendor, PE office); fail closed. Compare prices only in pricing UOM (docs/46). `main` deploys; verify /healthz; **a fix isn't fixed until the LIVE call path proves it**. QBO read-only forever; agents never email external domains. `silo_assertions()` = 0 after every silo-adjacent change. Never send Σ N to a lender.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | cc.proexteriorsus.net — Coolify uuid `lu5txzhyoza7uuz0scwpobv7`, builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` — schemas through **227b** |
| Agent host | PE-US-AGENTS `178.156.203.23` (`~/.ssh/hetzner_office`); timers: abc 07:30 · qbo 01:00 · wip-pack 11:00 · jt-sentinel 17:00 · maya-gate */15 (UTC) |
| Secrets | 1P CW_Master via `op` (QBO PROD TOKENS, Coolify Root API, SUPABASE_ACCESS_TOKEN, LINEAR_API_KEY, AGENTMAIL_API_KEY) |
| Slack / Linear | #pe-cc-dev-team `C0BNVF99Y74` = all app/code/Linear traffic + approvals; team PE-CC-DevTeam; approver allowlist `U0B8SGJJZLJ` |
| Dev server | `.claude/launch.json` port **4399** |
