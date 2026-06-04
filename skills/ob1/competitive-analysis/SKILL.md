---
name: competitive-analysis
description: >
  Produces a decision-ready view of the roofer's competitive market: who
  the relevant competitors are, how they position and price, where gaps
  in the market exist, and what moves are worth making now. Covers both
  direct competitors (other roofers in the service area) and adjacent
  competitive forces (large storm-chasing nationals, insurance-preferred
  contractors, franchise networks). Output is operator-first — designed
  to change a real pricing, positioning, or strategic decision, not to
  produce market trivia.
when_to_use: >
  Invoke when @ob-sales or @ob-marketing receives a request like
  "who are we up against in the Northside market", "benchmark our
  warranty offering vs. competitors", "why are we losing to [competitor]",
  or "what's the competitive landscape before we price this commercial bid".
  Also runs when innovator is preparing an A3 for a new service line
  and needs a market context section. Best when you have a geographic
  service area, a target customer segment, and at least one specific
  decision the analysis should support.
inputs:
  - name: service_area
    type: string
    required: true
    description: >
      The geographic market to analyze (city, metro, or named service area
      from roofer.config.yaml).
  - name: decision_to_support
    type: string
    required: true
    description: >
      The specific decision this analysis should inform: pricing a storm-response
      offer, positioning a commercial entry, responding to a price objection,
      evaluating a new service-area expansion, etc.
  - name: competitor_set
    type: list
    required: false
    description: >
      Named competitors if already identified. If absent, the skill discovers
      the competitive set from Researcher's external data and prior brain atoms.
  - name: segment_focus
    type: string
    required: false
    description: >
      insurance-storm | retail-residential | commercial | all.
      Defaults to the client's primary revenue segment from roofer.config.yaml.
outputs:
  - name: competitive_brief
    type: draft
    description: >
      A structured brief: executive summary, competitor set with role labels,
      comparison table, positioning narrative, strategic implications,
      and 3–5 recommended moves tied to the stated decision.
  - name: competitive_atoms
    type: list
    description: >
      Individual competitor profile atoms written to the brain for future
      retrieval, each with trust_tier = evidence and source citations.
trust_tier_of_output: evidence
bound_agents:
  - ob-sales
  - ob-marketing
  - innovator
