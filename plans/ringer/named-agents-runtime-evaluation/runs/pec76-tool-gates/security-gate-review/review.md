# PEC-76 Security Gate Review

## Verdict

**PASS — planning gate only.** The three tool verdicts remain `conditional_pilot`; this review does not upgrade any tool to `allow` and does not attest that a scan, installation, identity fence, egress policy, effect fence, or rollback rehearsal has passed.

PEC-76 supplies an adequate A3-style purpose and target condition, identifies official provenance and license status, rejects unsafe installer paths, describes material egress and permission surfaces, preserves the local-MCP ban, separates persona identities, denies production effects, and defines tool-specific rollback. Its fail-closed prerequisite sequence is sufficient to close the documentation gate with no open P0/P1, provided Christopher Hussey accepts the conditional verdicts exactly as written.

## P0/P1 Findings

None in the reviewed planning artifacts.

The following are mandatory stop conditions rather than evidence already satisfied:

- No Orgo pilot may advance until the existing Maya computer is bound by stable ID to a dedicated persona registry entry and a workspace-scoped runtime key passes positive, wrong-workspace, cross-persona, and independent-revocation tests. The apparently account-wide master key remains provisioning-only, must never enter the computer, and must be rotated after scoped provisioning.
- No Hermes code may execute from `curl | bash`, `main`, `latest`, an unreviewed dependency graph, or an auto-updating installation. The exact commit/release, hashes or attestations, lock, SBOM, licenses, maintainers, security policy, static scan, dependency/secret scan, and manual/container build procedure must return for approval.
- Hermes starts with gateways, cron, self-improvement writes, Skills Hub installation, browser automation, shell, filesystem writes, and MCP disabled. Generated memory or skills remain quarantined drafts. No local stdio/Node MCP is permitted; any later MCP proposal requires a separate compliant containerized gate.
- **Local MCP — P1 stop condition:** no Hermes, eve, Orgo adapter, skill, plugin, or supporting tool may install, configure, spawn, or connect to a local stdio MCP server or local Node MCP server. An HTTP/SSE transport, loopback binding, or runtime sandbox does not by itself satisfy the gate. Any proposed MCP must return as an exact pinned artifact for its own provenance, license, installer, permissions, secrets, and egress review and, if adopted, run containerized on Hetzner under explicit human approval. Discovery of a local MCP configuration or process blocks the pilot until it is removed, evidence is retained, credentials are revoked or rotated as needed, and the tool is regated.
- No eve artifact may execute from `npx eve@latest` or an automatically upgraded beta. The disposable project, exact package versions, lockfile, provenance, dependency/license/static scans, contract tests, and beta-drift response must return for approval.
- Eve remains synthetic/replay-only: no production Slack, Gmail, Orgo session, business schedule, customer data, service-role database credential, or production effect namespace. Human approval cannot substitute for Command Center effect authorization.
- No runtime may inherit an unrestricted environment or receive an Orgo master key, Supabase service role, another persona's credential/session, or a shared-token fallback. Secret values must remain out of prompts, source, logs, traces, receipts, screenshots, scan uploads, and review artifacts.
- Hermes and eve may not own the same trigger, occurrence, lease, schedule, Slack event, reservation, or effect epoch. Advancement requires server-enforced fencing, database idempotency, stale-owner denial, effect reconciliation, and one authoritative Command Center/Supabase receipt path.
- Any unknown egress destination, cross-persona access, stale-owner acceptance, duplicate or unknown effect, secret exposure, scan failure, rollback failure, or open P0/P1 is an automatic no-go.

## Gate Coverage

