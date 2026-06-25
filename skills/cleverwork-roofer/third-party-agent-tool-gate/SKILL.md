---
name: third-party-agent-tool-gate
description: >
  Evaluate external skills, plugins, MCP servers, agent wrappers, memory tools, and installer repos before they can be used in a Cleverwork roofer brain.
when_to_use: >
  Use before installing, copying, enabling, containerizing, globally recommending, or materially depending on any third-party agent tool.
inputs:
  - tool_source: Repository URL, archive, package name, or local path being evaluated.
  - intended_use: The workflow, agent, or repo area the tool would affect.
  - audit_materials: README, license, installer scripts, config examples, security policy, scan outputs, and relevant source files.
outputs:
  - gate_verdict: allow, conditional_pilot, reference_only, defer, or reject with evidence and controls.
trust_tier_of_output: evidence
bound_agents:
  - auditor
  - quality-control
  - innovator
  - maintenance
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: proposals/2026-06-25-third-party-agent-tool-gate.md
---

# Third-Party Agent Tool Gate

## Context Required

Before issuing a verdict, gather:

- Source URL or package identity, exact version/commit if available, and maintainer/license details.
- Intended use, target agents, target repo paths, and whether the tool is a skill, plugin, MCP server, wrapper, memory layer, CLI, or installer.
- Installer/update behavior, examples, generated config, hooks, and any files it reads or writes.
- Network egress, telemetry, LLM calls, OSV/package lookups, cloud APIs, and whether source contents or secrets can leave the machine.
- Existing policy constraints, especially the local-MCP ban and the requirement for A3-backed new skills.

## Process

1. Classify the tool and the blast radius: read-only reference, one-off CLI, repo skill, MCP server, global hook, memory tool, or agent wrapper.
2. Review license, provenance, maintainership, release integrity, and security disclosures.
3. Inspect installer scripts, update paths, generated config, hooks, and any repo or home-directory writes.
4. Inspect egress and data handling. Treat source files, prompts, environment variables, client data, memory, and logs as sensitive.
5. Confirm local-MCP compliance. Do not approve local stdio MCP servers or local Node MCPs; MCP adoption must be containerized on Hetzner.
6. Run a SkillSpector static scan where applicable. Default to `--no-llm`; LLM-backed scan requires explicit approval because file contents can be transmitted.
7. Evaluate workflow benefit against risk, including whether existing approved skills already cover the use case.
8. Issue a verdict with required controls and a rollback path.

## Output Format

```text
THIRD-PARTY AGENT TOOL GATE
Source:
Version / commit:
Intended use:
Tool class:
Verdict: allow | conditional_pilot | reference_only | defer | reject
Evidence:
License / provenance:
Egress:
Install and permissions:
Local-MCP compliance:
SkillSpector/static scan:
Workflow benefit:
Required controls:
Approval record:
Rollback path:
```

## Judgment Rules

- `reject` if the tool requires a prohibited local MCP, unreviewed remote-code installer, broad hidden hooks, unsafe memory/instruction rewrites, secret/client-data egress without explicit approval, or conflicts with repo tone/workflow policy.
- `conditional_pilot` if the tool is promising but needs a disposable checkout, sandbox, container, manual install, checksum verification, or explicit no-egress controls before wider use.
- `reference_only` if the repo is useful as source material but should not be executed or installed.
- `defer` if the tool may be useful later but does not solve a current high-value problem or duplicates approved workflow.
- `allow` only after A3 traceability, license/provenance review, egress review, installer/permission review, local-MCP compliance, applicable static scan, human approval, and rollback path are all recorded.

## Works Well With

- `codex-security:security-scan`, `codex-security:security-diff-scan`, and `codex-security:threat-model` for sensitive changes.
- `repo-parity-release-audit` before ship or wrap-up when deploy alignment matters.
- `ssr-page-audit` and `pagespeed-95-gate` for Command Center performance work.
- Auditor and Quality Control for gate decisions and standard changes.

## Notes

Do not install or execute the tool being evaluated as part of this skill unless the user has explicitly approved a bounded sandbox or disposable checkout. A good gate is evidence-first and boring on purpose.
