# Standards — Cleverwork Open Brain

> Standards are the **versioned rubrics that Auditor enforces on every work product** produced by a vertical agent. Quality Control owns them. Auditor consumes them. No other agent modifies them.

---

## The separation principle

The Auditor and Quality Control separation is intentional and non-negotiable:

- **Auditor** enforces the current standard on each individual work product, in real time. Auditor does not change the standard. Auditor's job is consistent, unambiguous application.
- **Quality Control** sets and changes standards, based on evidence — specifically, on patterns of Auditor rejects and post-op debrief failures appearing 3+ times in a rolling 90-day window. QC runs DMAIC; QC writes or revises the standard; QC does not audit individual work products.

Mixing these functions corrupts both: an Auditor that can change its own standard will drift toward leniency. A QC that also audits individual products loses the objectivity to see cross-product patterns.

---

## How standards are versioned

Each standard lives in its domain subfolder as `vN.md`:

```
standards/
  ops/
    v1.md       ← current active version
    v1.1.md     ← QC revision once a pattern triggers DMAIC
    archive/
      v1.0.md   ← previous version, retained for provenance
  sales/
    v1.md
  marketing/
    v1.md
  accounting/
    v1.md
```

Version numbering:
- **Minor version** (v1.0 → v1.1): a single rule added, tightened, or relaxed based on a completed DMAIC cycle. Requires QC's written rationale attached to the new version.
- **Major version** (v1 → v2): a structural overhaul of the rubric (different work-product categories, different pass/fail logic). Requires Chris's explicit approval.

When QC releases a new version:
1. The new file is written in the domain subfolder.
2. The previous version is moved to `archive/` with its original filename.
3. A changelog entry is appended to the new file (see format below).
4. Auditor is notified (via the brain's agent-messaging layer) of the new active standard and its effective date.

---

## How Auditor consumes standards

Auditor's SKILL.md references the standards path for each domain. At audit time, Auditor:

1. Identifies the work product's domain (ops, sales, marketing, accounting) from the producing agent's context.
2. Reads the current active `vN.md` for that domain.
3. Evaluates the work product against each pass/fail check in the rubric.
4. Returns `pass`, `fail`, or `escalate` with a structured explanation referencing the specific rule number that failed.

Auditor never interpolates or improvises the standard. If a work product has characteristics not covered by the current rubric, Auditor returns `escalate` — not a silent pass.

---

## Who can change a standard

Only **Quality Control** may write or revise a standard. The workflow:

1. QC identifies a failure pattern (3+ occurrences of the same failure mode in 90 days, per the DMAIC trigger condition from `docs/00-architecture-brief.md` §4.2).
2. QC runs DMAIC: Define → Measure → Analyze → Improve → Control.
3. QC drafts the proposed standard revision and posts it to `#cleverwork-internal` with the DMAIC summary.
4. Chris + AM review. Approve / defer / kill.
5. If approved: QC writes the new version file. Adds changelog entry. Notifies Auditor.

No other agent, no recipe, and no skill may modify a standards file.

---

## Domain index

| Domain | Active version | Covers |
|---|---|---|
| [ops](./ops/v1.md) | v1 | Safety fields, permit records, sequencing, daily logs, close-out documentation |
| [sales](./sales/v1.md) | v1 | Estimate completeness, margin floor, scope clarity, proposal structure |
| [marketing](./marketing/v1.md) | v1 | PII-clean, consent recorded, schema.org markup present, no fabricated content |
| [accounting](./accounting/v1.md) | v1 | Supplement math, change-order authorization, invoice completeness, ACV/RCV reconciliation |
| [design](./design/v1.md) | v1 | DESIGN.md lints clean, WCAG AA, five-color role discipline, token-driven (no off-system values), Property-Card mono lock |
| [platform](./platform/v1.md) | v1 | Uptime ≥99.5%, incident ack times, backups + restore test, rebuild RTO/RPO, deploy + security posture, Historian/Researcher boundary |

---

## Standard file format

Every `vN.md` standard file follows this structure:

```markdown
# Standard: [Domain] Work Products — v[N]
QC Owner: Quality Control agent
Effective date: YYYY-MM-DD
Supersedes: v[N-1] (or "none" for v1)
Auditor reference key: standards/[domain]/v[N].md

## Scope
[Which work products this standard covers]

## Pass/Fail Checks
### [Work product type]
- [ ] CHECK-001: [Description] — REQUIRED | CONDITIONAL | RECOMMENDED
- [ ] CHECK-002: ...

## Escalation conditions
[When Auditor should escalate instead of pass/fail]

## Changelog
| Date | Change | DMAIC ref |
|---|---|---|
```

The `REQUIRED` / `CONDITIONAL` / `RECOMMENDED` distinction:
- **REQUIRED:** Absence = automatic fail. No exceptions.
- **CONDITIONAL:** Required only when a specific condition is met (e.g. CHECK-009: permit reference required IF `jurisdiction.permit_required_for_reroof = true`).
- **RECOMMENDED:** Best practice. Absence is flagged in the Auditor's output but does not fail the artifact.
