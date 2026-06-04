# Vertical Agents — The Client-Facing Workforce

> These five agents are the human interface to the brain. They are Slack-mentionable, domain-specific, and roofer-authentic. The brain is the asset; the agents are how you talk to it.

---

## The Five Verticals at a Glance

| Handle | Agent | Core domain |
|---|---|---|
| `@ob-accounting` | Accounting | Invoicing, job costing, insurance supplement accounting, depreciation recovery |
| `@ob-ops` | Operations | Scheduling, crews, sequencing, safety, permits, materials coordination |
| `@ob-sales` | Sales | Leads, inspections, estimates, insurance claim filing, adjuster meetings, supplements |
| `@ob-marketing` | Marketing | Content, reviews, CompanyCam curation, EEAT flywheel, manufacturer cert badges |
| `@ob-exec` | Executive | Dashboards, KPI trees, capacity planning, hiring, strategy |

Full role definitions and skill packs live in the subdirectories below.

---

## The Modularity Rule

**A single-truck roofer does not get fleet skills. A storm-heavy market gets claim skills.**

The default skill pack for each agent follows the 80/20 rule: the 5–7 skills that deliver the most value to the widest range of roofing clients are enabled by default. Everything else ships dormant and requires an approved A3 with a measured ≥10x ROI before it is activated.

Concrete examples:

- `storm-canvassing` is enabled by default in `@ob-sales` because most residential roofers chase storm work. A flat-commercial-only roofer may disable it.
- `depreciation-recovery-tracking` in `@ob-accounting` is enabled by default because every insurance job has an open depreciation check. A cash-pay-only roofer may disable it.
- `fleet-tracking` for `@ob-ops` is dormant by default. A roofer running five crews with a fleet manager needs it. A two-truck operation does not.

Skills are toggled in `config/roofer.config.yaml` under `agents.vertical.[role].skills`. The Innovator agent monitors usage patterns and proposes A3s when a dormant skill looks like it has a 10x ROI case for a specific client. Approval and build decisions belong to Chris and the account manager.

---

## How a Slack Mention Flows

When a team member types a `@ob-*` mention in Slack, here is the complete path the request travels before a response arrives:

```
1. MENTION
   Human types "@ob-sales the Henderson hail claim got a partial
   approval; draft the supplement ask."
         |
         ▼
2. CONDUCTOR routes
   Conductor receives the Slack event, identifies the target vertical
   agent (Sales), and hands off the raw message plus the current
   per-client morning-digest context.
         |
         ▼
3. HISTORIAN retrieves internal context
   Sales calls Historian. Historian queries the client brain for:
     - property_id matching Henderson property
     - job atoms linked to this claim (insurance_claim record,
       prior adjuster notes, original scope, Xactimate items)
     - any prior supplement interactions on this job
   Historian returns ranked atoms with provenance, era, and
   trust_tier. Historian never touches the public internet.
         |
         ▼
4. RESEARCHER (optional, when needed)
   If Sales needs external facts — current Xactimate pricing for
   this region, recent adjuster-culture notes for this carrier,
   IRC code language for the disputed line items — Sales calls
   Researcher. Researcher retrieves from external sources only
   and never reads the client brain.
         |
         ▼
5. VERTICAL AGENT produces output
   Sales drafts the supplement request letter using:
     - Historian's retrieved atoms (original scope, partial approval
       summary, documented line items the adjuster skipped)
     - Researcher's external data (if invoked)
     - Its own domain skills (supplement-writing, Xactimate line-item
       logic, carrier-specific escalation patterns)
         |
         ▼
6. AUDITOR gate
   Every output passes through Auditor before delivery.
   Auditor checks against the current QC standard: completeness
   of citation, appropriate trust_tier assignments, no PII leaks,
   no consent boundary violations, format conformance.
   Pass → output ships. Fail → returns to Sales with structured
   rejection; Sales revises and resubmits. Escalate → Conductor
   pages Chris or the account manager.
         |
         ▼
7. DELIVERY
   Auditor-approved output arrives in the Slack thread as a
   reply. Conductor simultaneously:
     - Writes the output atom to the brain (trust_tier: inference,
       linked to job_id + insurance_claim record)
     - Updates the AccuLynx job record via the acculynx bridge
       (supplement request filed, date, status: pending)
     - Queues a follow-up reminder in the next morning digest
         |
         ▼
8. CAPTURE closes the loop overnight
   Capture atomizes the day's interactions (the supplement letter,
   the Slack thread, any responses) back into the brain so
   Historian has the full provenance chain on the next retrieval.
```

**The rule that never bends:** Historian only reads inward. Researcher only reads outward. They are separate processes with separate credentials. This seals the prompt-injection exfiltration path.

---

## Cross-Cutting Governance

All vertical agents operate under the same atom model and governance rules defined in `CONVENTIONS.md`:

- Every atom produced by a vertical agent carries `trust_tier: inference` until a human confirms it; promotion to `instruction` requires explicit confirmation and only Quality Control may change an existing atom's tier.
- Every output passes Auditor before delivery.
- Skill additions require a signed A3 with a ≥10x ROI calculation. Exempt: mission-grade infrastructure and high-error-cost safety/legal/financial tasks.
- No PII, no secrets, no profanity anywhere in any output or atom.
- Config-driven: agent behavior reads `config/roofer.config.yaml`; no company name is hard-coded in any file.

Horizontal agents (Capture, Historian, Researcher, Conductor, Auditor, Quality Control, Innovator, Maintenance) live in `agents/horizontal/`. They are not Slack-mentionable by clients; they operate invisibly or surface through Conductor.