provenance:
  origin: ob1
  author: Nate B. Jones (natebjones.com)
  source_url: https://github.com/open-brain-initiative/OB1
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Competitive Analysis skill
from OB1 by Nate B. Jones (natebjones.com, https://github.com/open-brain-initiative/OB1).
OB1 is licensed FSL-1.1-MIT. This adaptation re-expresses the skill's operator-first
competitive analysis framework in the Cleverwork roofing domain. The core structural
principles — operator-first framing, primary source preference, distinguishing facts
from inferences, and producing recommended moves rather than market summaries —
belong to OB1's original design.

---

# Competitive Analysis

The goal is not a comprehensive map of every roofer in the market. The goal is a brief
that helps the contractor make a better pricing, positioning, or pursuit decision today
than they would have made without it.

---

## Context Required

- Geographic service area
- Decision to support (required — without this the analysis has no frame)
- Primary customer segment (insurance-storm, retail-residential, commercial)
- Competitor set (or permission for Researcher to discover it from public sources)
- Pricing context if pricing is the subject of the decision
- Prior competitive atoms in the brain (prior encounters, customer objections, lost-job debrief atoms)

---

## Process

### Step 1 — Frame the Assignment

State clearly:
- What decision this analysis supports
- The geographic scope
- The customer segment being analyzed
- The time horizon (is this for a decision this week or a strategic planning cycle?)

The framing is what keeps the analysis from sprawling. Every subsequent step should pass the test: "Does this help the stated decision?"

### Step 2 — Build the Competitor Set

Classify each competitor:

| Role | Description |
|---|---|
| Direct | Same trade, same geography, same primary segment |
| Adjacent | Same trade, different geography OR different segment (e.g., focused on commercial when this roofer is residential) |
| Emerging | New entrants, storm chasers moving into the market, national franchise expansions |
| Insurance-preferred | Carriers that maintain preferred contractor programs that route claims to specific roofing companies |

For each competitor: source the information from Researcher's external data (company website, Google Business Profile, contractor license database, review platforms, BBB, local permit records). Label confidence: HIGH (primary source), MEDIUM (secondary source), LOW (inferred).

### Step 3 — Compare the Right Dimensions

Always include:
- Positioning and target customer: what does the competitor claim to be, and for whom?
- Manufacturer certifications: GAF Master Elite? OC Platinum? CertainTeed SELECT? (These affect warranty tier and carry marketing weight.)
- Service area overlap with this roofer

Include when public evidence exists:
- Pricing: do they publish prices or price ranges? How do they structure proposals (per-square vs. full-job)?
- Warranty offering: what warranty tier do they typically deliver?
- Storm-chasing posture: do they follow storm events regionally?
- Volume indicators: review count trajectory, permit pull frequency in public records, fleet size visible on maps

Include when relevant to the decision:
- Online visibility: Google ranking for key terms in the service area, review rating and recency
- Insurance carrier relationships: do they appear on preferred contractor lists?
- Subcontractor vs. crew model: affects quality consistency and liability posture

Never invent a number. If a pricing page is ambiguous, say it is ambiguous.

### Step 4 — Convert Findings to Judgment

Separate:
- **Known:** supported by primary sources
- **Inferred:** reasonable conclusion from indirect signals (labeled explicitly)
- **Unknown:** relevant but not discoverable from public sources

Then answer:
- Where is this market crowded? (Commoditized segment = price pressure = margin risk)
- Where is it under-served? (Gap = opportunity if the roofer can credibly fill it)
- What advantage does this roofer have that no listed competitor currently claims?
- What threat is growing that the roofer should respond to in the next 90 days?

### Step 5 — Recommended Moves

Tied to the stated decision, write 3–5 recommended moves. Each move should be:
- Specific enough to act on
- Based on a finding in the analysis
- Achievable given the roofer's current resources

Example moves:
- "No competitor in the Northside market prominently features a GAF Golden Pledge warranty in their marketing. Lead with it on the storm-response landing page — this is a defensible differentiator."
- "The two largest direct competitors both rely on storm-chasing volume; neither has a documented referral program. A structured referral incentive would reach a segment they are not cultivating."
- "[Competitor name] has 4.2 stars with 38 reviews vs. this roofer's 4.7 with 22 reviews. Accelerating the EEAT review capture from the next 10 closed jobs would overtake their review volume within 60 days."

### Step 6 — Produce the Brief and Write Atoms

```
COMPETITIVE BRIEF
Service area: [area]     Segment: [segment]
Decision: [decision to support]     Date: [date]

EXECUTIVE SUMMARY
[3–4 sentences: what the market looks like, what matters for the stated decision]

COMPETITOR SET
  [Name] — Direct | Adjacent | Emerging | Insurance-preferred
  Cert tier: [tier]  Reviews: [N avg rating, N count]  Confidence: HIGH/MEDIUM/LOW
  ...

COMPARISON TABLE
  [Dimension] | [Competitor A] | [Competitor B] | [This roofer]
  ...

MARKET NARRATIVE
[A paragraph: how this market is structured, where the pricing and positioning
gaps are, what the most significant competitive dynamic is]

STRATEGIC IMPLICATIONS
[3–5 bullets: risks, opportunities, what this roofer's position means in this context]

RECOMMENDED MOVES
  1. [Move — tied to finding]
  2. [Move]
  3. [Move]
```

Write one competitor atom per named competitor to the brain for future retrieval.

---

## Judgment Rules

- Prefer primary sources. Competitor website and Google Business Profile data are primary. Review sites are secondary. Hearsay in debrief atoms is tertiary — useful as a signal but never sufficient alone.
- Never assign a price to a competitor unless they publish it or a client provided a competing quote (in which case, cite the source and date).
- Inferences about competitor strategy are labeled "inferred" — never stated as confirmed facts.
- The recommended moves are the product. If the analysis does not produce actionable moves tied to the stated decision, the analysis is incomplete.

---

## Works Well With

- `meeting-synthesis` — competitive intelligence from a lost-job debrief or from a customer objection conversation feeds directly here
- `innovator` — competitive gap findings are strong A3 inputs
- `ob-marketing` — the EEAT differentiation moves from this skill inform the publication strategy

---

## Notes

- Storm-chasing nationals (e.g., large companies that deploy crews after major storm events) are a temporary competitive force, not a permanent market presence. Analyze them separately from local competitors; their posture is volume-driven, not relationship-driven, which means they are not competing for the same customers a local roofer wants long-term.
- Insurance preferred contractor programs: these are significant competitive forces in markets with high storm frequency. Research which carriers have preferred programs in the service area and whether any competitors hold preferred status — this affects the insurance-storm acquisition funnel directly.


---

## Attribution

Adapted from **OB1** by Nate B. Jones (FSL-1.1-MIT) — re-expressed in Cleverwork's own words, not copied verbatim. Nate gives away practical systems like this: <https://natebjones.com> · <https://substack.com/@natesnewsletter>.
