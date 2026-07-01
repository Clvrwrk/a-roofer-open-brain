# Phase 4: Sandbox Write-Capability Exploration & Red-Team - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 04-sandbox-write-capability-exploration-red-team
**Areas discussed:** Test-harness form, Result recording schema, Disposable-entity lifecycle, Red-team depth & stop rule

---

## Test-harness form

| Option | Description | Selected |
|--------|-------------|----------|
| New `acculynx-write-sweep` Edge Function | Mirror the Phase 1 read-sweep; hard sandbox-key gate baked in; reuse acculynx-sync lib | ✓ |
| Extend `acculynx-read-sweep` in place | One fn does read+write; less duplication but muddies read harness's prod-safety story | |
| Local Node script (extend the seeder) | Fastest iteration; precedent exists; but not deployable/gated the OB1 way | |

**User's choice:** New write-sweep Edge Function
**Notes:** Single enforced safety boundary (hard sandbox gate in the fn), OB1-compliant, deployable. Existing seeder is prior art, not the harness.

---

## Result recording schema

| Option | Description | Selected |
|--------|-------------|----------|
| New `acculynx_write_catalog` + `write_probe` tables | Mirror read catalog/probe; per-endpoint verdict + per-probe rows; matrix generated from tables | ✓ |
| Extend the read catalog/probe tables | Add http_method dimension; less schema but conflates read+write surfaces | |
| Markdown matrix only | Supersede docs/37 directly, no DB; lowest effort but weaker "evidence-based" | |

**User's choice:** New write_catalog + write_probe tables
**Notes:** Evidence-based verdict needs structured per-probe rows; matrix doc generated from tables.

---

## Disposable-entity lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Tag + leave; DELETE where the 4 endpoints allow | Stamp run-id; exercise real DELETEs; reuse created parents for dependent writes; leave the rest | ✓ |
| Reseed/reset the sandbox each run | Clean slate; but AccuLynx has no bulk reset and most entities can't be deleted | |
| Create-and-leave, no cleanup | Simplest; loses deliberate idempotency/DELETE red-team | |

**User's choice:** Tag + leave; DELETE where the 4 endpoints allow
**Notes:** Dependency chains seeded via reused parents (worksheet needs financialsId, etc.). Sandbox is disposable.

---

## Red-team depth & stop rule

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered: deep on the write lane, smoke-test the rest | 5-dimension red-team on ~8 lane endpoints; happy-path + bad-input on ~30; stop after 2 consecutive no-new-error probes | ✓ |
| Uniform full depth on all 38 | Most thorough; large plan, heavy cruft, diminishing returns on unsupported endpoints | |
| Happy-path + one error probe on all 38 | Fast matrix; under-delivers on "red-teamed to diminishing returns" | |

**User's choice:** Tiered depth
**Notes:** Dimensions = bad input / partial failure / idempotency-retries / ordering-dependency / authz-scope. Concrete stop rule = 2 consecutive probes with no new error shape or guardrail.

---

## Claude's Discretion

- Exact `acculynx-write-sweep` internal structure and endpoint ordering (grounded in read-sweep pattern).
- Exact column set of the new write catalog/probe tables (mirror read tables).
- How dependency chains are seeded (reuse seeder vs. fresh creates).

## Deferred Ideas

- Production write/action layer + approval-gated write wrappers → Phase 5 (REQ-08).
- Dedicated AccuLynx Agent (A3-gated) → Phase 6 (REQ-09).
- Reactive status mirroring via webhooks → future (only sandbox webhook-tier signal noted).
