# @ob-exec — Skill Pack

> Default pack covers the four KPI-and-dashboard capabilities that every roofer owner benefits from regardless of company size. Strategy and M&A skills are dormant; they require a client at the scale where those questions are live.
> Toggle in `config/roofer.config.yaml` under `agents.vertical.exec.skills`.

---

## Default Skill Pack (enabled by default)

| Skill ID | Purpose | Maps to |
|---|---|---|
| `dashboards` | Produce rolling financial dashboards (revenue, margin, cash flow, job-type mix) sourced from QuickBooks + AccuLynx + insurance_claim atoms | `skills/cleverwork-roofer/dashboards/` |
| `kpi-trees` | Calculate and publish the three-branch KPI tree (revenue, insurance, operations) with full atom citation and calculation method per node | `skills/cleverwork-roofer/kpi-trees/` |
| `capacity-planning` | Calculate forward-looking schedule load, identify hiring signals, model storm-surge capacity gaps | `skills/cleverwork-roofer/capacity-planning/` |
| `hiring` | Produce hiring-intent assessments and job description drafts when the capacity signal fires; source required skill profile from crew-capability atoms | `skills/cleverwork-roofer/hiring/` |

---

## Dormant Skills — Pending A3 Approval

| Skill ID | Purpose | A3 status | Activation condition |
|---|---|---|---|
| `strategy` | Produce annual business reviews, market opportunity analyses, and competitive-position assessments for owner-level strategic planning | Not yet filed | Client has ≥12 months of operational atoms in the brain; owner actively uses the brain for planning |
| `benchmarking` | Compare the client's KPI tree against regional industry benchmarks (via Researcher); surface where the client is above or below industry averages | Not yet filed | Reliable regional benchmarking data available via Researcher integrations (NRCA, RoofersCoffeeShop, etc.) |
| `multi-entity-roll-up` | Aggregate KPI trees across multiple legal entities or business units into a consolidated executive view | Not yet filed | Client operates ≥2 legal entities or business units under common ownership |
| `ma-readiness` | Produce a structured M&A readiness assessment: normalized EBITDA, key-person dependency risk, customer concentration, IP assets (certifications, warranties, EEAT authority), and brain-asset valuation | Not yet filed | Owner explicitly indicates acquisition or sale intent |
| `insurance-roi-analysis` | Calculate the full ROI of the insurance-job channel: average job margin net of claim-handling overhead, supplement recovery efficiency, carrier portfolio diversification | Not yet filed | Client has ≥18 months of closed insurance jobs with complete financial atoms |
| `labor-cost-analytics` | Drill into crew labor cost per job type, per crew, and per market condition; identify highest-margin crew configurations | Not yet filed | Client has ≥2 crews and ≥12 months of crew-utilization atoms |

---

## Skill Format Notes

Every skill in `skills/cleverwork-roofer/` ships with:
- `SKILL.md` — frontmatter + prompt/instructions (Cleverwork-original prose)
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "bound_agents": ["exec"], "a3_ref": null }`

The `kpi-trees` skill is designed as a composable tree: each KPI node is a callable sub-unit. The owner can ask for the full tree or a single branch. This makes the skill useful at any company size — a two-truck roofer may only care about the revenue branch and the insurance branch; a five-crew operation runs all three.

KPI outputs are `inference`-tier by default because they involve calculated aggregations. They are clearly labeled as calculated; the source atoms (QuickBooks actuals, AccuLynx job data, insurance_claim records) are cited inline so the owner can trace any number back to its origin. Promotion to `instruction` happens after the owner confirms the calculation methodology is correct for their business — this confirmation is a one-time `instruction`-tier setup atom per KPI node, not a per-report confirmation.
