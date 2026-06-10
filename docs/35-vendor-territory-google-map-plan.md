# Vendor Territory Google Map Plan

## Goal

Restore the Vendor Territories experience from `deployment/remote/dashboard/index.html`, but make it production-grade inside the live Command Center.

This is not a static SVG map. The target is an interactive Google Maps surface backed by live Supabase data for PE offices, vendor branch locations, territory assignment, and current price-agreement authority.

## Prior Experience To Preserve

The previous app had the right interaction model:

- Top-level `Vendor Territories` workspace.
- Google Maps base map with normal pan, zoom, and geographic navigation.
- PE office markers.
- Vendor branch markers.
- Two-hour drive-time territory polygons around offices.
- Branch marker click opens a detail panel.
- Branch detail shows pricing gate status and current price agreement state.
- Overlap branches show candidate offices and let a human confirm the default office.
- Out-of-boundary branches route to branch-level price negotiation.
- Live `/api/territories` data when Supabase is available, snapshot fallback when not.

## Confirmed UX Decisions

- Default extent: full United States.
- Layout: large map-first workspace with a persistent right-side detail panel.
- Marker density: clustering on by default; as the user zooms, clusters split into visible clickable pins.
- Marker color priority:
  1. Branch-to-PE-office routing state.
  2. Current branch/region price-agreement state.
  3. Vendor brand color.
- Warning color: yellow means the branch does not have a final PE office route yet. This includes overlapping office territories where the branch must be assigned to one PE office so fallback regional pricing can apply.
- Blocked color: red means missing branch pricing or missing usable price-agreement authority.
- Vendor color: once routing and price-agreement states are healthy, use the vendor's established main logo color.
- Vendor expansion: ABC must work at 800+ branches first; QXO and SRS must fit the same data/model/UI without redesign.
- QXO and SRS state: show them as planned vendors in the UX/data model, but do not imply live coverage until their APIs are connected and populated.
- Human assignment behavior: yellow overlap/no-route decisions save immediately after the user chooses the PE office. The UI should still make the write obvious, show success/failure state, and preserve an audit trail.

## Source Of Truth

Supabase is the live source of truth.

Primary tables/views/functions already implied by the repo:

- `office`: PE office location, active state, drive-time minutes, cached territory boundary.
- `regions`: region/market records. Verify that the public Pro Exteriors location list has full address/contact coverage here, or is related cleanly from `office` if the schema separates office details from region details.
- `vendor_branches`: vendor branch location, geocode status, assigned/suggested office, pricing status.
- Vendor API mirror tables: `abc_vendor_branches` now, with QXO/SRS mirror tables planned later. These are ingest/source mirrors and must reconcile into canonical `vendors` + `vendor_branches`.
- `branch_office_candidate`: all offices whose two-hour boundary contains a branch.
- `vendors`: ABC now, QXO and SRS later.
- `price_agreements`: region-level and branch-level price authority.
- `branch_pricing_ok(branch_id)`: invoice/payment gate check.
- `territory_snapshot()`: map-shaped read RPC.
- `price_list_snapshot()`: price agreement currency and refresh-request state.

Browser clients must never receive service-role credentials. The Command Center should expose server-side Astro API routes that read/write Supabase using the existing server client pattern.

## Live Data Verification Requirements

Before build-out, run a read-only Supabase audit and capture the result in the implementation notes:

- Verify `https://proexteriorsus.com/locations/` against live Supabase.
- Confirm every public Pro Exteriors location has full address and contact detail in `regions`, or document the exact current split if `office` owns address/contact and `regions` owns pricing/market identity.
- Compare the ABC API mirror table `abc_vendor_branches` against canonical `vendors` + `vendor_branches`.
- Report API mirror count, canonical ABC branch count, matched branch count, unmatched API branches, canonical-only branches, and null coverage for key fields.
- Treat QXO and SRS as the same workflow once their APIs are connected: API mirror table first, then canonical vendor/vendor branch reconciliation.

### Read-Only Audit Snapshot: 2026-06-10

Public `https://proexteriorsus.com/locations/` currently lists 7 locations:

- Richardson, TX: `1778 N Plano Rd #118, Richardson, TX`, `844-336-PROS`
- Euless, TX: `1105 S Airport Cir Ste C, Euless, TX`, `844-336-PROS`
- Wichita, KS: `801 E Douglas Ave #270, Wichita, KS`, `844-336-PROS`
- Denver (Greenwood Village), CO: `5650 Greenwood Plaza Blvd Ste 145, Greenwood Village, CO`, `844-336-PROS`
- Kansas City, MO: `710 Central St Ste 40, Kansas City, MO`, `844-336-PROS`
- Valdosta, GA: `Address forthcoming`, `844-336-PROS`
- Burlington, NC: `Address forthcoming`, `844-336-PROS`

Supabase verification findings:

- `regions` has 8 rows and the fields `region_code`, `region_name`, `primary_city`, `primary_state`, `is_active`, `notes`, timestamps, and ids. It does not currently have full address/contact fields, and none of the 7 public location cards are present there with full address/contact detail.
- `office` has 5 active PE office rows matching Richardson, Euless, Wichita, Denver/Greenwood Village, and Kansas City. These rows have address, city/state, latitude, and longitude, but no phone number and no postal code.
- Valdosta, GA and Burlington, NC are public planned/forthcoming locations but are not currently represented as `office` rows and are not represented in `regions` with full address/contact detail.
- ABC canonical vendor is `ABC Supply Co.` / `abc-supply`.
- `abc_vendor_branches` has 720 API mirror rows.
- Canonical `vendor_branches` has 756 ABC rows.
- Only 86 API rows match canonical ABC rows by numeric branch number. This is not enough for source-of-truth matching because many canonical `branch_number` values are location slugs such as `huntsville-AL-35801-4061`, while the API mirror uses numeric ABC branch numbers such as `104`.
- 691 API rows match canonical rows by exact location/address heuristic, and 4 API rows had no match by branch number, exact address, or rounded coordinate heuristic in the read-only audit: Eagan MN `1254`, Hattiesburg MS `1339`, Camden NJ `413`, Bridgeport WV `662`.
- Canonical ABC null coverage currently includes: 36 missing address, 36 missing phone, 23 missing city, 19 missing state, 756 missing postal code, 607 missing latitude/longitude, and 724 missing `pricing_territory_office_id`.

Immediate data work before map launch:

- Decide whether public office contact fields belong on `office`, `regions`, or both. The user preference is `regions`; the existing schema currently stores physical office address/geo in `office`.
- Add or link the public Pro Exteriors locations so `regions` can answer the business requirement for full address/contact coverage.
- Add a canonical field for the vendor's native branch number, or migrate `vendor_branches.branch_number` for ABC away from generated slugs, before the map relies on branch-number matching.
- Build the weekly ABC reconciliation to backfill missing canonical address, phone, postal code, coordinates, and branch-native identifiers from `abc_vendor_branches`, while preserving human territory/pricing decisions.

## Vendor Import And Reconciliation Workflow

The recurring source-of-truth workflow should be:

1. Pull vendor API data into the vendor-specific mirror table without destroying prior canonical decisions.
2. Normalize branch identity using stable vendor branch numbers first, then normalized address/city/state fallback where needed.
3. Upsert canonical `vendors` and `vendor_branches` records.
4. Fill null canonical fields from fresher API data when confidence is high.
5. Preserve human decisions such as `pricing_territory_office_id`, `territory_decided_by`, and `territory_decided_at`.
6. Emit an audit report after every pull: new branches, changed branches, unresolved matches, null-field backfills, API failures, and branches requiring human review.

Schedule this as a weekly API pull for all connected vendors. ABC is first; QXO and SRS are planned and should plug into the same job contract.

## Data Contract

The map API should return enough data for a full interactive detail panel, not just plotting:

```ts
type TerritoryMapPayload = {
  generatedAt: string;
  source: "live" | "snapshot";
  vendors: VendorSummary[];
  states: string[];
  offices: OfficeMapNode[];
  branches: VendorBranchMapNode[];
  counts: TerritoryCounts;
};

type OfficeMapNode = {
  id: string;
  name: string;
  officeType: "brick_mortar" | "satellite";
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  driveTimeMinutes: number;
  boundary: GeoJSON.Polygon | null;
  boundaryMethod: string | null;
  boundaryComputedAt: string | null;
  activePriceAgreements: PriceAgreementSummary[];
};

type VendorBranchMapNode = {
  id: string;
  vendorId: string;
  vendorName: "ABC Supply" | "QXO" | "SRS Distribution" | string;
  branchNumber: string | null;
  branchName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  geocodeStatus: string;
  pricingStatus: "covered" | "overlap_pending" | "out_of_boundary" | "unclassified";
  markerPriority: "needs_office_route" | "missing_branch_pricing" | "vendor_brand";
  markerColor: string;
  assignedOfficeId: string | null;
  suggestedOfficeId: string | null;
  candidateOffices: CandidateOffice[];
  currentAgreement: PriceAgreementSummary | null;
  pricingApproved: boolean;
  invoiceGateStatus: "approved" | "blocked";
};
```

## Google Maps Responsibilities

Use Google Maps for presentation and route-derived geography, not as the database.

- Maps JavaScript API: render base map, markers, polygons, InfoWindows/detail interactions.
- Geocoding API: normalize office and branch addresses into lat/lng when Supabase rows are missing coordinates.
- Routes API or Distance Matrix: compute drive time from each PE office to vendor branches.
- Territory boundary generation: precompute and cache two-hour isochrone-style polygons in Supabase `office.boundary`.

Google does not provide a simple first-party "2-hour isochrone polygon" endpoint. The existing schema hints at `google_routes_bearing_v1`: sample bearings around the office, binary-search the reachable point for 120-minute drive time, build a polygon, store it, and mark `boundary_method`. Use `radius_fallback` only when Google routing fails.

Do not compute 800+ branch routes in the browser. Enrichment and territory classification should run server-side or as a scheduled/import job, then cache results in Supabase.

The browser Maps key must be supplied through `GOOGLE_MAPS_BROWSER_KEY`, never committed to source. The production key provided for this build is restricted to `*.proexteriorsus.net/*`; local testing needs an additional localhost referrer or a dev origin under that domain.

## UI / UX Target

Top-level left-nav item:

- Label: `Vendor Map` or `Vendor Territories`.
- Route: `/vendor-territories`.
- Active state independent from Accounting.

First screen:

- Full operational map as the primary surface.
- Persistent right-side detail panel for selected office/branch.
- Filter bar above or overlaying map, not hidden in Accounting source detail.

Controls:

- Vendor filter: All, ABC, QXO, SRS.
- QXO and SRS appear as planned filters until live API data exists; their empty state should say planned, not broken.
- Geography filter: US, state, office territory.
- Status filter: covered, overlap, out-of-boundary, unclassified, missing price agreement.
- Search: branch number, branch name, city, state, vendor.
- Map controls: normal pan/zoom, fit US, fit selected state, fit office territory, reset view.
- Marker clustering on by default for 800+ branches; clusters split into clickable pins as zoom increases.

Marker color system:

- Yellow: branch needs a PE office route decision. This is the overlap/fallback-pricing state: the branch sits under multiple office territories or otherwise lacks a final office assignment, so the map must ask a human to choose the office before fallback regional pricing applies.
- Red: branch pricing is missing or blocked. The branch has no usable current branch/region price-agreement authority.
- Vendor main color: branch has a valid PE office route and usable pricing authority; pin then reflects vendor brand color, such as ABC/QXO/SRS logo palette.
- Marker color is determined by the highest-priority active condition, not by an arbitrary status label.

Branch click:

- Vendor, branch number/name, full address, city/state.
- Geocode status and source.
- Assigned PE office and suggested office.
- Candidate offices with drive minutes/miles.
- Current price agreement: vendor, region/office/branch scope, account, version, effective/expiry, CEO verified, source file.
- Pricing gate: approved/blocked and why.
- Human actions:
  - Confirm suggested office for overlap.
  - Assign different office.
  - Start branch-level price negotiation.
  - Open current price agreement.
  - Open affected invoice/price-gap rows.

Office click:

- Office name, address, region, active state.
- Drive-time minutes and boundary freshness.
- Current regional price agreements by vendor.
- Branch counts inside territory by vendor/status.
- Button to recompute boundary when stale.

## Implementation Phases

### Phase 0: Alignment Interview

Run `/interview-me` before building. Confirm first-screen layout, right-panel behavior, marker colors, filters, and whether the old `index.html` interaction should be copied exactly or modernized.

### Phase 1: Data Audit

