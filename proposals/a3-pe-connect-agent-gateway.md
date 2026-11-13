# A3 — pe-connect: one company gateway for staff AI agents

**Status:** draft, waiting for Chris. Nothing is built, installed or connected.  
**Owner:** Chris (CTO / AI Administrator)  
**Date:** 2026-11-13  
**Affected clients:** Pro Exteriors first. The pattern is template-wide if it holds.

**ROI in one line:** staff can run their job work from the agent they already use (Grok Bot, ChatGPT dots, later Claude Duet), while Pro Exteriors keeps one place that decides what each person and each agent may read, propose and approve, and one log of everything an agent did.

## 1. The problem

- Always-on agents now run on the vendor's cloud computer and connect to company systems through connectors. Staff will connect them with or without a company plan.
- A personal agent account holds its own sign-in tokens and its own memory. When that person leaves, the company cannot see or revoke what the agent kept.
- Every vendor has its own connector and skill format. Building the same workflow three times means three sets of rules that drift apart.
- Most staff activity is short messages between members about one job: a commission, a charge, an invoice. If that moves into agent group chats, the job record loses it, and the rules in CRM_PWA `docs/product/JOB-COMMUNICATION-HISTORY.md` (CH-01 to CH-13) stop holding.

**Not measured yet.** This A3 has no baseline for messages per day, minutes per message or error rate. Section 7 says what to measure before approval.

## 2. Proposed solution

A new repository and Coolify app, working name `pe-connect`: one remote MCP server in a container on the Hetzner host. Every approved agent connects to it and to nothing else of ours.

```
staff agent (Grok Bot | dots | Duet)
        │  remote MCP, WorkOS sign-in as the person
        ▼
   pe-connect gateway ── policy check ── audit log
        │        (role, office, training, capability)
        ├── crm connector      jobs, job communications, requests, home/today
        ├── hr connector       directory, org chart, role grants (read)
        ├── brain connector    Historian recall (see open decision 1)
        ├── acculynx connector read
        ├── quickbooks connector  read-only mirror, never live QBO
        └── vendor connectors  ABC, SRS, QXO invoice and price audit reads
```

Repository layout:

```
pe-connect/
  gateway/        MCP server: WorkOS sign-in, policy check, audit log, /healthz with buildCommit
  connectors/     one folder per system, each with connector.yaml and narrow tools
  skills/         one folder per workflow: SKILL.md + metadata.json (format in skills/README.md)
  access/
    capabilities.yaml   every capability, for example hr.directory.read
    role-map.yaml       role_key -> capabilities, with the training gate
    agent-map.yaml      agent_key -> role_key
  clients/        setup notes per agent product
  tests/          role-by-tool matrix, prompt-injection canaries
```

How access is decided:

- **HR is the source of truth for who holds what.** The gateway reads the role catalog and the per-office role grants added in CRM_PWA PR 308 (`hr_role_catalog`, `member_role_grants`). AI agents sit on the same org chart (`org_positions.agent_key`) and get roles the same way.
- **The role map lives in this repo.** A permission change is a reviewed pull request. CI fails when the map names a role key the HR catalog does not have.
- **Each tool names the capability it needs.** On every call the gateway resolves the person, their roles and offices, and filters the tool list before the agent sees it.
- **Office scope is injected by the server.** A tool never takes an office as a free argument from the agent.
- **A skill marked sensitive stays hidden** until training is confirmed on the person's grant.
- **Read by default.** A write comes back as a proposed action that a person confirms on the app's own screen.

## 3. Job chat through the gateway

The agent is each person's front end to the one job thread. It is never a second place where the conversation lives.

| Rule already in place | What the gateway does |
|---|---|
| CH-01: the job owns every message | A message cannot be posted until it resolves to exactly one job. No job, no post: the agent asks which job. |
| CH-02: people are typed links, never guessed from text | The agent picks recipients and the customer subject from the job's own people. A commission, charge or invoice is attached as a typed link, not pasted as text. |
| CH-03: job access, not participation, decides who can read | Every read goes through the same job authorization as the app. |
| CH-05: a note alone never creates a task | The agent may propose a follow-up. A person confirms it. |
| CH-07: reading is not processing | An agent reading a thread for its owner does not mark it read. |
| CH-13: every alerted coworker registers their own disposition | The agent shows what is waiting and offers the four quick dispositions. It records one only on the person's explicit choice, per note, with the source stored as agent-relayed (open decision 4). |
| CH-11 and zero external sends | No tool sends anything to a customer. |
| HOME-5: nothing on a home surface sends, signs, books or pays | The morning brief reads the same Up next and Needs you endpoints, in the same order. It adds no inbox of its own. |

What makes the stream simpler for staff:

- **One sentence in, one typed job note out.** "Ask accounting why job 4417 has a second dump fee" becomes a note on that job, with the charge linked and the right person alerted.
- **Most threads end with one tap.** Reviewed, Taking ownership, Needs clarification or No action needed closes the loop without another reply.
- **A per-job summary on request:** what is open, who owes a response, what changed. It is generated each time, labelled as a summary, and never stored as a message.

