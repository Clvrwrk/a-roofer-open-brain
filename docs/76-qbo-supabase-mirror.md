# QuickBooks Online → Supabase mirror (PEC-102)

**Status:** implemented (schema + backfill job)  
**Linear:** [PEC-102](https://linear.app/cleverwork/issue/PEC-102/qb-full-historical-mirror-inception-thursday-refresh-read-only)  
**Guardrails:** [PEC-98](https://linear.app/cleverwork/issue/PEC-98) / [`docs/74-…`](74-quickbooks-production-read-only-guardrails.md)  
**Initiative:** [docs/75](75-cashflow-wip-executive-initiative-2026-07-26.md) CashFlow/WIP

## Purpose

Full historical extract of live **Pro Exteriors LLC** QBO into PE Supabase (`rnhmvcpsvtqjlffpsayu`) for Friday AR / CashFlow WIP joins with AccuLynx + ABC. Production QBO is **read-only forever** — the brain is the mutable copy.

## Cadence

| Mode | When | Command |
| --- | --- | --- |
| `smoke` | After schema change | `node …/mirror-backfill.mjs --mode=smoke` |
| `backfill` | Inception / catch-up | `node …/mirror-backfill.mjs --mode=backfill` |
| `thursday` | Weekly before Friday AR | `bash scripts/qbo-thursday-sync.sh` |

Thursday target: America/Chicago evening or UTC Thursday so Lucinda has fresh mirror Friday morning.

## Schema

Migrations:

- `schemas/cleverwork-roofer/188-qbo-mirror-ddl.sql` — entity tables
- `schemas/cleverwork-roofer/189-qbo-register-views.sql` — per-register views ([PEC-109](https://linear.app/cleverwork/issue/PEC-109))

| Table | Contents |
| --- | --- |
| `qbo_sync_runs` | Run ledger |
| `qbo_sync_watermarks` | Per-entity high-water |
| `qbo_company_info` | CompanyInfo |
| `qbo_accounts` | Chart of accounts (incl. banks/CCs/LOCs) |
| `qbo_customers` / `qbo_vendors` / `qbo_classes` | Lists |
| `qbo_invoices` / `qbo_payments` | AR |
| `qbo_bills` / `qbo_bill_payments` | AP |
| `qbo_purchases` | Bank/CC/LOC register (Expense/Check/CC credit) |
| `qbo_deposits` | Deposits |
| `qbo_journal_entries` | Journals |
| `qbo_vendor_credits` / `qbo_credit_memos` | Credits (supplier vs customer) |
| `qbo_transfers` | Transfers |
| `qbo_report_snapshots` | BS / P&L / TB / CF / AR & AP aging |

Keys: `(realm_id, qbo_id)`. Line detail in `lines jsonb` on parents (v1). RLS: service_role only.

### Per-register views (same names as QBO)

Schema `qbo_registers` — one view per bank / credit card / notes-payable / short-term financing account, **named exactly like the QBO register** (e.g. `"ABC Supply"`, `"Amex (1002)"`, `"First United 8597"`, `"Lowe's Commercial"`).

| Object | Purpose |
| --- | --- |
| `v_qbo_register_accounts` | Catalog of register-eligible accounts |
| `v_qbo_register_lines` | Unified lines (Purchase + Deposit + Payment + BillPayment + Transfer + JE) |
| `qbo_registers."<QBO name>"` | One register, QBO name 1:1 |
| `qbo_register('ABC Supply')` | Function form by exact name or `account_ref` |
| `qbo_refresh_register_views()` | Rebuild named views after CoA sync (called by mirror job) |

```sql
-- List registers (matches QBO Chart of Accounts names)
SELECT account_name, register_kind, current_balance
FROM v_qbo_register_accounts
ORDER BY register_kind, account_name;

-- ABC Supply register (same name as QBO)
SELECT txn_date, doc_number, payee_name, spent, received, memo
FROM qbo_registers."ABC Supply"
ORDER BY txn_date DESC;

-- Any register by exact QBO name
SELECT * FROM qbo_register('Amex (1002)');
```

### Presence flags: rows QuickBooks no longer returns (mig 348)

The mirror never deletes. Until 2026-11-22 it also never noticed a deletion, so an invoice deleted, or voided and re-created, in QuickBooks stayed open in the mirror. On 2026-11-22 that was 223 invoices ($2.44M open), which is why the mirror showed $4.39M open AR against $1.92M in QuickBooks and why payments on replacement invoices looked missing.

Every mirrored entity table now carries:

| Column | Set by | Meaning |
| --- | --- | --- |
| `last_seen_at`, `last_seen_run_key` | every upsert | The last full pull or change-feed read that returned the row |
| `missing_since` | `qbo_mark_missing()` after a complete full pull | QuickBooks did not return the row. Cleared automatically if it comes back |
| `qbo_deleted_at` | `qbo_mark_deleted()` from the change feed | QuickBooks CDC reported the entity as Deleted |

**Read actuals from the `_current` views**, never the base tables: `v_qbo_invoices_current`, `v_qbo_payments_current`, `v_qbo_bills_current`, `v_qbo_purchases_current` and one per entity table. `v_qbo_job_cost_lines_all` (and so `v_qbo_job_costs` and the WIP board), `v_qbo_register_lines` and `v_work_invoice_qbo_recon` already read current rows only.

| Object | Purpose |
| --- | --- |
| `v_qbo_removed_rows` | Every flagged transaction, for review |
| `v_qbo_ar_report_lines` | Detail lines of the latest AgedReceivableDetail report |
| `v_qbo_ar_reconciliation` | Mirror open invoices vs the report; `status = drift` beyond 1% |
| `v_qbo_ar_invoice_recon` | The same, per invoice (`match`, `mirror_only`, `report_only`, `balance_differs`, `flagged_removed`) |

Safety rules in the job:

- Flagging runs only after a **complete** full pull (`backfill` or `thursday` mode, not cut short by `--max-pages`) that paged with `orderby Id`.
- If a pull returns fewer than 80% of the rows the mirror holds as present, nothing is flagged and the run records a warning (`--missing-guard` to change the share). A bad API response cannot mark the mirror deleted.
- `--no-flag-missing` and `--no-cdc` turn the two passes off for a run.

### Change feed (CDC)

After every full pull the job reads QuickBooks Change Data Capture (`GET /cdc?entities=<Entity>&changedSince=<ISO>`, read-only) for each entity. Changed entities are upserted; entities reported `status: "Deleted"` get `qbo_deleted_at`. The watermark is `qbo_sync_watermarks` entity `CDC`; each call overlaps the last by 10 minutes and never reaches back more than the 30 days QuickBooks keeps. It also runs on its own:

```bash
node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=cdc
```

`--mode=cdc` is cheap (one GET per entity) and can run hourly for near-real-time payments, alongside the nightly full pull.

## Client

`integrations/bridges/quickbooks/read-only-client.mjs` — GET + SELECT query only; OAuth refresh POST to Intuit token endpoint only.

## Job

`integrations/bridges/quickbooks/mirror-backfill.mjs`

```bash
# Env: repo .env (Supabase) + ~/.config/cleverwork/master.env (QBO prod)
node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=smoke
node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=backfill
node integrations/bridges/quickbooks/mirror-backfill.mjs --only=purchases,accounts --dry-run
```

Gates:

1. `QUICKBOOKS_ACCESS_MODE=read_only` + `WRITE_ENABLED=false`
2. CompanyInfo name matches `/pro\s*exteriors/i`
3. Upserts only into Supabase — never QBO writes

Run JSON: `integrations/bridges/quickbooks/.mirror-runs/` (gitignored).

## Host timer

`scripts/qbo-thursday-sync.sh` — same pattern as ABC nightly. Despite the name, `qbo_sync_runs` shows it running **nightly at 02:00 UTC** (checked 2026-11-22); the Thursday line below is the original plan. Install on agent host:

```cron
# Thursday 20:00 America/Chicago ≈ Friday AR prep
0 20 * * 4 TZ="America/Chicago" /usr/bin/env bash /opt/openbrain/a-roofers-open-brain/scripts/qbo-thursday-sync.sh
```

## Accounting method

Reports default to **Cash** (PE books). Pass `--accounting-method=Accrual` only for labeled comparison pulls; store method on `qbo_report_snapshots`.

## Out of scope

- Writing back to QBO
- Atomizing into `public.thoughts` (see `mapping.md` — separate path)
- Convex Decision Cockpit mirror (PEC-53) — external; this is the Supabase SoR for CC
