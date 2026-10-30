# Maya production checklist

## Identity and lineage

- [ ] Runtime identity is `maya-chen`; client is `pe-finance`; memory zone is `ob1-pe-finance`.
- [ ] Every active assignment has a CAT source and linked accounting child.
- [ ] Current recurring occurrences are children of the active Maya program root.

## Data controls

- [ ] Price evidence carries vendor, branch/territory, item, pricing UOM, effective date, source, and freshness.
- [ ] Invoice comparisons use `price_per_uom` and an approved `v_item_uom_map` conversion where needed.
- [ ] Credit-memo packets contain only supported discrepancy lines and remain internal until human approval.
- [ ] WIP/AR packets separate billed AR from unbilled work and cite `computed_at`/source freshness.
- [ ] QuickBooks production remains read-only.

## Runtime health

- [ ] Gmail and Slack identities/connections match the pinned Maya registry.
- [ ] Mailbox, CAT-first Linear intake, Linear work claimant, and cadence scheduler each emit receipts.
- [ ] Daily, weekly, monthly, quarterly, and annual loops are present exactly once.
- [ ] Command Center read token is scoped to Maya and contains no approval or financial-write permission.
- [ ] Unknown provider outcomes stop as ambiguous; kill switch and rollback are documented.

## Storage

- [ ] Fast.io contains only sanitized issue-bound artifacts.
- [ ] Dropbox mirror receipt is current and additive.
- [ ] No secrets, raw PII, raw exports, or unreviewed external files are present.

