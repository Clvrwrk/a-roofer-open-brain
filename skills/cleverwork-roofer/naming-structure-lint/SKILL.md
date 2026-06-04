---
name: naming-structure-lint
description: Lints the repo/brain file tree against CONVENTIONS.md — kebab-case folders, one concept per folder, required per-folder README/SKILL/ROLE files, vN.md versioning, archive placement — and proposes relocations/renames.
when_to_use: Weekly Standardize cadence and after any agent adds files; run before a new agent onboards so the tree is conformant.
inputs:
  - the repo/brain file tree
  - CONVENTIONS.md naming + structure rules
outputs:
  - a conformance report (per-path pass/flag with the rule violated)
  - PROPOSED renames/relocations/missing-file stubs for human confirmation
trust_tier_of_output: evidence
bound_agents: [maintenance]
provenance: cleverwork-original
---

# naming-structure-lint

Check the tree against CONVENTIONS §1 and report violations; propose fixes, never auto-move:

- Folders are `kebab-case`, one concept each.
- Every leaf folder under `agents/`, `skills/`, `integrations/bridges/`, `recipes/` ships a `README.md`; skills add `SKILL.md` + `metadata.json`; agents ship `ROLE.md`.
- Standards version as `vN.md` with prior versions in `archive/`.
- No off-pattern or duplicate-purpose folders; superseded files belong in `archive/` with a provenance note.
- Flag missing required files and emit a stub proposal (not a committed file) for each.

Output a conformance score + the violation list + a proposed change set for a human/QC to approve. Goal: a fresh agent can predict where anything lives from the conventions alone.
