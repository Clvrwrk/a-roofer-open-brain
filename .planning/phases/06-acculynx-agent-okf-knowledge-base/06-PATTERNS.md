# Phase 6: AccuLynx Agent + OKF Knowledge Base - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 9 (create/modify)
**Analogs found:** 7 / 9 (1 NO_ANALOG, 1 audit-only/no-change-expected)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/command-center/src/lib/access-control.ts` (ADD `ob-acculynx` entry) | config | CRUD (roster registration) | same file, `ob-conductor` entry (lines 233-238) | exact |
| `proposals/2026-07-01-acculynx-agent.md` | config (governance doc) | request-response (approval workflow) | `proposals/2026-06-09-acculynx-api.md` + `proposals/_a3-template.md` | exact |
| `.claude/agents/acculynx.md` (or repo-confirmed path) | config (subagent definition) | request-response | **NONE IN-REPO** | NO_ANALOG |
| `skills/cleverwork-roofer/acculynx-api/SKILL.md` (MODIFY) | config (skill routing) | request-response | same file, "Required Local References" block (lines 78-96) | exact (self-modify) |
| `docs/knowledge-base/acculynx/index.md` (MODIFY) | utility (doc index) | transform (link aggregation) | same file's existing section pattern | exact (self-modify) |
| `docs/knowledge-base/acculynx/ingestion/index.md` (MODIFY — add write-sweep/write-action/runbook links) | utility (doc index) | transform | same file's existing 2-line-list pattern | exact (self-modify) |
| `docs/knowledge-base/acculynx/api/index.md` (AUDIT — verify only) | utility (doc index) | transform | already complete, no change needed | n/a (verified complete) |
| `docs/knowledge-base/acculynx/data/index.md` (AUDIT — verify only) | utility (doc index) | transform | already complete, no change needed | n/a (verified complete) |
| `docs/knowledge-base/acculynx/security/index.md` (CREATE — optional) | utility (doc index) | transform | `docs/knowledge-base/acculynx/api/index.md` (closest sibling shape: short intro + bullet list) | role-match |
| `docs/knowledge-base/acculynx/log.md` (MODIFY — append Phase 2-5 entries) | utility (changelog) | transform (append-only) | same file's existing `## 2026-06-30` entry format | exact (self-modify) |
| `context/MEMORY.md` (pointer, via meta-memory-write) | config (curated memory) | transform | same file's `## Standing instructions` / `## ▶ Pick up here` bullet format | exact (self-modify) |

## Pattern Assignments

### `app/command-center/src/lib/access-control.ts` — add `ob-acculynx` (config, CRUD)

**Analog:** same file, `ob-conductor` entry, lines 233-238 (read live 2026-07-01):

```typescript
{
  id: "ob-conductor",
  displayName: "Conductor",
  handle: "@ob-conductor",
  departmentAccess: "all",
  roles: ["horizontal", "conductor", "router"],
},
```

**Exact shape to copy for `ob-acculynx`** (per D-02/D-03; `departmentAccess: "all"` is REQUIRED — do not narrow to `["accounting","operations"]`, see RESEARCH.md Alternatives Considered / Pitfall 1, `LANE_DEPARTMENT` spans sales+accounting+operations):

```typescript
{
  id: "ob-acculynx",
  displayName: "AccuLynx",
  handle: "@ob-acculynx",
  departmentAccess: "all",
  roles: ["vertical", "acculynx"],  // or ["horizontal", "acculynx"] — planner's call, cosmetic only (roles unused in access decisions per serviceAgentToActor)
},
```

**No other code changes required** — `serviceAgentToActor`, `SERVICE_AGENT_PERMISSIONS`, and `/api/agent/acculynx-write-action/enqueue.ts` are already generic over any `ServiceAgentIdentity` in the array (verified `[codebase]` this session and prior research session).

**Sequencing constraint (D-04, hard gate):** this edit MUST NOT land before `proposals/2026-07-01-acculynx-agent.md` has `Status: approved`. Treat as `checkpoint:human-approve` in the plan.

---

### `proposals/2026-07-01-acculynx-agent.md` — the rule-9 A3 (config/governance, request-response)

**Analogs:** `proposals/_a3-template.md` (structure skeleton, 119 lines, 9 numbered sections) + `proposals/2026-06-09-acculynx-api.md` (same-domain precedent, 112 lines, approved same-day, exempted from ROI math).

**Section skeleton to copy** (from `_a3-template.md`, verbatim header structure):

