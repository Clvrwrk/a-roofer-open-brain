# 09 — Validating & auditing the agent team

> How Cleverwork knows what's working and what isn't — per agent, per skill, per client. This wires the governance roles we already built (Auditor, Quality Control, Maintenance, Innovator) to concrete metrics and a live dashboard, so "is this team earning its keep?" is a number, not a feeling.

## The principle

We measure three things, at three altitudes, and never let one stand in for another:

1. **Did each work product meet standard?** (Auditor — real-time, per artifact)
2. **Are the standards themselves right, and are failures clustering?** (Quality Control — cross-job, DMAIC)
3. **Is the brain itself staying healthy?** (Maintenance — 5S hygiene)

Plus a fourth, business altitude: **did the client's number move?** That's the only metric that ultimately matters; the other three explain *why* it did or didn't.

## The KPI tree (Pro Exteriors as the worked example)

```
BUSINESS OUTCOME (the only thing the client pays for)
├── Speed:    lead-response time · cycle time lead→close · claim→supplement→approval days
├── Conversion: appointment-set rate · close rate · supplement-approval rate
├── Revenue:  avg job size · supplement $ recovered · review/EEAT pieces published
└── Trust:    CSAT/repeat rate · warranty-registration rate
        ▲ explained by ▼
AGENT OPERATIONS (is the team doing good work, cheaply?)
├── Quality:  Auditor pass rate (per agent) · rework rate · escalation rate
├── Autonomy: human-override rate · % artifacts shipped without human edit
├── Leverage: human-hours saved vs. week-0 baseline · atoms captured per job
└── Coverage: debrief completion rate · digest usefulness (Chris/AM thumbs)
        ▲ explained by ▼
BRAIN HEALTH (is the asset compounding or rotting?)
├── Integrity: provenance-resolve rate · era-stamp completeness · consent-flag completeness
├── Cleanliness: dedup rate · orphan-atom rate · contradiction count
└── Durability: stale-atom % · backup-restore success · embedding-refresh currency
```

Every node rolls up. If close rate dips (business), you look at `@ob-sales` Auditor pass rate and override rate (ops); if those are fine, you look at whether the brain is returning stale or low-trust atoms (health). The tree is how a 2-person team triages without guessing.

## Instrumentation — it's already in the schema

Validation isn't a bolt-on; the brain logs it as it works:

- **Every agent output passes the Auditor**, which writes an atom: `{audit_result: pass|fail|escalate, audit_score, failure_modes[], audited_against_standard_version}`. Reject rate per agent is a `GROUP BY` away.
- **Every recall is traced** (`agent_memory_recall_traces` / `recall_items` from the OB1 spine): what was asked, what was returned, what was *used* vs ignored. Low used-rate = the agent isn't trusting the brain, or the brain isn't answering.
- **Every cross-client read is logged** (`atom_access_log`) — the consent audit.
- **Every live skill carries its A3's projected ROI** (`proposals/`). Actual-vs-projected is computable, so a skill that isn't clearing its 10x gate surfaces itself. *If the human is cheaper, the human comes back* — this is where we catch it.
- **Week-0 baseline** is captured before any agent goes live: current human-hours, error rate, and cost for ops + sales tasks. Everything after is a delta against it.

## The validation dashboard (self-hosted, Coolify/Astro)

A page in the same self-hosted dashboard, reading from the brain (anon key, through the MCP container):

- **KPI cards** — the business row of the tree, vs. last period and vs. baseline.
- **Per-agent scorecard** — green/yellow/red on pass rate, override rate, hours saved, with sparklines.
- **Auditor reject feed** — live; the failure cases *are* the proof the system works.
- **QC / DMAIC board** — failure modes at 2 (watch) and 3+ (open a cycle), with standard version history.
- **Maintenance hygiene panel** — the 5S daily/weekly/monthly numbers + the Kaizen log.
- **Consent & access audit** — `atom_access_log` with anomaly flags.

## The ritual: the weekly "what's working" review

15–30 min, Chris + AM, every Monday. Conductor assembles the packet Friday night:

1. **Scorecard** — each agent rated green / yellow / red against its targets.
2. **Three wins, three misses** — pulled from the week's atoms (biggest hours-saved, biggest Auditor catches; worst rework, slowest cycle, any override spike).
3. **Gate check** — any live skill whose actual ROI fell below 10x → flag for revise-or-retire.
4. **Decisions** — promote a piloted skill, open a DMAIC, adjust a standard, or pull an agent back to human.

Monthly, the Maintenance Kaizen review (`agents/horizontal/maintenance/PLAYBOOK.md` §4.4) runs on the same cadence. Quarterly, QC audits whether the standards themselves still serve the goal.

## Ramp & exit criteria (Phase 1, from the architecture brief)

Don't expand until the first client proves the model:

- One agent's work is shippable without human edit ≥ target % of the time.
- Ops + sales human-hours drop ≥ 60% within 30 days **with no rise in Auditor reject rate** vs. the human-only baseline.
- Auditor has caught real defects (rejects are the proof, not a failure).
- Innovator has logged ≥ 5 candidate A3s; Maintenance has run clean.

If a metric misses, Phase 2 doesn't start until we understand why. That's PDCA, not delay.

## Cadence summary

| Who | Cadence | Watches | Acts by |
| --- | --- | --- | --- |
| Auditor | real-time | every work product vs. current standard | pass / reject / escalate |
| Conductor | daily + weekly | scorecard, escalations, digest usefulness | route, surface, compile the review |
| Quality Control | weekly + monthly | clustered failures (3+), trust-tier errors | open DMAIC, re-version standards |
| Maintenance | daily→quarterly | brain hygiene (5S) | dedup, flag, archive, Kaizen the playbook |
| Innovator | continuous + quarterly | manual-work patterns, sub-10x skills | A3 proposals; resurrect killed ones |
| Chris + AM | weekly + quarterly | the scorecard + the gate | promote / revise / retire / pull-to-human |

## Team validation scorecard (template)

```
Client: ________   Week of: ________   Overall: 🟢/🟡/🔴
Business:  lead-response __  close rate __  supplement $ __  cycle time __
Per agent: @ob-ops 🟢  @ob-sales 🟡  @ob-accounting —  conductor 🟢  auditor 🟢
Top wins:  1) ___  2) ___  3) ___
Top misses:1) ___  2) ___  3) ___
Gate check: skills below 10x → ___    Decisions → ___
Brain health: dedup __  orphans __  provenance __  consent gaps __
```

See also `standards/` (what Auditor enforces), `agents/horizontal/{auditor,quality-control,maintenance,innovator}/`, and `proposals/` (the 10x gate).
