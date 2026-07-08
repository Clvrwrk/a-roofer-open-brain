# Agents Under Management — Discovery Interview (Round 1)

**Purpose.** Lock every ambiguous input so `docs/73` (the spec) can state *objective, testable* acceptance criteria for all 8 goal objectives, then execute in gated phases. You review this, critique/answer inline, we loop until you say **done**.

**How to answer fastest.** Every question below carries a **▶ Default** — my best recommendation grounded in the current profiles/docs. Where you agree, just write **✅**. Where you don't, correct it. Open-ended ones are marked **✱** (no safe default; need your call).

**Already decided (not re-asked):**
- Email send policy: agents **auto-send only within `cc.proexteriorsus.net` + `proexteriorsus.com`**; everything else is a Gmail **draft** cc'ing `admin@cc.proexteriorsus.net` for a human to send.
- Sequencing: spec-first → gated phases; re-enable each agent only after it passes `#agent-deploy-validation`.
- Authorship: this interview loop.

**Current roster (8 agents).** maya-chen (intake), alex-rivers (pricing), casey-morgan (vendor-draft), jordan-price (finance), sam-torres (QA), rowan-vale (external research), lena-brooks (marketing), ops-conductor (orchestrator). All currently **paused** (tick timers disabled) pending this work.

---

## Part 0 — Two live bugs to confirm the fix path (blocking agent re-enable)

**Q1 [model ID] ✱** Every agent's `jobs.json` sets `model: "anthropic/claude-sonnet-4-20250514"` — **not a valid OpenRouter ID** (the 400 you saw). ops-conductor uses `anthropic/claude-sonnet-4-5`.
▶ Default: standardize workhorse agents on a verified-valid OpenRouter Sonnet ID and reasoning agents (Conductor, Sam/QA) on a stronger tier — I'll confirm the exact current valid IDs against OpenRouter before deploying. **Confirm: OK to standardize model IDs as part of the fix, and do you have a preferred provider/model or cost ceiling per run?**

**Q2 [dict.lower bug]** Separate runtime error `'dict' object has no attribute 'lower'` in the Hermes cron path.
▶ Default: I root-cause it on the host against one agent before any re-enable; treat "agent completes a real run and posts once, cleanly" as the fix gate. **Confirm.**

---

## Part 1 — Foundational/structural decisions (resolve first; they shape everything)

