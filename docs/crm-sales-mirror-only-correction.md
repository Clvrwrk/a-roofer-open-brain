# CRM desktop scope correction and optional CC Sales mirror

The September9 user correction defines desktop as responsive CRM. Command Center Accounting and all other CC areas retain their original UI and workflows. Any CRM mirror is optional and confined to CC `/sales`; it must not replace the complete Command Center or change Accounting. This supersedes the earlier companion receipts' broad canonical-Friday deployment direction without rewriting their historical evidence.

Parent restored the retained `cc-production-e4344d8` runtime with canonical Friday disabled and owns live verification. This companion performs no deployment, database mutation, upstream push or production routing change. The CRM application/database are unchanged by this task.

## Source boundaries

SalesPage now renders a standalone CRM-style document using the existing shared font/token/primitive packages. It no longer nests the CRM journey rail inside the global CC AppShell. SalesWorkspace remains a thin `/api/sales` client adapter. Its vendored CrmSalesMirror is exactly CRM `apps/crm/src/components/WipRelease.tsx` after documented substitutions: component name, local stylesheet import, and explicit home/login/logout/logo props. The same five journey groups, disabled Coming later items, responsive layout, role/session bootstrap, dirty/pending callbacks, sign-out protection and shared weekly workspace are preserved.

Canonical source SHA-256: `3ce316a5d088dec8f9e2df5f8856276bd80271d1594195aca7922d1816d901e5`. Copied CSS SHA-256: `a349549df1f3550363d8c06f73944742636dcfd58e688b9c87588546185bb2bd`. The test reverses only those explicit host substitutions and checks the original source digest; CSS is byte-identical. CRM and CC logo bytes already match SHA-256 `9ee94004f9cb3744d62b84be35fd584d54a9c1da5c0e3fd5e33915a021db597d`.

FridayWeeklyWorkspace is restored byte-for-byte to `e4344d8bbd145d7697428fe41c01e011f0d7e714`; its SHA-256 is `6f290b963fa381a9f3ed007c1394809e5cbdf9706cafe971f94832b222a2ca5c`. A readback comparison verifies42 existing Accounting components/pages/API routes, Friday helpers and the global AppShell match that baseline exactly. No Accounting source route, API workflow, global nav, auth handler or resolver is edited in this slice. The older baseline already contains an optional canonical-Friday flag; runtime must remain false and public Accounting requests must stay on the retained original container.

## Isolated candidate assets and deployment boundary

`CRM_SALES_MIRROR_ASSETS_PREFIX` is an optional Docker build argument, empty by default. The only accepted nonempty value is `/sales-mirror-assets`. Astro's installed public config type documents `build.assetsPrefix` as the generated-asset URL prefix; the actual prefixed production build confirms generated `/sales-mirror-assets/_astro/…` links and `/sales-mirror-assets/pro-exteriors-logo.svg`. Default `build` configuration remains unchanged when the variable is unset. Vite embeds the fixed prefix only for the mirror's logo. No secret or provider configuration is introduced.

The reviewed parent deployment must route only exact `/sales`, `/sales/*`, `/api/sales/*` and `/sales-mirror-assets/*` to the candidate. Strip only `/sales-mirror-assets` from asset requests before forwarding to the candidate. Keep `/auth/*`, `/healthz`, global `/_astro/*`, Accounting and every other CC route on the original runtime. Do not install a whole-host upstream override. Candidate canonical Friday remains false. SalesPage exposes `X-CRM-Sales-Build` from runtime `COMMAND_CENTER_BUILD_SHA`, permitting Sales build verification independently from original CC healthz lineage.

## Verification and limits

All181 scoped tests across six Sales/host/access/staff/legacy/Friday files pass. New tests verify five journey groups and six unavailable entries, parameterized host links, normalized shell/CSS parity, original Friday consumer bytes, standalone Sales document/no-store, Sales build header, exact default/opt-in asset configuration and Docker build-stage propagation. The scoped consumer/resolver TypeScript check passes. The production build with `CRM_SALES_MIRROR_ASSETS_PREFIX=/sales-mirror-assets` passes, and generated artifacts contain the isolated asset and logo URLs. The first test run had an incorrect expected count of seven unavailable entries; actual CRM source contains six, corrected without changing production behavior. The scoped TypeScript fixture initially lacked Vite ambient types; the Sales wrapper now explicitly references them.

No shared package was repacked or changed: workspace0.1.38, contracts/server0.1.21 remain installed. The normal commit hook updates only the CC app version marker; parent handoff records final commit and post-marker build. Parent owns actual path routing and signed-in visual verification. Source parity and local checks alone do not establish deployed mirror acceptance or full role/device/journey acceptance.
