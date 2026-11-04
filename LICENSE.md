# License & third-party notices

**`a-roofers-open-brain` is released under the MIT License — see [`LICENSE`](LICENSE).**

This repository is structured as an **open-source fork/derivative**. That means: every line of Cleverwork-original work is MIT-licensed, and the handful of files we vendored from an upstream project keep that project's own license — exactly as a responsible fork preserves upstream `LICENSE` files. The table below is the complete picture.

## How the licensing maps to the sources

| Component | In this repo | License of record | Notes |
| --- | --- | --- | --- |
| **Cleverwork-original work** — `schemas/cleverwork-roofer/`, `agents/`, `skills/cleverwork-roofer/`, `recipes/`, `standards/`, `proposals/`, `server/`, `scripts/`, `config/`, `integrations/bridges/`, and all Cleverwork-authored docs | the whole repo except the rows below | **MIT** (`LICENSE`) | © 2026 Cleverwork. Free to use, copy, modify, distribute, sublicense. |
| **OB1 base schemas** (Nate B. Jones) | `schemas/ob1-base/enhanced-thoughts.sql`, `provenance-chains.sql`, `typed-reasoning-edges.sql`, `agent-memory.sql` | **FSL-1.1-MIT** (upstream) | Vendored as-is with header comments preserved. The **Functional Source License converts to MIT two years after each OB1 release**, so these files become MIT on that schedule. Our re-expressed bootstrap `00-core-thoughts.sql` is Cleverwork-original → MIT. Attribution in `schemas/ob1-base/ATTRIBUTION.md`. |
| **DESIGN.md format spec** (Google Labs) | *no files* (the vendored copy at `standards/design/vendor/design.md/` was removed on 2026-11-04) | n/a | The brain no longer carries or lints a DESIGN.md file; the Pro Exteriors design system moved to https://ds.proexteriorsus.net (`@proexteriors/ds` in Clvrwrk/CRM_PWA). Our design standard (`standards/design/v1.md`, now a pointer) and brand file (`config/brand/DESIGN.md`, now a pointer) are Cleverwork-original → MIT. |
| **Dynamous workshops** (Cole Medin) | *no files* — concepts only (security checklist, going-local, local stack) | n/a | We **did not copy** any Dynamous file. Our security/local docs (`docs/04`, `docs/06`, `deployment/local/`) are Cleverwork-original re-expressions → **MIT** — and so carry no Dynamous license obligation. Cited as inspiration. |
| **InfraNodus skills** | `skills/infranodus/*` — re-expressed, not copied | n/a | Prompt *patterns* re-authored in our own words → **MIT**, with attribution to InfraNodus in each `SKILL.md`. |
| **Karpathy LLM-Wiki gist** | *no files* — conceptual citation in `docs/03-philosophy.md` | n/a | Pattern citation only; no text copied. |

## What "fork-compatible MIT" means here, plainly

- **You can fork, use commercially, and redistribute this repo under MIT.** That covers everything Cleverwork wrote — which is the vast majority of the code and all of the roofer-specific value.
- The only files **not** yet freely MIT are the four vendored OB1 base schemas, which stay under OB1's FSL-1.1-MIT until their automatic MIT conversion. We cannot retroactively MIT-license another author's still-FSL code — but a fork doesn't need to: those files self-convert, and our own bootstrap already provides an MIT path. If you want a 100%-MIT tree today, swap the four vendored files for the equivalent setup from OB1's public getting-started guide.
- Because we never redistributed any Dynamous or InfraNodus *files*, there is no proprietary obligation riding along — our expressions of those ideas are MIT.

## Attribution (please keep it)

This project stands on **OB1** by Nate B. Jones (<https://natebjones.com> · <https://substack.com/@natesnewsletter>), **Cole Medin's Dynamous** community work, **InfraNodus**, and **Andrej Karpathy's** LLM-Wiki proposal. If you fork, keep the attributions in `schemas/ob1-base/ATTRIBUTION.md` and the InfraNodus/OB1 `SKILL.md` notes.
