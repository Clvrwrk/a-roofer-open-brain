# Architecture Review: Provisional eve-first Pilot

## Verdict

**Reject an eve-first production pilot. Approve only an eve-first *shadow evaluation* in which eve receives synthetic or replayed inputs and owns no production trigger, schedule, queue mutation, or outbound effect.** Round 1 establishes that present runtime health is unknown, Slack and Gmail do not share one durable queue, cadence has several competing authorities, and eve is beta with interrupted steps that may rerun. Introducing eve as another live owner would multiply ambiguity rather than test a replacement (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Executive Finding,” “Current Architecture,” and “Failure Modes”; `../../round1/eve-fit/eve-fit.md`, “Executive Finding,” “Gaps and Unknowns,” and “Pilot Shape”).

The minimum safe design is one stable ingress/API plane and durable operational ledger in Command Center/Supabase, one fenced runtime owner per trigger class, and runtime adapters for Hermes and eve behind the same versioned contracts. Hermes remains the production owner while eve is evaluated. If eve wins, ownership transfers through a lease/fencing epoch; it is never established by enabling a second subscriber and hoping deduplication absorbs the overlap (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership,” “Slack Design,” and “Failure and Recovery”).

## Findings

### P0 — Dual live ingress creates duplicate work and duplicate effects

The provisional pilot becomes unsafe if eve subscribes to production Slack, Gmail, or schedules while the VPS/Hermes paths may still be active. Round 1 found at least Socket listeners, DM polling, file events, Gmail polling, and generated crons without a demonstrated shared idempotency contract; it also found that current listener and scheduler state is unknown. Eve checkpoints do not supply end-to-end exactly-once effects, and an interrupted step may rerun (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture,” “Failure Modes,” and “Unknowns”; `../../round1/eve-fit/eve-fit.md`, “Verified Capabilities” and “Gaps and Unknowns”).

Required disposition: one ingress adapter must first persist an immutable envelope with a database-enforced unique `source_key`; one work item may be created from it; every external action must reserve a unique `effect_key` before execution. During evaluation, production envelopes go only to Hermes. Eve receives fixture/replay envelopes in a separate tenant and effect namespace (`../../round1/eve-fit/eve-fit.md`, “Pilot Shape”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Slack Design”).

### P0 — Ownership is not a configuration flag; it needs fencing

The artifacts call for exclusive ownership but do not evidence a deployed ownership primitive. Disabling a cron file, a Slack connection, or a process is not sufficient because an old process can resume after network recovery or supervisor restart. The coexistence of VPS, Kasm-era configuration, Orgo targets, Hermes, and eve makes stale-owner recovery a primary split-brain risk (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Contradictions” items 7–8 and “Failure Modes”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership” and “Failure and Recovery”).

Required disposition: acquire a database lease keyed by `{persona, trigger_class}` with a monotonically increasing fencing epoch. Every queue claim, schedule fire, and effect reservation carries that epoch; the database rejects stale epochs. Cutover is a lease transfer, not simultaneous subscriptions (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership” and “Failure and Recovery”).

### P0 — Identity routing can produce the wrong speaker or wrong authority

Seven named personas, Ops Conductor, thirteen role labels, shared department inboxes, Google identities, and Slack apps do not currently form one canonical principal model. Round 1 also found a shared `@openbrain` Slack-token fallback, which can make a named persona’s output appear under another bot. Eve’s documentation does not prove that one project safely multiplexes seven independent bot identities (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture,” “Contradictions” items 2 and 10, and `app/command-center/src/lib/slack-agents.ts:52-69`; `../../round1/eve-fit/eve-fit.md`, “Gaps and Unknowns”).

Required disposition: a canonical principal registry must bind `persona_id` to immutable Slack app/team IDs, Google account, inbox route, Orgo workspace/computer, runtime deployment, and scoped Command Center credential. Identity-bearing operations fail closed on any mismatch or missing credential; no shared-token fallback and no prompt-selected persona. Separate eve deployments/credentials per persona are required until isolation is proven (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Named Agent Template,” “Email Design,” and “Slack Design”).

### P1 — Schedule ownership is fragmented and semantically inconsistent