Verify live Supabase contains:

- Public Pro Exteriors locations from `https://proexteriorsus.com/locations/` with address/contact coverage in `regions` and/or linked `office` rows.
- All PE office rows with addresses and coordinates.
- ABC vendor branches, expected count near 800+.
- ABC API mirror rows in `abc_vendor_branches` reconcile into canonical `vendors` + `vendor_branches`.
- Branch address fields, branch numbers, vendor IDs, geocode status.
- Current price agreements mapped to regions/offices/branches.
- `territory_snapshot()` shape and gaps.

Deliverable: gap report with missing public locations, missing fields, stale boundaries, branch count by vendor/state, mirror-vs-canonical match results, and agreement coverage.

### Phase 2: API Contract

Add Astro server routes:

- `GET /api/vendor-territories`: live map payload.
- `POST /api/vendor-territories/assign`: human-approved branch-to-office assignment.
- `POST /api/vendor-territories/recompute-office`: recompute one office boundary.
- `POST /api/vendor-territories/geocode`: admin-only geocode refresh for selected office/branch batch.

Keep the prior static snapshot fallback only as degraded mode.

`POST /api/vendor-territories/assign` must persist immediately and return the updated branch/office/pricing state so the map can recolor yellow branches without a page refresh.

### Phase 3: Enrichment Jobs

Create idempotent server scripts/jobs:

- Weekly vendor API pull for all connected vendors.
- ABC mirror-to-canonical reconciliation from `abc_vendor_branches` into `vendors` + `vendor_branches`.
- Planned QXO/SRS mirror-to-canonical reconciliation with the same contract once their APIs are linked.
- Geocode missing office coordinates.
- Geocode missing vendor branch coordinates.
- Compute/cached two-hour office boundaries.
- Compute branch-office candidates and nearest suggested office.
- Classify branch status.
- Refresh agreement coverage and pricing gate flags.

Jobs must be resumable, rate-limited, and log costs/results. No browser-driven Google API batch work.

### Phase 4: Map UI

Build `/vendor-territories` around Google Maps:

- Load Maps JS using a browser-safe referrer-restricted key.
- Render office markers, branch markers, polygons, and marker clusters.
- Implement filters and search without reloading the page.
- Fit bounds by US/state/office/vendor/status.
- Click branch/office markers into a persistent detail panel.
- Preserve keyboard and mobile usability.

### Phase 5: Human Actions

Wire only safe internal writes:

- Confirm branch assignment.
- Mark territory decision metadata.
- Draft price negotiation request.
- Link branch to existing agreement.

No vendor-facing message is sent automatically. Lucinda/Roberto/Chris approve external sends.

Assignment writes should be immediate, audited, and reversible through an internal admin path if a human chooses the wrong PE office.

### Phase 6: Verification

Acceptance checks:

- `/vendor-territories` is top-level nav and active when open.
- Map uses Google Maps, not SVG-only.
- PE offices render from live Supabase.
- ABC branches render from live Supabase, with expected 800+ count once data is present.
- ABC API mirror and canonical branch counts reconcile, with unmatched rows surfaced as data-quality work.
- Public Pro Exteriors locations are present with full address/contact details in the agreed Supabase table relationship.
- State and vendor filters change both markers and counts.
- Search finds a branch by number/name/city.
- Office click shows office details and boundary metadata.
- Branch click shows branch details and current price agreement.
- Overlap branch shows candidate offices and human assignment controls.
- Out-of-boundary branch routes to branch-level price negotiation.
- No service-role secrets reach the browser.
- Initial render is usable with 800+ markers.
- Clustering is on by default and zooming reveals clickable pins.
- Marker colors follow the priority order: routing problem, pricing problem, vendor brand.
- Mobile has no horizontal overflow and the detail panel remains usable.

## Open Questions For Interview

1. What are the exact PE offices that should have two-hour rings in v1?
2. What is the minimum branch detail panel content that must be visible without scrolling?
3. Should recompute/geocode controls be visible to admins only, or hidden behind a maintenance route?
4. Should the map show Google default controls, custom Command Center controls, or both?

## Notes

The temporary SVG restoration in the current worktree is not the target product. It can be mined for server-side projection ideas, but the final implementation should replace it with a Google Maps component and live Supabase territory payload.
