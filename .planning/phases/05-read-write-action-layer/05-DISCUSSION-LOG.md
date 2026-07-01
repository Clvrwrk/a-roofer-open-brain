# Phase 5: Read/Write Action Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 05-read-write-action-layer
**Areas discussed:** Approval-gate substrate, First task to offload, Wrapper coverage set, Preview + exec surface

---

## Approval-gate substrate

### How the human-approval gate is built
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse work-queue | Each pending write = a live-work item; approve/reject in HumanUnblockerDashboard; recordLiveWorkDecision + buildDecisionAuditEvent for audit | ✓ |
| Dedicated write-action store | New acculynx_write_action + approval tables/API purpose-built for writes | |
| Hybrid | Dedicated table for payload/dry-run/exec-result, surfaced through the existing work-queue UI | |

**User's choice:** Reuse work-queue.

### What executes the write after approval
| Option | Description | Selected |
|--------|-------------|----------|
| New write-action Edge Function | Supabase Edge Function reuses acculynxFetch + accounts lib; sole prod-write path; invoked by decision endpoint | ✓ |
| Command Center API route | An Astro /api route writes directly using a server-side key | |
| You decide | Defer to research/planning | |

**User's choice:** New `acculynx-write-action` Edge Function.

### How the dry-run preview is produced
| Option | Description | Selected |
|--------|-------------|----------|
| Same fn, dry-run mode | dryRun flag builds+validates exact request, returns without sending; execute = same path minus flag | ✓ |
| Separate preview builder | Distinct preview logic; execute builds its own request (drift risk) | |

**User's choice:** Same function, dry-run mode.

---

## First task to offload

### Which lane(s) to offload
| Option | Description | Selected |
|--------|-------------|----------|
| Post a job message/note | POST /jobs/{id}/messages — low blast radius, high frequency | |
| Record a payment | POST /jobs/{id}/payments/* — higher value, money-touching | |
| Update custom fields | PUT /jobs/{id}/custom-fields — data hygiene | |
| Add an external reference | POST /jobs/external-references — integration primitive | |
| **All (free text)** | All four lanes in scope | ✓ |

**User's choice:** All four lanes in scope.

### Which lane executes against PROD first
| Option | Description | Selected |
|--------|-------------|----------|
| Job message first | Prove full gate on lowest-stakes lane against prod first | |
| Payment first | Prove on highest-value (money) lane immediately | ✓ |
| You decide at execution | Defer first-prod ordering to execution | |

**User's choice:** Payment first.
**Notes:** First-ever prod write touches money → payment guardrails (idempotency, amount/account validation, no double-post) get first-class attention.

---

## Wrapper coverage set

| Option | Description | Selected |
|--------|-------------|----------|
| Four discussed lanes only | Ship wrappers for exactly the four discussed lanes | |
| All 12 writable + 5 write-only | Wrap all 17 proven-safe lanes now | ✓ |
| Writable-only (12) | Skip the 5 write-only no-readback lanes (would exclude job-message) | |

**User's choice:** All 17 proven-safe lanes (12 writable + 5 write-only).
**Notes:** 2 fragile-with-guardrail lanes deferred as guarded follow-ups; 17 blocked-by-dependency out.

---

## Preview + exec surface

### Where preview renders + approval happens
| Option | Description | Selected |
|--------|-------------|----------|
| Command Center dashboard | Preview + approve/reject in HumanUnblockerDashboard | |
| Slack approval | Dry-run preview to Slack with approve/reject actions | |
| Both: dashboard + Slack notify | Approve in dashboard (source of truth); Slack notifies on pending | ✓ |

**User's choice:** Both — dashboard is source of truth, Slack notifies.

### Prod-vs-sandbox gate beyond the approval click
| Option | Description | Selected |
|--------|-------------|----------|
| Explicit target + approver perm | Item names target; prod requires explicit target flag AND prod-write-permitted approver; sandbox default | ✓ |
| Approval click is sufficient | One approval covers it | |
| Sandbox-only in Phase 5 | Defer prod execution (would break SC3) | |

**User's choice:** Explicit target + approver permission (sandbox default, prod never implicit).

---

## Claude's Discretion

- Exact `acculynx-write-action` internal structure + per-lane request-shape construction.
- Pending-write record shape (payload / dry-run diff / exec-result attachment to work-queue item), idempotency-key strategy, retry/rate-limit on execute.
- Human-readable dry-run preview rendering.
- Agent authoring flow via agent API; partial-failure / rollback on multi-step writes.

## Deferred Ideas

- 2 fragile-with-guardrail lanes (PUT trade-types, DELETE initial-appointment) → guarded follow-up.
- 17 blocked-by-dependency lanes → need sandbox/company config (documentFolderId, accountTypeId, role-specific CompanyUserId).
- Dedicated AccuLynx Agent (A3-gated) → Phase 6.
- Reactive status mirroring via webhooks → future.
- Executive Sales Pipeline dashboard → Phase 7.