Round 1 identified persona profiles, a master cadence, `scripts/write-cron-jobs.py`, and `scripts/deploy-crons.py` as competing authorities. Casey and Rowan are described as event-triggered while generators enable recurring work; Maya and Jordan schedules also disagree. Adding eve cron creates a fifth authority and risks both double fires and silent omissions (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture,” “Contradictions” items 5–6, and repository paths `agents/cadences/roofing-agent-master-cadence.yaml`, `scripts/write-cron-jobs.py`, `scripts/deploy-crons.py`).

Required disposition: one canonical schedule registry in the operational database, with stable `schedule_id`, version, timezone, next-fire calculation, enabled state, owner lease, last-fire receipt, and unique `{schedule_id, scheduled_for}` occurrence. Runtime-native cron may wake a dispatcher, but may not define business cadence. Approval-sensitive schedules create durable work and park; they do not perform direct effects (`../../round1/eve-fit/eve-fit.md`, “Gaps and Unknowns”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership”).

### P1 — The API boundary is implicit and runtime-specific

Round 1 proposes typed tools but does not freeze a shared contract for ingest, claim, checkpoint, approve, effect, receipt, and complete. Without that contract, Hermes and eve will encode different retry, error, identity, and completion semantics; benchmarking then compares applications rather than runtimes. Direct Supabase access would further couple orchestration to schema and bypass least privilege (`../../round1/eve-fit/eve-fit.md`, “Security and Egress” and “Pilot Shape”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Hermes Role,” “Eve Role,” and “Security Controls”).

Required disposition: expose versioned Command Center endpoints with schemas and conditional writes: `POST /v1/events`, `POST /v1/work-items/{id}:claim`, `POST /v1/approvals`, `POST /v1/effects:reserve`, `POST /v1/effects/{id}:commit`, and `POST /v1/runs/{id}:checkpoint|complete`. Require principal, correlation ID, idempotency key, fencing epoch, contract version, and expected state/version. Neither runtime receives a Supabase service-role key (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Security Controls”; repository path `docs/58-dev-vs-ops-agent-delineation.md`).

### P1 — Source-of-truth drift is already present

Command Center/Supabase is intended to be the operational record, but ordinary Slack work can bypass `dashboard_work_items`; attachments and Linear escalation form side channels; runtime status is mock data; vendor workflow state and traces have limited retention. Treating eve sessions, Vercel runs, Hermes homes, Slack threads, or Linear as additional truth stores would make reconciliation impossible (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture,” “Contradictions” item 3, and repository paths `app/command-center/src/lib/cadence.ts:365`, `docs/70-agent-coordination-stabilization-and-migration-plan.md`; `../../round1/eve-fit/eve-fit.md`, “Verified Capabilities” and “Security and Egress”).

Required disposition: Command Center owns work state, approvals, effects, receipts, principals, leases, and schedules. Runtime checkpoints are execution caches. Slack/Gmail/Linear are sources or projections linked by immutable external IDs, never alternate queues. Linear remains only a receipted DevTeam escalation boundary (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture” and “Linear Findings”).

### P1 — Migration is coupled to identity, desktop, scheduler, queue, and schema changes

Changing runtime while also provisioning desktops, changing Gmail access, reconciling identities, replacing cadence storage, or migrating database schema destroys attribution: a failed run cannot be assigned to eve versus changed infrastructure. Round 1 explicitly says reuse Maya’s existing computer, prohibit database migration/desktop replacement/DNS change in the pilot, and test eve as an experiment rather than a sidecar (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Orgo Integration,” “Eve Role,” and “Failure and Recovery”; `../../round1/eve-fit/eve-fit.md`, “Pilot Shape”).

Required disposition: first stabilize the shared contracts and ledger under Hermes; then run eve against identical synthetic fixtures; then transfer exactly one low-risk inbound trigger. Keep schema additions backward-compatible and runtime-neutral until rollback proof passes.

### P1 — Rollback is underspecified without in-flight reconciliation

“Disable eve and re-enable Hermes” can lose work, replay effects, or strand approvals if it does not account for claimed items, checkpoint state, reserved-but-uncommitted effects, and stale scheduled occurrences. Revoking credentials too early can also prevent eve from writing terminal receipts; revoking too late leaves a stale owner capable of effects (`../../round1/eve-fit/eve-fit.md`, “Pilot Shape”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Failure and Recovery”).

