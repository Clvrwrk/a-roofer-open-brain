-- Wave B re-audit engine (docs/81 §6) — run wave_b_2026-08-05_r3, executed on prod 2026-08-05.
-- Re-prices every auditable line of the benchmark invoices against the invoice's own
-- PE office inherited agreement set, invoice-date-effective:
--   * office = ship_to -> home branch (abc_ship_to_branch_access.home_branch) ->
--     vendor_branches(pricing_status='covered').pricing_territory_office_id
--   * in-force agreements = for every covered branch of that office, the NEWEST version
--     per agreement_number with effective_date <= invoice_date ('API-%' excluded).
--     Evergreen: expiry never disqualifies; a lapsed relied-on version stamps
--     paexp_tag = 'PAEXP-' || expiry_date (docs/81 §4).
--   * item match tiers: 1 exact item_number, 2 exact/prefix normalized description,
--     3 item family (both item numbers >= 8 chars, equal after dropping last 2 chars —
--     ABC color/variant suffixes), 4 pg_trgm description similarity >= 0.45.
--   * best price: unit-matched first, then LOWEST price across in-force agreements
--     (lowest-price-wins), then tier.
--   * classification: no_price (no match) | uom_review (only unit-mismatched matches) |
--     discrepancy (qty > 0 and invoiced > agreement price) | valid.
--   * line credits < $0.05 are rounding artifacts -> reclassified 'valid'.
-- Results: public.invoice_line_reaudit (migration 198). Final r3: 67 discrepancy lines,
-- 30 invoices, $1,784.26. Persistence: invoice_pipeline_status -> 'invoice_audit_pending'
-- (source cleanup_wave_b) for all 40 invoices; credit_memo_requests upserted to 'draft'
-- with recalculated expected_credit/line_count (supersedes 2026-07-28 $1,941.44 request).
-- Packet generation: scripts/invoice-audit-v2/generate-credit-memo-packet.mjs.
--
-- To re-run for a future set: change bench(...) and the run_label.

insert into public.invoice_line_reaudit
  (run_label, invoice_number, line_id, item_number, item_description, quantity, uom,
   invoiced_price, office_id, office_name, agreement_id, agreement_number,
   agreement_effective, agreement_expiry, match_method, unit_match, office_price,
   variance_ext, classification, paexp_tag)
with bench(invoice_number) as (values ('<invoice list>')),
inv as (
  select b.invoice_number, i.invoice_date::date as invoice_date, o.id as office_id, o.name as office_name
  from bench b
  join abc_invoices i on i.invoice_number = b.invoice_number
  join abc_ship_to_branch_access a on a.ship_to_number = i.ship_to_number and a.home_branch = true
  join vendor_branches vb on vb.branch_number = a.branch_number and vb.pricing_status = 'covered'
  join office o on o.id = vb.pricing_territory_office_id
),
ag as (
  select a.id::text as agreement_id, coalesce(a.agreement_number,'PA-'||a.id) as agreement_number,
         nullif(regexp_replace(coalesce(a.branch_number, m.branch_number),'^0+',''),'') as branch_key,
         a.effective_date, a.expiry_date
  from abc_price_agreements a
  left join abc_price_agreement_branch_matches m on m.abc_price_agreement_id = a.id
  where exists (select 1 from abc_price_list_items i where i.agreement_id = a.id)
    and coalesce(a.agreement_number,'') !~* '^API-'
),
ag_versions as (
  select distinct on (i.invoice_number, ag.agreement_number)
         i.invoice_number, ag.agreement_id, ag.agreement_number, ag.effective_date, ag.expiry_date
  from inv i
  join vendor_branches vb2 on vb2.pricing_territory_office_id = i.office_id and vb2.pricing_status = 'covered'
  join ag on ag.branch_key = nullif(regexp_replace(coalesce(vb2.branch_number,''),'^0+',''),'')
         and ag.effective_date <= i.invoice_date
  order by i.invoice_number, ag.agreement_number, ag.effective_date desc
),
line_prices as (
  select l.line_id::text as line_id, l.invoice_number,
         p.unit_price as list_price, p.unit as list_unit,
         av.agreement_id, av.agreement_number, av.effective_date, av.expiry_date,
         case
           when p.item_number = l.item_number then 1
           when p.description_normalized = lower(l.item_description)
             or lower(l.item_description) like p.description_normalized || '%'
             or p.description_normalized like lower(l.item_description) || '%' then 2
           when p.item_number is not null and l.item_number is not null
             and length(p.item_number) >= 8 and length(l.item_number) >= 8
             and left(p.item_number, length(p.item_number)-2) = left(l.item_number, length(l.item_number)-2) then 3
           else 4
         end as tier,
         (upper(coalesce(p.unit,'')) = upper(coalesce(l.uom,''))) as unit_match
  from v_invoice_audit_line l
  join inv i on i.invoice_number = l.invoice_number
  join ag_versions av on av.invoice_number = l.invoice_number
  join abc_price_list_items p on p.agreement_id::text = av.agreement_id
   and (p.item_number = l.item_number
     or p.description_normalized = lower(l.item_description)
     or lower(l.item_description) like p.description_normalized || '%'
     or p.description_normalized like lower(l.item_description) || '%'
     or (p.item_number is not null and l.item_number is not null
         and length(p.item_number) >= 8 and length(l.item_number) >= 8
         and left(p.item_number, length(p.item_number)-2) = left(l.item_number, length(l.item_number)-2))
     or similarity(p.description_normalized, lower(l.item_description)) >= 0.45)
),
best as (
  select distinct on (line_id) *
  from line_prices
  order by line_id, unit_match desc, tier asc, list_price asc
)
select
  '<run_label>', l.invoice_number, l.line_id::text, l.item_number, l.item_description,
  l.quantity, l.uom, l.unit_price, i.office_id, i.office_name,
  b.agreement_id, b.agreement_number, b.effective_date, b.expiry_date,
  case b.tier when 1 then 'item_number' when 2 then 'description' when 3 then 'item_family' when 4 then 'desc_similar' else 'none' end,
  b.unit_match, b.list_price,
  case when b.line_id is not null and b.unit_match and l.quantity > 0 and l.unit_price > b.list_price
       then round((l.unit_price - b.list_price) * l.quantity, 2) end,
  case
    when b.line_id is null then 'no_price'
    when not b.unit_match then 'uom_review'
    when l.quantity > 0 and l.unit_price > b.list_price then 'discrepancy'
    else 'valid'
  end,
  case when b.expiry_date is not null and b.expiry_date < i.invoice_date
       then 'PAEXP-' || b.expiry_date end
from v_invoice_audit_line l
join inv i on i.invoice_number = l.invoice_number
left join best b on b.line_id = l.line_id::text
where l.is_auditable
on conflict (run_label, invoice_number, line_id) do nothing;
