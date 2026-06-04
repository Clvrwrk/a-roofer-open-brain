# @ob-sales — Skill Pack

> Default pack assumes a residential roofer who does both retail and insurance work. Storm-canvassing is enabled by default because the majority of residential roofers in hail-prone markets run it. Cash-pay-only or flat-commercial-focused roofers may disable storm-canvassing and insurance-claims.
> Toggle in `config/roofer.config.yaml` under `agents.vertical.sales.skills`.

---

## Default Skill Pack (enabled by default)

| Skill ID | Purpose | Maps to |
|---|---|---|
| `leads` | Capture leads from all sources as atoms against the property record; score by roof age, policy type, carrier, and referral source; surface the qualified list daily | `skills/cleverwork-roofer/leads/` |
| `storm-canvassing` | On storm events, generate prioritized canvassing lists from NOAA/NWS data + Historian property history; write storm-event atoms to the brain | `skills/cleverwork-roofer/storm-canvassing/` |
| `estimating` | Generate estimates from EagleView + current Xactimate regional pricing; apply standard waste factor and margin; flag supplement-prone line items by carrier | `skills/cleverwork-roofer/estimating/` |
| `insurance-claims` | Own the full claim lifecycle: filing support, claim atoms, adjuster-meeting prep, supplement identification and writing, scope dispute assessment | `skills/cleverwork-roofer/insurance-claims/` |
| `proposals` | Draft customer-facing proposals from estimate data; include manufacturer warranty terms (GAF/OC/CertainTeed per job); apply client's standard terms from config | `skills/cleverwork-roofer/proposals/` |
| `follow-up` | Generate follow-up cadence reminders for stalled proposals; produce win/loss atoms on close; track referral source per won job | `skills/cleverwork-roofer/follow-up/` |

---

## Dormant Skills — Pending A3 Approval

| Skill ID | Purpose | A3 status | Activation condition |
|---|---|---|---|
| `public-adjuster-referral` | Identify claims where denial value justifies public adjuster referral; produce a structured handoff packet for the PA | Not yet filed | Client has ≥3 denied supplement claims per quarter exceeding threshold |
| `carrier-supplement-intelligence` | Accumulate per-carrier supplement acceptance rate, common denial reasons, and successful counter-arguments; auto-surface in supplement drafts | Not yet filed | Client has ≥12 months of closed insurance jobs in brain |
| `manufacturer-cert-selling` | Surface applicable GAF System Plus, WeatherStopper, or Golden Pledge warranty tier options at proposal time; include warranty registration workflow | Not yet filed | Client is GAF Master Elite or OC Platinum Preferred |
| `referral-campaign-feed` | Aggregate referral-network atoms and produce a structured referral-outreach list for `@ob-marketing`; identify top referrers for recognition | Not yet filed | Client has ≥6 months of win/loss atoms and referral-source data |
| `commercial-bid-package` | Generate commercial roofing bid packages (spec compliance, addenda tracking, bond requirements) for GC-submitted bids | Not yet filed | Client actively pursues commercial GC-bid work |
| `xactimate-line-item-library` | Build and maintain a client-specific library of successfully supplemented Xactimate line items with supporting code citations and carrier-acceptance notes | Not yet filed | Client closes ≥5 insurance jobs per month |

---

## Skill Format Notes

Every skill in `skills/cleverwork-roofer/` ships with:
- `SKILL.md` — frontmatter + prompt/instructions (Cleverwork-original prose)
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "bound_agents": ["sales"], "a3_ref": null }`

The `insurance-claims` skill writes atoms to the `insurance_claim` table. The `storm-canvassing` skill is the only sales skill that calls Researcher by default on trigger (storm event detection). All other Researcher calls in sales are on-demand when the rep explicitly needs external data (carrier policy language, current pricing).
