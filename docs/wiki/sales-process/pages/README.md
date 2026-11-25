---
title: How to add a page to the sales wiki
order: 1
---

# How to add a page to the sales wiki

Every file in this folder (`docs/wiki/sales-process/pages/`) shows up in the wiki's **Team folder** tab the next time someone opens it, or within two minutes if it is already open. Nobody has to republish the wiki.

## Markdown pages

A `.md` file becomes a page. Put a short header at the top to place it inside a track or a stage:

```text
---
title: Adjuster meeting checklist
track: ri
stage: p5
order: 10
---
```

| Field | What it does | Values |
|---|---|---|
| `title` | The page name. Without it, the first `#` heading is used. | Any text |
| `track` | Shows the page on that track's page. | `rr` Residential Retail, `ri` Residential Insurance, `cr` Commercial Retail, `ci` Commercial Insurance, `svc` Commercial Repair |
| `stage` | Shows the page inside that stage's deep dive. Needs `track`. | `p1` to `p10`; `s1` to `s6` for Commercial Repair |
| `order` | Sorts pages; lower comes first. | A number |

Diagrams in a ```` ```mermaid ```` block are drawn on the page. Links to other files in this folder open them in GitHub.

## Other files

PDFs, spreadsheets and images are listed in the Team folder tab with a link to open them in GitHub.

## Rules

- Clean, professional language. No customer names, phone numbers, addresses or claim numbers, and no secrets.
- The wiki reads the `main` branch. Files on another branch appear only after that branch is merged.
- Readers need the GitHub connector in claude.ai and access to the repository to see the folder. Everyone else still sees the published wiki.