```markdown
# A3: [Proposed Skill or Integration Name]

Proposed by: [Innovator | Chris | Account Manager]
Date: YYYY-MM-DD
Status: pending | approved | killed | deferred (revisit_at: YYYY-MM-DD)
Affected clients: [list client slugs, or "template-wide" for all future clients]
A3 file: proposals/YYYY-MM-DD-[skill-name].md

---

## 1. The problem (measured)
## 2. Root cause (5 Whys — brief)
## 3. Proposed solution
## 4. The new state (projected)
## 5. The math
## 6. Risks
## 7. Alternative considered
## 8. Decision
## 9. Post-build tracking
```

**Exemption framing to copy** (from `2026-06-09-acculynx-api.md`, lines ~60-75 — the precedent for exempting mission-grade infra from the 10x ROI math):

```markdown
| Total monthly cost, current state (X) | Not instrumented |
| Total monthly agent operating cost, new state (Y) | Near-zero for local lookup |
| One-time build cost (Z) | One agent build session |
| Build cost amortized over 12 months (Z/12) | Minimal |
| ROI multiplier: X / (Y + Z/12) | Exempt |
| Payback period | First serious AccuLynx bridge/debug task |

Exempt from 10x gate? Yes. This is mission-grade infrastructure for the primary
PM adapter; avoided-error cost is the ROI driver.
```

**Decision-block format to copy** (lines ~97-105 of the precedent):

```markdown
## 8. Decision

- [x] Approve - build by YYYY-MM-DD; pilot client: [client / scope].
- [ ] Kill
- [ ] Defer

Approver: Chris
Approved / decided on: YYYY-MM-DD
```

**Key content difference for the AccuLynx Agent A3 vs. the skill A3:** RESEARCH.md's Summary notes the Agent A3 has an *even stronger* exemption case — it operationalizes existing ~$0-marginal-cost read/write capability (Phases 1-5 already built it) rather than proposing new capability. The planner should draft this framing but D-04 still requires the user's explicit approval, not self-declared exemption.

---

### `.claude/agents/acculynx.md` (or repo-confirmed equivalent path) — NO_ANALOG

**Role:** config (Claude Code subagent definition) | **Data flow:** request-response (dev-session tool invocation)

**Finding:** There is **no `.claude/agents/` directory anywhere in this repo** and no repo-local Claude Code project-subagent convention to copy. This was confirmed by direct filesystem search this session (research) — only `~/.claude/agents/gsd-*` exists globally (unrelated GSD tooling agents, not project subagents).

**Do NOT use as an analog:**
- `agents/dev-engine/pe-cc-claude/SKILL.md` — a different animal entirely: a Linear-issue-polling engine profile with `frontmatter` fields for team/project IDs and a `no_supabase_service_role: true` boundary rule. Useful only as a *conceptual* precedent for dev/live-plane separation, not as a template for subagent frontmatter shape.
- Any `SOUL.md`, `ROLE.md`, or other agent-shaped document in this repo — none of these are the Claude Code `Task`-tool-invokable subagent format.