**Q3 [single cadence source] ✱** Cadence is currently defined in **four** places that disagree (`agents/cadences/roofing-agent-master-cadence.yaml`, each profile's `hermes.cron_schedule`, `write-cron-jobs.py`, `deploy-crons.py`).
▶ Default: make **`roofing-agent-master-cadence.yaml` the single source of truth**; generate `jobs.json` + profile cron from it; delete/retire the duplicates. **Confirm.**

**Q4 [routing rubric as data] ✱** Slack routing today is prose ("Ops Conductor decides"). Objective 7 needs deterministic routing.
▶ Default: build a machine-readable **intent/keyword → single-owner agent** table with explicit multi-match precedence, committed in-repo and owned by ops-conductor. **Confirm — and is a keyword+LLM-classifier hybrid acceptable, or do you want pure-deterministic keyword rules?**

**Q5 [channels exist?] ✱** Objective 1 names **`#agent-profile-builder`** (publish profiles) and **`#agent-deploy-validation`** (agent self-intro). These don't appear in any profile/config.
▶ Default: I create both channels, invite all agent bots + you, and treat them as the publish/gate surfaces. **Confirm they don't already exist under other names, and whether they should be public or private.**

**Q6 [existing channels] ** Known channels: `#ob-agents-internal` (C0BD8U44HL3, raw agent output), `#ob-ops-conductor` (C0BDF8QRF8A, Chris↔Conductor), 3 human accounting channels, dev channels (do-not-join).
▶ Default: raw agent/cron output + journals → `#ob-agents-internal`; curated human-facing summaries → `#ob-ops-conductor`; agents stop posting into the 3 human channels directly (Conductor surfaces what matters). **Confirm this is the target channel architecture.**

**Q7 [model tiers] ** Schema allows `workhorse | reasoning | fast`; every agent is `workhorse` even though config implies Conductor/QA/exec should be `reasoning`.
▶ Default: Conductor + Sam(QA) = reasoning tier; Maya/Alex/Casey/Jordan/Rowan/Lena = workhorse; none on `fast`. **Confirm or re-tier.**

**Q8 [marketing vertical] ✱** `config/roofer.config.yaml` has marketing **`enabled: false`**, yet Lena is fully specced.
▶ Default: keep Lena **paused/excluded from v1** (accounting alpha first), spec her but don't deploy until you flip marketing on. **Confirm — include Lena now or hold?**

---

## Part 2 — Per-agent questions (fill empty cadence buckets, resolve contradictions, set boundaries)

For each agent: **is the current scope correct**, and **what fills the empty cadence buckets?** Defaults propose sensible fills; correct any.

**Q9 [Maya] ** Scope (Gmail intake/classify/extract → work items) looks complete; all cadence buckets populated.
▶ Default: accept Maya's current task set as the completeness template. **Confirm, or add/remove any Maya task.**

**Q10 [Alex — variance thresholds contradiction] ✱** Three different numbers exist: profile says **$500/line or $2,000/invoice**; cadence `morning_abc_sync` says **>$50/line or >$200/invoice**; `variance_daily_summary` says **>$500 line**.
▶ Default: single canonical rule — flag **>$50/line OR >$200/invoice** to surface, **>$500/line or >$2,000/invoice** to escalate to human. **Give me the authoritative thresholds.**

**Q11 [Jordan — empty daily bucket + orphan cron] ** Jordan has no daily task; profile cron `0 3 1 * *` matches nothing.
▶ Default: add a light **daily AR/cash-position glance** (weekdays 7:30am, silent unless a 90+ day or coverage-gap item appears); fix the orphan cron. **Confirm or leave Jordan non-daily.**

**Q12 [Casey — empty annual bucket] ** 
▶ Default: annual = **year-end dispute/recovery retrospective** (total recovered, win rate, top vendors, template effectiveness). **Confirm.**

**Q13 [Sam — empty daily & annual] ** 
▶ Default: daily = **overnight error/failure sweep** across agent runs (silent unless failures) — directly serves objective 2's failure tracking; annual = **year-end accuracy & compliance report**. **Confirm.**

**Q14 [Rowan — storm monitor mis-bucketed + empty annual] ** `storm_event_monitor` is daily (`0 6 * * *`) but filed under "weekly"; annual empty.
▶ Default: re-bucket storm monitor as **daily**; annual = **regulatory/code landscape year-in-review**. Keep `research_requires_chris_approval: true`. **Confirm.**

**Q15 [Ops Conductor — NO cadence at all] ✱** Biggest gap: the orchestrator has zero scheduled tasks, yet objective 2 makes it the daily reporter.
▶ Default: daily **journal roll-up + Chris DM + email** (time in Q19); weekly **system-health digest**; monthly **agent-performance review**. **Confirm the Conductor cadence, especially the daily report time.**

**Q16 [scope-overlap owners] ✱** Role mappings overlap: both Alex and Sam map to `Auditor`; both Casey and Sam map to `Conductor`.
▶ Default: one owner per function — **Sam = Auditor/QA**, **ops-conductor = Conductor/routing**, Alex = pricing only, Casey = vendor-comms only. **Confirm the authoritative owner per role.**

**Q17 [dangling handoff targets] ** Rowan hands off to `@ob-sales` and `Innovator`, which have no profiles.
▶ Default: route those handoffs to **ops-conductor** until a sales/innovator agent exists. **Confirm.**

---

## Part 3 — Per-objective acceptance criteria (make each measurable)

**Q18 [Obj 1 — "fully documented & published"] ✱** What artifact counts as a published profile?
▶ Default: one **profile card per agent** (mission, scope, full cadence table, routing keywords, tools, channels, escalation) posted to `#agent-profile-builder` + committed in-repo; **measurable = 8 cards published, each matching its deployed `jobs.json`**. **Confirm the format.**

**Q19 [Obj 2 — daily status DM + email] ✱** Content, timing, destination.
▶ Default: ops-conductor compiles each agent's daily journal (work done / planned / blockers / performance-from-Latitude), **DMs you (D0B8B2NHP39) + emails you at [which address?]** at **[what local time?]**. Format = per-agent 3-line NEPQ + a system-health header. **Give me: send time, email recipient (admin@ vs chussey@cleverwork.io), and whether one digest or per-agent.**

**Q20 [Obj 2 — journal definition] ** What is an agent "daily journal"?
▶ Default: a structured record each agent writes at end of run-day (tasks attempted, succeeded, failed w/ reason, items produced, blockers, next-day plan) to `#ob-agents-internal` + a durable store the Conductor reads. **Confirm the fields.**

**Q21 [Obj 2 — Latitude usage] ✱** `LATITUDE_PE_CC_API_KEY` now present. How do you want Latitude used?
▶ Default: instrument every agent run as a Latitude log/trace (prompt, tools, outcome, latency, error), and the Conductor queries Latitude for the "performance" + "failures" section of the daily report. **Confirm — is Latitude the system-of-record for agent activity, or just prompt-eval?**

**Q22 [Obj 3 — "full Sentry deployment"] ✱** Scope of "full."
▶ Default: Sentry captures errors from (a) the CC app, (b) the Hermes agent runtime (every failed run → Sentry issue with agent + job tags), (c) the socket/router. **Measurable = a forced test error from each surface appears in Sentry.** **Confirm the 3 surfaces; any alerting rules (e.g. notify on P1)?**

**Q23 [Obj 4 — "full integrated Linear PM"] ✱** What lives in Linear and who writes it?
▶ Default: Linear is the escalation + work-tracking sink — ops-conductor opens issues for unclear requests, bugs, blockers, and agent failures (teams `PE-CC-DevTeam`/`PE-CC-DevEngine`); each agent's blockers become Linear issues; you triage. **Measurable = every escalation/failure yields a Linear issue with agent+type labels.** **Confirm the team(s), issue taxonomy, and whether agents create issues directly or via Conductor.**

**Q24 [Obj 5 — email 4×/day + reply-all] ✱** Which agents, exact cadence, and what "respond to every email" means.
▶ Default: the 5 Google-Workspace inbox agents (maya, casey, jordan, lena, sam — alex is read-only, conductor read-only) check inbox **4×/business-day (e.g. 8/11/14/16)**; **every inbound gets either a reply-draft or a triage/ack**; all replies **cc `admin@cc.proexteriorsus.net`**; sends obey the domain lock (draft outside the 2 domains). **Confirm: which agents must check email, the 4 check-times, and does "respond to every email" include auto-acknowledging or only substantive replies?**

**Q25 [Obj 6 — domain lock] ** Hard rule: no email to any domain except the two.
▶ Default: enforce in `outbound-guard.ts` as an allowlist; anything else → draft only; **measurable = a test send to an external domain is blocked/drafted, logged**. **Confirm the two domains are the complete allowlist (no vendor exceptions).**

**Q26 [Obj 7 — Slack monitored + ack] ✱** Which channels are monitored, and what's the required ack?
▶ Default: ops-conductor monitors all human-facing channels; **every human message gets routed to exactly one agent within N minutes, and that agent replies in-thread with an ack** ("Got it — I'm doing X"). **Confirm: which channels are in scope, the max ack latency (SLA), and the ack wording standard.**

**Q27 [Obj 8 — honesty rule] ** "I don't know, let me review" > fabrication.
▶ Default: inject a hard epistemic rule into **every** agent's system prompt: if the rule/answer isn't known, respond "I don't know — let me review" + open a review item, never fabricate. **Measurable = a probe question with no defined SOP yields the honest response + a logged review item.** **Confirm wording.**

**Q28 [validation gate] ✱** What must an agent pass to be re-enabled and self-introduce at `#agent-deploy-validation`?
▶ Default: a per-agent checklist — model fixed, one clean real run, journal emitted, email-cadence verified, routing keywords registered, honesty probe passed — then the agent posts a self-intro (who I am, what I own, my cadence, how to reach me). **Confirm the gate checklist.**

---

## Part 4 — Anything I haven't asked

**Q29 ✱** What outcome would make you say "this is done" that isn't captured above? Any hard deadline, budget ceiling on agent LLM spend, or agent you want first through the gate?

---

*Round 1 ends here. Mark ✅/corrections inline; I'll fold your answers in, surface any new questions they raise, and re-issue until you say done — then I write `docs/73` spec with the locked acceptance criteria.*
