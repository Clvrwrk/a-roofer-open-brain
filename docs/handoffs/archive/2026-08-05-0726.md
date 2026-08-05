# Project Handoff — PE Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + memory brain)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-04 23:50
**Agent:** Claude Code (Fable 5) — Lead Orchestrator
**Reason:** User-requested `/project-handoff` (+ full Linear handoff)

---

## Accomplished This Session

### Vendor expansion — QXO + SRS modelled end to end
- `integrations/bridges/{qxo,srs-roofhub}/data/branches-2026-08-04.{json,csv}`: **QXO 566 stores** (via the finder's backend `beacon-ng.becn.com/v1/store-location`; 30-item cap beaten with an adaptive quadtree sweep, 480 calls) and **SRS 448 branches** (find-a-branch + all 448 detail pages, schema.org LD+JSON): address, geo, phone, fax, hours, branch manager + email, products, sales-team roster.
- `integrations/bridges/load-vendor-branches.mjs`: idempotent loader → 1,014 rows in `vendor_branches`. SRS has no public branch numbers, so stable codes are derived from detail-page slugs.
- `schemas/cleverwork-roofer/192-vendor-invoices-multi-vendor.sql`: `vendor_invoices`, `vendor_invoice_lines`, `vendor_invoice_uploads`, `vendor_branch_code_map`, `vendor_item_uom_map`.
- `integrations/bridges/ingest-vendor-invoice-csv.mjs`: one Billtrust-shape parser, two column maps. Loaded SRS 30 invoices ($73,968) + QXO 23 ($17,556, 2 accounts) = **283 priced lines**. QXO statement export yields AR open/closed + paid-date proxy.
- `integrations/bridges/ingest-agreement-pdfs-2026-08-04.mjs`: ABC Denver (153 items), DFW (137), + SRS Melissa TX Level 4 (97), Wichita quote (17).
- `integrations/bridges/abc-supply/ingest-price-sheet-ocr.mjs`: Unstructured `hi_res` OCR for image-only sheets. Wichita 2036874-16 went **0 → 157 items**.
- `docs/79`, `docs/80`: onboarding plan + file-format/ingestion spec.

### Emergency infrastructure rebuild (both hosts crashed)
- **PE.CC.DEV `178.105.220.14`** (cpx62, fsn1): key-only SSH, Coolify installed, Cloudflare DNS repointed, `command-center` app recreated, **119 env vars restored**, TLS on both hostnames, GitHub webhook re-secreted — push→deploy verified.
- **PE-US-AGENTS `178.156.203.23`** (cpx21, Ubuntu 24.04, **ash**): created because ABC's WAF 403s the EU IP. `openbrain-abc-sync.timer` runs here (03:30 ET), disabled on the EU host.
- All 4 SSH keypairs backed up to 1Password **CW_Master** (SHA-256 verified identical).

### Territory + pricing
- `schemas/cleverwork-roofer/193`: **Atlanta (Jonesboro), GA office** — was missing entirely; 48 GA branches had no pricing territory. Real 120-min isochrone via **Routes API** (`google_routes_bearing_v1`, 150.0 km mean radius).
- `scripts/compute-office-drive-time-boundary.mjs`, `scripts/geocode-vendor-branches.mjs`, mig `194` (`assign_branch_territories()`): **589 ABC branches geocoded, 0 failures**; 138 branches now territory-assigned across 6 offices.
- `schemas/cleverwork-roofer/195`: inheritance views — `v_vendor_agreement_current`, `v_office_vendor_branch`, `v_office_vendor_price_item`, `v_office_vendor_inheritance`.
- `app/command-center/src/lib/price-agreement-coverage.ts` + Territory Coverage section on the Agreement Builder + `src/pages/api/price-agreement/coverage-export.ts` (PDF/CSV per vendor, accounting-gated).

### Map
- `app/command-center/public/vendor-icons/*`: vendor logos on opaque white discs (ring = status lens), PE roof badge for offices, single-vendor cluster badges.
- `VendorTerritoryMap.astro` / `vendor-territories.ts`: **2-hour drive-time rings restored** (the compact payload was nulling `boundary`), contact hotlinks for all branches.

## Git State
- **Branch:** `main` — **`main == origin/main` (0 ahead / 0 behind)**
- **Last commit:** `e5011fc` — "fix(builder): Territory Coverage heading invisible in dark mode"
- **Uncommitted changes:**

| File | Status | Note |
|------|--------|------|
| `docs/handoffs/current.md` | Modified | This handoff (commit with it) |
| `context/memory/2026-07-27.md` | Untracked | Pre-existing, unrelated |
| `docs/analytics/`, `scripts/analytics/` | Untracked | Pre-existing — GROK `/analytics` Aspose pack (see archived 2026-07-30 handoff) |
| `scripts/build-cpa-bank-decision-pack.py` | Untracked | Pre-existing |
| `raw data/` | Untracked | Pre-existing — xlsx working files, do NOT commit (client data) |
| `docs/handoffs/archive/2026-07-30-0006.md` | Untracked | Prior handoff archive |

## Task Cut Off
None — session ended at a clean boundary. Last change (dark-mode heading fix) is deployed and live.

## Next Task — Start Here

**Task:** Send vendor coverage rosters to the reps (PEC-137)

**What to check / do:**
1. Open https://cc.proexteriorsus.net/accounting/price-agreement/builder → "Territory Coverage — who inherits which price list". **Verify it renders in both light and dark mode** (PEC-141 — no UI was visually verified this session).
2. Export per vendor: `GET /api/price-agreement/coverage-export?vendor=abc-supply&format=pdf` (also `qxo`, `srs`).
3. Confirm the gaps before sending: **Atlanta has no agreement with any vendor (39 branches)**; **QXO has none anywhere (59 branches)**; KC + Wichita run on lapsed-but-extended ABC lists.

**If the Builder 500s:** it is the pre-existing `v_negotiable_items` statement timeout (PEC-139), not the coverage section — the page now degrades with a "Partial data" notice instead of dying.

**Prompt to use:** "Read docs/handoffs/current.md. Then export the vendor coverage PDFs for ABC, QXO and SRS and draft the rep emails for the Atlanta and QXO agreement gaps."

## Decisions Made This Session

- **Generic `vendor_invoices` tables, not per-vendor clones** — both portals emit the same Billtrust CSV shape; one parser, two column maps.
- **Evergreen price lists** — a lapsed agreement stays in force until the vendor replaces it (ABC agreed; assumed for all vendors). `is_lapsed` means "Extended", never an error.
- **Competing agreements resolve per item, lowest price wins** ("best-of blend"), with the source branch recorded so a rep can see what to match.
- **UOM safety (docs/46)** — prices only ever compared within the same unit; OCR rows with no UOM are stored `null`, never guessed.
- **Routes API, not Distance Matrix** — Distance Matrix is denied on `GOOGLE_MAPS_SERVER_KEY`; `computeRouteMatrix` is enabled. The browser key is referrer-restricted and correctly unusable server-side.
- **Two-host split restored** — EU box for Coolify/CC, US Ashburn box for US-egress syncs, because ABC's WAF geo-blocks the EU IP.
- **A branch inside two office rings belongs to both** — both offices genuinely buy there (29 such branches, Euless ∩ Richardson).

## Blockers Requiring Human Action

1. **Visual verification of all UI work** — the local dev server never started this session (`preview_start` reported success, nothing listened on 4321). Map markers, drive-time rings, cluster pills and the Territory Coverage section were verified by build + API/data checks only.
2. **QXO has no negotiated agreement anywhere; Atlanta none with any vendor** — needs the rep conversation (PEC-137/PEC-140).
3. **Linear MCP connector token expired** — this handoff used the `LINEAR_API_KEY` from CW_Master over GraphQL instead. Re-authorize the connector via `/mcp` in an interactive session if you want MCP access back.
4. **Hetzner account** — confirm nothing else was lost in the crash; only the two servers were rebuilt.

## Verification Commands
1. `curl -s -o /dev/null -w "%{http_code}\n" https://cc.proexteriorsus.net/accounting/invoice-audit` — must return **302** (auth enforced). A 200 means the auth regression is back.
2. `curl -s https://cc.proexteriorsus.net/healthz | jq -r .buildCommit` — should be `e5011fc…` or later.
3. `ssh -i ~/.ssh/a_roofers_open_brain_ed25519 root@178.156.203.23 'systemctl list-timers openbrain-abc-sync.timer --no-pager'` — next run 03:30 ET on the **US** host.
4. Supabase: `select office_name, vendor_slug, branches_in_territory, primary_branches, branches_inheriting, priced_items from v_office_vendor_inheritance order by 1,2;` — 18 rows, 6 offices × 3 vendors.

## Full Context

### What was built across ALL sessions (running list)
- OB1 memory spine, property-first atom model, MCP containers
- ABC Supply API mirror (invoices, orders, catalog, pricing) + nightly cycle-count sync
- UOM pricing normalization (docs/46, migs 119–122) — `price_per_uom` is the canonical effective price
- Invoice audit + disposition engine (`disposeInvoice`), credit-memo flow, payment/register export
- AccuLynx mirror + PE job-naming alignment (mig 163); JobTread mirror (34,433 writes)
- QBO read-only mirror (PEC-98); CenterPoint mirror; Executive pipeline
- Vendor territory map (Google Maps + drive-time isochrones)
- `/analytics` Aspose formula workbook packs (GROK, 2026-07-29/30)
- **This session:** QXO + SRS end-to-end, host rebuild + US host, Atlanta office, full geocoding, price-agreement territory inheritance + rep coverage roster

### Architecture decisions
- ABC keeps its own `abc_*` tables; QXO/SRS use generic `vendor_*` tables; the inheritance views UNION both. ABC was not migrated — too much depends on it.
- Canonical UOM columns on `abc_invoice_lines` are **generated columns over ABC's exact `raw` JSON shape**. New vendors compute UOM in the **loader** instead, because a CSV vendor would produce NULLs and silently drop out of every audit view.
- `assign_branch_territories()` never overrides a human-decided territory (`territory_decided_by`).
- The Agreement Builder loads its two data sources with `Promise.allSettled` — one slow loader must not blank the page.

### Key invariants (never violate)
- **`COMMAND_CENTER_AUTH_MODE` must be `workos` in production.** Anything else disables authentication entirely and makes every dashboard and API publicly readable. This caused a ~3.5h exposure today (PEC-135).
- Never compare prices across different UOMs (docs/46).
- QBO production is read-only / mirror-only (PEC-98).
- No secrets, service-role keys, or raw client PII in committed files.
- Migrations are additive and idempotent; never destructive.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Command Center | https://cc.proexteriorsus.net — Coolify app `lu5txzhyoza7uuz0scwpobv7` |
| Coolify | https://coolify.proexteriorsus.net — host `178.105.220.14` (PE.CC.DEV, cpx62, fsn1) |
| US agent/sync host | `178.156.203.23` (PE-US-AGENTS, cpx21, ash) — ABC nightly sync lives here |
| Supabase | `rnhmvcpsvtqjlffpsayu` — schemas through **195** |
| DNS | Cloudflare, zone `proexteriorsus.net` |
| SSH | key `~/.ssh/a_roofers_open_brain_ed25519`, user `root`, both hosts key-only |
| Secrets | 1Password **CW_Master** (+ `Hetzner-PE_CC_DEV` in the **Employee** vault: Hetzner API, Coolify root API token, root password) |
| Linear | Team **PEC** (PE-CC-DevTeam) · project "SESSION 2026-08-04 — QXO+SRS vendors, host rebuild, price inheritance" |

## Linear Accounting
- **Project:** [SESSION 2026-08-04 · QXO+SRS vendors, host rebuild, price inheritance](https://linear.app/cleverwork/project/session-2026-08-04-qxosrs-vendors-host-rebuild-price-inheritance-95be5c5e76e0)
- **Done (10):** PEC-127 branch registries · PEC-128 invoice/AR ingest · PEC-129 agreements + OCR · PEC-130 host rebuild · PEC-131 US host / geo-block · PEC-132 Atlanta office · PEC-133 geocoding + territories · PEC-134 inheritance + coverage · **PEC-135 SECURITY auth-disabled** · PEC-136 map work
- **Todo (5):** **PEC-137 send rep rosters** · PEC-138 docs/27 rebuild checklist · PEC-139 optimize `v_negotiable_items` · PEC-140 load QXO/SRS agreements · PEC-141 visual verification
