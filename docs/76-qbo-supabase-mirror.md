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

## Host timer (Thursday)

`scripts/qbo-thursday-sync.sh` — same pattern as ABC nightly. Install on agent host:

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
