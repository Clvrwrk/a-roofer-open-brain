# Skills — Format, Origins, Agent Bindings, and Governance

This directory contains every skill available to the Cleverwork Open Brain roofer workforce. Skills are portable prompt-plus-context bundles that give agents specific, repeatable capabilities without hard-coding them into the agent's base role. A skill tells an agent *how to think* about a class of task; the agent's ROLE.md tells it *who it is*.

---

## Skill Format (Merged Standard)

Every skill lives in its own folder. Every folder ships exactly two files:

### `SKILL.md`

YAML frontmatter followed by prose instructions.

Required frontmatter keys:

```yaml
---
name: kebab-case-skill-name
description: >
  One- to three-sentence plain-English description. This is what an agent
  reads to decide whether to invoke the skill. Be specific about domain.
when_to_use: >
  Conditions that trigger this skill. Include explicit trigger phrases,
  upstream events, and composability notes (what this works well with).
inputs:
  - name: field_name
    type: string | atom | uuid | boolean | list
    required: true | false
    description: What this input is and where it comes from.
outputs:
  - name: field_name
    type: string | atom | draft | json
    description: What the output contains and where it goes.
trust_tier_of_output: instruction | evidence | inference
  # instruction  = human-confirmed or trusted import; may steer behavior
  # evidence     = observed fact with a source (default for most skill outputs)
  # inference    = model-generated conclusion; never auto-promoted without human confirm
bound_agents:
  - agent-role-name   # vertical: ob-accounting, ob-ops, ob-sales, ob-marketing, ob-exec
                      # horizontal: capture, historian, researcher, conductor,
                      #             auditor, quality-control, innovator, maintenance
provenance:
  origin: cleverwork | ob1 | infranodus
  author: author name or org
  source_url: https://... (for cited skills)
  license: MIT
  a3_ref: proposals/YYYY-MM-DD-skill-name.md | null
---
```

After the frontmatter: the skill's actual instructions, structured however makes sense for the task (phases, rules, output templates, example inputs/outputs).

### `metadata.json`

```json
{
  "name": "kebab-case-skill-name",
  "version": "0.1.0",
  "origin": "cleverwork | ob1 | infranodus",
  "license": "MIT",
  "bound_agents": ["agent-role-name"],
  "a3_ref": null
}
```

---

## The Three Origins

### `cleverwork-roofer/` — Originals

Skills written from scratch by Cleverwork. Domain: residential and commercial roofing — insurance/storm claims, Xactimate supplements, EagleView aerial takeoffs, GAF/CertainTeed/Owens Corning warranty registration, EEAT flywheel publication, schema.org markup, and post-op debrief atomization.

These skills carry no external license obligations and are MIT-licensed as Cleverwork-original work.

### `infranodus/` — Cognition Skills (Cited from InfraNodus)

These skills are re-expressed adaptations of the cognitive-variability framework developed by InfraNodus (infranodus.com). They are **not** verbatim copies of InfraNodus source material. Each folder includes an `ATTRIBUTION` note with a link to the original.

InfraNodus cognition skills bind to the *thinking* horizontal agents — `auditor`, `quality-control`, and `innovator` — because those are the roles where structured epistemic challenge produces the highest leverage. They make those agents *think differently*, not just retrieve faster.

Original InfraNodus skills: https://github.com/infranodus/skills

### `ob1/` — Memory and Session Skills (Cited from OB1)

These skills are re-expressed adaptations of skills from OB1, the persistent-memory spine authored by Nate B. Jones (natebjones.com). They are **not** verbatim copies. Each folder includes an `ATTRIBUTION` note with provenance.

OB1 is licensed FSL-1.1-MIT. The skills here are re-expressed Cleverwork-authored adaptations with attribution; the vendored OB1 schema files keep their upstream notices separately under `schemas/ob1-base/`.

Original OB1 skills: https://github.com/open-brain-initiative/OB1

---

## How Skills Bind to Agents

