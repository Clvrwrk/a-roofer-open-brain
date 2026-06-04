# Proposals — Cleverwork Open Brain

> This folder is the governance gate for the brain's evolution. Every new agent skill, every new integration, and every material change to an existing workflow begins here as an A3 proposal.

---

## The A3 process

The A3 is a one-page proposal format borrowed from Toyota's lean manufacturing tradition. The name refers to the paper size (A3 = 11×17 inches) — a discipline in itself: if your proposal requires more than one page, you do not yet understand the problem well enough to solve it.

Cleverwork's A3 includes a hard **10x ROI gate**: the proposed skill or workflow change must show a ratio of current monthly human cost to projected new monthly agent cost (plus build cost amortized over 12 months) of at least 10. If the math does not reach 10, the proposal should not be approved. If the human is cheaper, the human remains.

### The math formula

```
X = Total monthly cost in current state (human time × loaded hourly rate + error cost)
Y = Total monthly cost in new state (agent operating cost + required human review time × loaded rate)
Z = One-time build cost (engineering hours + tooling)

ROI multiplier = X / (Y + Z/12)

Must be ≥ 10 to proceed.
```

### Exempt from the 10x gate

Two categories bypass the gate:

1. **Mission-grade infrastructure.** The post-op debrief pipeline, era-stamped atoms, property data model, EEAT flywheel, client onboarding wizard. These are how the brain works — not optimizations. They are foundational to the 5-year persistence promise.

2. **High-error-cost tasks.** Safety, legal, regulatory compliance, financial-close tasks where the *cost of getting it wrong* carries the ROI math even when time savings alone do not reach 10x. The math must still be shown — but the denominator includes error-avoidance value.

---

## A3 lifecycle

Every A3 proposal carries a `status` field with one of four values:

| Status | Meaning |
|---|---|
| `pending` | Submitted; awaiting Chris + AM review. |
| `approved` | Approved; added to build backlog. Build-by date set. |
| `killed` | Rejected with documented reason. Archived; not deleted. |
| `deferred` | Held; `revisit_at` date set. Conductor brings it back. |

Killed proposals are archived in `proposals/archive/`. They are never deleted. Conditions change: a model price drop, a volume increase, or a new error-cost event can resurrect a killed proposal. Innovator's quarterly review surfaces killed proposals when conditions match the original kill reason's inverse.

Deferred proposals have a `revisit_at` date. Conductor adds this date to its tracking calendar. On the revisit date, Conductor DMs Chris + AM: "[Proposal name] deferred on [date] with condition: [condition]. Condition check: [current state]."

---

## Proposal file naming

Proposals are named by date and skill name:

```
YYYY-MM-DD-[skill-name].md
```

Examples:
- `2026-06-10-storm-claim-supplement.md`
- `2026-08-15-eagleview-auto-measure.md`
- `2026-11-01-qb-ar-aging-alert.md`

The `_a3-template.md` and `_playbook-evolution-template.md` files in this folder are templates, not proposals. The `_backlog.md` file is the single source of truth for all approved proposals awaiting build.

---

## Proposal authorship

Proposals may be authored by:

- **Innovator** (primary source — scouts patterns from debrief atoms, Auditor rejects, and Conductor's manual-work flags)
- **Chris** (strategic proposals not yet surfaced by Innovator)
- **Account Manager** (client-specific observations)

Regardless of author, every proposal must fill in all fields of the A3 template and must include measured (not estimated) baselines wherever the brain has relevant atoms. The Innovator never invents numbers — it cites atoms.

---

## Templates in this folder

| File | Purpose |
|---|---|
| [`_a3-template.md`](./_a3-template.md) | Full A3 for new skills and integrations |
| [`_playbook-evolution-template.md`](./_playbook-evolution-template.md) | A3-lite for Maintenance playbook changes |
| [`_backlog.md`](./_backlog.md) | Running list of approved proposals awaiting build |

---

## Proposals index

| Proposal | Status | Author | Date | ROI |
|---|---|---|---|---|
| [storm-claim-supplement skill](./2026-06-10-storm-claim-supplement.md) | `approved` | Innovator | 2026-06-10 | 18.4x |
| [eagleview-auto-measure integration](./2026-08-20-eagleview-auto-measure.md) | `deferred` | Innovator | 2026-08-20 | 7.2x (below gate) |
| [dos-paper-traveler bridge](./2026-07-01-dos-paper-traveler-bridge.md) | `killed` | Chris | 2026-07-01 | — |
