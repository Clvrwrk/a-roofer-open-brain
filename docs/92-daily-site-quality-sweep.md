# Daily site quality sweep (Layer 2) — docs/92

The unattended half of the 2026-08-18 site audit (docs/90). That audit found two
real defects (PEC-215, PEC-216) by hand. This runs the same checks every morning
so the next regression is caught by a machine, not months later by a person.

Script: `scripts/site-quality-sweep.mjs` · Units:
`deployment/remote/systemd/openbrain-site-sweep.{service,timer}` · Runs **06:00
America/Chicago** on the US agent host (178.156.203.23, PE-US-AGENTS).

## What it checks

**Static (against the repo checkout — no network, no credentials)**

| Check | Fails on |
|---|---|
| Link graph | any internal `href`, `fetch()`, `location.href` or `redirect()` target that does not resolve to a real route |
| Fabricated data | a literal `$` amount or `%` hardcoded in page markup; a `lib/` module that self-declares sample/fake data **and** is imported at runtime |
| Orphan pages | a real `.astro` page with no inbound link and no nav entry |

**Live (against https://cc.proexteriorsus.net)**

| Check | Fails on |
|---|---|
| `/healthz` | unreachable, non-200, or `status != "ok"` |
| Deploy drift | deployed `buildCommit` != `origin/main` (warning) |
| `/api/*` probes | 5xx, 401/403, or breach of a per-route response-time budget |

## What it deliberately does NOT check

The HTML dashboards are **WorkOS-gated** and an agent has no human session (see
the `/workos-agent-auth` skill), so this cannot fetch them from production. Page
rendering and browser-console checks need both a headless browser and a human
session — that is a separate job, and pretending to cover it here would be worse
than the honest gap. The static analysis covers the page tree instead.

## Signal quality

The first draft produced **2 errors and 21 warnings — all false positives**. That
matters: a sweep that cries wolf gets ignored, and an ignored sweep is worse than
no sweep. Both detectors were tightened:

- **Fabricated data** matched a bare `hardcoded`, which fired on comments
  *describing bugs that were already fixed* ("`hasPriceList` was hardcoded true").
  Now only self-admissions of data that is fake **right now**.
- **Orphan pages** flagged every machine endpoint (`/auth/*`, `/oauth2/*`,
  `/agent/*`, `/.well-known/*`, `/healthz`) — none of which are ever linked from
  the UI by design. Now restricted to real `.astro` pages, and the link extractor
  understands JS navigation, not just `href=`.

Current baseline: **0 errors, 2 warnings** (`/accounting/price-list/branch`,
`/system` — both genuine "review me" signals).

## Alerting

- **Slack** → `#pe-cc-dev-team` (standing rule) whenever there is any finding.
- **Linear** → auto-files an issue when there is at least one **error** (never for
  warnings alone, so the backlog does not fill with noise). Needs `LINEAR_API_KEY`
  + `LINEAR_TEAM_ID`.
- Exit code 1 on errors, so the systemd unit records a failure. `SuccessExitStatus=0 1`
  keeps a failing sweep from wedging the timer.

Every credential is optional and the sweep says out loud when one is missing —
e.g. no `AGENT_SERVICE_TOKEN` emits a warning that live API coverage was skipped,
rather than silently reporting a clean run.

## Deploy

```bash
ssh -i ~/.ssh/hetzner_office root@178.156.203.23
cd /opt/openbrain/a-roofers-open-brain && git pull
cp deployment/remote/systemd/openbrain-site-sweep.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now openbrain-site-sweep.timer
systemctl list-timers openbrain-site-sweep.timer      # confirm next run
node scripts/site-quality-sweep.mjs                   # one manual run
```

## Scheduled-job coverage on the agent host

Verified 2026-08-19 by reading each unit's `ExecStart`:

| Unit | Script | Schedule |
|---|---|---|
| `openbrain-abc-sync` | `abc-nightly-sync.sh` | 03:30 America/New_York |
| `openbrain-maya-gate` | `maya-gate.sh` | every 15 min |
| `openbrain-jt-sentinel` | `jt-sync-sentinel.sh` | 10:00 America/Los_Angeles |
| `openbrain-qbo-thursday-sync` | `qbo-thursday-sync.sh` | Thu 20:00 America/Chicago |
| `openbrain-wip-pack-thursday` | `wip-pack-thursday.sh` | 06:00 America/Chicago |
| **`openbrain-site-sweep`** | **`site-quality-sweep.mjs`** | **06:00 America/Chicago (new)** |

`alex-no-price-triage.mjs` is **already covered** — it is invoked from
`abc-nightly-sync.sh` (line 91) after the invoice ingest, not by its own timer.

**Still unscheduled — verify before adding, do not double-schedule:**

| Script | Note |
|---|---|
| `uptime-check.sh` | header says "no_agent cron" — may already be in a host **crontab** rather than systemd |
| `memsearch-nightly-cron.sh` | header says "invoked by cron" — same caveat |
| `openbrain-dev-tick@`, `openbrain-open-engine` | services exist with **no timer** — intentional (manually/queue triggered) or a gap; confirm on the host |

Confirming those requires reading the live host's `crontab -l` and
`systemctl list-timers`; adding units blindly risks running the same job twice.
