# 128 · hr. workspace design: people, pay, offices & assets

**Status:** design · 2026-10-21 · owner: Chris Hussey
**Canvas:** [People & Payroll Workspace](https://claude.ai/artifact/K6pnJN7XMnDWaJuHUC4SnS), 63 artboards
**Platform context:** [docs/127](127-platform-surfaces-and-sitemap.md)

`hr.proexteriorsus.net` is the full HR suite: people and payroll through the PEO, 1099 contractors and crews, the redesigned title/seat/access model, office management, and company assets. It follows the Command Center design system (navy rail, Inter, status pills, 10-row disclosure UX-06, attachment intake UX-11, confirmations that state effect and non-effects CMP-08).

## Key decisions

1. **Worker type lives on the person** (W-2 via PEO · 1099 individual · crew/sub company). It decides payroll vs. Accounts Payable, the paperwork packet and year-end forms. A six-question classification check runs before anyone is added.
2. **The PEO is co-employer, not a mirror.** Sensitive data (SSN, bank, W-4 elections) is entered by the employee in the PEO portal and never stored in hr. hr prepares pay periods, commissions and changes; the PEO calculates and pays; hr reconciles the PEO invoice and splits it by PE office.
3. **One job = four separate answers** (canvas 6.1): **title** (catalog: pay band, overtime status, workers' comp code, PEO job code, allowed worker types), **seat** (office, reports-to, cost split), **access role + office scope**, and optional **responsibilities**. A title suggests access; it never grants it. Admin is an access role, ending duplicate admin seats.
4. **Every change is effective-dated with a 10–500 character reason** and kept in history; nothing is deleted (UX-10).
5. **Offices and assets are HR records.** Leases, licensing, utilities, maintenance, security codes/SOPs, Google Business Profile address truth, vehicles, tools, equipment and storm housing all live in hr. Departures and title changes flow into them automatically (alarm codes, keys, assets to return, licenses tied to a person).
6. **QuickBooks is read-only** (hard rule 13): rent, contractor payments, licenses and bookings are approved in hr and paid by Accounting.

## Screen inventory (canvas rows)

| Row | Screens |
|---|---|
| 1 People | Home (Needs you), Directory, Person profile |
| 2 Hire & onboard | Classify worker, Job/title/pay, Onboarding tracker, Send to PEO, Mobile new-hire packet |
| 3 Payroll | Pay period prep, Commissions, PEO invoice reconciliation |
| 4 Contractors | Contractors & crews, Approve a payment, Year-end 1099s |
| 5 Time off & compliance | Time off, Compliance center, Safety & conduct, Offboarding, Mobile time-off request |
| 6 Titles & access | Model, Title catalog, Title editor, Change someone's title, Access roles, Org chart, Legacy title cleanup |
| 7 Offices | Offices home, Office profile, Open an office, Opening tracker, Office documents, Move or close, Mobile close-out walkthrough |
| 8 Running an office | Leases & rent, Licensing, Utilities, Maintenance, Security & alarm SOPs, Local inventory (material stock moves to pm), Google Business Profile & listings |
| 9 Platform map | Sitemap, one job across surfaces, ownership, app. portal, shared shell |
| 10 Assets | Asset register, Vehicle profile, Tools & equipment checkout, Storm housing board, House a storm team, Mobile pre-trip check |

## Screens still needed to complete the design

**People & hiring.** Profile tabs beyond Overview (Job & pay, Documents, History); I-9 Section 2 and E-Verify screens; document request flow; Directory "More filters" panel; wizard step 3 (paperwork packet builder); 1099 and crew variants of the add-person wizard; the "mixed answers → counsel" classification state; offer-letter templates.

**Payroll & contractors.** PEO preview/approval after submit; off-cycle runs (bonus, final pay); commission plan editor and chargeback dispute; individual contractor profile; W-9 request and TIN-mismatch flow; COI renewal request; disputed invoice line; 1099 corrections.

**Time off, compliance, safety, offboarding.** Policy and holiday editors; balance adjustments; compliance requirement setup and audit export; OSHA 300/300A log; conduct write-up with acknowledgment; review cycles; involuntary termination and contractor-ending variants of offboarding.

**Titles & access.** Create a title; access-role editor with capability toggles and a "who gains/loses what" preview; headcount/seat plan editor; all-office org chart with drag-to-reassign confirmation.

**Offices & assets.** Office profile tabs; lease abstraction (upload → confirm extracted dates); virtual-office profile; rent approval confirmation; license renewal submission; start/stop a utility; new work order; SOP editor and acknowledgment; add/remove alarm code; Google holiday-hours editor; add-asset form; trailer and equipment profiles with inspection logs; drone pilot certifications; rental unit profile; asset disposal/sale; storm deployment setup (roster, cost center, dates).

**Across the app.** Empty, loading, error and permission-denied states (CMP-07); phone layouts for the desktop screens; dark mode; global search results and notifications panel; every `admin.`, `pm.` and `app.` screen beyond the portal home.

## Assumptions to confirm

PEO name and import method · 2026 1099-NEC threshold ($2,000) and filing dates with the CPA · state rules cited on screens (Colorado paid sick leave and final pay, I-9 timing, Kansas and Oklahoma contractor registration, Florida certified roofing license, Google storefront eligibility) · workers' comp class codes per title.
