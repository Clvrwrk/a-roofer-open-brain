# A3 — pe-connect: one company gateway for staff AI agents

**Status:** build to staging approved by Chris on 2026-11-13, with seeded test data only. Not approved: connecting any agent product, reading production data, or the pilot. Those wait on decisions 3 to 8.  
**Proposed by:** Chris, drafted with Claude  
**Owner:** Chris (CTO / AI Administrator)  
**Date:** 2026-11-13, revised twice the same day after two Ringer review rounds (section 11)  
**Affected clients:** Pro Exteriors first. The pattern is template-wide if it holds.  
**A3 file:** `proposals/a3-pe-connect-agent-gateway.md`

**ROI in one line:** staff can run their job work from an always-on AI agent, while Pro Exteriors keeps one place that decides what each person may read, propose and approve through it, and one log of every call an agent makes into company systems. What the agent does on the vendor's side (chats, browsing, memory) stays under the vendor's controls and our contract with them.

**Terms used here**

- **Always-on agent:** an AI assistant that runs on the vendor's cloud computer and keeps working between chats (Grok Bot, ChatGPT dots, Claude Duet).
- **MCP:** the protocol these agents use to call tools on another system. A **remote MCP server** is one they reach over the internet.
- **Gateway:** our own MCP server, the only door from an agent into company systems.
- **WorkOS:** the sign-in service the company apps already use. **Coolify:** the deploy tool on our Hetzner server.
- **Capability:** one named permission, for example "read the HR directory".
- **Hard rule N:** a numbered rule in this repo's `CLAUDE.md`.
- **Egress:** data leaving for somewhere outside the company. A **destination allowlist** is a list, set by us, of the only internet addresses the agent's computer may reach.
- **SSO and SCIM:** company sign-in, and automatic adding and removing of staff accounts from our directory.
- **CI:** the automated checks that run on every pull request. **YAML:** a plain-text settings file.
- **`buildCommit`:** the exact code version a running service reports about itself.
- **SkillSpector:** the static scanner this repo uses on third-party agent tools.

## 1. The problem

- Staff will connect always-on agents to company systems with or without a company plan.
- On a personal account the company has no admin console. It cannot see what the agent connected to, what it remembers, or end its sessions when the person leaves. Where sign-in tokens, sessions and memory are kept differs by vendor (section 5).
- Every vendor has its own connector and skill format. Building one workflow three times means three sets of rules that drift apart.
- Most staff activity is short messages between members about one job: a commission, a charge, an invoice. If that moves into agent group chats, the job record loses it, and the accepted rules in CRM_PWA `docs/product/JOB-COMMUNICATION-HISTORY.md` (CH-01 to CH-13) cannot hold.

**Not measured.** There is no baseline for messages per day, minutes per message or error rate. Section 8 asks Chris to choose an exemption or a measurement before approval.

## 2. Root cause

1. Why does this take staff time? Job questions are typed by hand into chat, then someone finds the job and the record.
2. Why is it not automated? Always-on agents that can reach company tools are new this year.
3. Why are the existing tools not enough? The CRM holds the job thread but has no agent door; the vendor connectors go straight to each system with their own permissions.
4. Why was it not a priority? The HR role records that could decide access did not exist before CRM_PWA PR 308.
5. Why now? Several such products launched in the second half of 2026, and staff will try them.

## 3. Proposed solution

Working name `pe-connect`: one remote MCP server in a container on the Hetzner host. Every approved agent connects to it and to nothing else of ours. Where the code lives is open decision 2.

**Phase one, the only scope this A3 asks to approve:** read-only tools over the CRM and HR. Proposed tools, each with a fixed list of fields it may return:

| Tool | Returns |
|---|---|
| `crm.find_job` | Jobs the person may see, matched by job number, customer, address or rep |
| `crm.get_job` | One job's stage, people and next step |
| `crm.list_job_notes` | Notes and replies on one job, with the coverage stated |
| `crm.home_surface` | The person's current home list, as the CRM orders it |
| `hr.directory_search` | Staff name, role, office and work contact |
| `hr.org_chart` | Seats and reporting lines |

