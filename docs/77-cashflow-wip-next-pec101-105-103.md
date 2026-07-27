# CashFlow/WIP next wave — PEC-101 / 105 / 103

**Status:** kicked off 2026-07-27 after QBO mirror landed (`origin/main` @ `e07c71f`, PEC-102/109 Done)  
**Initiative:** [docs/75-cashflow-wip-executive-initiative-2026-07-26.md](75-cashflow-wip-executive-initiative-2026-07-26.md)  
**Do not start PEC-104 UI** until join rules + field sources below are locked.

## Why this wave

Mirror + registers are queryable. Interactive `/executive/cashflow-wip` still needs:

1. Structured AccuLynx stage inputs (no OCR)
2. Job # expense tying (ABC + misc; CMs separate)
3. Persistent stage/deposit dwell (AccuLynx does not keep history)

---

## PEC-101 — AccuLynx field + Ops process rollout

**Owner:** Chris + Lucinda/Ops  
**Linear:** [PEC-101](https://linear.app/cleverwork/issue/PEC-101)

### Required structured fields (locked intent)

| Field | Owner | Notes |
| --- | --- | --- |
| Sales Manager | Sales | Distinct from salesperson |
| Contract signed date | Sales | If distinct from Prospect |
| Deposit invoice date / amount | Accounting | Prefer AccuLynx; QB invoice as cross-check |
| Anticipated deposit collection date | **Ops** | Human-gated |
| Deposit collected / posted date | Accounting + brain | QB Payment/Deposit preferred; brain records timestamp |
| Work complete / final sign-off dates | Ops | Human-gated |
| Anticipated ACV / final payment date | **Ops** | Human-gated |
| Ops close checklist (final payroll) | Ops | Gate before Closed |
| Supplement-open flag | Accounting | WIP-supplement while AccuLynx Invoiced |

### Working rules

- Ops fully human-gated for status moves
- Dashboard stages may diverge from AccuLynx milestones
- Structured source before OCR — verify AccuLynx API/`raw` JSON before any parse path

### Next actions

1. Inventory which of the above already exist as AccuLynx custom fields (API + UI)
2. Gap list → AccuLynx admin create / rename
3. Map each field → Supabase column (prefer existing `acculynx_*` tables; additive migrations only)
4. Lucinda/Ops sign-off on process ownership

---

## PEC-105 — ABC + misc → Job # / JobID; CMs separate

**Owner:** Accounting agent + Chris  
**Linear:** [PEC-105](https://linear.app/cleverwork/issue/PEC-105)

### Join ladder (ABC register ↔ `abc_invoices` ↔ job)

Ordered match attempts (stop at first hit):

1. `qbo_registers."ABC Supply".memo` / PrivateNote contains ABC `invoice_number`
2. Same-day ±3 / +14 amount match (`spent` or `received` ≈ invoice total)
3. DocNumber / Check# as **job label** only after (1)/(2) — never treat job label as invoice #

Credit memos / vendor credits: **always a separate WIP line** — never silent-net into job expense.

### Smoke baseline (2026-07-27)

| Check | Result |
| --- | --- |
| ABC register lines | 2,419 (2023-09-18 → 2026-06-22) |
| First United 8597 lines | 266 (2026-06-03 → 2026-07-28); 7 Deposits + 106 Payments |
| ABC invoices last 90d matched to register (memo ∪ amt/date) | **166 / 234 = 70.9%** |

Gap (~29% unmatched + older register lag vs brain invoices through 2026-07-24) feeds Lucinda challenge pack under `outputs/abc-register-gap-2026-07-26/` (gitignored).

### Misc expenses

Plan (not implement yet): non-ABC `qbo_purchases` / bill lines with job label in DocNumber or class → JobID via AccuLynx job number map. Approve plan with Lucinda before coding.

### Next actions

1. SQL view `v_abc_job_spend` implementing the join ladder + CM split
2. Document false-positive rate on job-label DocNumbers (GROK anti-pattern)
3. Misc-expense tying plan short doc → Lucinda approve

---

## PEC-103 — Stage dwell + deposit-posted memory log

**Owner:** Capture/Conductor + Accounting  
**Linear:** [PEC-103](https://linear.app/cleverwork/issue/PEC-103)

### Intent

Persist enter/exit for CashFlow stages and cashflow target dates. On deposit post, stamp time to measure **Approved @ 100% AR outstanding days** (invoice → deposit delay).

### Constraints

- Inferred atoms = `evidence` until QC/human promote
- `job_id` FK; `property_id` when place-relevant
- No raw PII in curated `MEMORY.md`

### Proposed schema (additive; not applied yet)

Working name: `cashflow_stage_events` + `cashflow_deposit_posts`

| Column | Notes |
| --- | --- |
| `job_id` / `acculynx_job_id` | Required |
| `property_id` | When known |
| `stage` | Lead…Closed enum aligned to docs/75 |
| `event` | `entered` / `exited` / `target_set` / `deposit_posted` |
| `event_at` | timestamptz |
| `source` | `acculynx` / `qbo` / `ops_human` / `inferred` |
| `trust_tier` | default `evidence` |
| `evidence_ref` | qbo payment id / acculynx field / etc. |

### Next actions

1. Finalize enum vs dashboard bucket names
2. Migration 190+ DDL (additive)
3. Writer: on QBO Payment/Deposit matching a job deposit invoice → `deposit_posted`
4. Writer: AccuLynx webhook or nightly diff for stage enter/exit

---

## Sequence

```
PEC-102/109 ✓ mirror + registers + Thursday timer
    → PEC-101 field inventory (human)  ║  PEC-105 v_abc_job_spend (agent)
    → PEC-103 dwell DDL + deposit writer
    → PEC-104 /executive/cashflow-wip page
```

## Host ops notes (PEC-102)

- Agent host `5.78.146.161`: `openbrain-qbo-thursday-sync.timer` enabled
- Next fire: **Thu 20:00 America/Chicago** (2026-07-31 01:00 UTC)
- Host repo updated via git bundle (`/opt/openbrain/aob.bundle`) — keep shipping bundles after main merges until GitHub remote is wired
