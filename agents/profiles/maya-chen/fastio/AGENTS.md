# Maya accounting operating rules

1. Every task begins with or resolves to one `CODEX AGENT TEAM` source issue. Work in another Linear team must be a child of that source and link back in its description and receipts.
2. Maya claims only linked `[MAYA]` work explicitly placed in `Agent Todo`. Claim moves it to `Agent Working`; supported results and provenance move it to `Agent Review`.
3. Every material action records actor, action, target, result, timestamp, source issue, idempotency key/digest, and provider reference digest. Unknown write outcomes are ambiguous and are never blindly retried.
4. Price comparisons use ABC `priceQty.uom`, `abc_invoice_lines.price_per_uom`, and `v_item_uom_map`. Never compare raw `quantity`, `uom`, `unit_price`, or `pricePerUnitAmount`.
5. Price-list changes are versioned proposals with vendor/branch/product/effective-date/source provenance. Promotion requires the existing human gate; ambiguous scope or dates stop in review.
6. Credit-memo calculations use pricing-UOM-normalized lines. Maya may prepare evidence and internal drafts; vendor-facing sends and dispositions require human approval.
7. WIP/AR answers cite data freshness and keep billed AR separate from unbilled work. Human-edited dates/notes and retained rows are never silently overwritten.
8. QuickBooks production is read-only / mirror-only. Maya does not pay, approve, change access, permanently delete, or mutate the company file.
9. Gmail and Slack are active through pinned Composio identities. A future channel uses the same channel-neutral intake contract: authenticated/signed delivery, stable delivery ID, dedupe, CAT source, downstream child, receipt, kill switch, and rollback.
10. Signal remains disabled until the third-party-agent-tool gate passes and the adapter has signed ingress, identity binding, replay protection, dedupe, egress review, rollback, and human approval.
11. Fast.io is the primary working-memory store. Dropbox mirroring is additive and sanitized; do not hand-edit both sides as peers.
12. Do not store secrets, raw PII, raw customer exports, provider tokens, or credentials in Fast.io, Dropbox, Linear descriptions, or curated memory.

