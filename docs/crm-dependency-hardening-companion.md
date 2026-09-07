# CRM companion dependency hardening receipt

2026-09-06 Pacific. Companion branch `codex/crm-shared-design`, starting at `0f969c8c52c3a9c99175bb15e8e0fa9122852ed8`; CRM source baseline `b2ffff1`, branch `codex/prd-grill`. This companion work is authorized by the CRM build and lives outside the shared upstream working checkout. No merge, push or deployment is included.

Astro 7.3.1, Node adapter 11.1.5, React integration 6.0.5 and Sentry 10.73.0 align with the existing shared sales consumer. Preserve prior HTML whitespace. Compatible security patches plus an ExcelJS-only UUID 11.1.1 override clear the fresh npm network audit (16 prior inherited findings → 0). ExcelJS remains 4.4.0; revisit the override when upstream adopts a patched UUID. No additional service/license cost.

Checks: 321 tests in 26 files, Astro build, clean Docker build with pinned Node 22.23.0 base digest, and ten container HTTP cases passed. Synthetic XLSX roundtrips cover financial values/cents, provenance, literal text and the extended-format UUID path. The final container ran UID 1000, no external network, no credentials; supervisor skipped Slack, session parent was writable, Sales API remained 401. Temporary server/container stopped. No real financial data, customer communication or telemetry upload was tested.

Docker now supplies vendor artifacts before both installs and excludes `.env*`; optional Sentry credentials require BuildKit `--secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN`. Do not continue passing the secret as a build argument. Actual Coolify secret wiring/source-map upload remains activation work; the secret-free build succeeds.

Root CRM records exact dependency/source/image hashes and final companion commit in `docs/delivery/evidence/desktop-dependency-hardening.json`; narrative in `docs/delivery/X1-DEPENDENCY-HARDENING.md`, independent review in `docs/delivery/X1-DEPENDENCY-RED-TEAM.md`. Shared sales artifact remains 0.1.1 with SHA-256 `d3801a1eb32399834e74b3d31529951e28a53ce4581bc7aa3a91e1f8d97f651e`; this change does not alter that artifact or canonical data contracts.

Limited local browser checks covered Sales/Pipeline plus unavailable-data Friday WIP, Estimate Audit and Cash Runway. All-department populated, authenticated, mobile and hosted regression gates remain open. Shared loading/saved wording and heading issues, and inherited unknown-cash “Above floor” behavior remain next-slice blockers. No numerical UX/Technical pass or MVP acceptance is awarded.
