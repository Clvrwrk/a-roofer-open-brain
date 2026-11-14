# Project Handoff: Google Maps keys and the ds street map
**Project:** Pro Exteriors Open Brain, maps credentials and the ds street map (`@proexteriors/ds`)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (ds lives in https://github.com/Clvrwrk/CRM_PWA `packages/ds`)
**Production URL:** https://ds.proexteriorsus.net (ds 1.4.2, d98f2be)
**Date:** 2026-11-14 04:55 UTC
**Agent:** Claude Code on Chris's Mac (project thread session)
**Reason:** User-requested (`/project-handoff`)

Linear: [PEC-970](https://linear.app/cleverwork/issue/PEC-970) (record, Done) and [PEC-972](https://linear.app/cleverwork/issue/PEC-972) (follow-ups, Backlog).

This session was read-only. No key or Map ID value was printed, saved or reported. Nothing was changed in 1Password, Google Cloud, any server or any app repo. The only commit is this document.

---

## Accomplished This Session

### 1. Google Maps credentials inventoried
The keys are in the 1Password vault **"Shared with Grok Bot"**. Every item has the fields `credential` and `notesPlain`.

| Item | What it is | Use it for |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Server key | Geocoding and Routes from the server |
| `GOOGLE_GEOCODING_API_KEY` | A third key, separate from the other two | Geocoding and Routes also work |
| `GOOGLE_MAPS_BROWSER_KEY` | Browser key, referrer-restricted | Maps JavaScript map in the page only |
| `GOOGLE_MAPS_PLATFORM_API_KEY` | **Same key** as the browser key | Same as the browser key |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | Map ID | Passed to the map with the browser key |

### 2. API tests, using the office address (Chris: "always use the office address")
Origin: 1778 N Plano Rd #118, Richardson, TX 75081, from the Richardson row of `public.office`.

| Key | Geocoding | Routes (office to Plano) |
|---|---|---|
| Browser/Platform | REQUEST_DENIED: referrer-restricted keys cannot be used with this API | 403 PERMISSION_DENIED |
| Server | OK | 200: 5,682 m, 586 s |
| Geocoding | OK | 200, same route |

### 3. Browser key referrers (Playwright stub page per origin; no real site hit)
- **Allowed:** cc, crm, hr, pm and ds on proexteriorsus.net, plus `http://localhost:3000`.
- **Blocked** with RefererNotAllowedMapError: `https://example.com`, `https://proexteriorsus.com` and `http://localhost:4399` (the Command Center dev port).

### 4. ds street map, Google provider
- **ds 1.4.1:** `googleStreet()` destructured `Map` from Google, which hid the built-in `Map`. `new Map()` for the markers then threw, so only the office marker drew. Fixed in CRM_PWA#307 (ds 1.4.2), which is live.
- **ds 1.4.2 re-test on ds.proexteriorsus.net:**
  - `street()` resolves.
  - Three markers draw (HQ, T1, P1); the pin with null coordinates is correctly skipped.
  - Clicking the P1 marker selects P1: `is-selected`, `pe-map-select` P1, list row `aria-current`.
  - Clicking the T1 list row selects T1.
  - No key, API or Map ID errors.
- **Headed Chrome with WebGL:** the map renders as **VECTOR** but in **Google's standard colours**, so the Map ID has no gray style attached.

### Evidence
- Screenshots, which show no key: `Dropbox-AIA4/Cleverwork Main/CLAUDE/output/pe-google-maps-check-2026-11-13/`
  - `ds-1.4.1-headless-office-only.png`: before the fix, office marker only.
  - `ds-1.4.2-headed-vector-standard-colours.png`: after the fix, vector map with the HQ, P1 and T1 markers.
- Reusable key-free scripts are in the same folder under `scripts/`:
  - `gmaps-test.sh`: server APIs.
  - `maptest.cjs`: referrer check.
  - `maptest142.cjs`: ds street map; set `HEADED=1` for Chrome.
  - Keys go in through environment variables only.

## Git State
- **Branch:** `claude/project-thread-7wsa1g`, from `origin/main` at `60b975c8`.
- **Last commit:** this document only.
- **Uncommitted changes:** none on this branch. The main checkout still has pre-existing, unrelated changes that were not touched: `.memsearch.toml`, `context/memory/2026-10-02.md` and `app/command-center/.astro`.

## Task Cut Off
None. The session ended at a clean boundary.

## Next Task — Start Here

**Task:** [PEC-972](https://linear.app/cleverwork/issue/PEC-972) Google Maps follow-ups.
**What to check / do:**
1. **Chris, in Google Cloud Map Styles:** attach or publish the ds greyscale style (MP-08) to the Map ID in `NEXT_PUBLIC_GOOGLE_MAP_ID`.
2. **Chris:** decide whether to add `http://localhost:4399/*` to the browser key's allowed referrers.
3. **ds:** switch the marker `addListener("click")` to `addEventListener("gmp-click")`. Google logs a deprecation warning today.
4. **ds:** fit the view to the pins (or raise the default zoom) so nearby pins are not hidden under the HQ marker. This needs a mockup check first (rule 10).
5. Re-run `maptest142.cjs` with `HEADED=1` and confirm the map is gray in the screenshot.

**If the map is still in standard colours after step 1:** check that the style is published, then hard-reload. Map ID styles can take a few minutes to propagate.

**Prompt to use:** "Read docs/handoffs/2026-11-14-google-maps-keys-and-street-map.md and PEC-972, then re-run the headed ds street map test."

## Decisions Made This Session

- **The server key is for server APIs; the browser key is for the page map only.** The browser key is referrer-restricted and Google refuses it for Geocoding and Routes.
- **Map and route tests use the office address**, 1778 N Plano Rd #118, Richardson, TX (Chris, 2026-11-13).
- **Referrer tests use routed stub pages**, never the real sites, so no live app is touched.
