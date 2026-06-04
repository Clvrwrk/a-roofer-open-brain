# @ob-ops — Skill Pack

> Default pack covers the daily rhythm of a residential/light-commercial roofer. Fleet, equipment-maintenance, and large-crew tools are dormant until the 10x ROI case is made for a specific client.
> Toggle in `config/roofer.config.yaml` under `agents.vertical.ops.skills`.

---

## Default Skill Pack (enabled by default)

| Skill ID | Purpose | Maps to |
|---|---|---|
| `scheduling` | Maintain the active job calendar; flag conflicts, capacity gaps, and weather windows from AccuLynx data | `skills/cleverwork-roofer/scheduling/` |
| `crews-subs` | Track crew and sub assignments per job; maintain capability atoms; flag certification gaps (fall protection, steep-slope, manufacturer install certs) | `skills/cleverwork-roofer/crews-subs/` |
| `daily-logs` | Atomize daily foreman logs from AccuLynx or Slack; produce per-job daily briefing for the morning digest | `skills/cleverwork-roofer/daily-logs/` |
| `materials` | Confirm materials ordered and delivery scheduled before install; track usage vs. order per job; flag dumpster logistics gaps | `skills/cleverwork-roofer/materials/` |
| `product-catalog-manager` | Propose vendor SKU/product equivalency matches, maintain catalog completeness, and route uncertain matches to human approval | `skills/cleverwork-roofer/product-catalog-manager/` |
| `tearoff-sequencing` | Generate tear-off and install sequencing plans accounting for weather exposure, dumpster capacity, jurisdiction requirements (ice-and-water shield, underlayment), and EagleView measurements | `skills/cleverwork-roofer/tearoff-sequencing/` |
| `safety` | Flag fall-protection plan gaps; capture safety incidents as atoms; escalate incidents immediately to Conductor → Chris | `skills/cleverwork-roofer/safety/` |
| `permits` | Track permit status and inspection scheduling per job; flag uninspected or unpermitted work; draft inspection request reminders | `skills/cleverwork-roofer/permits/` |

---

## Dormant Skills — Pending A3 Approval

| Skill ID | Purpose | A3 status | Activation condition |
|---|---|---|---|
| `fleet-tracking` | Track company vehicles: location, maintenance intervals, driver assignments, fuel log; flag overdue maintenance | Not yet filed | Client operates ≥4 company vehicles |
| `equipment-maintenance` | Maintain service schedules for owned equipment (lifts, generators, compressors, nail guns); flag overdue intervals | Not yet filed | Client owns ≥$50K in equipment requiring scheduled maintenance |
| `sub-compliance-tracking` | Track sub COIs, license expiration, W-9 status; flag expired docs before scheduling a sub on a job | Not yet filed | Client uses ≥3 recurring sub trades |
| `eagleview-auto-integration` | Auto-pull EagleView reports on job creation and attach measurements to materials order draft | Not yet filed | Client orders EagleView on ≥80% of new jobs |
| `weather-delay-logging` | Capture weather-delay atoms with NOAA source; link to job schedule impact; feed Innovator for schedule-buffer A3 | Not yet filed | Client loses ≥2 job-days per month to weather delays on average |
| `inspector-culture-db` | Build and maintain per-inspector notes (known preferences, common fail reasons, relationship atoms); surface before every inspection | Not yet filed | Client operates in ≥3 jurisdictions or has ≥2 years of inspection history in the brain |

---

## Skill Format Notes

Every skill in `skills/cleverwork-roofer/` ships with:
- `SKILL.md` — frontmatter + prompt/instructions (Cleverwork-original prose)
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "bound_agents": ["ops"], "a3_ref": null }`

The `safety` skill is mission-grade infrastructure (high-error-cost exemption per CONVENTIONS.md §10) and is not subject to the 10x ROI gate. It ships enabled by default with no override path.