Required disposition: rollback must close ingress, revoke the lease, wait a bounded drain interval, quarantine nonterminal claims, reconcile every effect reservation, write a cutover receipt, rotate/revoke eve credentials, grant Hermes a new epoch, inject a canary, and release quarantined work one item at a time. The old epoch remains permanently invalid.

### P2 — Observability can report a healthy process while the business system is dead

The current UI uses mock runtime status and `/healthz` does not prove persona listeners, schedule progress, Gmail cursors, leases, queue age, or receipts. Eve’s Agent Runs improve traces but do not supply durable business health or adequate receipt retention (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture” and “Failure Modes”; `../../round1/eve-fit/eve-fit.md`, “Verified Capabilities” and “Gaps and Unknowns”).

Required disposition: derive health from ledger facts: lease freshness, last accepted event, last/next schedule occurrence, oldest unclaimed work, approval age, effect reservation age, receipt-sink success, credential canaries, runtime/config version, and cost breaker. A process heartbeat is diagnostic metadata, not readiness.

### P2 — Approval semantics are not portable by default

Eve HITL can park workflows, but approval omission is permissive and task-mode schedules cannot wait for approval. A runtime UI approval is also insufficient unless it binds the exact effect payload and is checked server-side (`../../round1/eve-fit/eve-fit.md`, “Verified Capabilities,” “Gaps and Unknowns,” and “Security and Egress”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Email Design”).

Required disposition: Command Center approval records bind principal, action type, exact payload hash, recipients/resources, expiry, approver, policy version, and effect key. Any mutation invalidates approval; the effect-reservation API enforces it regardless of runtime.

### P3 — Tooling alternatives distract from the control-plane problem

Cursor and Devin have strong DevTeam/browser uses but do not provide the required named Slack principals or mailbox semantics. Adding them to an eve/Hermes production pilot would add more schedulers, state, and identities without solving queue or ownership invariants (`../../round1/cursor-devin-fit/cursor-devin-fit.md`, “Executive Finding,” “Security and Identity,” and “Recommendation”).

Required disposition: exclude them from this architecture pilot; evaluate them separately as bounded DevTeam or browser adjuncts through the same work/effect APIs.

## Architecture Invariants

1. One authoritative operational ledger: Command Center/Supabase owns events, work, approvals, schedules, leases, effects, and receipts (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture”).
2. One active owner per `{persona, trigger_class}`; ownership is a fenced database lease, not process discovery (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership”).
3. At-least-once delivery plus database idempotency; no claim of transport-level exactly-once (`../../round1/eve-fit/eve-fit.md`, “Gaps and Unknowns”).
4. Every external effect is reserved and committed exactly once by stable `effect_key`; retries return the recorded result (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Slack Design”).
5. Persona is an authenticated principal bound to fixed credentials and resources; identity fails closed (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Contradictions” item 2).
6. Business schedules exist once, independent of runtime, and each occurrence has a unique key (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Contradictions” item 5).
7. Runtime state and vendor traces are caches/evidence, never business truth (`../../round1/eve-fit/eve-fit.md`, “Security and Egress”).
8. Approval is enforced at the effect boundary against an immutable payload hash (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Email Design”).
9. Linear is a linked DevTeam escalation, never the Roofing-Ops queue (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture”).
10. Rollback never restores an old fencing epoch and never depends on deleting business records (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Failure and Recovery”).

## Minimum Viable Architecture

```text
Slack / Gmail / schedule clock
            |
   authenticated ingress adapters
            |
  Command Center API + Supabase ledger
  events -> work -> approvals -> effects -> receipts
             |             ^
       fenced owner lease  |
             |             |
      runtime adapter (one active)
        Hermes OR eve
             |
      typed tools / Orgo adjunct
```

Minimum components:

- A canonical principal registry and scoped Command Center bearer per persona.
- An ingress envelope table with unique external source keys and immutable payload hashes.
- A work-item state machine with optimistic versioning, claim lease, fencing epoch, attempt, and correlation IDs.
- One schedule registry and occurrence table; runtime-neutral dispatcher; unique occurrence keys.
- An approval table and effect ledger with reserve/commit/unknown/reconciled states.
- Versioned API schemas shared by thin Hermes and eve adapters; no direct runtime service-role database access.
- A receipt/health projection derived from durable ledger records.
- Separate synthetic tenant, credentials, and effect namespace for eve shadow runs.

