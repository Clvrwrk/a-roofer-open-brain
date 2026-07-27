# Linear Execution Map — Named-Agent Runtime Program

Target team: `PE-CC-DevTeam` (`PEC`)

Target project: `Roofers Brain Agent Engine`

Created planning project: [Named Agent Runtime Program — Ringer Governed](https://linear.app/cleverwork/project/named-agent-runtime-program-ringer-governed-8668c63e9b1d)

Accountable planning owner: Christopher Hussey. Each record remains Backlog and
requires its execution-role and independent-review humans to be named before work.

Standing governance: `CLE-8` and `docs/74-named-agent-runtime-ringer-governance.md`

## Project structure

Create three parent issues. Parent A and Parent B children are serial gates. Parent C
contains two separately gated parallel branches after NA-3. None is a license to execute.
Every child description must include its Ringer evidence contract, acceptance
criteria, rollback requirement, dependencies, and current authorization boundary.

### Parent A — Maya named-agent runtime pilot

1. Evidence inventory and ownership freeze.
2. Third-party tool gates and approvals.
3. Principal and resource registry.
4. Runtime-neutral Command Center contract.
5. Fenced ownership and schedule registry.
6. Exactly-once ingress/effect ledger.
7. Scoped credentials and Orgo adapter.
8. Maya Hermes package.
9. Slack and Gmail synthetic path.
10. Model ladder and cost controls.
11. Security adversarial suite.
12. Observability, SLOs, and runbooks.
13. Phase A Hermes benchmark.
14. Phase B isolated eve benchmark.
15. Maya go/no-go.

### Parent B — Serial named-agent rollout

Blocked by Maya go/no-go. Children execute strictly in order: Alex, Casey, Jordan,
Sam, Rowan, Lena. Each child requires its own Ringer plan, implementation checks,
adversarial review, three clean days, production go/no-go, and rollback proof.

### Parent C — Specialist adjuncts

Contains a Cursor DevTeam pilot and a separately gated Devin browser-adjunct
evaluation. Neither receives Roofing-Ops persona, mailbox, decision, or effect
authority.

## Universal child-issue template

**Objective:** one measurable outcome with one accountable owner.

**Owns:** exact repository paths, runtime resources, and external systems.

**Does not own:** production activation and all systems outside the declared scope.

**Dependencies:** explicit blocking issue identifiers.

**Ringer contract:** plan, manifest, lint, run ID, executed checks, adversarial
review, synthesis, retries, and artifacts are linked before completion.

**Security:** no secret values in Linear or artifacts; third-party gate and scoped
principal required before connecting credentials.

**Acceptance:** objective pass/fail behavior, including negative and recovery tests.

**Rollback:** tested kill switch, owner fencing, reconciliation, credential revoke,
and restoration procedure.

**Authorization:** planning-only by default. Separate recorded gates authorize (1)
synthetic implementation, (2) credential connection, (3) Phase A, (4) Phase B, (5)
one-lane shadow/draft, and (6) production. Each approval names approvers, allowed
systems/effects, evidence IDs, expiry, rollback owner, and predecessor issue IDs.
Production requires passed packets from PE-CC-DEV technical-service, security,
SRE/operations, and persona-owner reviewer agents, followed by Christopher Hussey's
sole human approval. Reviewer agents cannot approve their own work or replace the
human approval.

## Deterministic issue register

The stable keys below remain searchable planning aliases; Linear's assigned `PEC-*`
identifiers are the authoritative dependency keys. The graph is intentionally serial
where risk is cumulative.

Linear assigned the following durable identifiers on 2026-07-26:

| Alias | Linear | Alias | Linear | Alias | Linear |
| --- | --- | --- | --- | --- | --- |
| NA-1 | PEC-72 | NA-20 | PEC-73 | NA-30 | PEC-74 |
| NA-2 | PEC-75 | NA-3 | PEC-76 | NA-4 | PEC-77 |
| NA-5 | PEC-78 | NA-6 | PEC-79 | NA-7 | PEC-80 |
| NA-8 | PEC-81 | NA-9 | PEC-82 | NA-10 | PEC-83 |
| NA-11 | PEC-84 | NA-12 | PEC-85 | NA-13 | PEC-86 |
| NA-14 | PEC-87 | NA-15 | PEC-88 | NA-16 | PEC-89 |
| NA-21 | PEC-90 | NA-22 | PEC-91 | NA-23 | PEC-92 |
| NA-24 | PEC-93 | NA-25 | PEC-94 | NA-26 | PEC-95 |
| NA-31 | PEC-96 | NA-32 | PEC-97 | — | — |

The actual blocking edges are PEC-75 → PEC-76 → PEC-77 → PEC-78 → PEC-79 →
PEC-80 → PEC-81 → PEC-82 → PEC-83 → PEC-84 → PEC-85 → PEC-86 → PEC-87 →
PEC-88 → PEC-89 → PEC-90 → PEC-91 → PEC-92 → PEC-93 → PEC-94 → PEC-95.
PEC-96 and PEC-97 are separately gated parallel branches, each blocked by PEC-76.

| Key | Parent | Accountable owner | Blocked by | Owns / measurable outcome | Rollback proof |
| --- | --- | --- | --- | --- | --- |
| NA-2 | NA-1 | runtime engineer | — | read-only stable-ID/trigger inventory | restore ownership freeze snapshot |
| NA-3 | NA-1 | security reviewer | NA-2 | Hermes, Orgo, and later eve tool gates | reject/uninstall package and revoke test access |
| NA-4 | NA-1 | platform engineer | NA-3 | unique principal/resource registry and mismatch tests | restore prior registry; deny unknown principals |
| NA-5 | NA-1 | API engineer | NA-4 | runtime-neutral API and contract suite | feature-disable, old app restore, schema compatibility |
| NA-6 | NA-1 | platform engineer | NA-5 | fenced lease and schedule registry | fence new epoch and restore prior owner |
| NA-7 | NA-1 | API engineer | NA-6 | exactly-once ingress/effect ledger | stop effects, preserve queue, reconcile unknowns |
| NA-8 | NA-1 | security/platform owner | NA-7 | scoped Orgo, Command Center, and provider credentials | revoke scoped credentials; master remains external |
| NA-9 | NA-1 | runtime engineer | NA-8 | pinned, paused Maya Hermes package | restore checksummed home/config backup |
| NA-10 | NA-1 | integrations engineer | NA-9 | inbound Slack, Gmail draft, non-delivery sink | revoke test integrations and reconcile cursors |
| NA-11 | NA-1 | AI platform owner | NA-10 | benchmarked model ladder, budgets, and breakers | pin prior route or stop task class |
| NA-12 | NA-1 | security reviewer | NA-11 | adversarial identity/effect/injection suite | keep outbound and next gate disabled |
| NA-13 | NA-1 | SRE | NA-12 | honest health, SLOs, runbooks, foundation restore | executed foundation and runtime restore |
| NA-14 | NA-1 | pilot lead | NA-13 | three-day frozen Hermes benchmark | quiesce Hermes synthetic owner |
| NA-15 | NA-1 | pilot lead | NA-14 | isolated equivalent eve benchmark | disable eve; restore Hermes fenced owner |
| NA-16 | NA-1 | Christopher Hussey after PE-CC-DEV review packet | NA-15 | signed Maya winner/no-go decision | retain Hermes; keep outbound paused |
| NA-21 | NA-20 | runtime engineer + Alex owner | NA-16 | Alex isolated rollout and three clean days | revoke Alex lane; restore prior owner |
| NA-22 | NA-20 | runtime engineer + Casey owner | NA-21 | Casey isolated rollout and three clean days | revoke Casey lane; restore prior owner |
| NA-23 | NA-20 | runtime engineer + Jordan owner | NA-22 | Jordan dedicated desktop and finance-safe tests | revoke Jordan lane; restore prior owner |
| NA-24 | NA-20 | runtime engineer + Sam owner | NA-23 | Sam dedicated desktop and trust-tier denial | revoke Sam lane; restore prior owner |
| NA-25 | NA-20 | runtime engineer + Rowan owner | NA-24 | Rowan external-only deployment and egress tests | revoke Rowan lane and external credentials |
| NA-26 | NA-20 | runtime engineer + Lena owner | NA-25 | Lena draft-only rollout and publication gates | revoke Lena lane and publication credentials |
| NA-31 | NA-30 | DevTeam lead | NA-3 | low-risk Cursor pilot without persona authority | revoke principal and close workflows |
| NA-32 | NA-30 | DevTeam lead + security reviewer | NA-3 | bounded Devin browser-gap evaluation | revoke session/account; export audit |

For every row, `Owns` is the complete allowed mutation boundary; production activation
and all unlisted systems are excluded. The matching final-pilot acceptance criteria
must be copied into the issue description without weakening them.

## Enforceable evidence checklist

Every child contains this checklist. The independent validator marks each item PASS,
or records `N/A` with a cited deterministic applicability rule; unexplained N/A
blocks completion.

- [ ] Real parent/predecessor Linear IDs and accountable human are recorded.
- [ ] Owned paths/resources/systems and explicit exclusions are recorded.
- [ ] Ringer plan and linted manifest are linked.
- [ ] Run ID, all attempts/retries, executed check output, and artifacts are durable.
- [ ] Independent security/operator review has no open P0/P1.
- [ ] Secret scan and third-party gate receipts are linked when credentials/tools apply.
- [ ] Stable resource IDs, principal scopes, and negative identity tests are linked.
- [ ] Cost/reliability/operator-time evidence is linked when runtime/model behavior applies.
- [ ] Kill switch, reconciliation, rollback and roll-forward proof are linked.
- [ ] Synthesis names verdict, exceptions, next action, and authorization consumed.
- [ ] Applicable phase approval is signed, unexpired, and effects stayed within scope.

## Completion rule

An issue cannot move to Agent Done based on prose or screenshots alone. All real
dependencies must be closed; every applicable checklist item must pass; required
Ringer checks must pass; independent review must have no open P0/P1; receipts and
synthesis must be durable; the applicable human approval must be recorded; and the
actual work/effects must remain within authorization. A failed first attempt remains
visible. Missing evidence, unexplained N/A, expired approval, or scope drift blocks
the transition.
