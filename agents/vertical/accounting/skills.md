# @ob-accounting — Skill Pack

> Default pack is intentionally small (80/20 rule). A client running 20 residential insurance jobs per year gets more value from these 7 skills done well than from 20 skills done poorly.
> Dormant skills require an approved A3 with ≥10x ROI before activation.
> Toggle in `config/roofer.config.yaml` under `agents.vertical.accounting.skills`.

---

## Default Skill Pack (enabled by default)

| Skill ID | Purpose | Maps to |
|---|---|---|
| `invoicing` | Generate progress and final invoices from AccuLynx job phase data; flag uninvoiced milestones | `skills/cleverwork-roofer/invoicing/` |
| `ar-aging` | Produce AR aging reports (15/30/60 day buckets); draft collection follow-up for overdue balances | `skills/cleverwork-roofer/ar-aging/` |
| `job-costing` | Track budgeted vs. actual costs (materials, labor, subs, overhead) per job; flag overruns before close | `skills/cleverwork-roofer/job-costing/` |
| `change-orders` | Register approved change orders against job; reconcile AccuLynx data with QuickBooks; flag unapproved performed work | `skills/cleverwork-roofer/change-orders/` |
| `insurance-supplement-accounting` | Track supplement submissions, approvals, partial approvals, and supplemented revenue per insurance_claim record | `skills/cleverwork-roofer/insurance-supplement-accounting/` |
| `depreciation-recovery-tracking` | Monitor ACV holdback, completion-submission date, carrier release window, and recovered vs. outstanding depreciation per job | `skills/cleverwork-roofer/depreciation-recovery-tracking/` |
| `financial-close` | Produce final job-costing summary at closeout: budget vs. actual, gross margin, supplement revenue, uncaptured depreciation | `skills/cleverwork-roofer/financial-close/` |
| `vendor-invoice-credit-memo-audit` | Compare vendor invoice lines against approved negotiated price agreements; draft internal credit memo request packets for Lucinda review; track follow-up | `skills/cleverwork-roofer/vendor-invoice-credit-memo-audit/` |

---

## Dormant Skills — Pending A3 Approval

| Skill ID | Purpose | A3 status | Activation condition |
|---|---|---|---|
| `draw-schedule-automation` | Auto-generate draw schedules from contract terms and push to AccuLynx; surface draw milestones before they are missed | Not yet filed | Client runs ≥3 concurrent jobs with multi-draw contracts |
| `carrier-payment-analytics` | Aggregate carrier payment timing across jobs; surface slowest carriers and supplement acceptance rates; feed adjuster strategy atoms to `@ob-sales` | Not yet filed | Client has ≥12 months of closed insurance jobs in brain |
| `quickbooks-desktop-sync` | Two-way sync with QuickBooks Desktop (on-prem, Tier 3 bridge) | Not yet filed | Client uses QB Desktop rather than QBO |
| `lien-waiver-tracking` | Track conditional and unconditional lien waivers by job and payment; flag missing waivers at close | Not yet filed | Client operates in states with strict lien-waiver requirements (TX, FL, CO) |
| `subcontractor-1099-prep` | Aggregate sub payments per calendar year; flag subs approaching 1099 thresholds; produce year-end 1099 prep packet | Not yet filed | Client uses 1+ recurring subs paid over $600/year |
| `sales-tax-by-jurisdiction` | Calculate sales tax on materials and labor by jurisdiction (rules vary by state and county for roofing work) | Not yet filed | Client operates in multiple jurisdictions with differing tax treatment of roofing work |

---

## Skill Format Notes

Every skill in `skills/cleverwork-roofer/` ships with:
- `SKILL.md` — frontmatter + prompt/instructions (Cleverwork-original prose)
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "bound_agents": ["accounting"], "a3_ref": null }`

Skills marked `enabled: false` in `roofer.config.yaml` are loaded into the agent's skill index but never invoked. The Innovator agent monitors dormant-skill activation patterns across clients and files A3s when evidence supports a 10x ROI case.