Phase one returns no pay, payroll, training notes, commission amounts, invoice or price data. It creates no repository skill, binds to no Open Brain agent, and uses no OB1 or InfraNodus primitive.

```
staff agent (one approved product)
        │  remote MCP, signed in through WorkOS as one person
        ▼
   pe-connect gateway ── policy check ── audit log
        │        (role, office, training, capability)
        ├── crm connector   jobs, job communications, home lists   (read)
        └── hr connector    directory, org chart                   (read)

Later, each with its own approval: posting job notes, AccuLynx reads,
the QuickBooks mirror, vendor invoice and price audit reads.

Not proposed: any Historian or client-brain tool (section 6).
```

Layout:

```
pe-connect/
  gateway/        MCP server: sign-in, policy check, audit log, kill switch, /healthz with buildCommit
  connectors/     one folder per system, each with README.md, connector.yaml and narrow tools
  skills/         cleverwork-roofer/<skill>/ with README.md, SKILL.md and metadata.json;
                  cited skills under their origin folder (CONVENTIONS §7)
  access/
    capabilities.yaml      every capability
    role-map.yaml          role_key -> capabilities, with the training gate
    agent-ceilings.yaml    the most each agent product may ever be given
  clients/        setup notes per agent product
  tests/          role-by-tool matrix, wrong-office and wrong-job tests, prompt-injection tests
```

How access is decided:

- **HR decides who holds which role.** The gateway reads each person's role grants per office from the tables in CRM_PWA PR 308 (`hr_role_catalog`, `member_role_grants`). For each role it takes the latest catalog version and allows it only if that version is active; a retired role is refused. The grant must be in effect today. Office scope, line of business, access level and the training confirmation are all checked, and every value of each is covered by a test before any read ships.
- **The repo decides what a role may do.** `role-map.yaml` maps each role to capabilities. A change is a reviewed pull request.
- **An agent never adds access.** What a call may do is the overlap of three things: the signed-in person's roles and offices, the capabilities their role maps to, and the ceiling for that agent product. PR 308 grants roles to people only; it has no way to grant a role to an AI agent seat. An agent acting with no person signed in is out of scope.
- **Missing or stale means no.** If the role map names a retired role, or the map and the HR catalog disagree, the gateway refuses the call. CI checks both directions.
- **Scope comes from the record, not the request.** For every job, person or file an agent names, the gateway looks up that record's office and company and checks it against the person's grant. Lists, searches and counts are filtered row by row in database functions that take the person from the validated sign-in and accept no scope from the caller. An office is never a free argument.
- **No shared sign-ins.** Each call carries one person, one agent product and one registered agent instance, and the gateway checks the sign-in token's issuer, audience and organization. Access tokens are short-lived, and the person's membership and grants are re-checked on every call. A team bot shared by several people gets no company connector until this can be met.
- **Agent seats are inventory only.** A seat on the org chart gives an agent no access. In phase one each pilot person signs in as themselves, so no seat needs an owner yet.

## 4. Job chat through the gateway

The agent is each person's front end to the one job thread. It is never a second place where the conversation lives.

The CH and HOME rules are accepted requirements. The CH document says plainly that it "is not an implemented application feature", and its status table is dated 2026-10-14. CRM_PWA PR 191 (merged 2026-11-01) built part of it. The status column below is from that document and must be re-checked in production before any tool is built. **A tool ships only when the CRM itself enforces the rule behind it.**

