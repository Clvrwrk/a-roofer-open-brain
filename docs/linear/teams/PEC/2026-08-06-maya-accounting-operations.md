# PEC production receipt — Maya accounting operations

- CAT source: CAT-20
- Downstream implementation: PEC-173
- Branch: `contrib/cleverwork/maya-linear-accounting`
- Implementing actor: Codex
- Requested by: Christopher Hussey
- Date: 2026-08-06

## External issue effects

- Created CAT-24 → PEC-177 for Kansas pricing.
- Created CAT-25 and parented canonical PEC-111; marked PEC-161 duplicate of PEC-111.
- Created CAT-26 and parented canonical PEC-112; marked PEC-160 duplicate of PEC-112.
- Created CAT-27 and parented canonical PEC-164; marked PEC-165 duplicate of PEC-164.

## Repository effects

- CAT-first Gmail and Slack orchestration with forwarded-copy dedupe.
- Explicit Agent Todo Linear claimant and ambiguity-safe local receipts.
- Complete daily/weekly/monthly/quarterly/annual loop scheduler.
- Read-only Command Center accounting capability boundary.
- Supabase default-deny orchestration/claim/channel/loop/receipt schema.
- Idempotent channel-neutral `/api/agent/intake`.
- Fast.io PE Finance operating pack and corrected UOM credit-memo rule.

## Guardrails retained

Financial mutations, external vendor sends, price promotion, credit-memo disposition, WIP/AR edits, payments, access changes, and QuickBooks writes remain outside Maya's autonomous Linear-work authority. Signal remains disabled pending the third-party-agent-tool gate.

