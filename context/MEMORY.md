<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## Active Threads
- **Price Agreement Audit suite** (2026-06-17, on `main`): Invoice Audit + 6 KPI drill-downs, Negotiated Item Catalog, Price List Audit vendor→branch coverage tree (LIVE Supabase loader), `/abc-price-agreement-gaps` = workflow home. Kept the deployed Google-Maps **Vendor Map** at `/vendor-territories`.
- **DEV ⇄ LIVE UNIFIED + deployed**: `origin/main` = `9b0a882` (had diverged: stale local main vs the deployed map/WorkOS branch). Coolify auto-deploys on main push — VERIFY the build landed on cc.proexteriorsus.net.
- **NEXT — pick up here:** interview Chris on the new **menu bar** + **page schema**, then redesign. He was about to open http://127.0.0.1:4321/ and say "go". Detail in `docs/handoffs/current.md`.
- DB live: migrations 95 (price_refresh_request branch grain) / 96 (abc_change_log RLS) / 97 (vendor_branches contact projection — 54/54 in-scope branches now have ABC manager email) + views v_price_list_branch/_item, v_vendor_branch_abc_xref. Plan: `docs/39`.
- Estimate pipeline (docs/33) BUILT thru Phase 6; awaits Roberto labor-rate approval.

## Environment / Deploy contract
- **CLAUDE.md rule 11 / AGENTS.md:** source of truth = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE branch = `origin/main`**; Coolify builds `app/command-center/Dockerfile` → `https://cc.proexteriorsus.net` (WorkOS auth). Branch FROM live, commit early, merge back — never diverge.
- Local dev: `http://127.0.0.1:4321/` (Local Operator, no WorkOS gate).
- Supabase `rnhmvcpsvtqjlffpsayu`. `.env` = real secrets (incl. Coolify/Maps/WorkOS); `config/.env.example` names-only.

## Open threads
- Redesign menu + page schema (interview pending).
- Sales-rep EMAIL still a gap (not on ABC site/Location API; rep NAME from price_agreements). Branch-manager contacts now filled from ABC API.
- Price List Audit v1 honest gaps: item $ partial (no invoice-price join), item-match ~12% → most branches read "partial", year factors synthetic, Request write-path client-mock. Invoice audit / drill-downs / catalog still SAMPLE data.
- `outputs/` HTML mockups NOT committed (dev artifacts).
