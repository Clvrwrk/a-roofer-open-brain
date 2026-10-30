# A3 — Matt Pocock skills plugin (engineering workflow skills)

**Status:** allow — approved by Chris, 2026-10-21  
**Owner:** Chris (engineering workflow)  
**ROI:** Shared, repeatable engineering workflows (spec, tickets, TDD, diagnosis, code review, handoff) across all Proexteriors repos and cloud sessions, instead of re-prompting each session.

## Scope

Claude Code plugin `mattpocock-skills` from the `mattpocock` marketplace (GitHub `mattpocock/skills`), enabled through `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`) and installed in the cloud environment setup script. Developer workflow only. It is not part of the brain, holds no client data, and is not an agent skill of any roofing agent.

## Gate checklist

- [x] License and provenance: MIT, Matt Pocock (aihero.dev), public GitHub repo. Reviewed at v1.3.1.
- [x] Contents: 27 markdown skills only. No hooks, no MCP servers, no binaries, no installer scripts.
- [x] Egress: none from the plugin itself. Install and updates fetch the GitHub repo.
- [x] Permissions: skills run with the session's normal permissions. No config writes, no lifecycle hooks.
- [x] Local-MCP ban: not affected (no MCP servers).
- [x] SkillSpector: not applicable for a prompt-only skill set; contents reviewed manually.
- [x] Rollback: remove the two keys from `.claude/settings.json` and the two lines from the setup script, or `claude plugin uninstall mattpocock-skills@mattpocock`.
- [x] Human approval: Chris, 2026-10-21.

## Notes

Re-review if a future version adds hooks or MCP servers. Several skill names overlap with built-in or other plugin skills (for example `code-review`); plugin skills are namespaced as `mattpocock-skills:<name>`, so there is no collision.