| Requirement the gateway must keep | Gateway behaviour | Status in the CRM (2026-10-14 doc) |
|---|---|---|
| CH-01: the job owns every message | Nothing is posted until it resolves to exactly one job. No job, no post. | Verified |
| CH-02: people and records are typed links, never guessed from text | The customer a note is about is a contact verified against the job. Alerted coworkers are separate staff links. Neither is taken from text. | Staff recipients verified. A customer subject link is missing. A typed link to a charge, commission or invoice is not confirmed to exist. |
| CH-03: job access, not participation, decides who can read | Every read uses the CRM's own job authorization. | Verified for the Administrator role only |
| CH-04: search and paging reach the full history | Until the CRM can page the full history, a summary opens with what it covers ("latest 100 threads; older history not included") and never claims to be complete. | Missing: readers stop at 100 threads and 200 entries, with no search of message text |
| CH-05: a note alone never creates a task | The agent may suggest a follow-up. A person creates it on the CRM screen, through the existing action writer. | Missing: no link from a message to an action |
| CH-06, CH-08 to CH-10: staff history and the final-costed archive | No archive or staff-history tool until the CRM has all four: lifetime job history per person, verified final-costed evidence, a kept archive reason and content, and an audited reopen trail. Until then archive state is reported as unavailable. | Missing; depends on closeout work that is not built |
| CH-07: read, archive, task and assignment states are separate | An agent reading a thread changes none of them. | Partial |
| CH-11: show honestly what each channel covers | Results carry the CRM's coverage and sync markers. No tool sends anything to a customer. | Unverified |
| CH-12: retries never duplicate; revoked access wins over cache | Every read re-checks access. The gateway caches no job content. A later write uses the CRM writer's own receipt key and its recovery rules. | Not confirmed |
| CH-13: every alerted coworker registers their own disposition | No "waiting for my response" tool until the CRM writer keeps the reviewer list fixed at post time, a per-note and per-reviewer record, and the no-reviewer case. Recording a disposition stays on the CRM screen. | Writer not finished (PEC-656) |
| HOME-2 to HOME-4: surfaces follow the session role | The morning brief reads one surface, chosen by the CRM's own rule, in the CRM's order, with its row limits and every "unavailable" marker kept. It never infers a booking, an approval, a dollar value or a connection status. | Built on branches; one part not merged |
| HOME-5: nothing on a home surface sends, signs, books or pays | The brief performs no action. | Design rule |

Phase one only reads: the agent can find a job, read its notes and say what is waiting. What would make the stream simpler in a later write phase, which this A3 does not ask to approve:

- **One sentence in, one typed job note out.** Made-up example, not a real job: "Ask accounting why example job 4417 has a second dump fee" would become a note on that job with the right person alerted.
- **Most threads end with one tap** on the CRM screen: Reviewed, Taking ownership, Needs clarification or No action needed.
- **A per-job summary on request** (phase one). It is generated each time, labelled as a summary with its coverage, and never stored as a message.

## 5. Gate checklist

For the gateway (ours):

- [ ] Runs as a container on Hetzner. No local MCP server (hard rule 3).
- [ ] Sentry project, `/healthz` with `buildCommit`, vendored self-heal kit (CONVENTIONS §10d).
- [ ] No secrets in the repo; placeholders mirrored in an example env file (hard rule 2).
- [ ] Every database change is additive and re-runnable (hard rule 1). Work branches from the deployed branch and merges back to it (hard rule 11).
- [ ] A new function in CRM_PWA returns a person's effective roles and offices. The PR 308 tables are closed to app roles and have no reader yet.
- [ ] PR 308's migration is applied in production. It is not yet.
- [ ] Any later skill follows CONVENTIONS §§1 and 5 (`README.md`, `SKILL.md`, `metadata.json`). `skills/README.md` says two files and must be aligned first.
- [ ] Later connectors only: QuickBooks tools read the Supabase mirror (hard rule 13). Price and invoice tools read `mv_invoice_audit_line` and keep the four gates: vendor, office, time and unit of measure.

For each agent product, the full third-party agent tool gate in `docs/54-third-party-agent-tool-gate-2026-06-25.md` (hard rule 12). None is reviewed yet:

