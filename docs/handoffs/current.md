# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify via `/healthz` `buildCommit`)
**Date:** 2026-08-05 22:15
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup (end of session)

> Prior handoff (JT Sync Sentinel, 2026-08-05 07:26) archived under `docs/handoffs/archive/`.

---

## Accomplished This Session

### Invoice Audit v2 — R5 cleanup + docs/82 close-out
- `schemas/cleverwork-roofer/204-archive-euless-office.sql`: Euless, TX office archived (`is_active=false`; boundary/rings kept as history); its 2 Wichita Falls branches + 42 stale suggestions repointed to Richardson.
- 12 orphaned invoice-audit API routes + 4 orphaned libs + 4 test files deleted; dead code removed; `POST /api/invoice-audit/classify` added (v2 agent write path; agents blocked from passing variance/UOM lines); Service/Warranty page variant retired; "To Audit" KPI → "Claims To Review".

### Territory map v2 cutover + vendor silo
- `schemas/.../205-office-vendor-agreements.sql`: all-vendor office coverage (`v_office_vendor_agreements`); SRS's 3 agreements (Melissa L4→Richardson, 0049828559→Wichita, 0049345641→Denver) join the office-inherited model; duplicate SRS rows archived.
- Ring semantics (Chris): green=in-date in-force, yellow=expired-evergreen(PAEXP)/unrouted, red=no agreement (incl. QXO), grey=out-of-scope; `ceo_verified` demoted to display badge.
- `schemas/.../207-resolve-tx-overlap-pending.sql`: all 29 stranded overlap_pending branches (Euless two-ring artifacts, 15 SRS + 14 QXO) resolved to Richardson.
- `schemas/.../208-vendor-silo-office-views.sql` + app fixes: branch-number collisions (QXO 113/249/… vs ABC) sealed in the views, in the map's ABC-API evidence, and in `/accounting/price-list/branch` (now vendor-scoped via `&vendor=`).
- `/accounting/vendor-regions` rebuilt on the interactive map (rotted static-SVG page + demo "Price List Requests" panel removed); office cards list all vendors' chains; `?office=` honored.

### CM review flow (three QA rounds with Chris)
- Per-line review checkboxes in the audit tree: claim lines sync the Weekly CM stamps; a checked negotiated-variance line JOINS the CM claim set via `POST /api/credit-memos/add-line` (never "accepts" the price); No-Price/UOM lines record reviewed-valid via classify.
- Approve/Un-approve dead-click fixed (inline stopPropagation swallowed the delegated handler); Credit Memo Requested KPI card updates live.
- `schemas/.../212-credit-memo-claims-sync.sql`: claim-set ↔ live-engine sync, running in the 15-min matview cron — claim sets can never drift from the engine (first run: 44 synced, 16 phantom drafts cancelled).
- `schemas/.../213-claims-sync-agreement-context.sql` (+213b backfill): every claim line carries office + agreement (number/eff/expiry) — the weekly email cites the agreement per line; 89+41 already-reviewed claims stamped as decided.
- Reviewing a claim = the line's audit decision ('disputed' appended; un-review re-pends); "N to audit" counts only visible discrepancy lines (summary + detail + lazy paths); checkbox clicks no longer collapse categories; sub-nickel variance = In Tolerance (0.05 floor).
- `schemas/.../214-at-risk-excludes-decided.sql`: `$ At Risk` excludes passed AND disputed — no longer mirrors the CM total; CM card shows draft dollars ("69 approved ($4,629) · 2 draft ($504)" = $5,132 headline).

### docs/84 full-GUI audit + W1–W3 remediation
- Three parallel audit agents traced every pill/table/link to its data source → `docs/84-gui-surface-audit.md` (findings in waves W1–W4).
- `schemas/.../209-order-estimate-office-pricing.sql`: Order Audit + Estimate Audit cut over to office-inherited evergreen pricing (ship-to fallback arm kept); new `v_ship_to_pricing_office`; office resolvers ABC-siloed.
- W2 (delegated subagent): 14 sample/dead files deleted (5 fabricated audit queue pages, dashboard.astro mock, frozen-clock price-list-coverage chain, orphan components/route); /agents Open-Items fixed + auth panel honesty; sales call-priority dead branch removed; catalog fixes.
- W3: map "Expired (evergreen)" filter, in-force isNegotiated, dead counters removed; `request_kind` guards in credit-memo lookup/disposition; dead disposition/comms CSS purged.

