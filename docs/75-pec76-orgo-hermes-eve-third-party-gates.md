# PEC-76 — Orgo, Hermes, and Vercel eve Third-Party Gates

Date: 2026-07-26
Owner and sole human approver: Christopher Hussey
Execution reviewers: PE-CC-DEV operations and security personas through Ringer
Scope: planning and gate decisions only; no installation, provisioning, credential creation, runtime activation, mailbox access, Slack connection, schedule, deployment, or outbound effect.

## A3 problem and target condition

The named-agent program needs persistent browser computers, an economical agent harness, and a durable orchestration comparison without reintroducing overlapping owners. The target condition is: Orgo supplies isolated persistent computers; Hermes is the measured Phase A baseline inside each computer; eve may enter only a synthetic Phase B shadow comparison behind the same Command Center contracts. No vendor runtime is a business source of truth, and no two runtimes may own the same trigger or effect epoch.

## Gate summary

| Tool | Provenance/license | Data and egress | Install/update boundary | Permissions and identity | Verdict |
| --- | --- | --- | --- | --- | --- |
| Orgo API/computers | Vendor SaaS; official API documentation. No open-source license applies to the hosted service. | Browser pixels, input events, computer state, and any data visible inside the remote desktop cross the vendor boundary. Bearer credentials authenticate every API call. | No package install is approved by this gate. Use the HTTPS API only through a reviewed adapter; never vendor quick-start secrets or snippets into source. | Dedicated workspace/computer per persona; workspace-scoped key where supported; master key provisioning-only; no key or browser session shared across personas. | `conditional_pilot` for Maya's existing computer only, after PEC-77 through PEC-81 controls. |
| Nous Hermes Agent | Official NousResearch repository; MIT license. Current official docs describe persistent memory, skills, shell/file tools, messaging gateways, cron, MCP, and self-improvement. | Model prompts, tool inputs, web queries, gateway traffic, memory, and optional MCP/tool traffic can leave the computer. Code in its container can read injected environment credentials. | Official quick install is `curl ... | bash`, which this repository forbids. No `main`/latest installer. Pilot must use a disposable pinned commit/release, checksum/attestation inventory, reviewed dependency lock, and manual/container build. Updates are disabled until the gate repeats. | One Unix home, config, memory, skills, logs, model credential, Slack credential, Google session, Orgo key, and Command Center principal per persona. Default-deny tools; no local MCP; no Skills Hub auto-install or self-written skill promotion. | `conditional_pilot` for an isolated Maya baseline after static scan and explicit execution approval. |
| Vercel eve | Official `vercel/eve` repository; Apache-2.0; Vercel states the framework is beta and behavior may change. | Agent prompts, tool payloads, traces, schedules, sandbox state, AI Gateway calls, Connect credentials, and channel events enter Vercel-managed services and connected providers. | `npx eve@latest` is prohibited. Any shadow pilot must pin package versions and lockfile, verify release provenance, use a disposable project/tenant, disable automatic upgrades, and pass dependency/license/static scans. | Dedicated Vercel project, deployment, Connect principals, effect namespace, and runtime credential per persona. No production Slack/Gmail, no real schedule, no service-role database access, and no shared-token fallback. | `conditional_pilot` for synthetic/replay shadow evaluation only after PEC-77 through PEC-80 and a completed eve scan. |

## Source evidence

- Orgo authentication requires a Bearer key and recommends environment storage, rotation after exposure, and separate keys per environment: https://docs.orgo.ai/api-reference/authentication
- Orgo's API provisions workspaces and computers and returns stable UUIDs: https://docs.orgo.ai/api-reference/introduction
- Orgo computer-bound model calls require the authenticated user to own the computer or belong to its workspace: https://docs.orgo.ai/api-reference/chat/completions
- Hermes official repository and documentation: https://github.com/NousResearch/hermes-agent and https://hermes-agent.nousresearch.com/docs/
- Hermes MIT license: https://github.com/NousResearch/hermes-agent/blob/main/LICENSE
- Hermes security documentation warns that code in a container can read injected task credentials and documents authorization, approval, file-write, container, MCP, session, and input boundaries: https://hermes-agent.nousresearch.com/docs/user-guide/security/
- eve official product page and knowledge base: https://vercel.com/eve and https://vercel.com/kb/eve
- eve official repository is Apache-2.0 and explicitly beta: https://github.com/vercel/eve
- Vercel's announcement describes durable execution, sandboxed compute, approvals, subagents, and evals: https://vercel.com/blog/introducing-eve

