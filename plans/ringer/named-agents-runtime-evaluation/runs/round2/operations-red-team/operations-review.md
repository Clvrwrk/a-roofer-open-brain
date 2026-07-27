## Verdict

**Do not authorize seven-agent production operation yet.** Round 1 defines a credible target—one fenced runtime, identity set, queue, receipt stream, and kill switch per named agent—but does not demonstrate an operator console, current inventory, live heartbeats, completed end-to-end receipts, or tested recovery. A real operator therefore cannot presently answer, from one authoritative surface, which of Maya, Alex, Casey, Jordan, Sam, Rowan, and Lena is alive; what each consumed and emitted; what is blocked; or which host owns its triggers. The most important evidence explicitly calls current listener, scheduler, token, inbox, and end-to-end health **unknown**, and notes that Command Center runtime status is mock data ([runtime-forensics.md](../../round1/linear-runtime-forensics/runtime-forensics.md), “Executive Finding,” “Current Architecture,” and “Evidence”).

Round 1's corrected Hermes-on-Orgo design is a suitable **implementation specification**, not an accepted operating capability. Its health probes, ownership leases, effect ledger, receipts, and recovery steps are written in the future tense and were not exercised ([maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Slack Design” and “Failure and Recovery”). Eve should remain an isolated comparison only, and Cursor/Devin should remain DevTeam or tightly bounded browser adjuncts; none repairs the missing operational control plane ([eve-fit.md](../../round1/eve-fit/eve-fit.md), “Pilot Shape”; [cursor-devin-fit.md](../../round1/cursor-devin-fit/cursor-devin-fit.md), “Best-Fit Roles”).

Operational readiness is **red**. The safe production count is zero until Maya passes the acceptance test below; subsequent agents should be enabled serially.

## Findings

