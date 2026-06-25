# A3: third-party-agent-tool-gate internal skill

## Background

External agent tools can read repo contents, mutate instruction files, install local MCP servers, write memory, or send source to third-party providers. The brain already forbids local stdio MCP servers and local Node MCPs, but agents still need a repeatable way to evaluate external skills, plugins, MCP servers, wrappers, and installer repos before they touch the workflow.

## Current Condition

The current repo has security and workflow rules spread across `CONVENTIONS.md`, `AGENTS.md`, `CLAUDE.md`, and Cursor rules. The June 25 third-party repo review produced clear decisions, but future agents need a standard skill that turns those decisions into an evidence-backed gate.

## Goal / Target Condition

Create an internal `third-party-agent-tool-gate` skill that outputs one of five verdicts: `allow`, `conditional_pilot`, `reference_only`, `defer`, or `reject`. The skill must require A3 traceability, license/provenance review, egress review, installer/permission review, local-MCP compliance, and SkillSpector static scanning where applicable.

## Root Cause

Without a named gate, external tool adoption is vulnerable to convenience drift: a helpful repo can become a global hook before anyone confirms egress, install behavior, policy compatibility, or rollback.

## Countermeasures

- Add `docs/54-third-party-agent-tool-gate-2026-06-25.md` as the active decision record for the six reviewed repos.
- Add the `third-party-agent-tool-gate` internal skill under `skills/cleverwork-roofer/`.
- Mirror one shared rule into `CONVENTIONS.md`, `CLAUDE.md`, `AGENTS.md`, and `.cursor/rules/agent-conventions.mdc`.
- Treat SkillSpector as a controlled static-first pilot only, not a global hook.
- Continue to use existing trusted skills for security, performance, release parity, and GSD phase checks.

## ROI / Risk

This is mission-grade infrastructure and security work. It does not need to prove 10x feature ROI because a single unsafe tool install could leak source/client context, violate the local-MCP policy, or fork agent behavior globally. Build cost is small: one policy doc, one internal skill, and harness alignment.

## Implementation Plan

1. Create this A3 before adding the skill.
2. Add the policy/decision document.
3. Add the skill files and metadata.
4. Align the four harness files with the shared rule.
5. Verify no third-party repo is installed as a global hook and no local MCP config is added.

## Follow-Up

Auditor owns per-tool gate runs. Quality Control owns changes to the standard. Innovator may propose new tools, but does not bypass the gate or implement unapproved tools.

## Decision

Status: approved  
Date: 2026-06-25  
Approval basis: user explicitly requested global implementation of the repo-gate recommendations and confirmed third-party repos must not be installed into production workflow until the gate passes.