**Open item for the planner (flag explicitly, do not guess-and-ship):** Before authoring this file, fetch current Claude Code subagent documentation (WebFetch/WebSearch against `docs.claude.com` or equivalent) to confirm the actual required/optional frontmatter fields (`name`, `description`, `tools`, `model` is CONTEXT.md's best-guess shape, unverified this session — RESEARCH.md Assumption A1 / Open Question 1). Insert a `checkpoint:human-verify` or a doc-fetch task ahead of authoring. Treat this file as greenfield new-pattern work, not copy-paste.

---

### `skills/cleverwork-roofer/acculynx-api/SKILL.md` (MODIFY — route to OKF + add ob-acculynx) (config, request-response)

**Analog:** same file's existing "Required Local References" block, lines 78-96 (read live):

```markdown
## Required Local References

Load these before choosing endpoints:

- `integrations/bridges/acculynx/API.md` — operating guide and source scope.
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — machine-readable endpoint index.
- `skills/cleverwork-roofer/acculynx-api/reference/full-endpoint-reference.md` — human-readable endpoint details.
- `skills/cleverwork-roofer/acculynx-api/reference/source-index.md` — fetched source inventory.
- `integrations/bridges/acculynx/README.md` and `mapping.md` — bridge-specific behavior and brain schema mapping.
- `skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md` — **Knowledge Folder** pointer: routes agents to the Google Drive "AccuLynx" folder (who/what/how/why/where/when) and the read/write capability matrices (`docs/65`, `docs/37`).
```

**Pattern to copy for the modification:** add an entry pointing directly at the OKF bundle root (`docs/knowledge-base/acculynx/index.md`) in this same bullet-list style, and add `ob-acculynx` to the existing `bound_agents:` frontmatter array (currently: `capture, conductor, auditor, ob-sales, ob-ops, ob-accounting` — lines ~38-44 of frontmatter).

**Note:** `reference/knowledge-folder.md` already points to the in-repo OKF bundle (fixed in Phase 1, do not re-litigate per RESEARCH.md State of the Art) — only its link *completeness* (mirrors the root index gap) needs auditing.

---

### `docs/knowledge-base/acculynx/index.md` (MODIFY — link write-sweep/write-action/runbook/security) (utility, transform)

**Analog:** the file's own existing section+bullet-list pattern (read live, lines 1-30):

```markdown
# Ingestion (the HOW)

* [Ingestion](ingestion/) - how AccuLynx data gets into the brain
  * [Sync Pipeline](ingestion/sync-pipeline.md) - pg_cron → pg_net → acculynx-sync Edge Function
  * [Read-Capability Sweep](ingestion/read-sweep.md) - the sandbox endpoint-discovery harness

# API surface

* [API](api/) - the AccuLynx REST API V2 surface
  * [Auth & Rate Limits](api/auth-and-limits.md) - per-account keys, 30/10 req/s
  * [Read Capability](api/read-capability.md) - the 86 documented GETs and what they return
  * [Write Capability](api/write-capability.md) - what can be written back (and what can't)
```

**Gap confirmed by this session's direct read:** the root index currently has NO section for Write Action layer or Security. Missing links to add (files exist on disk, confirmed via `ls`): `ingestion/write-sweep.md`, `ingestion/write-action.md`, `ingestion/runbook.md`, `security/posture.md`.

**Exact new sections to add** (following the identical `# Heading` + `* [Link](path) - description` convention):

```markdown
# Write action layer (the HOW, write side)

* [Write-Sweep](ingestion/write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](ingestion/write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Runbook](ingestion/runbook.md) - ingestion recovery procedures

# Security

* [Security Posture](security/posture.md) - secrets, RLS, STRIDE attestation (Phase 3)
```

---

### `docs/knowledge-base/acculynx/ingestion/index.md` (MODIFY) (utility, transform)

**Current content (confirmed live read, full file, 6 lines):**

```markdown
# Ingestion

How AccuLynx data gets into the brain, and how the API surface is mapped.

* [Sync Pipeline](sync-pipeline.md) - the live pull-based incremental sync (pg_cron → pg_net → Edge Function)
* [Read-Capability Sweep](read-sweep.md) - the sandbox-only endpoint-discovery harness
```

**Confirmed gap:** `ls docs/knowledge-base/acculynx/ingestion/` shows `write-sweep.md`, `write-action.md`, `runbook.md` all exist on disk but are **not linked** in this index. Copy the existing 2-bullet pattern and extend:

```markdown
* [Write-Sweep](write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Runbook](runbook.md) - ingestion recovery procedures
```

---

### `docs/knowledge-base/acculynx/api/index.md` and `docs/knowledge-base/acculynx/data/index.md` — AUDIT ONLY, no change expected

**Finding (direct read this session):** both are already complete against their directory contents.
- `api/index.md` lists `auth-and-limits.md`, `read-capability.md`, `write-capability.md` — matches `ls api/` exactly (4 files incl. index.md itself). No gap.
- `data/index.md` lists `jobs.md`, `tables.md` — matches `ls data/` exactly (3 files incl. index.md). No gap.

RESEARCH.md's claim that these are "stale from Phase 1" is **not confirmed by this session's direct read** — treat as an audit-and-confirm task, not a guaranteed edit. Planner should still have a task to `ls` + diff at execution time in case files were added between research and planning.

---

### `docs/knowledge-base/acculynx/security/index.md` (CREATE — optional, per OKF spec §6 "MAY appear") (utility, transform)

**Analog:** `docs/knowledge-base/acculynx/api/index.md`'s shape (short intro paragraph + bullet list) is the closest sibling pattern, since `security/` currently has only `posture.md` and no index:

```markdown
# Security

The AccuLynx integration's security posture — secrets, RLS, and boundary enforcement.

* [Security Posture](posture.md) - secrets, RLS, STRIDE attestation, and the
  untrusted-content boundary (data never instructions) that REQ-09 (this phase)
  must enforce agent-side
```

**Note:** RESEARCH.md flags this as low-risk/optional (OKF spec index files are "MAY appear," not required) — do not treat omission as a Phase 6 failure if deprioritized.

---

### `docs/knowledge-base/acculynx/log.md` (MODIFY — append Phase 2-5 entries) (utility/changelog, transform — append-only)

**Analog:** the file's own existing entry format (full file read, 4 lines):

```markdown
# AccuLynx Bundle Update Log

## 2026-06-30
* **Initialization**: Created the AccuLynx OKF bundle (Phase 1, REQ-01) — [overview](/overview.md), [accounts](/accounts.md), [ingestion](/ingestion/), [api](/api/), [data](/data/).
* **Creation**: Captured the 9-account [registry](/accounts.md), the live [sync pipeline](/ingestion/sync-pipeline.md), the sandbox [read sweep](/ingestion/read-sweep.md), and the [read](/api/read-capability.md) / [write](/api/write-capability.md) capability surface.
```

**Pattern to copy** for the append: a new `## YYYY-MM-DD` heading per phase, with `* **[Verb]**: [description] — [links]` bullets, in the same bold-verb-lead style. Append entries for Phase 2 (ingestion additions), Phase 3 (security posture, cron health), Phase 4 (write-sweep), Phase 5 (write-action), and Phase 6 (this phase — agent + bundle completion) once each is confirmed by the planner against actual phase dates/deliverables.

---

### `context/MEMORY.md` — memory pointer (config, transform)

**Analog:** the file's own existing bullet/section format (full file read, current `## Standing instructions` and `## ▶ Pick up here` sections):

```markdown
## ▶ Pick up here
**ACTIVE: AccuLynx commercialization** (`.planning/`, 7 phases, GSD). ...

## Standing instructions (Chris)
- Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.
- Verify vs LIVE DB, not migration files; validation on every agent.
```

**Constraint:** 2,500 char cap, `wc -c` before writing (per CLAUDE.md Memory Budget). Route any durable AccuLynx-Agent-provisioning fact (A3 approved, `ob-acculynx` live) through `.claude/skills/meta-memory-write/` — do not hand-edit `MEMORY.md` directly per the standing convention. This is a routing note for the planner, not a file the planner writes directly.

---

## Shared Patterns

### OB Roster Identity Registration
**Source:** `app/command-center/src/lib/access-control.ts`, `SERVICE_AGENT_IDENTITIES` array (15 existing entries, all one shape: `id`, `displayName`, `handle`, `departmentAccess`, `roles`).
**Apply to:** the single `access-control.ts` edit (see Pattern Assignments above). No other files need touching for the roster registration itself — `serviceAgentToActor` and the enqueue route are already generic.

### A3 Governance Document Structure
**Source:** `proposals/_a3-template.md` (skeleton) + `proposals/2026-06-09-acculynx-api.md` (filled precedent, same domain, exemption-from-ROI framing).
**Apply to:** the single A3 file. This is the hard rule-9 gate — nothing else in the phase should be built/shipped-live until `Status: approved` is set (D-04).

### OKF Index Link-List Convention
**Source:** `docs/knowledge-base/acculynx/index.md` root file's own existing `# Heading` + `* [Link](path) - one-line description` convention, replicated identically in every sub-index (`api/index.md`, `ingestion/index.md`, `data/index.md`).
**Apply to:** every OKF index file edit in this phase (root index, ingestion index, optional security index, log.md's changelog-entry variant). Keep the same terse one-line description style; do not introduce a different format per sub-bundle.

### Skill-to-Knowledge Routing
**Source:** `skills/cleverwork-roofer/acculynx-api/SKILL.md`'s "Required Local References" bullet-list + `bound_agents:` frontmatter array.
**Apply to:** the SKILL.md modification — add the OKF root pointer to the reference list, add `ob-acculynx` to `bound_agents`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.claude/agents/acculynx.md` (or repo-confirmed equivalent path) | config (subagent definition) | request-response | No `.claude/agents/` directory or Claude Code project-subagent file exists anywhere in this repo (confirmed via filesystem search). `agents/dev-engine/pe-cc-claude/SKILL.md` is a superficially similar but functionally unrelated format (Linear-polling engine profile, not a `Task`-tool subagent) and must NOT be used as a template. Planner must verify current Claude Code subagent frontmatter format (`name`, `description`, `tools`, `model` — CONTEXT.md's unverified guess) against live Anthropic docs before authoring. Treat as new-pattern greenfield work with a `checkpoint:human-verify` gate, not copy-paste. |

## Metadata

**Analog search scope:** `app/command-center/src/lib/access-control.ts`, `proposals/`, `.claude/agents/` (confirmed absent), `agents/dev-engine/pe-cc-claude/`, `skills/cleverwork-roofer/acculynx-api/`, `docs/knowledge-base/acculynx/**`, `context/MEMORY.md`.
**Files scanned:** 12 (all read directly this session; no re-reads of overlapping ranges).
**Pattern extraction date:** 2026-07-01