| Gate step | Grok Bot | ChatGPT dots | Claude Duet |
|---|---|---|---|
| 1. Intended use, owner and rollback named | [ ] | [ ] | [ ] |
| 2. Licence, provenance, maintainership, release integrity, security policy | [ ] | [ ] | [ ] |
| 3. Egress: prompts, tool results, files, environment values, telemetry, update checks and third-party calls; and in the contract: no training, retention, deletion, residency, sub-processors, breach notice | [ ] | [ ] | [ ] |
| 4. Installer and update behaviour | [ ] | [ ] | [ ] |
| 5. Permissions: files, network, repos, hooks, shell, memory and settings the agent's computer can reach; a destination allowlist we control | [ ] | [ ] | [ ] |
| 6. SkillSpector scan, or a note on why it does not apply to a hosted product | [ ] | [ ] | [ ] |
| 7. No local MCP server needed | [ ] | [ ] | [ ] |
| 8. Company plan with SSO, SCIM, an MCP allowlist and admin audit logs | [ ] | [ ] | [ ] |
| 9. Offboarding steps, including sessions and memory | [ ] | [ ] | [ ] |
| 10. Verdict and dated approval: Chris | [ ] | [ ] | [ ] |

What the vendors' own pages said on 2026-11-13. A review lane fetched the pages in section 11; I re-read the Grok Bot security page and the Claude Duet help page. Contract terms were not seen.

- **Grok Bot (xAI, built and hosted by Cursor).** Version 1.0 was announced on 2026-11-02, with Team Bots on Team and Enterprise plans. The MCP allowlist, SCIM, audit logs, action recording, enforced auto-review and network controls are **Enterprise only**; a self-serve Team cannot set a destination allowlist. Sign-in tokens for connected apps are stored on the vendor's servers, and the model sees only tool results.
- **ChatGPT dots (OpenAI).** Available on Business Premium and eligible Enterprise workspaces, where Enterprise was in an admin preview through 2026-11-18. Custom remote MCP servers connect as workspace plugins, set up on the web. Business Premium availability depends on region and workspace eligibility, and dots are unavailable to workspaces with UAE data or inference residency. Admins can switch a dot's cloud browser and cloud network access on or off and set website allow and block lists for the browser; a wider network policy for dot cloud tasks is "still in development". Whether the gateway connection still works with both switches off is not known. Removing a member revokes their access but does not delete their dot; offboarding needs a separate review of their connections, work and data.
- **Claude Duet (Anthropic).** A US-only waitlist research preview for Pro, Max and Ultra accounts. It is **not available on Team or Enterprise yet**, so it cannot pass step 8 today. It stays out of the pilot until an organization plan exists.
- **Meta Muse.** A personal product. Its pages do not say whether it supports MCP. Out of scope.

## 6. Risks

- **Prompt injection is the main risk, and read-only does not stop it.** These agents browse the web and read email on the same computer that calls our gateway. A hostile page, email or even a job note can tell the agent to read company data and send it out through the browser. This is the path hard rule 5 exists to close. Required before any pilot:
  - the pilot agent is a separate instance whose only connector is `pe-connect`: no email, chat, file upload, local computer access or other connector that can write;
  - its computer cannot reach the open internet: either a destination allowlist we control, or browsing and network access switched off;
  - each tool has a fixed list of fields, a cap on rows and size, and no bulk export; the gateway limits how many calls an agent may make in a period;
  - vendor memory is off where the product allows it;
  - the test suite proves hostile text in a tool result cannot trigger a read, a disclosure or a write.
  If no product can meet the first two, the pilot does not start (open decision 3).