| Skill | Bound Agents | Why |
|---|---|---|
| `storm-claim-supplement` | `ob-sales`, `ob-accounting` | Drafts Xactimate-style supplement asks; output crosses the financial and sales boundary |
| `insurance-adjuster-prep` | `ob-sales` | Prepares the sales-facing brief for an adjuster conversation |
| `eagleview-takeoff-qa` | `ob-ops` | Operations owns scope and measurement accuracy |
| `roof-estimate-qa` | `ob-sales`, `auditor` | Sales produces; Auditor gates before delivery |
| `gaf-warranty-registration` | `ob-accounting`, `ob-ops` | Accounting tracks warranties financially; Ops owns install completion proof |
| `acculynx-api` | `capture`, `conductor`, `auditor`, `ob-sales`, `ob-ops`, `ob-accounting` | Endpoint planning and safety gates for the primary PM adapter |
| `eeat-publishing` | `ob-marketing` | Marketing drives publication; dual consent check required |
| `schema-markup` | `ob-marketing` | Structured-data output for every published page |
| `post-op-debrief-atomizer` | `capture` | Capture runs dual-track hard/soft atomization on every debrief transcript |
| `critical-perspective` | `auditor`, `quality-control`, `innovator` | Epistemic challenge for agents that set or enforce standards |
| `ontology-creator` | `quality-control`, `innovator` | Builds structured knowledge graphs from accumulated brain content |
| `shifting-perspective` | `auditor`, `quality-control`, `innovator` | Detects structural bias and surfaces underrepresented viewpoints |
| `rhetorical-analyst` | `auditor`, `quality-control` | Checks argument quality and exposes hidden assumptions in proposals |
| `meeting-synthesis` | `ob-sales`, `ob-ops`, `conductor` | Turns any meeting transcript into a durable decision record |
| `competitive-analysis` | `ob-sales`, `ob-marketing`, `innovator` | Market mapping for pricing, positioning, and strategic moves |
| `auto-capture` | `capture`, `conductor` | Ensures high-value session output lands in the brain before the window closes |

---

## The 10x A3 Gate

No new skill enters this directory without a completed A3 proposal stored at `proposals/YYYY-MM-DD-skill-name.md`. The A3 must show:

1. A measured baseline (task frequency, time, error rate, cost).
2. A projected new state with the skill in place.
3. An explicit **ROI multiplier of 10x or greater** calculated as: `(current monthly human cost) / (agent + human-review cost + build cost amortized over 12 months)`.
4. A rollback path if the skill misbehaves.
5. Which trust tier the output lands at.

**Exempt from the gate:** post-op-debrief-atomizer, eeat-publishing, schema-markup, and any skill whose primary ROI argument is avoided-error cost rather than time savings — provided the error-cost math is shown explicitly. These are mission-grade infrastructure. The human is still cheaper for tasks that don't clear the bar; the human remains.

---

## Adding a New Skill

1. Write the A3 at `proposals/YYYY-MM-DD-skill-name.md` (use `proposals/_a3-template.md`).
2. Get approval from Chris + Account Manager.
3. Create the folder under the correct origin directory.
4. Write `SKILL.md` and `metadata.json` conforming to the format above.
5. Deploy to one pilot client; observe two weeks; Auditor reports actual vs. projected ROI.
6. If ROI met: add to template default. If ROI missed by 20%+: kill or revise.

## Skill maturity (built vs. dormant-by-design)

This is a Scaffold-phase repo. Per the governance model (CONVENTIONS §10), a skill does **not** exist as code until it clears the 10x A3 gate — so agent skill packs in `agents/**/skills.md` deliberately **name** skills that are not yet built. That is the 80/20 default, not a gap.

**Built now (9 cleverwork-roofer):** `acculynx-api`, `eagleview-takeoff-qa`, `eeat-publishing`, `gaf-warranty-registration`, `insurance-adjuster-prep`, `post-op-debrief-atomizer`, `roof-estimate-qa`, `schema-markup`, `storm-claim-supplement`.

**Cited cognition (4 infranodus):** `critical-perspective`, `ontology-creator`, `rhetorical-analyst`, `shifting-perspective`.

**Cited OB1 (3):** `auto-capture`, `competitive-analysis`, `meeting-synthesis`.

Every other skill id referenced in an agent's `skills.md` or in `config/roofer.config.yaml` is **dormant**: it ships when an Innovator A3 proves ≥10x ROI (see `proposals/`). Until then the human remains.
