# Self-Healing Loop (every surface, every repo)

Status: active standard (stages ship disabled until enabled per surface)
Owner: Chris (CTO) for enablement; Quality Control for changes to this standard
Decision date: 2026-10-21
Related: [CRM A3](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/proposals/A3-error-autofix-pipeline.md), [A3 for all surfaces](../proposals/a3-self-healing-loop-all-surfaces.md), [20-observability-and-incident-response.md](20-observability-and-incident-response.md), [54-third-party-agent-tool-gate](54-third-party-agent-tool-gate-2026-06-25.md)

## The loop

```
App (Sentry SDK, release = build commit, PII scrubbed)
   │  1 DETECT        Sentry issue first seen / regressed; alert rules to #pe-cc-dev-team
   ▼
scheduled triage (GitHub Actions, every 15 min)               sentry + linear read keys only
   │  2 ENRICH+TRIAGE dedupe (Sentry id + signature), severity S1–S4, impact gate,
   │                  fixability class, PII strip, Linear bug log with evidence links
   ▼
Linear bug log  ── labels are the state machine ──────────────────────────────────────────┐
   │  3 INVESTIGATE   autofix:queued → agent gets the bug log as a data file (no credentials) │
   │  4 PROPOSE FIX   failing test first → minimal fix → full verify → patch policy →        │
   │                  independent clean-runner verify → draft PR autofix/<ID>               │
   ▼                                                                                      │
human review → merge → normal deploy (nothing auto-merges or auto-deploys)                │
   │  5 REVIEW+SHIP                                                                       │
   ▼                                                                                      │
verify-and-close (hourly)                                     sentry + linear keys, repo read
   │  6 VERIFY+CLOSE  /healthz buildCommit contains the merge → soak 72h →                │
   │                  quiet: resolve Sentry, Linear Done + `verified`                     │
   │                  seen again: Linear reopened + `regressed` + evidence ───────────────┘
   ▼
   7 FEEDBACK         evidence comments on Linear and Sentry; verified issues watched 14 days
```

The shape follows Chris's "Self-Healing Agent App Loop" definition (2026-10-21) with two deliberate differences, both recorded in the A3:

1. **Orchestration is GitHub Actions + Linear labels, not Inngest.** Waits in this loop are hours to days (review, deploy, soak), which a scheduled sweep over Linear state handles with no new vendor, no webhook ingress and no single runtime holding every key. Inngest is `defer` (doc 54) until minute-level reaction is a requirement.
2. **The fixing agent holds no credentials.** Investigation evidence (Sentry context, Seer root cause where available) is gathered by the triage job, which already holds read keys, and handed to the agent as data. The agent never gets Sentry, Linear, PostHog or GitHub write access. This keeps the prompt-injection path from error text to write tokens closed.

PostHog (product signals: funnels, rage clicks, health checks) is **phase 2**, behind its own A3 and the doc 54 gate, because session replay of roofing customers' data needs its own PII review.

## Linear state machine (team PE-CC-DevTeam)

| Label | Meaning | Set by |
|---|---|---|
| `bug`, `source:sentry` / `source:user` | A production defect from Sentry or a staff report | triage |
| `needs-human` | Infra/provider outage, auth boundary, schema, user free text, or the agent could not reproduce | triage / pipeline |
| `autofix:queued` → `autofix:running` → `autofix:pr-open` | Fix-proposal stage | triage / pipeline |
| `verify:pending` | Fix is live; soaking | verify-and-close |
| `verified` | Quiet for the soak window; Sentry resolved; Done | verify-and-close |
| `regressed` | Seen again after the fix shipped; reopened with evidence | verify-and-close |

Human-completed bug logs are verified the same way as agent fixes. Canceled issues are never verified.

## The kit

Canonical source and tests: `Clvrwrk/CRM_PWA` `scripts/triage/` (`lib.mjs`, `sentry-to-linear.mjs`, `verify-and-close.mjs`, `autofix-queue.mjs`, `patch-policy.mjs`). Other repos vendor `lib.mjs`, `sentry-to-linear.mjs` and `verify-and-close.mjs` into `scripts/self-heal/` with a header naming the source commit, plus `.github/workflows/self-heal.yml` (this repo's is the template). Change behaviour in CRM_PWA first, with tests, then re-vendor.

Switches (repository variables, all off by default):

| Variable | Effect |
|---|---|
| `SELF_HEAL_TRIAGE_ENABLED` | Stages 1–2 (CRM uses `AUTOFIX_ENABLED` in `autofix.yml`) |
| `AUTOFIX_AGENT_ENABLED` | Stages 3–4 (CRM only today) |
| `SELF_HEAL_VERIFY_ENABLED` | Stage 6 |
| `AUTOFIX_KILL_SWITCH` | Stops everything |
| `TRIAGE_MIN_SEVERITY` | Impact gate for new bug logs (CRM default `S4`, new surfaces `S3`) |

## Every surface, by default

A surface is not done until it is in the loop. For any new app, service or work surface:

1. Sentry SDK with `release` = build commit, `environment`, `sendDefaultPii: false`, masked replay, and a scrubber; a public `/healthz` that reports `buildCommit`.
2. A Sentry project (or an existing one plus a `surface` tag) named in the repo's `self-heal.yml`.
3. The vendored kit and workflow, triage enabled after a reviewed dry run.
4. Handled errors captured with a route and error code (not just uncaught exceptions).
5. Verify-and-close enabled once the Linear labels and states exist.
6. The fix-proposal stage only after the surface has a deterministic verify chain and branch protection.

## Rollout status (2026-10-21)

| Repo | Sentry project | Triage | Fix proposal | Verify-and-close |
|---|---|---|---|---|
| CRM_PWA | `pwa-crm` | live (Stage 1) | built, off | PR, off |
| a-roofer-open-brain (Command Center) | `cc-proexteriorsus` | kit added, off (thin webhook defers once `SELF_HEAL_TRIAGE_OWNS_LINEAR=true`) | not yet | kit added, off |
| pm.proexteriorsus.net | `pm-scheduler` | kit added, off | not yet | kit added, off |
| PE_CC_EXECUTIVE | `pe-cc-executive` | kit added, off | not yet | kit added, off |
| PE-CC-COURSES | `pe-cc-courses` | kit added, off | not yet | kit added, off |

## What only a human can do

- Create the Sentry projects for pm, Executive and Courses; set DSNs in each runtime.
- Per repo: secrets `SENTRY_AUTH_TOKEN` (internal integration: issue read, comment, resolve) and `LINEAR_API_KEY`; variables for the Linear team, labels and state ids.
- Create Linear labels `verify:pending`, `verified`, `regressed`.
- Branch protection on `main` (human approval + the verify check) before any fix-proposal stage.
- An Anthropic workspace key with a monthly spend cap before any agent stage.
- Flip each switch after a dry run; record the date here.
