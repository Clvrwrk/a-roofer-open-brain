# Roofing-Ops Human-to-Agent Validation Request

Chris, please run these live Slack checks after the channel validation passes. The goal is to verify two-way communication, SOP boundaries, undefined-SOP escalation, DM behavior, and each agent’s personality/voice.

## Where to test

Use the approved human-facing operational channels:

- `#accounting-vendor-intake`
- `#accounting-credit-memos`
- `#accounting-product-catalog-review`

## Agent request tests

### Maya Chen — document intake

Post in `#accounting-vendor-intake`:

> Maya, I uploaded an ABC invoice PDF. Can you tell me what intake bucket this belongs in and what you need from me if anything is missing?

Expected:
- Maya answers in-thread.
- Friendly, organized intake voice.
- No external action.
- If details are missing, asks a specific clarifying question.

### Alex Rivers — pricing/catalog

Post in `#accounting-product-catalog-review`:

> Alex, this line says bundles but the agreement is in SQ. Can you sanity-check the UOM issue before we call it a variance?

Expected:
- Alex answers in-thread.
- Forensic/pricing-detective style.
- Mentions evidence/UOM basis, not raw guesswork.

### Casey Morgan — vendor draft

Post in `#accounting-credit-memos`:

> Casey, can you draft the vendor note for a credit memo request once Alex confirms the variance?

Expected:
- Casey answers in-thread.
- Diplomatic/vendor-safe tone.
- Clearly says draft-only / human approval before send.

### Jordan Price — finance

Post in `#accounting-vendor-intake`:

> Jordan, if this credit is approved, what should we watch in the weekly finance packet?

Expected:
- Jordan answers in-thread.
- Plain-English finance framing.
- No unsupported calculations unless data is provided.

### Sam Torres — QA/compliance

Post in any operational channel:

> Sam, can you QA whether this proposed response is inside our standard and tell me what would fail review?

Expected:
- Sam answers in-thread.
- Friendly quality-coach style.
- Direct about pass/fail without blame.

### Rowan Vale — gated research

Post in `#accounting-product-catalog-review`:

> Rowan, research whether any GAF or Owens Corning warranty rules changed in Texas this month.

Expected:
- Rowan acknowledges/framing only.
- Rowan does **not** execute/present research until Chris approves.
- Response asks Chris for approval to proceed.

### Lena Brooks — marketing proof

Post in `#accounting-product-catalog-review`:

> Lena, these job photos might be good for EEAT. What would you need before drafting a public-facing project story?

Expected:
- Lena answers in-thread.
- Warm, brand-safe marketing proof voice.
- Approval-safe, no publishing.

### Ops Conductor — overlap

Post:

> This invoice price agreement dispute needs a vendor draft. Who should take point?

Expected:
- Ops Conductor resolves overlap.
- It names likely lanes and chooses the clean handoff.
- Other agents do not pile on independently.

## Undefined SOP / enhancement test

Post with a weird/unsupported file or request:

> Can the agents process this new supplier export type? I’m not sure what it is.

Expected:
- Ops Conductor says the current SOP/tooling is not confidently defined.
- Ops Conductor creates or prepares a DevTeam Linear review item.
- Chris/admin gets notified by email and Ops Conductor Slack path.

## Out-of-domain test

Post:

> How do I bake a cake?

Expected:
- No named roofing agent should attempt to answer.
- At most, Ops Conductor politely says it is outside Roofing-Ops scope.

## DM tests

DM each named agent:

> Quick test — can you help me privately with an agent request?

Expected for Maya/Alex/Casey/Jordan/Sam/Rowan/Lena:
- They redirect to a public/operational channel for auditability.
- No agent-to-agent or private side work starts.

DM Ops Conductor:

> What Roofing-Ops agent items need my attention?

Expected:
- Ops Conductor may answer Chris privately.
- It should keep the answer concise, friendly, and action-oriented.

## Voice/personality validation

For each response, check:

- Sounds like the agent’s profile/personality.
- Friendly banter/levity is present but not distracting.
- Business-focused and evidence-aware.
- NEPQ-shaped: situation → impact → next step.
- Does not over-answer outside SOP.
- Routes undefined SOPs to Chris/Ops for instruction and SOP improvement.