## Required controls before any install or provisioning

1. PEC-77 creates the canonical principal/resource registry and mismatch tests.
2. PEC-78 freezes versioned runtime-neutral ingress, work, lease, approval, effect, receipt, and health contracts.
3. PEC-79 proves one fenced owner and occurrence across stale processes and cutover.
4. PEC-80 proves database-enforced idempotency and reconciled effects.
5. PEC-81 proves scoped Orgo/Command Center/provider credentials, cross-persona denial, independent revocation, and zero master-key runtime exposure.
6. A disposable, network-restricted checkout pins the exact Hermes or eve release/commit and records hashes, dependency lock, SBOM, licenses, maintainers, security policy, release provenance, and rollback instructions.
7. SkillSpector runs static-first with `--no-llm` on applicable bundled skills. Source transmission to an LLM scanner requires separate approval. Dependency vulnerability and secret scans run without uploading repository or client data.
8. Installer review rejects `curl | bash`, `npx ...@latest`, global config mutation, auto-update, auto-hook installation, local stdio/Node MCP, and unreviewed Skills Hub/connection additions.
9. Egress tests deny unknown destinations. Allowed domains/providers are enumerated per persona and per tool. No runtime receives the Orgo master key, database service role, another persona's Slack/Google credential, or unrestricted environment inheritance.
10. Kill switch, stale-epoch denial, queue drain, unknown-effect reconciliation, credential revocation, artifact retention, and rollback/roll-forward rehearsals pass on synthetic fixtures before activation approval.

## Tool-specific test packets

### Orgo

- Reuse Maya's existing stable workspace/computer IDs; do not replace her authenticated desktop.
- Create no additional computer until the registry binds its persona, workspace, computer, Google principal, Slack app, and Command Center subject.
- Prove a workspace-scoped key can access only its intended workspace; wrong workspace and cross-persona requests return denial.
- Prove independent key revocation without disrupting other personas.
- Rotate the provisioning master after all seven scoped keys/computers are verified.
- Rollback: revoke the scoped key, stop the new computer without deleting it, fence its Command Center epoch, and retain evidence. Maya's existing desktop is never deleted by rollback.

### Hermes

- Pin a reviewed release/commit and build manually in Maya's isolated Orgo home; do not run the remote installer.
- Disable messaging gateways, cron, self-improvement writes, Skills Hub installs, browser automation, shell, filesystem writes, and MCP by default. Enable one tested capability at a time.
- Configure model routing from the named-agent cost template with hard per-run/day budgets and a high-cost escalation gate.
- Treat memory and generated skills as quarantined drafts until Auditor/Quality Control promotion.
- Rollback: stop the isolated service, revoke its lease and scoped credentials, preserve receipts, and restore the prior pinned image/home snapshot. Never fall back to the fenced legacy host.

### eve

- Shadow only in a dedicated synthetic Vercel project and data/effect namespace.
- Pin every package; no `latest`. Record Vercel beta risk and contract-test every upgrade.
- Use replay fixtures only; no production Slack, Gmail, Orgo browser session, or business schedule.
- Human-in-the-loop approval supplements but never replaces the Command Center effect authorization.
- Rollback: close ingress, revoke the shadow epoch, drain/checkpoint, reconcile all reservations, revoke Connect credentials, archive the synthetic project evidence, and leave Hermes as sole production candidate.

## Decision and authorization boundary

PEC-76 may close as a planning gate when independent operations and security reviews find no open P0/P1 in this document and Christopher accepts the three conditional verdicts. Closure authorizes only the downstream planning sequence. It does not authorize install, provisioning, credentials, live browser control, Slack/Gmail access, schedules, deployment, or external effects. Each tool must return to this gate with its pinned artifact/scan packet before its separately approved pilot.

## Human disposition

Christopher Hussey accepted all three `conditional_pilot` verdicts. PEC-76 is closed as a planning gate only in Linear comment `98bd67bb-6b0a-4cfe-a3ef-d727ae09590d`. All execution restrictions above remain in force. Next gate: PEC-77 principal and resource registry.
