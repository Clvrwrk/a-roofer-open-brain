---
type: Policy
title: OKF governance
description: Rules for authoring, validating, and maintaining OKF bundles in this repo.
resource: /docs/knowledge-base/OKF/SPEC.md
tags: [okf, governance, knowledge-base]
timestamp: "2026-06-29T00:00:00Z"
---

# OKF governance

OKF concepts are UTF-8 Markdown documents with YAML frontmatter. The required frontmatter field is `type`; recommended fields are `title`, `description`, `resource`, `tags`, and `timestamp`.

# Repo convention

- Working OKF bundles live under `/docs/knowledge-base/the-roofers-open-brain/`.
- The vendored OKF spec remains under `/docs/knowledge-base/OKF/` and is not the working knowledge layer.
- Every sub-bundle must have `index.md` and `log.md`.
- Concept documents should cite source repo docs, code, schemas, or external references.
- OKF indexes/summarizes canonical sources; it should not blindly duplicate every source file.

# Validation

Run:

```bash
node scripts/validate-okf.mjs
```

# Citations

[1] [OKF SPEC](/docs/knowledge-base/OKF/SPEC.md)

