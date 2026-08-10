# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify `/healthz` `buildCommit`)
**Date:** 2026-08-09 23:05 (PT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup (full Linear records + memory sweep)

> Prior handoff archived: `archive/2026-08-09-1930-pec189-198-wave.md`.
> Linear today (evening sessions 3–6): **PEC-193/194/197/198/200 Done** · **PEC-195 Done (BUILT, same-day approval)** · **PEC-196 In Progress (phase A shipped)** · **PEC-201 filed (CM chase page)** · **PEC-186/187 + CAT-30 tree closed** · session report **PEC-202**.

---

## Accomplished This Session (2026-08-09 evening, deploys `ba4135a`→`2b048cb`)

### 1 · Bug wave (PEC-200, 194, 193 — all Done, live-verified)
- `api/accounting/qb-bank-csv.ts`: Check No = AccuLynx job # only (12-char cap); client name → end of Description; `isoDate()` guard; SRS CM-TBD job/client resolution (was ABC-only); **matched=true filter dropped** (job = `pe_job_number ?? canonical_po`) + **paginated match-view read** (1000-row cap blanked newest invoices). ABC preview 53/53 rows carry Check No.
- `scripts/invoice-audit-tree.ts` (PEC-194): section "to audit" counted only `passed` — disputed lines stuck forever; now decided = passed OR disputed + body re-render on review. Proof: repro invoice old=5, fixed=0.
- `scripts/price-list-url.ts` (PEC-193): canonical vendor+office URL builder; `loadBranchPriceList` office-name fallback (12/37 ABC branches lack `vendor_branches.pricing_territory_office_id`); disabled tooltip "No data available — report empty".

### 2 · KPI 7-pill row + realtime (PEC-197+198, Done)
- `lib/kpi-pills.ts` + `api/accounting/kpi-pills.ts` + tree `refreshKpiPills()` (post-action patch + 60s poll); mig **226→228** `v_qb_export_pending`; mark-sent auto-fires per-invoice Process stamp (`disposition.ts`).

### 3 · PEC-196 phase A (In Progress)
- 5 fail-closed vendor guards (promote/items/handoff/issue-link 409 `vendor_not_supported`; request-price-list requires vendorSlug, 404 fail closed); roster `agreementStatus` axis; builder vendor strip; `docs/90` (full inventory + B1–B7 rebuild plan). Next spine: **B1 staging vendor col → B2 generic promote → B3 builder threading**.

### 4 · Chris directives (sessions 4–6)
- **AR paid override:** 78 ABC invoices ≤2026-05-30 marked paid ($298,649.31; `raw.paid_override`; work_key `ar-paid-override-2026-08-09`). AR reconcile stale since 6/19 — nightly sync never touches ar_status. Remaining open non-CM ABC $350,002.60 vs Chris's QB $310,194.61 (Δ $39,807.99 ≈ invoices not yet in QB).
- **CM-doc policy:** credit memos NEVER enter the standard audit (`fb3862d`): pendingLines=0 for CM docs, add-line 409 `credit_doc`, bogus SRS draft cancelled, 36 leak lines stamped, docs/89 G1 requirement. Chase surface = **PEC-201**.
- **ABC integrity:** 25 June invoices line-truncated by the (now upstream-FIXED) 10-line API bug — June re-pull healed all (gap census 0). 10 missing July/Aug PDFs fetched after fixing `backfill-invoice-pdfs.mjs` truncation; live PDF links 302.
- **PEC-195 BUILT (Alex):** migs **229/229b** (`v_no_price_repeats`, `agreement_gap_queue`, `alex_no_price_triage()` — 180s fn timeout, `source='auto_match'` → Alex persona). First pass: 64 lines stamped (all repeats), **295 global-product-file candidates** queued; to-audit census **0**. Pill 7 live; builder gained the Agreement Gaps section (`#agreement-gaps`). Nightly: `abc-nightly-sync.sh` + PDF backfill step + Alex step (host pulled `2b048cb`, smoke-tested).
- **PEC-186 tree closed** (incl. parent CAT-30) — gate live test complete, Maya replied.

## Git State
- **Branch:** `main` == `origin/main` (agent host `/opt/openbrain` synced to `2b048cb`)
- **Last commit:** see `git log` (handoff commits after this file)
- **Uncommitted changes:** none — this handoff commits as part of wrapup
- Migrations applied: **228, 229, 229b** (+ prod data ops all logged in `dashboard_action_log`). Deployed `buildCommit 2b048cb` verified.

## Task Cut Off
None — clean boundary. All directives executed and verified.

## Next Task — Start Here

**Task:** PEC-196 **B1→B3** (multi-vendor promote + builder threading), then **PEC-201** (CM chase page).
**What to check / do (B1):**
1. Read `docs/90` §rebuild + the PEC-196 epic comment (full file:line inventory).
2. B1: additive mig — `price_list_pdf_staging.vendor_slug`; review UI shows it; promote branches by vendor.
3. B2: generic promote path → `price_agreements`/`price_agreement_items` (uuid ids), Surface-2 `source:"abc"|"generic"` pattern; B3: builder branch universe from `vendor_branches`, `agreement_packages.vendor_slug`, per-vendor NAM in roster; fix handoff.ts unbounded update.
**If ABC breaks:** every guard fails closed with 409 — revert the single commit; guards are independent of data.

**Prompt to use:** "Read docs/handoffs/current.md, then start PEC-196 B1 (read docs/90 and the PEC-196 epic inventory comment first). Verify ABC and SRS through the live call path; silo_assertions() must stay 0."

## Decisions Made This Session

- **Credit-memo docs never enter the standard invoice audit** — they reconcile against the original invoice / CM request (receipt flow). Every future claim generator excludes `doc_type='credit'`.
- **All No-Price triage belongs to Alex** (nightly): repeats (≥2/calendar-year per vendor+office) → `agreement_gap_queue` = intake for the **global product file** (base standard for all negotiated price lists); the rest auto-approve as Alex. ⚠️ Threshold flag: Chris's later phrasing "more than twice" would be ≥3 — one constant in `alex_no_price_triage()`.
- **AR paid overrides are legitimate directive ops** — `raw.paid_override` provenance + action log; durable because only AR-report imports write ar_status.
- **QB dates stay ISO `YYYY-MM-DD`** (Chris confirmed "ISO").
- **PostgREST 1000-cap is a standing audit item** — struck twice more today (backfill script, qb CSV endpoint); paginate every read that can exceed 1000.
- **Function-scoped `statement_timeout`** for heavy RPCs called via PostgREST (`ALTER FUNCTION … SET statement_timeout`).

## Blockers Requiring Human Action

1. **None urgent.** Optional: confirm Alex threshold (≥2 built vs "more than twice" = ≥3); reconcile the $39,807.99 QB delta (I can generate the >05-30 open list for Lucinda on request).

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `origin/main` HEAD.
2. SQL: `select count(*) from silo_assertions();` — **0**.
3. SQL: `select alex_no_price_triage();` — idempotent; `stamped:0`, `candidates_open:295` (grows with new data).
4. SQL: pending census (docs in PEC-202) — **0 lines**.
5. `ssh root@178.156.203.23 'tail -5 /var/log/openbrain-abc-sync.log'` after 07:30 UTC — pdf backfill + alex triage steps log OK.

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine; property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens; AccuLynx→JobTread gated write queue; QuickBooks read-only mirror (docs/74); Slack agent identities; AgentMail; Maya accounting inbox + CAT-first runtime; Invoice Audit v2 (docs/81, migs 197–203); docs/82 remediation R1–R6; docs/83 Price Agreement Management; docs/84 GUI audit; Friday WIP/AR live board (docs/85, migs 215–216) + nightly Excel pack; PE-US-AGENTS host, QBO nightly sync w/ token-rotation persistence; office silo (migs 217/222); vendor payment memos (docs/86, mig 218); CM receipt reconciliation (mig 220); SRS/QXO in Invoice Audit (mig 221); vendor-silo re-key (mig 223) + nightly silo_assertions(); job-walk wrap fix (PEC-187); Maya repair gate (migs 224/225) **proven end-to-end**; multi-vendor CM pill (docs/88); QB bank CSV export (mig 226) + format v2 (job#-only Check No, ISO dates); SRS parity wave 1 (migs 227/227b) + docs/89; **7-pill KPI row + realtime (mig 228); price-list canonical URLs; PEC-196 phase A guards + roster agreementStatus (docs/90); Alex No-Price triage (migs 229/229b) + agreement_gap_queue (global product file intake); nightly PDF backfill; AR paid override; CM-doc audit exclusion.**

### Architecture decisions
- All prior handoff decisions stand. Vendor roster (`cm-vendor-roster.ts`) = ONE seam, two axes (`cmStatus`, `agreementStatus`). Price Agreements page = the multi-vendor reference (`source:"abc"|"generic"` dual-path, `(office_id, vendor_id)` keys) — converge Surfaces 1+3 on it. `priceListUrl()` = the only price-list href builder. `kpi-pills.ts` = the only KPI data source. `agreement_gap_queue` = global product file intake.
- "ABC classes" on the builder = Pareto A/B/C inventory classes, NOT the vendor — never rename.

### Key invariants (never violate)
- Additive/idempotent migrations; archive, never delete. Price agreement = (vendor, PE office); fail closed. Compare prices only in pricing UOM (docs/46). `main` deploys; verify /healthz; **a fix isn't fixed until the LIVE call path proves it**. QBO read-only forever; agents never email external domains. `silo_assertions()` = 0 after every silo-adjacent change. **Credit docs never enter the standard audit.** Paginate every PostgREST read that can exceed 1000 rows.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | cc.proexteriorsus.net — Coolify uuid `lu5txzhyoza7uuz0scwpobv7`, builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` — schemas through **229b** |
| Agent host | PE-US-AGENTS `178.156.203.23` (`~/.ssh/hetzner_office`); repo `/opt/openbrain/a-roofers-open-brain` @ `2b048cb`; timers: abc 07:30 (**+ pdf backfill + alex triage**) · qbo 01:00 · wip-pack 11:00 · jt-sentinel 17:00 · maya-gate */15 (UTC) |
| Secrets | 1P CW_Master via `op` (QBO PROD TOKENS, Coolify Root API, SUPABASE_ACCESS_TOKEN, LINEAR_API_KEY, AGENTMAIL_API_KEY) |
| Slack / Linear | #pe-cc-dev-team `C0BNVF99Y74`; team PE-CC-DevTeam; approver allowlist `U0B8SGJJZLJ` |
| Dev server | `.claude/launch.json` port **4399** (Local Operator auth — the verify path for human-gated endpoints) |
