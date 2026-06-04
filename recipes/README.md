# Recipes — Cleverwork Open Brain

> A recipe is a **named, repeatable SOP** that a specific set of agents and skills executes to accomplish a well-defined outcome for a roofing client. Recipes are the operational layer between raw skills and the daily work of running a roofing company.

---

## What makes something a recipe (not a skill)?

A **skill** is a prompt-plus-context bundle owned by a single agent.
A **recipe** is an end-to-end workflow that:

1. Spans two or more agents (or two or more human + agent handoffs).
2. Has a defined trigger, a defined terminal state, and at least one quality gate (Auditor or human approval).
3. Can be parameterized through `config/roofer.config.yaml` without modifying the recipe itself.

Every recipe folder is a leaf folder and ships exactly one `README.md` (the SOP) plus any supporting config examples.

---

## Recipe index

| Recipe | Trigger | Primary agents | Status |
|---|---|---|---|
| [post-op-debrief](./post-op-debrief/README.md) | `job.closed` webhook from PM tool | Conductor, Capture, QC, Marketing, Innovator | v1 |
| [eeat-flywheel](./eeat-flywheel/README.md) | Weekly cron + soft-atom queue | Auditor, Marketing, Conductor | v1 |
| [storm-response](./storm-response/README.md) | Storm event detection / canvass trigger | Conductor, Sales, Ops, Accounting, Capture | v1 |
| [property-onboarding](./property-onboarding/README.md) | New address enters the brain | Capture, Historian, Conductor | v1 |
| [client-onboarding-wizard](./client-onboarding-wizard/README.md) | New client engagement signed | Conductor + human (Cleverwork AM) | v1 |

---

## Recipe conventions

- **Config-driven.** No recipe hard-codes a company name, tool URL, or model name. All customizable values live in `config/roofer.config.yaml` or the recipe's own `*.config.example.yaml`.
- **Auditor gates.** Every artifact that leaves a recipe (a published page, a submitted claim, a sent message to a homeowner) passes through the Auditor before delivery.
- **Atom outputs documented.** Each recipe's README states which atom types it writes, which fields it populates, and the `trust_tier` of those atoms.
- **Versioning.** When a recipe SOP changes materially (step added, gate changed, participant role changed), the README gets a `## Changelog` entry with date + summary. The QC agent owns recipe versioning; the Maintenance agent never modifies recipe text.

---

## Adding a new recipe

1. An Innovator A3 (`proposals/`) must be approved first.
2. Create the folder under `recipes/[kebab-case-name]/`.
3. Ship `README.md` with: trigger, participants, step-by-step SOP, atom outputs, quality gates, config keys.
4. If the recipe requires config, ship `[recipe-name].config.example.yaml` in the same folder.
5. Update this index table.
