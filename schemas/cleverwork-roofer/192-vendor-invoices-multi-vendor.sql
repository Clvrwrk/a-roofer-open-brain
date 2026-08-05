-- 192 — Multi-vendor invoice mirror tables (QXO, SRS; ABC stays in abc_*)
-- docs/79 Phase 1 + docs/80 format spec. Additive + idempotent (hard rule 1).
-- Loader-computed canonical UOM columns (NOT generated over vendor raw JSON) —
-- the docs/46 price_per_uom contract is enforced at ingest time instead.

create table if not exists vendor_invoice_uploads (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  file_name text not null,
  file_kind text not null default 'invoice_csv', -- invoice_csv|statement_csv|invoice_pdf|price_sheet_pdf|quote_pdf
  storage_bucket text,
  storage_path text,
  sha256 text,
  source text not null default 'manual',        -- manual|email|slack|upload_ui
  parse_status text not null default 'pending', -- pending|parsed|failed|promoted
  parse_error text,
  rows_parsed integer,
  created_at timestamptz not null default now(),
  parsed_at timestamptz
);

create table if not exists vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  account_number text not null,
  invoice_number text not null,
  doc_type text not null default 'invoice',     -- invoice|credit|service_charge
  invoice_date date,
  due_date date,
  order_date date,
  ship_date date,
  branch_key text,                              -- SRS alpha code (AMDEN) / QXO numeric key
  vendor_branch_id uuid references vendor_branches(id),
  po_number text,                               -- PE job code lives here (SRS) or in statement ref (QXO)
  job_name text,
  vendor_job_number text,                       -- QXO JOB_INFO left side
  ship_to_text text,
  salesperson text,
  terms text,
  ship_via text,
  order_type text,
  sub_total numeric,
  sales_tax numeric,
  restock_fee numeric,
  ship_cost numeric,
  total_due numeric,
  ar_status text,                               -- open|closed (statement-derived)
  ar_total_due numeric,
  date_paid date,
  date_paid_is_proxy boolean not null default false,
  ar_synced_at timestamptz,
  upload_id uuid references vendor_invoice_uploads(id),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, account_number, invoice_number)
);
create index if not exists vendor_invoices_vendor_date_idx on vendor_invoices (vendor_id, invoice_date);
create index if not exists vendor_invoices_po_idx on vendor_invoices (po_number);

create table if not exists vendor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  invoice_id uuid not null references vendor_invoices(id),
  invoice_number text not null,
  line_number integer not null,
  item_number text,
  item_description text,
  ship_qty numeric,
  ship_uom text,
  price_qty numeric,
  price_uom text,
  price_per_uom numeric,                        -- canonical effective price (docs/46)
  unit_price numeric,                           -- as printed, in unit_price_uom
  extended_price numeric,
  uom_source text not null default 'vendor_native', -- vendor_native|uom_map|ship_uom_only
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_number)
);
create index if not exists vendor_invoice_lines_item_idx on vendor_invoice_lines (vendor_id, item_number);
create index if not exists vendor_invoice_lines_invnum_idx on vendor_invoice_lines (vendor_id, invoice_number);

-- SRS prints alpha branch codes (AMDEN, DJWIC) that don't exist on the public
-- branch registry; crosswalk them to vendor_branches as they are first seen.
create table if not exists vendor_branch_code_map (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  branch_code text not null,
  vendor_branch_id uuid references vendor_branches(id),
  evidence text,
  created_at timestamptz not null default now(),
  unique (vendor_id, branch_code)
);

-- Learned ship-UOM -> pricing-UOM conversions (QXO has no native pricing UOM).
create table if not exists vendor_item_uom_map (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  item_number text not null,
  ship_uom text not null,
  price_uom text not null,
  units_per_price_uom numeric not null,
  source text,                                  -- invoice_native|quote|price_sheet|description_parse
  evidence_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, item_number, ship_uom, price_uom)
);

alter table vendor_invoice_uploads enable row level security;
alter table vendor_invoices enable row level security;
alter table vendor_invoice_lines enable row level security;
alter table vendor_branch_code_map enable row level security;
alter table vendor_item_uom_map enable row level security;
