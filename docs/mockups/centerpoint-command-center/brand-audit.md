# Brand-alignment audit: CenterPoint mockups against ds.proexteriorsus.net

Audited against `@proexteriors/ds` rules v1.4.2 (`packages/ds/RULES.md` in Clvrwrk/CRM_PWA, `origin/main` on 2026-11-13).

## How the mockups were made

Each mockup is the real screen as the local dev server rendered it on 2026-11-13, with only the CenterPoint changes applied on top. The shell, sidebar, header, logo, type and every existing component are the product's own markup and CSS, not a redraw. The builder is `_build/build.py`.

The dashed orange outline and the "Mockup" bar at the bottom are review aids. They are not part of the design.

## Headline finding

**The mockups add no new pattern, class or token.** Every addition reuses a component that is already on the screen it joins. That is also the limit of this audit: the Command Center itself is not on ds tokens yet. Its CSS defines no `--pe-*` custom property at all and uses the old `fw-`, `cfx-` and `epl-` class prefixes, which K-04 lists as migration debt that "must not grow". The mockups inherit that debt and do not add to it.

## What the mockups rely on

| Rule | How the mockup meets it |
| --- | --- |
| **N-01, N-04** nested trees; a bar shows name, count, money | `commercial_service` is one more office bar on the Friday board and one more location row on the pipeline, in the existing bar markup |
| **N-08** money trees sort by money | The new Friday group sits fifth of nine, by its total |
| **T-01, T-03** ten rows, then "Show all N" | The group opens at 10 of 109 with "Show all 109 jobs ▾ (99 more)" |
| **T-08** every group shows the same columns in the same order | The new group has the same 17 columns. Cells it cannot fill show a dash |
| **T-09** shorten in the cell, full text in the tooltip | Client names are clipped with the full name in `title`, as on the other groups |
| **T-12, L-04** wide data uses column groups; no sideways scroll by default | Same Money and Est. Cash Flow column groups; see `friday-wip-columns-open.html` for the expanded state |
| **T-06, Y-03** numbers right-aligned in tabular figures | Existing `fw-num` and `num` cells |
| **P-03, P-04** a KPI is a work queue with a count | The one new pill, "CenterPoint ≠ QuickBooks", is a count that filters the board to the jobs to fix |
| **F-01, F-02** "All" means no constraint; one toolbar | `commercial_service` is one more value in the existing Office and Location filters. No new control |
| **F-08** aggregates are scoped to one office | The new group is its own office scope. Board totals add it the same way they add the other offices |
| **B-06** no data means greyed with a tooltip, not removed | Rep and Est Exp Outstanding show a dash with a tooltip that says why |
| **B-09** a toolbar holds filters and at most two buttons | No button added |
| **L-01** pills for status, tags and counts only | No new pill shape. The source name "CenterPoint" is plain text in the group's count |
| **C-06** no other accent colour | No colour added |
| **S-02** logo | Unchanged product shell |
| **E-01** never sample or fake rows | Every row and figure is live data. Rows left out are replaced by a sentence that says so. Customer names are replaced by numbered aliases in these files only |

## Where the mockups show existing debt (not introduced here)

| Rule | What is on the screen today | In the mockup |
| --- | --- | --- |
| **K-01, K-04** tokens and `pe-` classes only | No `--pe-*` tokens; `fw-`, `cfx-`, `epl-` classes | Inherited. The CenterPoint rows use the same classes |
| **K-01** no literal colour values | The days chip is coloured with an inline `hsl()` value | Inherited on the new rows, same formula |
| **C-02** flag red is never a chart colour | The stage chart uses red for receivables outstanding | Inherited. The chart is redrawn as static SVG in the same two colours |
| **S-01, L-04** one shell; a tab bar on phones; nothing scrolls sideways | At 390px and 768px the navigation stacks above the page, with no tab bar. On Friday WIP/AR and 13-Week Cash Flow the page scrolls sideways by 10px, caused by the navigation's "Soon" items; the Sales Pipeline fits. Measured with device emulation | Inherited: the overflow is in the navigation, not in anything the mockups add. See the `*-phone.png` and `*-tablet.png` screenshots |
| **T-07** never a table 15 columns wide | The Friday board has 17 columns, managed by column groups | Inherited |
| **F-04** scope control is a `.pe-seg` | Office is a select | Inherited |

## The one visible change to an existing element

**The Job # column grows from 72px to 96px on every group.** CenterPoint job numbers are 10 characters (`CP-25-1449`) and are clipped at 72px. T-08 requires the same columns on every group, so the width changes for all of them.

## Not covered

- **Dark mode.** The mockups are light only. The screens have a theme switch; the build screenshots must cover both (G-01).
- **axe (A-01).** Not run on the mockups. The additions reuse existing elements, so they bring no new contrast pair, but that is an argument, not a test.
