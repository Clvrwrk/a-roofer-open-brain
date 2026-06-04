---
name: ontology-creator
description: >
  Builds a structured ontology, taxonomy, or knowledge graph from a collection
  of brain atoms, work products, or text inputs. Extracts entities, defines
  relationships between them, and maps the conceptual structure of a domain
  as it has accumulated in the brain. Used by quality-control and innovator
  to understand what the brain actually knows — and where its knowledge map
  has gaps or structural asymmetries.
when_to_use: >
  Invoke when quality-control wants to understand the structural shape of
  a recurring failure mode across many atoms. Invoke when innovator is
  preparing a market landscape for an A3 proposal and needs to map
  competitor relationships, regulatory connections, or technology adjacencies.
  Invoke after a large debrief batch lands in the brain and a structural
  synthesis of what was learned is needed. Most useful when a question
  cannot be answered by retrieving a single atom — when the answer lives
  in the relationships between atoms.
inputs:
  - name: source_atoms_or_text
    type: list
    required: true
    description: >
      A collection of atoms (by ID), atom summaries, or free text to analyze.
      The skill works on any text input — atom content, debrief transcripts,
      competitor research, industry standards text, or a combination.
  - name: domain_focus
    type: string
    required: false
    description: >
      Optional: a specific domain or question to organize the ontology around
      (e.g., "ice-and-water-shield code requirements", "GAF warranty eligibility
      conditions", "adjuster dispute patterns"). If absent, the ontology
      covers the full scope of the input.
outputs:
  - name: ontology_map
    type: draft
    description: >
      A structured ontology in prose + list form, identifying the primary
      entities, their relationships (typed and directional), the conceptual
      clusters that emerge, and the structural gaps — concepts that the
      evidence suggests should be connected but are not yet.
trust_tier_of_output: inference
bound_agents:
  - quality-control
  - innovator
provenance:
  origin: infranodus
  author: InfraNodus (infranodus.com)
  source_url: https://github.com/infranodus/skills
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Ontology Creator skill
from InfraNodus (infranodus.com). InfraNodus uses knowledge graph analysis — including
cluster detection, gap identification, and network topology metrics — to extract structured
relationships from text. This adaptation re-expresses those structural analysis principles
without relying on the InfraNodus MCP server, grounded in the construction knowledge domain.
Original skill set: https://github.com/infranodus/skills

---

# Ontology Creator

A knowledge map built from what the brain has accumulated. Useful not as a snapshot of
what we know, but as a diagnostic of how we know it — which concepts are well-connected,
which are isolated, and which gaps in the map represent real gaps in the brain's knowledge.

---

## When to Apply This Skill

The right time to build an ontology is when you have too many atoms to read one by one,
but too few structural connections to answer a question confidently. The ontology does
not add new facts — it reveals the shape of the facts already present.

---

## Process

### Phase 1 — Entity Extraction

Read the input and extract the primary entities: the distinct things (products, roles,
regulations, procedures, properties, companies, concepts) that the input refers to.

For each entity, note:
- Its type (product, role, code, property, event, concept, organization, person)
- Its frequency across the input (how often it appears)
- Its centrality (how many other entities it connects to)

Do not over-extract. Prefer a smaller set of well-defined entities to a large set of
ambiguous ones. In a roofer's brain context, expect entities like: GAF Timberline HDZ,
IRC Section R905, Ice-and-Water Shield, Master Elite Contractor, ACV vs. RCV, EagleView
Bid Perfect, Adjuster Meeting, Post-Op Debrief, Storm Claim Supplement.

### Phase 2 — Relationship Mapping

For each pair of entities that co-occur meaningfully, define the relationship with a
typed direction:
- `[requires]` — entity A requires entity B (e.g., GAF Golden Pledge [requires] Deck Armor)
- `[governs]` — entity A governs entity B (e.g., IRC R905.1 [governs] underlayment installation)
- `[produces]` — entity A produces entity B (e.g., post-op debrief [produces] soft atoms)
- `[enables]` — entity A enables entity B (e.g., EagleView QA [enables] supplement quantities)
- `[constrains]` — entity A constrains entity B (e.g., AHJ amendment [constrains] ridge vent sizing)
- `[precedes]` — entity A precedes entity B in a workflow
- `[disputes]` — entity A is in tension with entity B (e.g., contractor scope [disputes] adjuster scope)
- `[attributes_to]` — entity A attributes provenance to entity B

### Phase 3 — Cluster Identification

Group the entities and relationships into clusters — sets of entities that are more
densely connected to each other than to the rest of the map.

For each cluster:
- Name it (e.g., "Insurance Claim Workflow", "Manufacturer Warranty System", "Code Compliance Chain")
- Note the hub entities within it (the ones with the most connections)
- Note whether the cluster has strong internal connections but few connections to other clusters

### Phase 4 — Gap Detection

Look at the map structurally:
- Which entities appear in multiple clusters but are not explicitly connected in the input?
  These are bridge concepts — candidates for new atoms or new skill prompts.
- Which entities have high frequency but few defined relationships? These are under-mapped concepts.
- Which relationships between clusters are missing that you would expect to exist?
  In a roofer's brain: if the "Insurance Claim Workflow" cluster and the "Manufacturer Warranty System"
  cluster are not connected, but they clearly should be (a storm claim replacement triggers warranty registration),
  that gap is a structural finding.

### Phase 5 — Ontology Summary

Assemble the findings:

```
ONTOLOGY MAP
Domain: [domain_focus or "full input scope"]
Entities: [N] identified

ENTITY LIST
  [Entity name] — Type: [type] — Centrality: high/medium/low
  ...

RELATIONSHIPS
  [Entity A] [relationship_type] [Entity B]
  ...

CLUSTERS
  [Cluster name]: [hub entities] — internal density: high/medium/low
  ...

STRUCTURAL GAPS
  [Gap 1]: [Entity A] and [Entity B] are not connected in the current input
            but should be because [reasoning]
  [Gap 2]: ...

RECOMMENDED ACTIONS
  [Numbered list of new atoms, new skill prompts, or knowledge-harvest targets
   that would close the most important gaps]
```

---

## Judgment Rules

- The ontology describes what is present in the input — do not infer relationships that are not supported by the text.
- Structural gaps are findings, not conclusions. Flag them as recommendations for human investigation.
- Do not include entity names from confidential claim details or homeowner PII in the ontology output.
- Trust tier is always `inference`. An ontology is a map drawn by the skill — the brain's actual state may differ.

---

## Works Well With

- `critical-perspective` — after the ontology reveals a gap, Critical Perspective stress-tests the explanation for why the gap exists
- `shifting-perspective` — the gaps identified in an ontology are often the result of a structural perspective bias; Shifting Perspective asks whose viewpoint would fill them
