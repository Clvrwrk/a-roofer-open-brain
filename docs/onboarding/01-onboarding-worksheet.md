# Open Brain — Pre-Onboarding Worksheet

> Done-for-you setup • AM-guided • complete before brain provisioning  •  ~45–60 minutes, guided

Generated from `onboarding/intake-schema.yaml` (the single source of truth that also drives the Open Brain as a Service web wizard). Do not edit by hand — edit the schema and re-run `scripts/build-onboarding-pdf.py`.

_We never collect passwords or API keys here — Section 5 records access only._

## 1. Company profile

_The basics that identify your business across the brain and on your published EEAT content._

- **Legal company name**
  - `____________________`
- **DBA / how customers know you**
  - `____________________`
- **Contractor license #**
  - `____________________`
- **Main phone**
  - `____________________`
- **Website** _(optional)_
  - `____________________`
- **Primary contact (name)**
  - `____________________`
- **Primary contact (email)**
  - `____________________`
- **Primary contact (phone)** _(optional)_
  - `____________________`

## 2. Service area & jurisdictions

_Where you work. Each jurisdiction seeds a regulatory_snapshot (the code in effect) so atoms are era-stamped correctly._

- **Cities / counties you serve**
  - `____________________`
  - _List every market you pull permits in._
- **Jurisdictions & code**
  - | Jurisdiction (city/county) | Building dept / AHJ | Building code (e.g. IRC-2021 + amendments) | Wind zone (e.g. Vult 115 mph) | Notes (ice/water shield, radiant barrier, etc.) |
  - | --- | --- | --- | --- | --- |
  - _One row per permitting authority. We seed the building code in effect._

## 3. Manufacturers & certifications

_Your manufacturer certifications drive warranty registration and the EEAT cert badges on your site._

- **Manufacturer certifications**
  - | Manufacturer (GAF, Owens Corning, CertainTeed…) | Cert level (Master Elite, Platinum Preferred…) | Certification / contractor ID | Warranty portal URL |
  - | --- | --- | --- | --- |

## 4. Current systems inventory

_What you run today. This decides which bridges we wire and which the brain mirrors. GHL stays your front-of-funnel CRM; your production tool stays the during-job system, mirrored into the brain._

- **CRM / leadgen**
  - ☐ Go High Level  ☐ Other  ☐ None yet
- **Production / PM software**
  - ☐ AccuLynx  ☐ JobTread  ☐ Buildertrend  ☐ Other  ☐ None yet
- **Accounting**
  - ☐ QuickBooks Online  ☐ QuickBooks Desktop  ☐ Other  ☐ None
- **Field photos / documentation** _(optional)_
  - ☐ CompanyCam  ☐ Other  ☐ None
- **Aerial measurement / takeoff** _(optional)_
  - ☐ EagleView  ☐ Other  ☐ None
- **Email / docs**
  - ☐ Google Workspace  ☐ Microsoft 365  ☐ Other
- **Team chat (the brain talks here)**
  - ☐ Slack  ☐ Will set up Slack  ☐ Other
- **Meeting / call recording (for debriefs)** _(optional)_
  - ☐ Granola  ☐ Fireflies  ☐ None

## 5. Access & credentials checklist

_We DO NOT collect passwords or API keys on this worksheet. Here we record which systems we need access to, who owns each account, and how the key will be handed over securely (OAuth in-app, or an encrypted vault link). Keys move through the secure channel only — never email, never this PDF._

- **Access we'll need (record owner + handoff method only)**
  - | System | Account owner (name) | Handoff: OAuth / secure vault / admin-invite | Status (requested / received / verified) |
  - | --- | --- | --- | --- |

## 6. Agent scope (what goes live first)

_We start small (80/20): the agents that cover the biggest pain first, then add via the 10x ROI gate. For most roofers that's Operations + Sales. The infrastructure agents (Capture, Conductor, Historian, Auditor) are always on._

- **Vertical agents to launch first**
  - ☐ @ob-ops  ☐ @ob-sales  ☐ @ob-accounting  ☐ @ob-marketing  ☐ @ob-exec
- **The #1 workflow you want handled first**
  - `____________________`
  - _e.g. 'storm canvass → inspection → claim → supplement', or 'daily logs + scheduling'._

## 7. Consent decisions

_These set how your brain shares and publishes. All are opt-in; opting out never costs you your own brain._

- **Cross-client property history — share your NON-trade-competitive property facts with other Cleverwork clients in different trades (and gain access to theirs)?**
  - ☐ Yes   ☐ No
  - _A roofer never shares with another roofer. A remodeler on the same house later could see your warranty/inspector notes — and you see theirs._
- **Trades to NEVER share with** _(optional)_
  - `____________________`
- **Consent to record post-op debriefs (PM + Foreman + customer) for atomization?**
  - ☐ Yes   ☐ No
- **Default: allow consented customer stories to be published to your website as EEAT content (each piece still gets one-click approval)?**
  - ☐ Yes   ☐ No

## 8. People & roles

_Who the brain works with. Each named teammate can get a Slack seat to mention the agents; the approver signs off on published content._

- **Content / publication approver (name)**
  - `____________________`
- **Approver (email)**
  - `____________________`
- **Team members who'll use the agents**
  - | Name | Email | Role (owner, PM, estimator, foreman, office…) | Slack seat? (Y/N) |
  - | --- | --- | --- | --- |
- **Who joins post-op debriefs** _(optional)_
  - | Role (PM / Foreman / Customer decision-maker) | Default person (if standing) |
  - | --- | --- |

## 9. Goals & week-0 baseline

_What 'working' means for you, and the starting numbers we measure against. This is how we prove the brain earned its keep (see the validation doc)._

- **Your top 3 outcomes from this engagement**
  - `____________________`
- **Week-0 baseline (today's reality, your best estimate)**
  - | Task / workflow | Human hours / week | Rough error/rework rate | Cost note (loaded rate, cost of an error) |
  - | --- | --- | --- | --- |

## 10. Expectations & support

_How we work together. This is a done-for-you service: Cleverwork configures, runs, and supports the brain; you own your business-system licenses and provide access._

- **I understand the support model: Conductor (the agent front-desk) handles most requests in Slack; Sev-1 issues page a human immediately; Sev-2 same business day. (see Client Support doc)**
  - ☐ Yes   ☐ No
- **I understand Cleverwork owns what it runs (brain, agents, dashboard); we own our tool licenses (GHL, AccuLynx, etc.) and will provide/maintain access.**
  - ☐ Yes   ☐ No
- **Your business hours / timezone** _(optional)_
  - `____________________`
- **Who we call for an urgent business decision**
  - `____________________`

## 11. Sign-offs

_Authorizations that let us proceed. Digital signatures are captured in the app; on paper, sign and date._

- **I authorize Cleverwork to provision and operate a dedicated, isolated brain for our company and to process our business data for the services described.**
  - `____________________`
- **I consent to debrief recording as configured in Section 7.**
  - `____________________`
- **My cross-client sharing choice in Section 7 is correct and authorized.**
  - `____________________`
- **Signed (name & title)**
  - `____________________`
- **Date**
  - `____________________`