Not verified: how much of CH-01 to CH-13 is live today. The requirements doc is dated 2026-10-14, and CRM_PWA PR 191 (merged 2026-11-01) built part of it. The gateway can only expose what the CRM writers already enforce.

## 4. Gate checklist

For the gateway (ours):

- [ ] Runs as a container on Hetzner. No local MCP server (hard rule 3).
- [ ] Sentry project, `/healthz` with `buildCommit`, vendored self-heal kit (CONVENTIONS §10d).
- [ ] No secrets in the repo; placeholders mirrored in an example env file.
- [ ] QuickBooks tools read the Supabase mirror only (hard rule 13).
- [ ] Price and invoice tools read `mv_invoice_audit_line`, never the slow view, and keep the four silo gates.
- [ ] A new database function in CRM_PWA returns a person's effective roles and offices. The PR 308 tables are closed to app roles and have no reader yet.
- [ ] PR 308's migration is applied in production. It is not yet.

For each agent product (third-party agent tool gate, hard rule 12). None of these is reviewed yet:

| Check | Grok Bot | ChatGPT dots | Claude Duet |
|---|---|---|---|
| Company plan with SSO and offboarding | [ ] | [ ] | [ ] |
| Admin can limit connectors to an allowlist | [ ] | [ ] | [ ] |
| No training on company data, in the contract | [ ] | [ ] | [ ] |
| Retention and data residency known | [ ] | [ ] | [ ] |
| Where sign-in tokens are held | [ ] | [ ] | [ ] |
| Accepts a custom remote MCP server | [ ] | [ ] | [ ] |
| Human approval: Chris | [ ] | [ ] | [ ] |

What a web check on 2026-11-13 suggested, from third-party comparison articles and not from vendor terms: Grok Bot has Team Bots in public beta on Teams and Enterprise plans with an enterprise MCP allowlist; dots run on ChatGPT Business Premium and Enterprise and accept custom MCP servers; Claude Duet is a US-only waitlist research preview; Meta Muse is a consumer product with no stated MCP support and is out of scope.

## 5. Risks

- **Prompt injection.** These agents browse the web and read email on a vendor computer. One that also holds internal write access can be steered by a hostile page. Mitigation: read by default, writes as proposals, no customer sends, and injection canaries in the test suite.
- **Hard rule 5.** Historian is internal-only. Serving brain recall to a hosted agent that also browses the web crosses that line unless the brain connector is limited or left out (open decision 1).
- **Shadow record.** Staff may chat in an agent's group chat instead of on the job. Mitigation: the job tools are the easy path, and group chats get no company connector.
- **Vendor change.** Three of the four products are in beta or preview. Mitigation: skills and rules stay in this repo as plain text.
- **Rollback.** Remove the gateway from each product's connector allowlist. No data moves, because the gateway stores only its audit log.

## 6. Alternatives considered

- **Use each vendor's built-in connectors straight to our systems.** Rejected: permissions would live in three vendor consoles, with no single log.
- **WebMCP in the browser.** Not ready as the base: as of a July 2026 write-up it was a Chrome origin trial with almost no agent support, and it needs an open tab, so unattended briefs cannot use it. The same tool definitions can be registered in the page later.
- **Commission the existing `server/` scaffold.** It reaches only the brain and was left undeployed (PEC-761). It is a reference, not the base.
- **Leave it to staff.** Rejected: that is the personal-account outcome in section 1.

## 7. The math and the 10x gate

No measured baseline exists, so no ROI multiple is claimed. Two paths:

- **Exemption.** Chris rules this mission-grade infrastructure: it is the access and audit layer every later skill sits behind. Each skill added to `pe-connect/skills/` still needs its own A3.
- **Measure first.** Count two weeks of job notes, replies and dispositions per person from `crm.job_activity`, and time five staff on the same ten tasks with and without an agent, then fill in the template's math.

## 8. Open decisions for Chris

1. Does the brain connector exist at all, and if so, which atoms may leave (hard rule 5)?
2. Exempt from the 10x gate, or measure first?
3. New repo `pe-connect`, or a folder in an existing repo?
4. May an agent record a disposition when its owner says so in chat, with the source stored as agent-relayed? Or must dispositions stay on the app screen only?
5. From PR 308, still open: who besides Chris owns each agent, and may a cover approve pay? Until decided, the gateway ignores cover links and no agent approves anything.
6. Where is the roles matrix? `role-map.yaml` cannot be drafted without the named roles.
7. Which product is piloted first, and with which three people?

## 9. Decision

- [ ] Approve: build the gateway with the crm and hr connectors first; pilot product: ____
- [ ] Defer: revisit on ____, condition: ____
- [ ] Kill: reason: ____

Approver: Chris  
Decided on: ____