| Priority | Finding | Operational consequence | Required closure evidence |
| --- | --- | --- | --- |
| **P0** | There is no authoritative, live seven-agent status surface. The dashboard status is mock, `/healthz` measures the web app rather than persona runtimes, the VPS was unreachable with available credentials, and only Maya's Orgo computer—not Hermes or its integrations—was observed running. | An operator can mistake a dead fleet for a healthy one and cannot localize Mac/VPS/Orgo/runtime/integration failure. | One live inventory/status API and UI row per agent, backed by fresh component heartbeats and a synthetic canary; no inferred green state. |
| **P0** | Trigger ownership is not proven exclusive. VPS/Kasm history, the proposed Orgo runtime, two cron deployment mechanisms, Slack listeners, polling, and a possible eve pilot coexist. | Restart or failover can create two consumers, duplicate schedules, and wrong-speaker or duplicate external effects. | A durable lease with fencing epoch for every `(agent, trigger)`; exactly one active owner; stale owners rejected server-side; migration/rollback drill receipts. |
| **P0** | Intake and effects lack a demonstrated end-to-end idempotency contract. Slack does not consistently create `dashboard_work_items`; no shared uniqueness/effect ledger is evidenced. Eve also warns interrupted steps may rerun. | A duplicate Slack event, retry, or crash can cause missed work or duplicate replies/drafts/writes. | Database uniqueness on canonical source keys, atomic effect reservation, replay tests, and one correlated work/approval/effect receipt chain. |
| **P0** | Recovery is prose, not a proven runbook. No current inventory identifies the exclusive owner and restart mechanism for each persona; no tested backup/restore or credential-expiry drill is supplied. | After a Mac restart, VPS outage, vendor outage, or token expiry, an operator may start a second owner, lose queued work, or resume after an unknown side effect. | Versioned runbooks plus timed game-day evidence for every incident in “Incident Recovery.” |
| **P1** | An operator cannot reliably see what each agent consumed, sent, or has stuck. Round 1 proposes receipts containing source/effect/cost data but reports no current receipt ledger, queue-age view, approval-age view, or correlated Slack/Gmail evidence. | Audit, customer-response, and incident triage depend on scattered logs and vendor consoles; stuck work is silent. | Immutable, queryable receipt ledger with correlation IDs and redacted input/output metadata; queue and approval age dashboards. |
| **P1** | Identity can fail open: local evidence says the Slack registry may fall back to shared `@openbrain`, while the target design requires dedicated identities. Four personas also share the Accounting service inbox and Sam routes via Conductor. | A message may be attributed to the wrong persona or lose named-agent provenance. | Remove shared-bot fallback; fail closed; expose persona, service inbox, source identity, and actual sender in every receipt. |
| **P1** | Cadence has multiple authorities and material contradictions: Maya 60 seconds vs 2 minutes; Casey/Rowan event-only vs enabled crons; Jordan monthly vs several generated jobs. | Operators cannot know what should run next or distinguish a missed run from an intentionally absent one; runaway schedules are plausible. | One declarative schedule registry, config hash, owner epoch, last/next run, enable reason, concurrency policy, and per-job spend/rate breakers. |
| **P1** | Credential health is fragmented. Slack, Google OAuth/browser sessions, Orgo keys, AgentMail, Command Center, and model-provider tokens have no consolidated expiry/last-success evidence. The supplied Maya Orgo key was inferred account-wide and requires rotation/scoping. | Token expiry presents as unexplained agent failure; broad credentials amplify a compromise. | Secret-reference inventory (never values), scope proof, expiry/rotation timestamps, last successful auth probe, and 14/7/1-day alerts where expiry is knowable. |
| **P1** | Role boundaries are specified but not proven at enforcement points. Rowan's external-only boundary conflicts with generated cross-reference work; outbound and `trust_tier` restrictions depend on target controls not shown live. | An apparently healthy runtime can still violate authorization or data-separation requirements. | Negative authorization tests at API/tool boundaries for every agent, especially Rowan, Sam, financial writes, and external sends. |
| **P2** | Native vendor telemetry is insufficient as the business ledger. Eve retention may be hours to days; Cursor/Devin audit features are engineering-oriented; Hermes logs/homes are host-local unless exported. | Forensics and cost attribution decay or disappear after outages and retention windows. | Export normalized traces/receipts to the authoritative store before acknowledging completion; retention of at least 400 days for operational metadata. |
| **P2** | Cost policy is designed but no measured baseline exists. Model prices are planning inputs, and no per-agent run volumes, settled bills, or operator minutes were supplied. | Staffing and vendor decisions cannot be budgeted; runaway spend may be detected only on invoice. | Four-week synthetic/shadow baseline with per-agent/task tokens, provider, retries, dollars, wall time, and operator minutes. |
| **P2** | Alert routing and on-call ownership are undefined. “Page the operator” and kill switches are proposed without named primary/backup, delivery path, acknowledgement, escalation, or maintenance window policy. | Alerts can be technically emitted yet operationally unowned. | Published rota, primary and backup delivery paths, acknowledgement/escalation timers, and quarterly notification drill. |
| **P3** | Documentation and terminology drift (seven personas vs eight Slack identities, one-app/read-only vs eight two-way apps, five desktops vs seven) increases operator error. | A responder can follow an obsolete topology during recovery. | One generated inventory/runbook set; obsolete docs visibly superseded; configuration-to-doc drift check in CI. |

Priority definitions: **P0** risks duplicate/unauthorized effects, silent fleet loss, or unrecoverable ambiguity and blocks production; **P1** materially impairs safe operation and blocks scaling beyond the pilot; **P2** impairs supportability, cost control, or forensics; **P3** is hygiene with a credible human-error path. The underlying contradictions and evidence gaps are catalogued in [runtime-forensics.md](../../round1/linear-runtime-forensics/runtime-forensics.md), “Contradictions,” “Failure Modes,” and “Unknowns,” which in turn cites repository evidence including `docs/70-agent-coordination-stabilization-and-migration-plan.md`, `app/command-center/runtime/slack-socket-runtime.mjs`, and `scripts/write-cron-jobs.py`.

## Operating Model

Command Center must be the one operator surface and durable system of record. Vendor dashboards, Orgo, systemd, and local Hermes homes are diagnostic sources, never competing truth.

Each of the seven rows must expose:

- **Identity and owner:** agent ID, role, Slack bot/app, Google identity, Orgo workspace/computer ID, Hermes home, deployed version/config hash, active host, trigger lease holder, and fencing epoch.
- **Alive:** independent state for computer/host, runtime process, lease, scheduler, Slack, Gmail, Command Center, model provider, receipt sink, and synthetic canary. Overall status is `healthy`, `degraded`, `blocked`, `paused`, or `offline`; unknown or stale is never green.
- **Consumed:** last 20 inputs with timestamp, source type, stable source ID/hash, redacted summary, work-item ID, dedup result, and cursor/checkpoint. Do not display raw secrets or unnecessary message bodies.
- **Sent/effected:** proposed and completed Slack replies, Gmail drafts/sends, Command Center writes, approvals, and external actions with target, content/attachment hashes, idempotency key, actor/approver, vendor receipt, and timestamp.
- **Stuck:** queue depth and oldest age by state (`ready`, `running`, `waiting_approval`, `waiting_auth`, `retry_wait`, `quarantined`, `failed`), current step, retry count, next retry, blocker code, and safe operator action.
- **Schedule and spend:** canonical jobs, enabled state, last/next run, duration, overlap, missed/runaway count, tokens, estimated/settled cost, daily/monthly budget, and breaker state.
- **Controls:** pause intake, pause schedules, disable outbound, global/per-agent kill switch, credential reauth, quarantine/replay, and fenced takeover. Consequential buttons require reason, confirmation, authorization, and an audit receipt.