| Security area | Red-team assessment |
| --- | --- |
| Provenance and license | Official Orgo documentation, the official NousResearch Hermes repository with MIT license, and the official Vercel eve repository with Apache-2.0 license are identified. Hosted Orgo is correctly not mischaracterized as open source. Exact executable artifacts still require pinned provenance packets before execution. |
| Installer and updates | Unsafe `curl | bash`, unpinned `npx`, `latest`/`main`, global mutation, auto-update, auto-hooks, and unreviewed skill/connection installation are explicitly rejected. Manual or container builds from locked artifacts are required. |
| Egress | The document inventories high-risk classes: remote-desktop pixels/input/state, prompts and tool payloads, web/model/gateway/MCP traffic, traces, schedules, sandbox state, dependency scan traffic, and connected-provider credentials. Per-persona/tool destination allowlists and unknown-destination denial are required. SkillSpector defaults to `--no-llm`; source transmission needs separate approval. |
| Permissions and effect boundaries | Default-deny capability enablement, least-privilege Command Center principals, synthetic namespaces, approval-gated outbound actions, server fencing, idempotency, and receipts constrain both authority and effects. A desktop or human approval is correctly not treated as business-effect authority. |
| Identity isolation | Dedicated workspace/computer, Unix home, config, memory, skills, logs, provider credentials, Google/Slack identities, Orgo key, Command Center subject, Vercel project/principals, and effect namespace are required per persona. Cross-persona denial and independent revocation are explicit. |
| Local-MCP compliance | Hermes MCP is disabled by default; local stdio/Node MCP and auto-installed MCP are expressly prohibited. This matches the active standard. Any future MCP would need its own gate and compliant Hetzner-container deployment. |
| Secrets | Runtime exposure of the master Orgo key, database service role, foreign-persona credentials, and unrestricted environment inheritance is forbidden. The reviewed artifacts contain credential names and public source URLs, but no secret value. |
| Beta and dependency drift | Eve's beta status is explicit; versions and lockfile must be pinned, automatic upgrades disabled, and every upgrade contract-tested and regated. Hermes updates are likewise disabled pending repeat review. |
| Rollback and recovery | Orgo preserves Maya's existing desktop while revoking the scoped key and fencing its epoch. Hermes restores a prior pinned image/home snapshot without legacy-host fallback. Eve closes ingress, revokes the epoch, drains/checkpoints, reconciles reservations, revokes Connect credentials, and archives synthetic evidence. Shared prerequisites add kill switches, unknown-effect reconciliation, artifact retention, and rollback/roll-forward rehearsals. |

Coverage is prospective, not proof of implementation. PEC-77 through PEC-81 receipts, pinned artifact packets, scans, allowlist-denial tests, and rollback transcripts do not yet exist in this review and must not be inferred from PASS.

## Authorization Boundary

Authorized by this review: closure of PEC-76 as a planning/documentation gate after Christopher Hussey records acceptance of the three unchanged `conditional_pilot` verdicts, plus preparation of downstream plans and non-executing review packets.

Not authorized: downloading or executing installers or packages; provisioning or replacing a computer/workspace/project; creating, copying, rotating, connecting, or revoking credentials; entering Maya's authenticated desktop; enabling Hermes or eve; changing hooks, global configuration, MCP, gateways, skills, schedules, listeners, leases, or effects; accessing Slack, Gmail, mailboxes, customer data, or live browser state; deploying; or sending/writing anything externally.

The owner and sole human approver is Christopher Hussey. A planning PASS, a tool's `conditional_pilot` label, completion of a predecessor, or a runtime's internal human-approval feature grants no execution or production authority. Each later authorization must name the exact artifact, persona, principal, resource IDs, allowed data, destinations, tools, effects, epoch, time limit, evidence, rollback owner, and kill switch. Missing or ambiguous authority resolves to no execution and no effect.

## Next Gate

Obtain Christopher Hussey's durable acceptance of the three conditional verdicts, then complete PEC-77 through PEC-81 in order and assemble the disposable pinned-artifact packet for the specific tool proposed for execution.

The next execution decision must review that returned packet—not this planning PASS—and verify exact provenance, checksums/attestations, lock/SBOM/licenses, static and dependency/secret scan results, installer diff and permission manifest, egress allowlist plus denial evidence, persona/resource registry, scoped-credential isolation and revocation, local-MCP compliance, single-owner lease/epoch tests, database effect idempotency/reconciliation, and rehearsed rollback. Only a separate explicit human approval may then authorize a synthetic, isolated, time-bounded pilot. Production activation and serial rollout remain later gates.
