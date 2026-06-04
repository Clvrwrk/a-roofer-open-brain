# a-roofers-open-brain

> A property-first, era-aware persistent memory layer for a roofing company — with a 13-agent workforce as its interface.
>
> **The agents are the interface. The brain is the asset. The data is the product.**

Built and maintained by [Cleverwork](https://cleverwork.io). This repo is the deployable template a single roofing client's brain is provisioned from. Clone it, fill in `config/roofer.config.yaml`, run `scripts/new-client.sh`, and you have an isolated brain running on Supabase + containerized MCPs with Slack-native agents.

---

## Why this exists

The roofing trade is losing institutional knowledge for the third time in 30 years. The early-90s computing transition and the mid-2000s SaaS transition each stranded a generation of know-how on yellow pads and in retiring foremen's heads. The boomer/Gen-X retirement wave is the third. `a-roofers-open-brain` is the deliberate intervention: capture the knowledge **as the work happens**, stamp it with its era and the code in effect, bind it to the **property** it was performed on, and keep it reliable for 5+ years.

Roofing is unusually property-bound: every job happens at a parcel, in a jurisdiction, under a code version, with a manufacturer warranty and an inspector culture. So the **property is the primary key**, not the client. That one decision unlocks cross-client property history — the moat no competitor can buy.

## What you get

- **13 agents per client.** 5 vertical (client-facing in Slack) + 8 horizontal (infrastructure). See [`AGENTS.md`](AGENTS.md).
- **A property-first, era-aware schema** that extends the [OB1](https://natebjones.com) memory spine. See [`schemas/`](schemas/).
- **Roofer-native bridges** — AccuLynx-first, plus CompanyCam, QuickBooks, EagleView, StartInfinity. See [`integrations/bridges/`](integrations/bridges/).
- **The post-op debrief pipeline + EEAT flywheel + storm-response recipe.** See [`recipes/`](recipes/).
- **Lean governance baked in** — Six Sigma A3 with a 10x ROI gate, Auditor vs. Quality Control separation, a 5S Maintenance playbook. See [`proposals/`](proposals/) and [`standards/`](standards/).
- **A workspace front desk for agents** — Hermes/Maintenance keeps the repo map, import triage, naming conformance, and move manifests current so agents do not burn context on the wrong files. See [`agents/horizontal/maintenance/FRONT-DESK.md`](agents/horizontal/maintenance/FRONT-DESK.md).

## Quickstart

```bash
# 1. Clone
git clone <this-repo> a-roofers-open-brain && cd a-roofers-open-brain

# 2. Configure your company (the ONLY file most roofers edit)
cp config/roofer.config.example.yaml config/roofer.config.yaml
cp config/.env.example .env
$EDITOR config/roofer.config.yaml   # company, service area, AccuLynx, jurisdictions, manufacturers
$EDITOR .env                        # secrets (never commit this file)

# 3. Provision an isolated brain (Supabase project + schema + MCP containers + dashboard)
./scripts/new-client.sh

# 4. Verify end-to-end
./scripts/verify-deployment.sh
```

Full walkthrough: [`docs/01-onboard-a-roofer.md`](docs/01-onboard-a-roofer.md). Stuck? [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md). Customizing beyond the config file: [`docs/CUSTOMIZATION.md`](docs/CUSTOMIZATION.md).

## Repository layout

| Path | What lives here |
| --- | --- |
| [`docs/`](docs/) | Architecture brief, onboarding, debrief script, philosophy, model matrix, security, FAQ, troubleshooting, customization |
| [`schemas/`](schemas/) | `ob1-base/` (vendored OB1 spine, attributed) + `cleverwork-roofer/` (property-first SQL migrations) |
| [`agents/`](agents/) | `horizontal/` (8 infrastructure agents) + `vertical/` (5 roofer-facing agents) |
| [`skills/`](skills/) | `_template/`, `infranodus/` (cited), `ob1/` (cited), `cleverwork-roofer/` (originals) |
| [`integrations/bridges/`](integrations/bridges/) | Data adapters, AccuLynx-first |
| [`recipes/`](recipes/) | Post-op debrief, EEAT flywheel, storm-response, property + client onboarding |
| [`standards/`](standards/) | Quality Control's versioned work-product standards (incl. `design/` — the DESIGN.md design-token contract) |
| [`proposals/`](proposals/) | A3 templates + skill backlog (the 10x ROI gate) |
| [`server/`](server/) | Deno + MCP container on Hetzner MCP server + smoke tests |
| [`deployment/`](deployment/) | `remote/` (default: Supabase + Coolify) + `local/` (held in reserve) |
| [`scripts/`](scripts/) | `new-client.sh`, `verify-deployment.sh`, `kaizen-review.sh` |
| [`config/`](config/) | `roofer.config.yaml` + `brand/DESIGN.md` — the customization surface |
| `app/command-center/` | Planned production Astro SSR app home; see [`docs/22-gsd-app-transition-roadmap.md`](docs/22-gsd-app-transition-roadmap.md) |
| `imports/`, `private/` | Local ignored intake/workbench folders for raw copied projects and client-private files |

## Built on the shoulders of

- **OB1** (Nate B. Jones) — the persistent-memory spine. Schemas, MCP container pattern, recipes, guard rails. Nate gives away practical systems like this: <https://natebjones.com> · <https://substack.com/@natesnewsletter>.
- **Dynamous workshops** (Cole Medin) — the security + local-sovereignty layer (referenced, not redistributed; see [`LICENSE.md`](LICENSE.md)).
- **InfraNodus skills** — the cognition layer for the thinking agents (Auditor, QC, Innovator).
- **Andrej Karpathy's LLM Wiki** — the philosophical pattern: build the wiki once, incrementally; don't re-derive on every query.
- **DESIGN.md** (Google Labs) — the design-token format every visual asset follows. Spec vendored under `standards/design/vendor/` (Apache-2.0); linter run via `npx @google/design.md`. <https://github.com/google-labs-code/design.md>.
- **GSD Core** (open-gsd) — the phase loop used for the app transition and future extended projects: Discuss, Plan, Execute, Verify, Ship. Referenced as a toolchain, not vendored by default. <https://github.com/open-gsd/gsd-core>.

## License

**MIT** — see [`LICENSE`](LICENSE). Structured as a fork: all Cleverwork-original work is MIT (use it, fork it, ship it commercially). The four vendored OB1 base schemas keep their FSL-1.1-MIT notice and auto-convert to MIT on OB1's release schedule; Dynamous and InfraNodus are cited concepts only, re-expressed, never redistributed. Full breakdown in [`LICENSE.md`](LICENSE.md).

---

_Status: Scaffold (Phase 0). Generated 2026-05-29 from the v0.1 architecture brief. See [`docs/00-architecture-brief.md`](docs/00-architecture-brief.md)._