The event contract is `source event -> unique work item -> checkpointed run -> approval (if required) -> reserved external effect -> vendor receipt -> completion receipt`. Use a stable key such as `slack:{team}:{event_id}` or `gmail:{account}:{message_id}` and a separate logical effect key. A unique database constraint, not model memory, enforces deduplication. The target four-layer Slack design is described in [maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Slack Design.”

Exactly one runtime owns Slack events and schedules for each agent. A lease has a monotonically increasing fencing epoch; every intake, checkpoint, and effect write carries it, and the server rejects stale epochs. Failover is an explicit operator act after quiescence/reconciliation, never “start another copy and see.” Mac mini state is not part of the target production path—Maya is explicitly Orgo-only—so a Mac restart must leave agent ownership unchanged ([maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Runtime Ownership”).

## SLOs and Alerts

Measure monthly per agent and for the fleet; exclude only declared maintenance windows. SLOs start after a four-week pilot baseline, but the safety invariants apply immediately.

| SLI / SLO | Target | Alert |
| --- | --- | --- |
| Status freshness | 99.9% of minutes have runtime, lease, queue, integration, and receipt-sink status no older than 60s | Warning at 90s; page at 180s or two failed canaries |
| Accepted-event durability | 99.95% of valid Slack/Gmail events create exactly one durable work item within 60s | Page on any 5-minute gap or any accepted event without work ID |
| Duplicate external effects | **0** duplicate Slack posts, emails, or consequential writes | Immediate P0 page and outbound kill switch |
| Receipt completeness | 100% of completed/failed runs link source, work item, run, approval, effect, cost, and terminal status; 99.9% written within 30s of effect | Stop new effects if receipt sink fails for 60s; page at 5m |
| Queue latency | 99% of ordinary events start within 5m; 99% of scheduled jobs start within 2m of due time | Warn at 5m; page when oldest ready item >15m or a job misses by >5m |
| Stuck-run detection | 100% of runs exceeding declared step timeout become visible within 2m | Page when running with no checkpoint for 2× step timeout |
| Approval visibility | 100% visible immediately with approver, exact effect hash, expiry; warn at 4 business hours | Daily escalation at 1 business day; no auto-approval |
| Recovery | MTTA <10m; restore safe intake within 30m for one-agent failure and 60m for fleet/vendor failure; reconcile effects before resume | Page primary immediately, backup at 10m, incident lead at 20m |
| Identity/authorization | 100% correct persona sender; 0 shared-bot fallbacks, cross-agent credential use, Rowan internal reads, unauthorized sends, or forbidden writes | Immediate P0, fail closed, quarantine run |
| Auth readiness | 99.9% successful scoped auth canaries; known expiries warned 14/7/1 days ahead | `waiting_auth` and page at first production failure; never retry-send blindly |
| Schedule safety | 0 overlapping executions unless explicitly declared; breaker within 60s of >3 starts/job/10m or 2× declared max runtime | Auto-pause job, page, preserve queue/effect ledger |
| Spend | 100% calls receipted; alert at 70%/85%; hard-stop noncritical work at 100% of daily or monthly agent budget | Immediate page on >2× expected run cost, unapproved T2, or missing cost receipt |

Availability must not collapse component health into a process-up bit. Round 1 explicitly says a green process with a stale lease or cursor is unhealthy ([maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Failure and Recovery”).

## Acceptance Test

Run first for Maya in a synthetic tenant/channel/mailbox, then repeat unchanged for Alex, Casey, Jordan, Sam, Rowan, and Lena before each serial promotion. A human operator unfamiliar with the implementation performs the test from the runbook and Command Center; implementers may observe but not guide. Record screen, timestamps, API receipts, and operator minutes.

1. From the fleet page, name all seven agents and correctly identify active host/computer, runtime/config version, last heartbeat/canary, lease epoch, integrations, last/next schedule, queue depth/oldest age, approval count, and spend. Randomly compare two rows to source probes. **Pass:** all answers in 5 minutes, no shell/vendor-console access, zero false-green fields.
2. Inject one synthetic Slack mention and one labeled Gmail message for the test agent. **Pass:** each produces exactly one work item within 60s; the operator can show redacted input metadata, checkpoints, proposed output, approval, vendor effect receipt, cost, and terminal status from a single correlation chain.
3. Redeliver each identical event 10 times, including concurrently and after runtime restart. **Pass:** one work item and one logical external effect per source; duplicate counters increase; no duplicate reply/draft/write.
4. Stop the runtime between effect reservation and vendor acknowledgement, then restore it. **Pass:** reconciliation queries the vendor/effect ledger and either records the existing effect or safely performs it once; never two effects.
5. Expire/revoke Slack, Google, Command Center, Orgo, and model credentials one at a time. **Pass:** affected work becomes `waiting_auth` or fails closed within the alert window, unrelated agents continue, no identity fallback occurs, and reauth plus canary restores work without event loss.
6. Simulate Mac restart. **Pass:** no production lease, listener, or schedule changes because the target runtime is Orgo/VPS-independent of the Mac; the UI remains truthful.
7. Simulate active-host/Orgo outage and separately a full VPS outage, including restoration of an obsolete owner. **Pass:** stale epoch writes/effects are rejected; queued inputs remain durable; an operator completes fenced takeover or restore inside the recovery SLO; backlog drains once.
8. Block Slack, Google/Gmail, Orgo, Command Center/receipt sink, and the model provider separately. **Pass:** degradation is component-specific, bounded fallbacks obey role and budget, effects stop when receipts cannot persist, and parked work resumes once.
9. Configure a schedule to fire every minute and hang beyond its maximum runtime. **Pass:** concurrency/rate/spend breakers auto-pause it within 60s, issue one page, and expose every attempted run without flooding downstream systems.
10. Attempt a shared-token reply, unauthorized external send, Sam `trust_tier` mutation, Rowan internal-data read, cross-agent browser/home access, and raw-price-UOM comparison. **Pass:** all are rejected at deterministic enforcement points and receipted; no prompt-only defense counts.
11. Restore the agent from a pinned runtime/home backup on a clean target after inventorying existing resources. **Pass:** config hash, identity scopes, cursors, pending approvals, queue, and effect ledger reconcile; one canary passes; total operator time meets SLO.
12. At the end, ask the operator: “What did this agent consume, what did it send, what is stuck, why, who owns it, what runs next, what did it cost, and how would you stop/recover it?” **Pass:** correct answers for a randomly selected agent in 3 minutes from Command Center alone.

Any duplicate/unauthorized effect, cross-agent access, false green, lost accepted event, unreceipted effect, or stale-owner effect is an automatic failure. Three consecutive clean full runs on different days are required per agent.

## Incident Recovery

All incidents begin the same way: declare incident/correlation ID, disable outbound if effects are uncertain, preserve queue/lease/checkpoint/effect evidence, identify the last committed checkpoint and last confirmed vendor effect, then repair. Resume only after read-only health, reconciliation, a synthetic canary, and acquisition of a new fencing epoch. This follows the target sequence in [maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Failure and Recovery,” but makes its decision points explicit.

| Incident | Detection and containment | Recovery and proof |
| --- | --- | --- |
| Mac restart | Fleet should remain green; alert only if any production owner incorrectly depends on Mac. | Do not restart agents locally. Verify leases/heartbeats/canary. Any ownership change is a configuration defect and P0. |
| VPS outage | Heartbeats/leases/listeners on VPS stale; pause affected outbound and prevent automatic old-owner return. | If VPS remains canonical, restore pinned services and reacquire new epochs; if Orgo is canonical, verify VPS owns nothing. Reconcile all source cursors and effects before draining backlog. |
| Orgo/computer outage | Computer probe fails while durable queue remains available. Pause browser-only steps; API-first paths may continue only if policy permits. | Restart the existing computer by immutable ID; never provision by display name during incident. Verify workspace scope, Google profile, Hermes home/config hash, lease, and canary. |
| Slack/Gmail/Orgo/model/vendor outage | Component canary fails; circuit breaker opens. Park dependent work, continue only independent read-only work, and prohibit identity/provider fallback outside declared policy. | Confirm vendor recovery, renew connections if needed, replay from durable cursor under idempotency keys, and compare vendor receipts before effects. |
| Token expiry/revocation | Auth probe or first 401/403 marks integration `waiting_auth`; no broad retry loop and no shared-token fallback. | Human uses least-privilege reauth/rotation procedure; verify expected scope and negative cross-scope test; run canary; release quarantined items individually. Never expose token values in UI/logs. |
| Duplicate event | Unique-key conflict increments duplicate count and links to canonical work item; no new run/effect. | Inspect canonical item/effect receipt. If an effect duplicated, kill outbound globally, preserve both vendor IDs, remediate externally, and treat as P0 before resumption. |
| Runaway schedule | Start-rate, overlap, runtime, token, or dollar breaker auto-pauses the single job and alerts. | Inspect canonical schedule/config diff and all spawned runs; cancel safely, reconcile effects, correct under review, run once manually, then explicitly re-enable. Do not delete evidence. |
| Receipt-store/Command Center outage | Runtime may ingest to a bounded durable local buffer but may not perform new consequential effects after 60s without durable receipts. | Restore store, flush in order with idempotent inserts, reconcile effects, canary, then enable outbound. |
| Full fleet restart | Global status turns offline/degraded; trigger leases expire but stale epochs remain invalid. | Restore queue/store first, then agents one at a time in fixed order, acquire leases, canary, and drain bounded batches. Stop on first identity/dedup/receipt failure. |

Backups must include versioned config and Hermes home state needed for cursors/checkpoints, but secrets remain references in the approved secret manager. Restore tests are quarterly. Recovery never creates a replacement Orgo desktop until inventory proves the original unavailable and a human approves replacement.

## Cost and Staffing

Round 1 provides token ceilings and planning-rate examples but no run-volume baseline or settled cost evidence ([maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Model and Cost Policy”). Do not publish a dollar forecast from those inputs alone.

During the Maya pilot, collect four weeks of: events and scheduled runs by task class; input/output/cache tokens; actual model/provider and dated unit rate; retries/escalations; Orgo/runtime/vendor fixed charges; storage/telemetry; operator setup, approval, recovery, and weekly-maintenance minutes. Report cost per accepted event, completed work item, schedule, persona-day, and human-approved effect, plus p50/p95 recovery labor. Allocate shared infrastructure by metered use and show it separately from model spend.

Minimum human coverage for a seven-agent production pilot:

- One named business owner for authority/approval policy and one technical service owner for runtime, queue, credentials, and incidents.
- A primary and backup responder during declared operating hours; P0 acknowledgement within 10 minutes. Do not claim 24×7 coverage without a funded rota of at least three trained responders or a contracted operations service.
- Initial estimate for planning, to be replaced by measurement: 0.5 technical FTE during build and serial rollout, 0.1–0.2 technical FTE steady state, plus business approver time. Add a formal on-call rotation only after alert volume and recovery minutes are measured.
- Weekly review of missed/duplicate events, stale approvals, auth expiry, schedule drift, spend, and error budget; monthly access/scope review; quarterly restore/vendor-outage/runaway-schedule game day.

The eve comparison should proceed only if it reduces median operator recovery/toil by at least the proposed 30% while matching all safety gates; vendor feature richness alone is not savings ([maya-runtime.md](../../round1/maya-orgo-hermes-runtime/maya-runtime.md), “Eve Role”). Cursor/Devin introduce another vendor console and control plane, so count their license, integration, audit-export, and on-call burden before treating them as operational leverage.

## Recommendation

Accept Round 1 as the **target design and risk register**, not as evidence of a live seven-agent service. Fund one bounded implementation milestone: build the authoritative inventory/status/receipt/lease/effect-ledger surface; establish one schedule registry; write executable incident runbooks; and pass the full human acceptance test with synthetic Maya.

Only then promote serially in this order: Maya, Alex, Casey, Jordan, Sam, Rowan, Lena. Require three clean test days and a human go/no-go at each step. Keep Hermes-on-Orgo the sole production trigger owner during evaluation; keep eve isolated; disable or fence every historical VPS/Kasm owner before transfer. Do not add Cursor, Devin, or another orchestration layer to solve observability—the missing capability is an owned operational control plane with durable evidence.

Production approval requires closure of all P0s, all identity/authorization P1s, defined budget and on-call ownership, and a signed acceptance-test record. Until then, the honest operator answer to “which agents are alive?” is **unknown**, and the safe operational state is paused/draft-only.
