# CRM_PWA Lead Management and Job Operations consumer

September 10, EX-124 source continuation. Upstream implementation authority is CRM_PWA at `/Users/chussey/Documents/ChatGPT/crm.proexteriorsus.net`, branch `codex/prd-grill`, with delivery contract `docs/product/LEAD-JOB-WORKSPACE.md` and reciprocal receipt `docs/delivery/LEAD-JOB-WORKSPACE.md`. Consumer baseline is cec64be17517cfaad5144c4484d3b9419b767485 on the separate `codex/crm-shared-design` worktree. This receipt accompanies the source mailbox retained by CRM; neither checkout is merged or deployed by this task.

The Sales mirror adopts lead/contingency/job navigation and shared workspace 0.1.41. Only the documented host URL/logo/style substitutions differ from the CRM shell. Host preservation tests retain the original Friday component hash and isolated assets/API paths. Original Accounting, global shell and provider workflows are unchanged. Legacy saved effort links now point users to the available work lists instead of falsely saying prospect workflows do not exist.

| Package | Version | Installed files verified | Archive SHA256 |
|---|---|---:|---|
| contracts | 0.1.22 | 41 | `4078d7d6aeb6ca7b7b6fe747fa0fc4d950b54bc6a2986b56bbf90bf82d15a090` |
| crm-server | 0.1.22 | 22 | `0e10255a669158eef24654278a79a8cb66fa84a7a706482a861bb8603b984f58` |
| sales-workspace | 0.1.41 | 103 | `b882814671c04a9af5cabf60145f16f1fe0a4eb10e7905848599597cff7d5831` |

All 166 installed package files match their archives. The nine scoped host/access/middleware/Sales tests pass: 145 tests. CRM builder also passes 576 unit tests, 38 disposable PostgreSQL scenarios and package/32-file Astro type checks; these are source validation, not hosted acceptance. The new activity RPC must be released with the matching CRM/consumer pair. Native member and authenticated roles receive a scoped read only. Production installation, actual staff role/device verification and provider signing/job creation/scheduling activation remain open. Final `ASTRO_TELEMETRY_DISABLED=1 SENTRY_AUTH_TOKEN= CRM_SALES_MIRROR_ASSETS_PREFIX=/sales-mirror-assets npm run build` passes. Sentry release/source-map upload was disabled. Vite retains a large-chunk warning; this is not a performance acceptance result.


## EX124 native callback release correction

The first hosted lead/job pair was rolled back after native WorkOS domain RPC permissions failed. CRM now includes the separately reviewed exact six-function member activation and native PostgreSQL coverage. Workspace0.1.42 adds a dedicated mandatory callback date/time, explicit review summary, timezone payload and DST ambiguity rejection. This companion consumes the immutable0.1.42 archive (SHA2568633a499923da3d2352bd32be6b11579e75542a131e34de9dc687170c21ba9ae); all103installed files match. Contracts/server remain0.1.22; shared design0.1.0. Original Accounting and isolated Sales API/assets remain preserved. The canonical release record is CRM_PWA docs/delivery/LEAD-JOB-RELEASE.md, which records the prior rollback and subsequent live checks. This receipt supersedes the earlier0.1.41 source-only status for the correction. Provider dispatch is not activated.
