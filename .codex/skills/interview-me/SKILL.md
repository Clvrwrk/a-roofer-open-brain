---
name: "interview-me"
description: "Use when the user invokes /interview-me, $interview-me, or asks to be interviewed before planning/building so the agent aligns on the end goal, UI/UX vision, constraints, success criteria, and non-goals before implementation."
metadata:
  short-description: "Alignment interview before planning or building."
---

# /interview-me

Run an alignment interview before implementation. The goal is to prevent agents from building the wrong thing confidently.

## Contract

When this skill is invoked:

- Do not write production code or make irreversible architecture choices.
- Do not produce a final build plan until the interview has a confirmed alignment brief.
- Ask concise questions in rounds of 3 to 5 questions maximum.
- Prefer concrete reference artifacts over abstract preference words.
- After each round, summarize locked decisions and remaining unknowns.
- End with an **Alignment Brief** and ask the user to confirm or correct it before any build starts.

## Interview Flow

### 1. Anchor

Establish what the user is trying to recreate or create.

Ask for:

- Reference examples: URLs, files, screenshots, prior app routes, sketches, competitors, or "like this but not that" examples.
- The primary user and job-to-be-done.
- The first screen the user expects to see.
- The one behavior that must feel right for the experience to count as successful.

### 2. UX Vision

Convert taste into implementation constraints.

Ask about:

- Information density: command center, map, table, workflow, consumer app, report, etc.
- Navigation model: top-level page, submenu, modal, drill-in, map-first, table-first.
- Interaction model: click, hover, filter, search, drag, zoom, keyboard, mobile needs.
- Visual reference: quiet/utilitarian, geographic/map native, executive dashboard, operations cockpit, etc.
- What the user hated about prior attempts.

### 3. Data And Truth

Identify source-of-truth and trust boundaries.

Ask about:

- Live data sources, snapshot fallbacks, manual overrides, and sync cadence.
- Required entities and fields.
- Which values are human-approved versus computed.
- Audit trail expectations.
- External APIs, paid services, credentials, rate limits, and acceptable caching.

### 4. Scope Edges

Find the boundaries before planning.

Ask:

- Must-have for v1.
- Nice-to-have but deferrable.
- Explicit non-goals.
- Failure states and empty states.
- What should never happen automatically without human approval.

### 5. Done Criteria

Turn the conversation into testable acceptance criteria.

Capture:

- Happy-path user flow.
- At least 5 observable acceptance checks.
- Data completeness requirements.
- Visual QA requirements.
- Performance expectations for realistic data size.
- Rollout path and fallback behavior.

## Output Format

After enough answers, produce:

```markdown
## Alignment Brief

### Product Goal

### Primary Users

### Reference Experience

### First Screen

### Required Interactions

### Data Sources And Trust

### Non-Negotiables

### Explicit Non-Goals

### Acceptance Criteria

### Open Questions

### Recommended Build Path
```

Then stop and ask:

`Does this brief match what you want built? If yes, I will use it as the source of truth for the plan/build.`

## If Tools Are Available

- If an image, local URL, localhost app, or file URL is provided and browser tools are available, inspect it before asking taste questions.
- If `request_user_input` is available, use it only for compact multiple-choice fork questions. Keep freeform vision questions in normal chat.
- If the user provides a repo path, inspect the relevant files before asking questions that the repo can answer.