This is the minimum because each element closes a demonstrated Round 1 failure mode; a message broker, event-stream platform, generalized workflow engine, or new desktop fleet is not required for the Maya evaluation (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Failure Modes”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Eve Role”).

## Migration Risks

- **Backfill ambiguity:** existing Slack threads, attachments, Gmail items, and Linear escalations may lack common correlation IDs. Import them as historical references, not replayable pending work (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture”).
- **Schema/runtime lockstep:** a destructive schema change can make Hermes rollback impossible. Use additive tables/columns and support both adapters through the rollback window (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Failure and Recovery”).
- **Stale schedulers:** systemd, generated Hermes cron stores, and eve cron can restart after cutover. Inventory and fence them; shutdown alone is not proof (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Unknowns”).
- **Identity remapping:** shared AgentMail roles cannot be assumed to equal persona identities. Preserve both `persona_id` and `service_role_id` explicitly (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Current Architecture” and “Contradictions” item 10).
- **In-flight approvals/effects:** runtime-local waits may not survive transfer. Before cutover, materialize approval and effect state in Command Center and quarantine unresolved operations (`../../round1/eve-fit/eve-fit.md`, “Verified Capabilities”).
- **False benchmark advantage:** changing Gmail, Orgo, model, tools, or schemas at the same time confounds the runtime result (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Eve Role”).
- **Vendor beta drift:** pin eve package and commit; contract tests must gate upgrades (`../../round1/eve-fit/eve-fit.md`, “Gaps and Unknowns”).

## Required Proofs

1. A duplicate Slack delivery produces one event, one work item, one reply, and one receipt under concurrent submission (`../../round1/eve-fit/eve-fit.md`, “Gaps and Unknowns”).
2. A killed runtime after effect reservation and after remote success-but-before-commit does not resend; reconciliation records the remote identifier (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Failure and Recovery”).
3. A stale Hermes or eve process using the prior fencing epoch cannot claim work, fire a schedule, or reserve an effect (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Runtime Ownership”).
4. Missing/wrong Slack, Google, Orgo, or Command Center identity fails closed and never falls back to a shared principal (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Contradictions” item 2).
5. One schedule occurrence is emitted across dispatcher restart, clock skew, and ownership transfer; missed occurrences follow an explicit catch-up policy (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Failure Modes”).
6. Approval binds an exact payload; edits, expiry, wrong approver, replay, and runtime bypass all fail at the effect API (`../../round1/eve-fit/eve-fit.md`, “Verified Capabilities”).
7. Hermes and eve pass the same versioned contract suite and synthetic Maya fixture, including errors, retries, timeouts, and receipts (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Eve Role”).
8. Rollback from eve restores Hermes with a new epoch, zero duplicate effects, no missing accepted event, and all in-flight work classified as completed, pending, or quarantined (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Failure and Recovery”).
9. Runtime health becomes red for stale lease, stale cursor, old queue age, uncommitted effect, or failed receipt sink even when the process heartbeat is green (`../../round1/linear-runtime-forensics/runtime-forensics.md`, “Failure Modes”).
10. The benchmark demonstrates a material operational advantage over measured Hermes, with zero critical authorization, cross-account, duplicate-send, or financial errors (`../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Eve Role” and “Recommendation”).

## Recommendation

Proceed in four gates:

1. **Stabilize under Hermes:** implement the runtime-neutral ledger contracts, principal registry, schedule registry, effect ledger, and fencing lease while Hermes remains the only production owner.
2. **Shadow eve:** pin and gate eve; use a separate synthetic tenant and identical fixtures. Permit no production subscription, schedule, credential, or effect.
3. **Canary ownership transfer:** only after all required proofs pass, transfer one low-risk Maya inbound trigger by revoking Hermes’s lease and granting eve a higher epoch. Keep consequential effects approval-gated and observe durable ledger metrics.
4. **Promote or roll back:** promote only if eve matches every safety invariant and materially lowers recovery/toil. Otherwise restore Hermes through a new fencing epoch. Do not expand to another persona until Maya’s cutover and rollback have both been demonstrated.

Thus the accepted architecture is **eve-evaluated, not eve-first in production**. The control plane must be runtime-neutral before the runtime can be changed safely (`../../round1/eve-fit/eve-fit.md`, “Recommendation”; `../../round1/maya-orgo-hermes-runtime/maya-runtime.md`, “Recommendation”).