### Price Agreement Management (docs/83, P1–P3 core)
- `schemas/.../210` (vendor_office_item_history_210): `mv_vendor_office_item_history` (purchase count, qty, lifetime value, min/max/avg/latest per office+vendor+item; 15-min refresh) + `price_agreement_proposals`.
- NEW `/accounting/price-agreements`: coverage chips (PAEXP-aware) + Gap Worksheet (≥2 lifetime buys, no in-force price — **535 items / $1.47M lifetime spend un-negotiated**) + Renewal Worksheet (678 items, avg-paid variance) + persisted proposed-price inputs (`/api/price-agreements/propose`).
- `schemas/.../211-price-agreement-requests.sql` + generator + request page: monthly per-vendor packet (frozen snapshot, forwardable HTML + CSV/MD, month tracker). **SRS 2026-08 request generated (39 renewals incl. the expired KS/CO quotes).**
- P3 partial: `/abc-price-agreement-gaps` + `/accounting/price-list/review` 301→ `/accounting/price-agreements`; their libs/scripts deleted; nav, precache, and map links updated (Price Agreements link now all-vendor).

## Git State
- **Branch:** `main` (canonical; Coolify auto-deploys on push)
- **Last commit:** `1707986` — "fix(invoice-audit): $ At Risk excludes decided lines (mig 214); CM card shows draft dollars" — **deployed & verified** via healthz
- **Uncommitted changes:** only this handoff (committed as part of wrapup)
- Migrations **204–214** applied to prod Supabase (`rnhmvcpsvtqjlffpsayu`); schema files mirror them. Note: another session's Maya inbox-triage commits merged into `main` mid-evening (rebased cleanly).

## Task Cut Off
None — session ended at a clean boundary after QA round 3 (KPI reconciliation) deployed and verified.

## Next Task — Start Here

**Task:** Task #9 — PAM remainder (AgentMail auto-draft + ingest absorb + final retirements)
**What to check / do:**
1. Build the AgentMail send/draft client (`lib/agentmail.ts` is config-only today) so the monthly price-agreement packet auto-drafts via Maya.Chen to Chris & Lucinda on the 1st; wire the weekly CM email through the same plumbing (shared with Phase 6 Tuesday automation).
2. Port `api/price-agreement/review/promote.ts` off the legacy ABC tables (it still writes `abc_price_agreements` + branch matches with `ceo_verified:false`) to `price_agreements`/generic model; absorb the staged-list QA into a PAM "Request & Ingest" section.
3. Then retire `/accounting/price-agreement/builder` + `/accounting/price-agreement/review` with redirects; decide the 12 `[slug]` dashboards' `abc-price-gaps` engine (docs/84 W1 item 3).
4. Separate builds still open: Phase 4 OCR verifier (Unstructured), Phase 5 SRS/QXO invoice ingestion (QXO source files with Chris), Phase 6 Tuesday INV-PROCESSED producer, W4 vendor-hardcode sweep.

**If a Coolify manual redeploy is needed:** the API token in root `.env` is DEAD (401) — Chris must mint a new one in the Coolify dashboard; webhook deploys on push to `main` still work fine.

**Prompt to use:** "Read docs/handoffs/current.md and docs/83-price-agreement-management.md. Then start task #9: build the AgentMail draft client + monthly auto-draft cron for the price-agreement request packets, then port promote.ts off the legacy ABC tables and absorb the staged-list QA into /accounting/price-agreements."

