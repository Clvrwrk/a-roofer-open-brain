# A3: Self-healing loop on every surface (Sentry -> Linear -> fix proposal -> verify-and-close)

Proposed by: Chris (CTO), via Claude Code
Date: 2026-10-21
Status: approved 2026-10-21 by Chris. Every stage still ships disabled; each stage is enabled per surface.
Affected clients: template-wide (all Cleverwork surfaces: Command Center, CRM, PM, Executive, Courses, and every future surface)
A3 file: proposals/a3-self-healing-loop-all-surfaces.md
Extends: [CRM_PWA A3: error autofix pipeline](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/proposals/A3-error-autofix-pipeline.md) (approved 2026-09-29, CRM scope only). Standard: [docs/127](../docs/127-self-healing-loop.md).

---

## 1. The problem (measured, 2026-10-21)

- **CRM:** Stage 1 triage has run every ~15 minutes since activation (1,585 workflow runs). Every Sentry-filed bug log since 2026-10-02 (PEC-454 onward) is `needs-human` and still in Backlog. Sentry lists 15 unresolved issues in 14 days; the top one (PWA-CRM-2P, 401 without a session) has 391 events. Nothing verifies a fix after deploy or resolves anything.
- **Command Center:** Sentry is on (`cc-proexteriorsus`), but the only path to Linear is a webhook that files one bare issue per event (title and link, no dedupe). CC-PROEXTERIORSUS-G (kpi pill fetch failed, 3 users, 15 events) has no structured record.
- **PM, Executive, Courses:** no error monitoring and no loop at all. A failure there is detected only when a person reports it, as the CRM was before the 2026-09-29 incident.
- **Cost model:** the CRM A3 section 8 figures apply per surface (about $8.5k per month of detect, triage, fix and blocked-user time per active surface at 3 defects per week). They are estimates until Stage 1 metrics replace them.

## 2. Root cause (5 Whys)

1. Why do fixed or stale errors pile up? Nothing closes the loop after deploy; Done in Linear and resolved in Sentry are both manual.
2. Why is Command Center thin? Its webhook predates the CRM pipeline and was never upgraded.
3. Why are three apps unmonitored? There was no default: each surface decided its own observability, and the newer ones did not.
4. Why does noise reach Linear? There is no impact gate; every S3/S4 auth or outage class becomes its own issue.
5. Why now? Chris's self-healing loop definition (2026-10-21) asks for the loop app-wide and as the default for future surfaces.

## 3. Proposed solution

- **Receiving role:** horizontal Conductor (error queue) and the dev team's Sentry Analyst / Bug Triager roles; the automation is GitHub Actions in each repo, not a new agent persona.
- **What it does:** the seven-stage loop in docs/127: detect, triage into a deduped Linear bug log with evidence, reproduce-first fix proposal as a draft PR (where a verify chain exists), human merge, then verify-and-close against production (deploy confirmed via `/healthz` `buildCommit`, 72h soak, resolve or reopen with evidence), watched 14 days for recurrence.
- **Primitive:** the approved CRM pipeline (`scripts/triage/`), vendored into each repo at `scripts/self-heal/`.
- **Trust tier of output:** `evidence`. Bug logs and root-cause text are evidence; only a human-merged PR changes a product.

## 4. The new state (projected)

- Detect to Linear bug log: 15 minutes or less on every surface (one tick).
- Shipped fix to verified-or-reopened: soak + 1 hour, with zero human time for the quiet case.
- Human review retained on every code change by design (no auto-merge, no auto-deploy).
- Agent operation cost: unchanged from the CRM A3 (about $9 per fix run) and only where the fix stage is enabled; triage and verify are runner-minutes only (about $25 per surface per month).

## 5. The math

Per surface, using CRM A3 section 8 assumptions: current cost X ≈ $8,483 per month; new cost Y ≈ $3,191 per month; one-time build Z ≈ $2,400. The detect, document and close stages exceed 10x on their own (about $1,463 of engineering time against about $25 of runner time). The whole-system multiplier is about 2.5x because human review is retained on purpose.

**Exemption requested:** mission-grade infrastructure and high error cost (CONVENTIONS §10), the same exemption approved for the CRM on 2026-09-29.

## 6. Third-party tool gate (hard rule 12)

| Tool | Verdict | Notes |
|---|---|---|
| Sentry (SaaS, SDKs) | already in use | No change in vendor. New token scope: issue resolve (`event:write`). |
| GitHub Actions | already in use (CRM) | Ephemeral runners; `permissions: {}` at top; read-only repo tokens in triage and verify jobs. |
| `anthropics/claude-code-action` | `conditional_pilot` (CRM A3 §10, pinned SHA) | Fix stage only, per surface, after its own verify chain and branch protection exist. |
| Inngest | `defer` | Not needed: the loop's waits are hours to days; Linear labels already hold state. Revisit if minute-level reaction is required. Recorded in doc 54. |
| PostHog | `defer` to phase 2 A3 | Product signals are valuable, but session replay over customer data needs its own PII, egress and consent review. Recorded in doc 54. |
| New MCP servers | none | No local MCPs. The fixing agent gets no MCP tools. |

## 7. Risks and rollback

| Risk | Mitigation |
|---|---|
| Wrong auto-resolve | Resolve only after deploy is confirmed and every linked Sentry issue stays quiet for the soak; a recurrence within 14 days reopens automatically |
| Reopen loops | The reopen clears the deploy mark and `autofix:pr-open`; a reopened issue re-enters only when it is completed again |
| Duplicate Linear issues (webhook plus triage) | Command Center webhook defers when `SELF_HEAL_TRIAGE_OWNS_LINEAR=true` |
| Prompt injection via error text | Unchanged CRM controls: scrubbed capture, second PII strip, agent holds no credentials, patch policy, independent verify, human review |
| Cost | Triage and verify are runner-minutes; the agent stage keeps `AUTOFIX_MAX_PER_RUN`, turn caps and a spend-capped key |

**Rollback:** `AUTOFIX_KILL_SWITCH=true` or unset the stage variable; revert the PR. Reopen or unresolve by hand if needed. No data is deleted.

## 8. Decision

- [x] A3 approved (Chris, 2026-10-21)
- [ ] Per-surface activation recorded in docs/127 "Rollout status"

Decision: [x] Approve  [ ] Kill  [ ] Defer
Approver: Chris Hussey  Date: 2026-10-21
