# A3 — REA ("Reverse Engineer Anything") behind the /rea skill

**Status:** conditional pilot — pending Chris's approval (drafted 2026-11-13)  
**Owner:** Chris (product and design workflow)  
**ROI:** Chris can point Claude at a product he likes (first example: theorgchart.com) and get a structured teardown of its screens, behavior, data model and APIs, turned into a rebuild plan and mockups in `@proexteriors/ds`. That replaces ad-hoc "look at this site" sessions with one repeatable method and evidence for every claim.

## Scope

- The `/rea` skill is a prompt-only Claude skill in Chris's account (no hooks, no MCP server, no files in this repo). Its default path uses tools we already run: Playwright with the preinstalled Chromium, and Firecrawl.
- This A3 covers the optional use of REA itself (github.com/morluto/rea, npm `rea-agents`) for targets the default tools cannot read: saved HAR captures, bundled JavaScript analysis, Electron/ASAR, APK, .NET and native binaries.
- Developer and design workflow only. REA never touches a client brain, the SOT Supabase, or production credentials.

## Gate checklist

- [x] License and provenance: MIT, author morluto, public GitHub repo, published as npm `rea-agents` (reviewed at 6.9.0). Third-party engines (Hopper, Ghidra, IDA, JEB, Kuna) keep their own licences and are not bundled. The project's DISCLAIMER forbids DRM or licence-check circumvention, access-control bypass, and copying proprietary code or assets; the `/rea` skill adopts the same limits.
- [x] Contents: TypeScript MCP server and CLI. `package.json` declares no install-time scripts. Runtime dependencies are pinned and inventoried in the repo's `licenses/npm-dependencies.txt`; browser work uses `playwright-core` against a caller-supplied Chromium.
- [x] Egress: analysis runs locally. Network use is package acquisition from npm and whatever the target page itself loads during a browser capture. No telemetry found in the README, SECURITY.md or install guide.
- [x] Installer and update behaviour: `rea setup` writes agent config (MCP registration, skills) and can offer to install Hopper. **Not allowed.** Only `npx -y rea-agents@6.9.0 <command> --json` is allowed, pinned, from the scratchpad, never from inside a repo or target tree.
- [x] Permissions: reads the target files given; browser launch mode uses a temporary profile and cleans it up. Writes only to the output directories we pass.
- [x] Local-MCP ban: honoured. REA is never registered as an MCP server; CLI only, and only in the disposable cloud container.
- [ ] SkillSpector static scan: not yet run. Required before moving from conditional pilot to allow.
- [x] Rollback: nothing is installed. Stop using the REA step in the `/rea` skill (or delete the skill in claude.ai); the default Playwright/Firecrawl path keeps working.
- [ ] Human approval: Chris.

## Guardrails written into the /rea skill

- Public pages, or accounts Chris owns or licenses and signs in to himself. No login, paywall, bot-check, rate-limit, licence or DRM bypass.
- Copy structure and behavior only. Never their code, text, images, logos, icons or fonts.
- Do not save real people's data from a target (for example names and photos on a public org chart); record the data shape only.
- Rebuild only in `@proexteriors/ds` (ds.proexteriorsus.net): no one-off components; new patterns go to ds itself.
- Mockup, brand-alignment audit and data gap analysis come before any build (CONVENTIONS §11c), with Chris's sign-off.

## Decision needed

Approve REA as a conditional pilot under the scope above (CLI only, pinned, cloud container), or keep it reference-only, in which case `/rea` runs on Playwright and Firecrawl alone.
