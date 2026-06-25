# Third-Party Agent Tool Gate - 2026-06-25

Status: active standard  
Owner: Auditor for per-tool review; Quality Control for standard changes  
Scope: external skills, plugins, MCP servers, agent wrappers, installer scripts, memory/compression tools, and any repo that can alter agent behavior or read/write client brain data.

## Decision Summary

| Source | Decision | Allowed use | Required guardrails |
| --- | --- | --- | --- |
| `nvidia/skillspector` | Conditional pilot | Static-first audit command in a disposable checkout or future containerized gate. | Default `--no-llm`; no source file contents sent to LLM providers without explicit approval; document OSV dependency-coordinate egress; do not run as a global hook yet. |
| `mukul975/Anthropic-Cybersecurity-Skills` | Reference-only unless individually approved | Read individual skills as examples or source material. | Do not install wholesale; each copied skill needs this gate, license review, command review, and explicit approval. |
| `DeusData/codebase-memory-mcp` | Conditional/manual-only | Future sandbox experiment for codebase memory, only if repo rules change or a containerized deployment is approved. | No local stdio/Node MCP; no auto installer; no auto config writes; no committed `.codebase-memory`; manual checksum/signature review required. |
| `headroomlabs-ai/headroom` | Defer | Revisit only if token/memory compression becomes a validated bottleneck. | Do not let it rewrite `CLAUDE.md`/`AGENTS.md` or wrap production agents without A3 approval. |
| `DietrichGebert/ponytail` | Principle-only | Borrow the bias toward simple, reusable, standard-library-first work. | Do not install plugin hooks, hidden lifecycle context, or statusline changes. |
| `JuliusBrussee/caveman` | Reject | None. | Conflicts with professional tone/workflow and uses risky installer/memory rewrite patterns. |

## Required Gate Before Any Install

1. Create or reference an A3 that names the intended use, ROI/security justification, owner, rollback path, and approval record.
2. Review license, provenance, maintainership, release integrity, and security policy.
3. Review egress: source contents, prompts, env vars, dependency names/versions, telemetry, update checks, and third-party API calls.
4. Review installer and update behavior. Avoid remote-code installers such as `curl | bash`, unpinned `npx`, unsigned binaries, and scripts that mutate global agent config.
5. Review permissions: filesystem reads/writes, network access, repo writes, hooks, shell commands, memory writes, and config writes.
6. Run a SkillSpector static scan where applicable. Default to `--no-llm`; LLM-backed scanning requires explicit approval because it can transmit file contents.
7. Confirm the tool does not violate the local-MCP ban. MCP servers must be containerized on Hetzner if adopted; local stdio MCP servers and local Node MCPs remain prohibited.
8. Record a verdict and human approval in the A3 or a linked decision log before enabling the tool globally.

## Verdict Vocabulary

- `allow`: Approved for the named scope after A3, license, egress, scan, install-boundary, and rollback review.
- `conditional_pilot`: Useful enough to test only in a disposable checkout, sandbox, or container with named controls.
- `reference_only`: Safe to read, quote, or adapt manually, but not install or execute.
- `defer`: Potentially useful, but not needed now or not worth current operational risk.
- `reject`: Not allowed for this brain because risk, workflow conflict, quality, or policy violation outweighs benefit.

## Global Workflow Use

- Use `codex-security:security-scan`, `codex-security:security-diff-scan`, and `codex-security:threat-model` for sensitive/security work.
- Use `ssr-page-audit` and `pagespeed-95-gate` for Command Center performance work.
- Use `repo-parity-release-audit` before wrap-up or ship when deploy alignment matters.
- Use the existing GSD review/verify skills for phase work and acceptance checks.

## Non-Goals

This standard does not approve any third-party repo as a live global hook. It installs a review process and an internal skill only. Production workflow changes still require the gate verdict and explicit approval.
