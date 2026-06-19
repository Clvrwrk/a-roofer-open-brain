# 43 — Price-list match lock & API (non-negotiated) pricing rules

Two time-sensitivity rules raised during the Price Agreement Audit review (2026-06-19).
Both are **design notes for the Price List Coverage / order-pricing work** — not yet built.

## Rule 1 — Hard lock: invoice ↔ price list, on first match

**Intent.** Price lists and invoices are both time-sensitive. An invoice must always be
evaluated against the price agreement that was *in force when it was first matched*, not
whatever agreement is current at the time of a later review. So the first match becomes a
**locked relationship** between that invoice and that price list.

**Behaviour.**
- When an invoice (line) is first matched to an active price list, persist the
  `(invoice, agreement)` pairing as a lock.
- All future views of that invoice resolve its negotiated price from the **locked**
  agreement, even after a newer price list is ingested.
- The lock can be **overridden only during an Invoice Audit**, by explicitly assigning a
  new price list to the invoice (records who/when; supersedes the prior lock).

**Why it matters.** Without the lock, re-pulling a newer agreement would retroactively
change the variance verdict on invoices that were already reviewed/closed — you'd "lose"
the basis you audited against.

**Implementation sketch (to design with Price List Coverage).**
- New table, e.g. `invoice_price_match_lock (invoice_number, invoice_line_id, agreement_id,
  locked_at, locked_by, source)` — additive, idempotent.
- Today the negotiated match is computed *live* in `v_invoice_audit_line` /
  `v_invoice_audit_invoice` (`neg` CTE: ship_to + item → highest-confidence agreement →
  `abc_price_list_items.unit_price`). Once a lock exists, the match must read the locked
  agreement instead of recomputing.
- Lock is written on first match (or on first audit disposition). Invoice Audit gets an
  "assign / change price list" action that writes a superseding lock.
- Interacts with the UOM normalization (schema 117) — the locked agreement's price still
  gets normalized into the line's UOM at compare time.

## Rule 2 — API price agreements are non-negotiated, out-of-territory only

**What they are.** `abc_price_agreements` rows whose `agreement_number` starts with `API-`
are the **live ABC API price lists**, not negotiated PDF agreements. They carry no expiry
and no curated item catalog. As of 2026-06-19 there are ~92 of them, each tied to a single
out-of-territory branch (e.g. Pooler GA, Augusta GA).

**Rules.**
- API price agreements are **only allowed outside the 2-hour drive-time window**. Inside an
  office's isochrone, a negotiated (PDF) agreement should govern; an API price there is a
  flag, not an acceptable basis.
- Whenever an **order or invoice is priced from an API list**, the UI must make it
  **explicit that this is an API price list — non-negotiated**, so the reviewer knows the
  price was never negotiated.

**Status.**
- Done: Price Agreement Audit flags API-only branches with an `API · non-negotiated` badge
  and a dedicated filter; branch identification uses `agreement_number LIKE 'API-%'`.
- To extend: surface the same `API · non-negotiated` tag on **order-audit, invoice-audit,
  and estimate/proposal** lines whose price came from an API list, and warn/enforce when an
  API price is used for an in-drive-time branch.
