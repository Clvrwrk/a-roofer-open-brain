# B3b Account and Location Staging Repair

Target: Supabase project `rnhmvcpsvtqjlffpsayu`, staging queue rows in `jt_mirror.pending_write` only.

## Repairs Applied

The repair changed only `customer_accounts` and `locations` rows whose pre-repair status was `staged` or `failed`. It did not update executed or skipped rows.

1. Added the documented `createAccount.suffixIfNecessary = true` escape hatch to all staged/failed customer-account payloads and reset failed customer accounts:

```sql
update jt_mirror.pending_write
set payload = jsonb_set(payload, '{suffixIfNecessary}', 'true'::jsonb, true),
    status = case when status = 'failed' then 'staged' else status end,
    error = case when status = 'failed' then null else error end,
    attempt = case when status = 'failed' then 0 else attempt end,
    updated_at = now()
where domain = 'customer_accounts'
  and status in ('staged', 'failed');
```

Rows affected: **380**. All 380 were failed duplicate-name attempts and were returned to `staged`.

2. Selected distinct staged Location `accountId.$ref` contact IDs, excluded IDs already covered by an Account crosswalk or a customer-account pending row in `staged`/`executed`/`failed`, and inserted customer accounts:

```sql
with gap_refs as (
  select distinct split_part(payload #>> '{accountId,$ref}', ':', 2) contact_id
  from jt_mirror.pending_write
  where domain = 'locations'
    and status = 'staged'
    and payload #>> '{accountId,$ref}' like 'acculynx_contact:%'
),
gaps as (
  select g.contact_id,
         coalesce(
           nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
           nullif(trim(c.company_name), ''),
           'Unknown Customer — AccuLynx ' || g.contact_id
         ) account_name
  from gap_refs g
  left join public.acculynx_contacts c on c.id = g.contact_id
  where not exists (
    select 1 from jt_mirror.crosswalk x
    where x.jt_type = 'account' and x.source_id = g.contact_id
  )
  and not exists (
    select 1 from jt_mirror.pending_write p
    where p.domain = 'customer_accounts'
      and p.status in ('staged', 'executed', 'failed')
      and p.source_ref = 'acculynx_contact:' || g.contact_id
  )
)
insert into jt_mirror.pending_write
  (domain, pave_op, payload, status, source_ref,
   idempotency_key, target_env, attempt)
select
  'customer_accounts',
  'createAccount',
  jsonb_build_object(
    'name', account_name,
    'type', 'customer',
    'organizationId', '22PazeRM5FCH',
    'suffixIfNecessary', true,
    '__execution_order', 70
  ),
  'staged',
  'acculynx_contact:' || contact_id,
  'customer_accounts:createAccount:acculynx_contact:' || contact_id,
  'production',
  0
from gaps;
```

Rows affected: **57** total. The initial exact gap query inserted 56. Resetting the failed Graciela Vaquera Location then made its previously hidden reference eligible for the staged-only gap query, so the live verification correctly exposed and staged a 57th account.

Primary-first active email/phone availability was checked in `acculynx_backfill.contact_emails` and `contact_phones`; none of the 56 initial raw-only gap contacts had enrichment rows. The proven Account template and official `createAccount` signature have no native email/phone keys, so no unsupported keys were invented.

3. Reset the failed Location:

```sql
update jt_mirror.pending_write
set status = 'staged',
    error = null,
    attempt = 0,
    updated_at = now()
where domain = 'locations'
  and status = 'failed';
```

Rows affected: **1** (`Graciela Vaquera`).

## Gap Contacts

The following **57** distinct customer accounts were staged:

- `0cb07237-d431-f111-8af3-ea808804e890` — Roger Wallace
- `14c0085a-ca27-f111-8af2-ea808804e890` — Joann Silmon
- `1f0f475e-0eec-f011-8af2-ea808804e890` — Jean Taylor
- `2ec88463-930e-f111-8af2-ea808804e890` — Atual Rai
- `30188088-6fd0-f011-8af2-ea808804e890` — Jelice Allen
- `3223c09a-b1cf-f011-8af2-ea808804e890` — Luke Steel
- `45299db9-33eb-f011-8af2-ea808804e890` — Delbert Resser
- `47aeaa68-ac03-f111-8af2-ea808804e890` — Maggie Casanova
- `48ee2700-4d04-f111-8af2-ea808804e890` — Jeff Boom
- `4eb4cd1c-c9f7-f011-8af2-ea808804e890` — Lisa Field
- `569cedcb-bc11-f111-8af2-ea808804e890` — Atual Rai
- `56e83db9-75f8-f011-8af2-ea808804e890` — Graciela Vaquera
- `5aae3fa2-562c-f111-8af3-ea808804e890` — Lucille (Wichita)
- `6bb9cbd0-06fb-f011-8af2-ea808804e890` — Brandon Watt
- `72b707d4-4d8e-f011-8af0-ea808804e890` — Candlewood Suites Wichita
- `734406a0-4bf6-f011-8af2-ea808804e890` — Property Assessment (3613 Bent Oak St)
- `745c0582-698e-f011-8af0-ea808804e890` — Stuart Ingman
- `75f490dc-29d5-f011-8af2-ea808804e890` — Larry Washington
- `7d838d6f-85fc-f011-8af2-ea808804e890` — Librado Espinoza
- `7d8ce66f-31c7-f011-8af1-ea808804e890` — Laura Castillo
- `84060e5a-4dc2-f011-8af1-ea808804e890` — Collette Burk
- `930d5860-1609-f111-8af2-ea808804e890` — Deborah  Garcia
- `946efcd7-28bf-f011-8af1-ea808804e890` — Greg Tenant
- `9478c97d-dfad-f011-8af1-ea808804e890` — Kendall Pulliam
- `95abbacc-f8bf-f011-8af1-ea808804e890` — Brian Hernandez
- `96e382f0-c1fb-f011-8af2-ea808804e890` — Santana Brown
- `970efb6b-46bf-f011-8af1-ea808804e890` — Jody Roberts
- `9d25fca1-2502-f111-8af2-ea808804e890` — Rick Griffitts
- `9d2983a4-7507-f111-8af2-ea808804e890` — Justin Roberts
- `a026168e-bc11-f111-8af2-ea808804e890` — Atual Rai
- `a20796f8-b911-f111-8af2-ea808804e890` — Atual Rai
- `aba993e7-8a00-f111-8af2-ea808804e890` — Loreta Weidner
- `afecc428-2bf3-f011-8af2-ea808804e890` — MARIA MENDOZA
- `b009650e-bc11-f111-8af2-ea808804e890` — Atual Rai
- `b7e48ea0-9aaf-f011-8af1-ea808804e890` — Chris Rockers
- `b883a624-29d2-f011-8af2-ea808804e890` — Mary and Mike McDonald
- `b8dfbbc3-eabf-f011-8af1-ea808804e890` — Jamie Frotles
- `bbdbef78-d6d2-f011-8af2-ea808804e890` — Andrew Leiker
- `be9ccb8d-8500-f111-8af2-ea808804e890` — Fernando Fernandez
- `bfb0ddcd-bb11-f111-8af2-ea808804e890` — Atul Rai
- `c106bde0-ccf7-f011-8af2-ea808804e890` — Robert Horsch
- `c253f4de-c002-f111-8af2-ea808804e890` — Tracey Hess
- `c2ce67c2-faf6-f011-8af2-ea808804e890` — Ema Alvarez
- `c5d35d89-ba11-f111-8af2-ea808804e890` — Atul Rai
- `ca6096d6-5cea-f011-8af2-ea808804e890` — Anthony Catron Catron
- `ca9dbcf3-d4d6-f011-8af2-ea808804e890` — Guillermo Vazquez
- `d16de5e5-0102-f111-8af2-ea808804e890` — Janice Holstead
- `d220de1e-a211-f111-8af2-ea808804e890` — Nicholas Bailey
- `d5599245-761d-f111-8af2-ea808804e890` — Chauncey Williams
- `d7433ace-9d2f-f111-8af3-ea808804e890` — Atul Rai
- `d860d19e-3eeb-f011-8af2-ea808804e890` — Alfonso Baker
- `d8cfb39b-89d0-f011-8af2-ea808804e890` — Carlos Mares
- `e022f7b1-cbf0-f011-8af2-ea808804e890` — Francis Graham
- `e3e85fea-db02-f111-8af2-ea808804e890` — Allison Tidwell
- `efd62f1c-6f08-f111-8af2-ea808804e890` — Kendall Williams
- `f2734c2f-9baf-f011-8af1-ea808804e890` — Ryan Heuer
- `fa8dac5d-ed08-f111-8af2-ea808804e890` — Michael Wagner

## Verification

Live SQL after all repairs:

| Assertion | Result |
| --- | ---: |
| Failed `pending_write` rows anywhere | **0** |
| Gap contacts from the exact staged-Location query | **0** |
| Staged customer accounts missing `suffixIfNecessary=true` | **0** |
| Staged customer accounts | **437** |
| Staged locations | **6,530** |
| Executed customer accounts | **6,147** |
| Skipped customer accounts | **1** |
| Executed locations | **44** |

The repository check `checks/b3b_fix_check.py` also passed:

```text
PASS — suffixIfNecessary set, gap contacts staged, zero failed rows, all location refs coverable
```

The executed/skipped customer-account counts and executed Location count match the B3 execution report, confirming that those protected rows were not changed.

## Verdict

**PASS — B3b staging repair complete.** Duplicate-name customer accounts are ready to retry with automatic unique suffixing, every staged Location account reference is now coverable by a staged account or crosswalk, the Graciela Vaquera Location is restaged, and no failed queue rows remain.
