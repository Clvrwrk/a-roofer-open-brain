# Handoff — Price Agreement Audit suite + Dev⇄Live unification

**Date:** 2026-06-17 · **Branch:** `main` @ `9b0a882` (= `origin/main`, deployed) · **Full log:** `context/memory/2026-06-17.md` (Sessions 1–12)

## ▶ PICK UP HERE (the very next step)
**Interview Chris on (1) the new menu/nav bar and (2) the page schema, then redesign the app.** Chris was about to open **http://127.0.0.1:4321/** and say "go" to start that interview. The current left-nav (what we're redesigning) = Work Queue · Agent Monitor · Accounting · **Price Agreement Audit** · Price Foundation · **Vendor Map** · Weekly Snapshot, + Departments list.

Before interviewing: dev server should be on `http://127.0.0.1:4321/` (Local Operator, no WorkOS gate). If down, restart `astro dev` in `app/command-center`.

## What shipped this session
- **Price Agreement Audit suite** (all on `main`):
  - `/abc-price-agreement-gaps` = **workflow home** (live KPIs + entry cards: Price List Coverage % → vendor-regions, Negotiated Catalog, Agreement Gaps queue, Invoice Audit downstream).
  - `/accounting/vendor-regions` = **Price List Audit** vendor→branch→item **coverage tree** on a **LIVE Supabase loader** (`loadPriceListCoverage`): real branches, drive-time (in-scope), region-agreement coverage (full/partial/none), real ABC **manager contacts**, Request-Price-List flow (client-mock), requests tracker.
  - `/accounting/price-list/catalog` = **Negotiated Item Catalog** (top-200 by spend, year + period toggles, stacked bars by Vendor → Vendor Branch when filtered).
  - `/accounting/invoice-audit` + 6 drill-downs (`/accounting/audit/{pending,out-of-tolerance,at-risk,no-price-lines,credit-memos,avg-resolution}`) — SAMPLE data, V1 worklist, Year filter, theme toggle, deep-links.
- **Kept the deployed Google-Maps Vendor Map** at `/vendor-territories` (origin/main already had it + WorkOS).

## Live DB (Supabase `rnhmvcpsvtqjlffpsayu`) — applied + verified
- `95-price-list-requests.sql` — additive branch-grain + weekly-follow-up cols on existing `price_refresh_request` + `v_price_refresh_request_aging`.
- `96-rls-abc-change-log.sql` — RLS on `abc_change_log` + service-role/auth policies (closed the advisor finding).
- `97-branch-contact-projection.sql` — crosswalk view `v_vendor_branch_abc_xref` + backfilled `vendor_branches.manager_name/email` (94 branches; **54/54 in-scope have ABC manager email**) + `sales_rep_name` (3).
- Loader views: `v_price_list_branch`, `v_price_list_branch_item`.
- Go-live plan + all decisions: `docs/39-price-list-audit-go-live-plan.md`.

## Dev⇄Live alignment (now a hard rule)
- Root cause: this session's work sat **uncommitted on a stale local `main`** while production ran a *different* branch (Google map + WorkOS). Fixed: committed → rebased onto `origin/main` (clean, local main was an ancestor) → **pushed `852bcfa..9b0a882 → main`**. Dev and live are one lineage.
- **Guardrail added:** CLAUDE.md **rule 11** + a "Live ⇄ Dev alignment (deploy contract)" section, and AGENTS.md worktree discipline. **Canonical live branch = `origin/main`**; Coolify builds `app/command-center/Dockerfile` → cc.proexteriorsus.net (WorkOS). Branch FROM live, commit early, merge back.
- ⚠️ **VERIFY:** Coolify auto-deploy on the `main` push — confirm the build went green in Coolify and `cc.proexteriorsus.net` shows the new nav. I could not trigger/watch the Coolify build (token not API-usable from `.env`).

## Open threads / honest gaps
- **Sales-rep EMAIL** still missing (not on ABC website or Location API; rep NAME comes from `price_agreements.sales_rep`). Branch-manager contacts are solved (from ABC API). Needed before the Request flow can actually send.
- **Request write-path** is still client-side mock — wire to `price_refresh_request` + the weekly-follow-up job (no external send without human approval).
- Price List Audit v1: item **$ is partial** (no invoice-price join yet — coverage is the real metric); **item-match ~12%** so most covered branches read "partial"; **year factors synthetic** (no per-year purchase rollup).
- Invoice Audit + drill-downs + catalog still **SAMPLE** data — port to live like the coverage tree did.
- `outputs/` HTML mockups (the original 5 invoice-audit + pending-audit + kpi-drilldowns) are NOT committed (dev artifacts); 5 layout variants per surface live there if a different layout is ever wanted.
- The 5 layout-variant mockups proved the V1 "worklist" winner; only V1 was ported to the app.
