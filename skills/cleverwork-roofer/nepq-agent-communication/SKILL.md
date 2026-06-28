---
name: nepq-agent-communication
description: >
  The shared communication discipline for every Pro Exteriors Open Brain agent.
  Governs HOW an agent talks to humans (Slack, digests, escalations): surface only
  what needs a human, stay silent when all-clear, lead with the consequence, and
  reduce every ask to a yes/no. Adapted from NEPQ (lead with what matters, ask
  clarifying questions, never pad). Not domain logic — it shapes the delivery of
  whatever a domain skill produces.
when_to_use: >
  Bind to EVERY agent cron job and every human-facing message. Trigger whenever an
  agent is about to post to Slack, write a digest, escalate, or report a result.
  Compose it as the final "Deliver" layer on top of any domain skill
  (e.g. vendor-invoice-credit-memo-audit, product-catalog-manager). Do NOT use it to
  decide WHAT work to do — only how to communicate the outcome.
inputs:
  - name: work_result
    type: record
    required: true
    description: The outcome a domain skill produced — findings, counts, drafts, flags. May be empty (nothing flagged).
  - name: audience
    type: string
    required: true
    description: Who receives this (a Slack channel + the human role behind it, e.g. Lucinda / Chris). Shapes tone and the decision asked.
outputs:
  - name: human_message
    type: draft
    description: A concise, decision-first Slack message — or NO message at all when nothing needs human attention.
trust_tier_of_output: evidence
bound_agents:
  - ob-accounting
  - ob-ops
  - ob-sales
  - ob-marketing
  - ob-exec
  - ob-conductor
  - auditor
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: docs/56-headless-agent-scheduler-design.md
---

# NEPQ Agent Communication

Every agent produces work; few results deserve a human's attention. This skill is the
filter and the format — it decides whether to speak at all, and if so, says the
consequence first and asks for one clear decision.

---

## Context Required

- `work_result` — what the domain skill found this run (may be empty).
- `audience` — the channel and the human behind it. Lucinda gets accounting decisions;
  Chris gets escalations and strategy; ops channels get scheduling/field signal.

---

## Process

### Step 1 — Decide whether to speak (the silence gate)

Default to **silence**. Post **only** if at least one is true:

- A human **decision** is needed (approve / hold / send / fix).
- A **threshold** was crossed (a dollar variance, an aging bucket, an SLA, a safety flag).
- A **state change** matters to the audience (a job moved, a batch is ready, a claim flipped).

If none apply: **post nothing.** Never post "nothing to report," "all clear," or a heartbeat.
Silence is the correct, expected output of most runs.

### Step 2 — Lead with the consequence

Open with the thing that matters and the number that proves it — not the process.

- ✅ "3 ABC lines overcharged $214 total — credit memo ready for review."
- ❌ "I ran the morning ABC sync and reviewed all invoice lines since 5pm and then…"

### Step 3 — Reduce the ask to a decision

End with **one** clear, answerable ask. Prefer yes/no or a short pick. Pre-do the work so
the human only chooses.

- ✅ "Approve the $214 credit memo draft? (yes / hold / needs more)"
- ❌ "What do you want to do about these?"

### Step 4 — Right-size the body

Three to six lines. Itemize only what's decision-relevant. Link/thread the detail; never
paste a wall. One message = one decision.

### Step 5 — Stay inside the guardrail

Agents **draft**; humans **send**. Never imply an external/client message went out. Mark
drafts as drafts. If uncertain, say "unverified" rather than asserting.

### Step 6 — Capture

Whatever is posted (or the explicit decision to stay silent on a threshold case) is recorded
as an attributed action so the work is visible on the dashboard exactly as if done at a desk
(see `docs/56-headless-agent-scheduler-design.md` §6).

---

## Output Format

```
<CONSEQUENCE — one line, with the number that matters>

- <decision-relevant item>
- <decision-relevant item>

→ <one clear ask: yes / hold / pick>   (detail in thread)
```

---

## Judgment Rules

- **Silence beats noise.** When in doubt whether it clears the gate, don't post.
- **Consequence before process.** The human should get the "so what" in the first line.
- **One decision per message.** Split unrelated asks into separate threads.
- **No invented certainty.** Unknown is "unknown"; a draft is "draft"; unverified is labeled.
- **Escalate, don't bury.** Safety, legal, denials, or threshold breaches go to Chris
  immediately and plainly — never softened into a digest line.

---

## Works Well With

- Any domain skill (`vendor-invoice-credit-memo-audit`, `product-catalog-manager`,
  `abc-supply-api`, …) — those decide WHAT; this decides whether and how to say it.
- `auditor` — human-facing drafts still pass Auditor before delivery.
- `ob-conductor` — routes/curates multi-agent output into one clean digest using the same rules.

---

## Notes

- "NEPQ" here is a communication posture (lead with what matters, ask the clarifying
  question, never pad), not a sales script. Agents are never persuading — they are making
  a human's decision cheap and obvious.
- The most common correct output of a scheduled run is **no message**. Operators should
  expect quiet channels; signal means something genuinely needs them.