- **Hard rule 5 and the brain.** `pe-connect` exposes no Historian or client-brain tool to a vendor-hosted agent. Historian stays a separate internal service with its own credentials. Any future memory path needs its own A3 and must return trust tier and provenance, keep `property_id` and `era_of_practice`, use the consent-gated path with `atom_access_log` for cross-client reads, and write new memory as `evidence` only.
- **Writes, when they come later.** A proposed write is approved on a company screen that shows the exact job, people and change. The approval is tied to that person, that proposal and a short time limit, and the CRM re-checks access when it commits.
- **Audit log.** Each entry records an event id, the person and their sign-in session, the agent product and instance, the tool and capability, the records touched and how many, the role, grant and role-map versions and the gateway's `buildCommit`, allow or deny with the reason, the size and data class of the result, and the time. It holds no message bodies and no tokens. Entries are append-only in a store separate from the gateway, with restricted access. Retention is open decision 7.
- **Drift.** The role map is in a repo and the grants are in a database. Mitigation: refuse on mismatch, as in section 3.
- **Shadow record.** Staff may chat in an agent's group chat instead of on the job. Mitigation: group chats get no company connector, and the job tools are the easy path.
- **Vendor change.** Duet is a preview and dots was still rolling out to Enterprise. Mitigation: skills and rules stay in our repo as plain text.
- **Offboarding.** Before the pilot, test and write down the longest time between removing a person in HR and their agent losing access, across the gateway, WorkOS and the vendor.
- **Rollback is a runbook, not one switch.** Turn on the gateway kill switch; remove the gateway from the product's allowlist; end vendor and WorkOS sessions; rotate the gateway's own credentials; ask the vendor to delete retained chats and memory under the contract; keep and export the audit log; list any notes written through the gateway. The runbook also lists every place the gateway leaves data (sign-in sessions, Sentry events, container logs, backups) and how each is cleared. Vendor copies of what an agent already read may outlive the switch, which is why the contract terms in gate step 3 come first.
- **Consent flags and standards:** none new in phase one. Trust tier of output: tool results are CRM and HR records, not brain atoms; if one is ever captured into the brain it enters as `evidence`. Any generated summary is `inference` and is never stored.

## 7. Alternatives considered

- **Use each vendor's built-in connectors straight to our systems.** Rejected: permissions would live in several vendor consoles, with no single log.
- **WebMCP in the browser.** Not ready as the base. Chrome's page, updated 2026-10-07, still describes an origin trial for attended use on a page the person has open, so unattended briefs cannot use it. The same tool definitions can be registered in the page later.
- **Commission the existing `server/` scaffold.** It reaches only the brain and was left undeployed (PEC-761). It is a reference, not the base.
- **Leave it human, or leave it to staff.** Rejected: that is the personal-account outcome in section 1.
- **Defer until Duet has an organization plan.** Reasonable if no product passes the gate in section 5.

## 8. The new state, the math and the 10x gate

Not known yet, so nothing is claimed: time per task with an agent, error rate, run cost per person per month, and build cost. The pilot must produce all four.

No build begins until Chris records one of these, with the date:

- **Exemption.** This is mission-grade infrastructure: the access and audit layer every later skill sits behind. Every workflow skill added later still needs its own A3.
- **Measured math.** Before any build: count two weeks of job notes and replies per person from `crm.job_activity` (dispositions cannot be counted until their writer ships) and time five staff on ten set tasks. That gives the cost today. The with-agent side can only be an estimate until something exists, so this path also needs Chris to allow a small, capped prototype for measuring, and the 10x figure is confirmed or not at the end of the pilot.

Either way, approval needs the numbers in open decisions 4 to 7: a cap on phase-one engineering hours, a ceiling on monthly run cost, the pilot length and the result that stops it, and the audit log's retention.

## 9. Open decisions for Chris

Needed before phase one:

1. **10x gate:** DECIDED 2026-11-13 (Chris): exempt as mission-grade infrastructure. Every later workflow skill still needs its own A3.
2. **Where the code lives:** DECIDED 2026-11-13 (Chris): a new repo, `Clvrwrk/mcp.proexteriorsus.net`. Its spec and tickets are that repo's GitHub issues. Staging host `mcp-staging.proexteriorsus.net`; `mcp.proexteriorsus.net` is reserved.
3. **Pilot product:** Grok Bot Enterprise is the only candidate whose public pages describe a destination allowlist. ChatGPT dots qualifies only if the gateway works with its cloud browser and network switched off. If neither passes the section 5 gate and the section 6 conditions, defer.
4. **Pilot people and length:** which three people, for how many weeks?
5. **Cost limits:** the cap on phase-one engineering hours, and the ceiling on monthly run cost.
6. **Stop rule:** the measured result that ends the pilot early.
7. **Audit log:** where it is stored, how long it is kept, and who may read it.
8. **Roles:** PARTLY DECIDED 2026-11-13 (Chris): the mapping of the nine residential business roles from `04_Team_Roles_and_Approvals.docx` to the four read capabilities is approved as written; it is recorded in `Clvrwrk/mcp.proexteriorsus.net` `docs/admin/role-map-residential.md`. Still open: commercial and multi-family roles, Insurance Coordinator and its training gate, line of business and access level per role, and seeding the HR role catalog with the role keys.

For a later write phase, not blocking phase one:

9. **Dispositions:** stay on the CRM screen only (recommended), or may an agent relay one on the person's explicit say-so, stored as agent-relayed?
10. **Agent seats:** who owns each AI agent seat on the org chart, besides Chris? Needed before any agent acts without a person signed in.
11. **Covers:** PR 308 lets the HR Manager link one person to cover another's role while they are out. May a cover approve pay or sign for the absent person? Until decided, the gateway ignores cover links.

## 10. Decision

- [x] **Approve building to staging only** (Chris, 2026-11-13): seeded test data, no agent product connected, no production data.
- [ ] **Approve phase one.** In order: decisions 1 to 8 recorded; one product passes every step of the section 5 gate and the section 6 conditions; PR 308 applied and its reader built; the six read-only tools built and deployed on Hetzner with every gateway checklist item met; role-by-tool, wrong-office, injection, health and audit tests pass; three named people pilot it. Build by ____. Pilot from ____ to ____. Report on use, cost and rollback due ____. Posting, dispositions and every other connector are excluded.
- [ ] **Defer:** revisit on ____, condition: ____
- [ ] **Kill:** reason: ____

Approver: Chris  
Decided on: ____

## 11. Review record

Ringer review swarm, 2026-11-13, two rounds of the same five read-only lanes on GPT-5.6 Sol through Codex: repository rules, CRM claims, security, consistency and plain language, and vendor facts. In both rounds five of five lanes passed their executed checks on the first attempt.

| Round | Run | Findings | P0 | P1 | P2 |
|---|---|---|---|---|---|
| 1 | `pe-connect-a3-review-20261113T161045Z-p37312` | 42 | 2 | 32 | 8 |
| 2 | `pe-connect-a3-review-20261113T162930Z-p49989` | 31 | 0 | 22 | 9 |

The author confirmed the main findings against the cited source lines and three vendor pages, and revised the A3 after each round. The text after the second revision has not been reviewed again. Some round-two findings asked for build-level detail (token formats, log fields, a full storage inventory); those are stated here as requirements and belong in the build specification. Reports are kept in `Archives/home-builds/pe-connect-a3-review-build/` on the M1 disk.

Vendor pages the review lane fetched:

- https://x.ai/news/grok-bot-1-0
- https://docs.x.ai/grok-bot/security
- https://docs.x.ai/grok-bot/teams-and-enterprises
- https://help.openai.com/en/articles/20001530-getting-started-with-your-dot
- https://help.openai.com/en/articles/20001554-managing-dots-in-chatgpt-workspaces
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs
- https://claude.com/resources/articles/claude-duet
- https://support.claude.com/en/articles/17631495-get-started-with-claude-duet
- https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/
- https://developer.chrome.com/docs/ai/webmcp

## 12. Post-build tracking (after the pilot)

- Actual time per task with the agent: ____
- Actual error rate: ____
- Actual run cost per person per month: ____
- Actual ROI multiple, or the exemption on record: ____
- Promoted beyond the pilot: yes / no / pending
- Quality Control observation: pass / revise / kill
