---
okf_version: "0.1"
type: knowledge-bundle
title: Open Knowledge Format (OKF)
description: Vendored OKF v0.1 spec, reference agent, sample bundles, and tooling from Google knowledge-catalog.
resource: /docs/knowledge-base/OKF/
tags: [okf, knowledge-format, markdown, yaml-frontmatter]
timestamp: "2026-06-28"
upstream_commit: "d44368c15e38e7c92481c5992e4f9b421a801d"
---

# Open Knowledge Format (OKF)

Vendored upstream bundle. OKF is the durable knowledge layer for this repo's `docs/knowledge-base/` — plain markdown + YAML frontmatter that any agent or tool can read without guessing.

## Start here

- [SPEC.md](SPEC.md) — OKF v0.1 specification (canonical)
- [README.md](README.md) — overview, reference agent, bundle production
- [ATTRIBUTION.md](ATTRIBUTION.md) — upstream provenance and license

## Example bundles (upstream samples)

- [bundles/ga4/](bundles/ga4/) — GA4 e-commerce dataset
- [bundles/stackoverflow/](bundles/stackoverflow/) — Stack Overflow public dataset
- [bundles/crypto_bitcoin/](bundles/crypto_bitcoin/) — Bitcoin blockchain tables

## Local usage in a-roofers-open-brain

Sibling OKF-style bundles (Cleverwork-authored, not upstream clones):

- [Open Engine](../open-engine/)
- [Open Skills](../open-skills/)
- [Application plan](../application/framework-application-plan.md)
- [Runbooks](../runbooks/)

## Reference tooling (optional)

Python reference agent and tests under `src/`, `tests/`, `samples/`. Not required for day-to-day agent context — agents read markdown bundles directly.

## Primary sources

- [OKF blog (Google Cloud)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
- [Upstream repository](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
