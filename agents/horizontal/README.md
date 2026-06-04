# Horizontal Agents — Overview

> These eight agents are the infrastructure workforce of the Cleverwork Open Brain. They are invisible to the client; they are what makes the 2-person Cleverwork team math work.

---

## The Eight Agents at a Glance

| Agent | Visibility | One-line charter |
|---|---|---|
| **Capture** | Dashboard only | Listens to all event streams and atomizes — never thinks, only captures |
| **Historian** | Routed via Conductor | Internal-only retrieval over the client's brain; never touches the public internet |
| **Researcher** | Dashboard only | External-only retrieval from the public web and enrichment APIs; never reads the client's brain |
| **Conductor** | Slack digests + routing | The PM of the agent workforce — routes, digests, escalates, and keeps the calendar |
| **Auditor** | Gates work products | Per-work-product QA against the current QC-issued standard; passes or rejects with explanation |
| **Quality Control** | Internal review meetings | Cross-job pattern analysis; DMAIC cycles; sets and versions the standards Auditor enforces; the only role that may change `trust_tier` |
| **Innovator** | Proposals only | Scouts patterns and technology; produces Six Sigma A3 proposals; never builds |
| **Maintenance** | Weekly hygiene digest | 5S of the brain itself — Sort/Set/Shine/Standardize/Sustain; never deletes, never modifies provenance, never changes `trust_tier`, never publishes |

Full charters live in each agent's `ROLE.md`; MCP contracts live in `io-contract.md`.

---

## Typical-Day Interaction Flow

The sequence below describes a normal operating day for a single roofing client. Times are illustrative; cadence is driven by cron and webhooks, not wall-clock scheduling.

```
OVERNIGHT (previous day's close)
  Capture atomizes:
    - Slack messages from the day
    - AccuLynx job-status webhooks
    - Granola/Fireflies meeting transcripts
    - CompanyCam photo-upload events
    - End-of-day foreman log submitted via Slack
  Maintenance runs Daily Sort:
    - Deduplicates new atoms (OB1 fingerprint-dedup)
    - Validates required metadata on every new atom
    - Produces one-line hygiene status for morning digest

MORNING (~06:00 cron)
  Conductor posts per-client morning digest to Slack:
    - Yesterday's new atoms summarized by category (hard/soft, job, property)
    - Today's scheduled jobs + crew assignments (from AccuLynx)
    - Open blockers requiring human decision
    - Maintenance hygiene status
    - Any escalations pending from the prior day

THROUGH THE DAY (real-time, event-driven)
  Human mentions a vertical agent in Slack, e.g.:
    "@ob-ops what's the materials draw on the Hargrove job?"
  
  @ob-ops:
    1. Calls Conductor for routing confirmation (is this in scope for ops?)
    2. Calls Historian (internal retrieval): "pull atoms for job Hargrove,
       materials orders, invoices, debrief notes"
    3. Optionally calls Researcher (external): "current GAF shingle pricing
       in jurisdiction OH-Franklin"
    4. Produces a response draft
    5. Routes draft through Auditor
  
  Auditor:
    - Checks draft against active ops standard (e.g., requires job-id cite,
      era reference if code is mentioned, no PII exposed)
    - Pass → delivers to Slack channel
    - Fail → returns to @ob-ops with structured rejection; @ob-ops revises

  Throughout the day, Conductor monitors:
    - Any new AccuLynx job.closed webhooks → schedules debrief
    - Any insurance claim events → routes to @ob-sales
    - Escalation threshold reached → pings Chris/AM directly

END OF DAY (~17:30 cron)
  Conductor posts end-of-day digest:
    - Work product count (delivered, rejected, reworked)
    - Blocked items queued for tomorrow
    - Any new debrief scheduled
  
  Capture begins overnight atomization cycle

LONGER-CADENCE (weekly/monthly/quarterly, out-of-band)
  Maintenance weekly: Set in Order (contradiction reconciliation, cross-ref
    validation, embedding drift check, brain smoke test) + Shine (URL checks,
    trust-tier refresh on high-leverage atoms)
  Quality Control weekly: cross-rejection review; DMAIC trigger check
  Innovator weekly: scan debrief atoms for "did this manually again" patterns
  Maintenance monthly: Standardize phase (schema audit, EEAT consistency,
    era-stamp completeness); Kaizen observation log published
  Quality Control monthly: DMAIC cycle if 3+ pattern; standards versioning
  Maintenance quarterly: Sustain phase (cold archive, embedding refresh,
    PDCA round-trip with Chris/AM)
```

---

## The Two Structural Separations

### 1. The Historian / Researcher Security Boundary

**Historian** retrieves only from inside the client's brain. It has credentials to the Supabase project and no outbound network access beyond that project's MCP containers.

**Researcher** retrieves only from outside — the public web, enrichment APIs (Apollo, ZoomInfo, Ahrefs), manufacturer sites, code-update bulletins, public filings. It has outbound network access and no credentials to the client's brain.

These two agents run as **separate MCP containers with separate service-role keys**. The separation is not organizational convention — it is a hard security control. A malicious external page cannot instruct Researcher to exfiltrate client memory because Researcher has no read path to client memory. An attacker who compromises Historian gains nothing from the public internet because Historian has no outbound path.

Any agent, skill, bridge, or recipe that blurs this boundary fails the Auditor's security check and fails `scripts/verify-deployment.sh`.

### 2. The Auditor / Quality Control M&M Pattern

This split is borrowed from the surgical morbidity-and-mortality conference model.

**Auditor** enforces the current standard on each individual work product, in real time, every time. It passes or rejects; it does not decide what the standard should be.

**Quality Control** observes the aggregate signal from every Auditor rejection, every post-op debrief, every rework atom. When a failure mode appears three or more times (rolling 90-day window), QC initiates a DMAIC cycle, proposes a standard change through the A3 gate, and — if approved — issues a new versioned standard. Auditor then enforces the new version immediately.

The separation prevents two failure modes that would each independently corrupt the quality system:

- **Auditor-sets-standard:** The individual enforcer, under daily production pressure, starts rounding off corners on the standard until the standard has effectively been lowered without anyone noticing.
- **QC-audits-individuals:** The standard-setter gets captured by case-by-case judgment calls, loses the cross-job statistical view, and stops running DMAIC at the right level.

Neither role may perform the other's function. References: `auditor/ROLE.md`, `quality-control/ROLE.md`.