## Decisions Made This Session (do not re-litigate)
- **Ring/status semantics:** Healthy = in-date in-force agreement (direct or office-inherited); Needs Attention = expired-evergreen (PAEXP) or unrouted; Problem = no agreement at all (QXO = red); `ceo_verified` is display-only, never a gate.
- **Full union:** office inheritance covers ALL vendors via `v_office_vendor_agreements`; the audit engine's generic arm lands with Phase 5 ingestion (verifiable against real rows).
- **Vendor silo:** branch-number joins must always be vendor-scoped — no vendor's pricing may ever surface on another vendor's status, price list, or agreements.
- **Gap rule:** ≥2 purchases lifetime per vendor+office with no in-force negotiated price ⇒ Gap Worksheet auto-enrollment.
- **Monthly requests:** auto-draft on the 1st via Maya.Chen AgentMail (generate-and-forward until the mail client exists).
- **Line review contract:** checking a variance line JOINS the CM (never accepts the price); No-Price/UOM check = reviewed-valid; a review IS the line's audit decision; agents may not pass variance/UOM lines.
- **At-risk:** overcharge NOT yet decided (excludes passed + disputed) — disjoint from the CM total by definition.
- **Claim sets:** must always match the live engine — the 15-min `credit_memo_claims_sync_all()` enforces it; sent/received CMs are never touched.

## Blockers Requiring Human Action
1. **Coolify API token** — mint a new token in the Coolify dashboard (stored one 401s); update root `.env`.
2. **QXO invoice source files** — needed before Phase 5 QXO ingestion.
3. **Ready to send (human forward):** 69 approved CMs on `/accounting/credit-memos/weekly`; SRS 2026-08 renewal request on `/accounting/price-agreements`.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` should equal `origin/main` HEAD (`1707986…` at handoff time).
2. `cd app/command-center && npm run build && npx vitest run` — build Complete!, 286/286 tests.
3. SQL (prod): `SELECT public.credit_memo_claims_sync_all();` — returns ok; cancelled count settles at 0 once stable.

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine (Supabase + pgvector, containerized MCPs); property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens (workos-agent-auth skill); AccuLynx→JobTread migration via gated write queue (2026-07-27/28); QuickBooks read-only mirror (docs/74); Slack agent identities (slack-agents skill); AgentMail webhook plumbing; Maya accounting inbox triage (activated 2026-08-05, separate session); Invoice Audit v2 (docs/81: two-axis status model, migs 197–203); docs/82 remediation R1–R6 (office-inherited engine cutover mig 201, CM review gates mig 202, reset v2 mig 203, map cutover, vendor silo); docs/83 Price Agreement Management P1–P3 core (migs 210–211); docs/84 full-GUI audit + W1–W3 fixes (migs 209, 212–214); migrations 204–214 all applied 2026-08-05.

### Architecture decisions
- Office-inherited, invoice-date-effective, evergreen (PAEXP), lowest-price-wins pricing is THE model everywhere; ship-to matches survive only as a no-regression fallback arm.
- Matviews (`mv_office_agreement_versions`, `mv_invoice_pricing_office`, `mv_vendor_office_item_history`) refresh on a 15-min pg_cron job that also runs `credit_memo_claims_sync_all()`.
- Append-only audit ledger (`invoice_line_audit`; current-state via `v_invoice_line_audit_current`); `invoice_line_reaudit` is the claim store — `classification='engine_resolved'` removes a row from gates without deleting history.
- Astro SSR + vanilla client scripts; dev server reads prod Supabase; `.claude/launch.json` (gitignored) strips inherited SUPABASE env vars.

### Key invariants (never violate)
- Additive/idempotent migrations only; archive, never delete (hard rule 1).
- Vendor silo: never key pricing across vendors by bare branch number.
- Compare prices only in the pricing UOM via `price_per_uom` (docs/46).
- Sent/received CMs are history — only draft/approved rows may change.
- `main` is the only deploy branch; verify `/healthz` `buildCommit` after every push.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | https://cc.proexteriorsus.net — Coolify app uuid `og0rmt02rff8qti9nlfk3nr7`, builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` (one DB for dev + live) |
| Deploy check | `GET /healthz` → `buildCommit` (≈30–90s after push, ~300s cold) |
| Coolify API | token in root `.env` DEAD (401) — needs re-mint; push-webhook deploys unaffected |
| Linear | team **PE-CC-DevTeam** (PEC-…) |
