---
name: rhetorical-analyst
description: >
  Analyzes the argument structure of a work product or proposal across three
  dimensions: persuasion mechanics, rhetorical moves, and logical integrity.
  Identifies hidden assumptions, checks for asymmetric standards, exposes logical
  gaps, and scores the strength of the argument on its own terms. Designed to help
  auditor and quality-control distinguish between arguments that are well-reasoned
  and arguments that merely feel convincing.
when_to_use: >
  Invoke when auditor is reviewing a proposal, A3, or supplement argument that
  relies heavily on reasoning rather than documented evidence. Invoke when
  quality-control is evaluating whether a proposed standard change is logically
  sound or is being driven by a recent vivid failure rather than a measured pattern.
  Invoke when innovator is reviewing a vendor claim, a manufacturer spec, or
  external research for an A3 proposal. Most valuable when the document is persuasive
  and that persuasiveness is itself the reason for scrutiny.
inputs:
  - name: argument_text
    type: string
    required: true
    description: >
      The text containing the argument to analyze. Can be an A3 proposal,
      a supplement justification, a QC standard rationale, a vendor proposal,
      or a position taken in a debrief or strategic discussion.
  - name: analysis_focus
    type: string
    required: false
    description: >
      Optional: a specific dimension to concentrate on — "logical gaps",
      "persuasion mechanics", "asymmetric standards", or "hidden assumptions".
      If absent, runs all three dimensions.
outputs:
  - name: rhetorical_analysis_report
    type: draft
    description: >
      A structured report identifying the argument's primary moves, scoring its
      logical integrity, exposing hidden assumptions, noting any asymmetric
      standards applied, and listing the specific claims that require stronger
      evidence before the argument should be accepted.
trust_tier_of_output: inference
bound_agents:
  - auditor
  - quality-control
provenance:
  origin: infranodus
  author: InfraNodus (infranodus.com)
  source_url: https://github.com/infranodus/skills
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Rhetorical Analyst skill
from InfraNodus (infranodus.com). InfraNodus's original framework analyzes arguments
across persuasion, rhetoric, and logic dimensions — identifying moves, scoring effectiveness,
exposing hidden assumptions, and checking for asymmetric standards including in the analyst's
own reasoning. This adaptation re-expresses those analytical principles in a construction-domain
context, grounded in the types of arguments that arise in roofing claims, estimates, proposals,
and governance decisions.
Original skill set: https://github.com/infranodus/skills

---

# Rhetorical Analyst

A well-constructed argument is not the same as a correct one. This skill reads arguments
on their own terms first — then tests whether those terms hold up.

---

## When to Apply This Skill

The most dangerous arguments to accept uncritically are the ones that are internally
consistent and clearly written. Internal consistency only means the argument does not
contradict itself; it does not mean the premises are true or that the same standard
is being applied symmetrically. This skill finds the difference.

---

## Process

### Dimension 1 — Persuasion Mechanics

Identify how the argument is trying to persuade:
- What emotional register is it operating in? (urgency, authority, scarcity, social proof, fear of loss)
- What rhetorical moves does it use? Common construction-domain moves:
  - Appeal to standard practice ("every roofer does this")
  - Appeal to authority ("the manufacturer requires it")
  - Appeal to precedent ("we did it this way last time and it worked")
  - Appeal to cost ("it's cheaper to do it right than to fix it later")
  - Appeal to risk ("if we don't supplement this, we won't cover costs")
- Is the argument primarily emotional, primarily evidentiary, or both?

Score each identified move: LEGITIMATE (the move is backed by evidence), REASONABLE (the move is plausible but could be challenged), or UNSUPPORTED (the move asserts without evidence).

### Dimension 2 — Logical Integrity

Map the argument's logical structure:
- What is the primary claim?
- What are the premises that support it?
- Is the inference from premises to claim valid?

Common logical gaps in construction-domain arguments:
- **Scope creep in claims:** asserting that because X is a good idea, Y (which follows from X) is also justified — without establishing the connection
- **Correlation as causation:** "We used Product A on the last job and it went well, therefore Product A is better than Product B"
- **Absence of evidence as evidence of absence:** "We've never had a callback on this installation method, therefore the method is sound"
- **False dichotomy:** "Either we supplement now or we lose money" — omitting the middle path of a partial supplement or a measurement dispute

For each logical gap: name it, explain why it weakens the argument, and state what evidence would close it.

### Dimension 3 — Asymmetric Standards

Asymmetric standards are the most subtle and consequential failure mode in organizational reasoning. They occur when:
- A higher standard of evidence is required to accept an uncomfortable conclusion than a comfortable one
- A failure is attributed to external causes when it is unfavorable and to internal excellence when it is favorable
- A proposed change is held to a higher bar than the status quo it is meant to replace

In a roofer's brain context:
- Does the A3 proposal hold the current human process to the same evidence standard it holds the proposed skill?
- Does the supplement argument require stronger justification for the items the adjuster is likely to challenge than for the items the adjuster will pass without question?
- Does the QC standard change proposal account for the fact that the standard being replaced also had a rationale?

For each asymmetry identified: describe it, explain its effect on the argument's validity, and note what symmetric treatment would require.

### Dimension 4 — Hidden Assumptions Specific to This Dimension

(In addition to the assumption inventory in the Critical Perspective skill — which this skill complements, not replaces.)

What does the argument assume about:
- The audience's existing knowledge or values?
- The time horizon over which the conclusion is valid?
- The baseline against which the argument's claim is being compared?

### Phase 5 — Summary

```
RHETORICAL ANALYSIS REPORT
Subject: [brief description]
Analysis focus: [dimension(s) analyzed]

PERSUASION MECHANICS
  Move 1: [description] — LEGITIMATE / REASONABLE / UNSUPPORTED
  Move 2: ...

LOGICAL INTEGRITY
  Primary claim: [claim]
  Premises: [list]
  Gaps identified:
    [Gap 1]: [name] — [description] — [what would close it]
    [Gap 2]: ...

ASYMMETRIC STANDARDS
  [Asymmetry 1]: [description] — [effect on argument validity]
  [Asymmetry 2]: ...

OVERALL ARGUMENT STRENGTH: STRONG / ADEQUATE / WEAK
  (STRONG: premises are sound, inference is valid, no significant asymmetries;
   ADEQUATE: sound in main thrust but has gaps that should be addressed before action;
   WEAK: central claim is not supported by the reasoning provided)

REQUIRED BEFORE ACCEPTANCE
  [Numbered list of specific evidence or clarifications the argument needs
   before auditor or QC should act on it]
```

---

## Judgment Rules

- This skill analyzes the argument as written — it does not evaluate whether the underlying facts are true (that is Critical Perspective's job).
- Asymmetric standard findings are the most important output. Always look for them, even in strong arguments.
- The trust tier is always `inference`. The rhetorical analysis is the skill's reading of the argument, not a definitive verdict.
- If the argument is genuinely strong — internally consistent, well-evidenced, symmetrically applied — say so. Do not manufacture critiques.

---

## Works Well With

- `critical-perspective` — Rhetorical Analyst attacks the argument's structure; Critical Perspective attacks its substance. Run both for high-stakes proposals.
- `shifting-perspective` — after identifying asymmetric standards, Shifting Perspective develops the viewpoint that the asymmetry disadvantaged
