# Supabase Product Surface Integration

## Scope

This pass wires the Command Center to the current Pro Exteriors Supabase instance as the first real data surface. It does not move, rename, sanitize, or extract the large copied project folders.

- Command Center loader: `app/command-center/src/lib/product-data.ts`
- Server-only Supabase client: `app/command-center/src/lib/supabase.server.ts`
- Dashboard route: `app/command-center/src/pages/index.astro`
- JSON route: `app/command-center/src/pages/api/product-surface.json.ts`
- Supabase project: `rnhmvcpsvtqjlffpsayu`
- Supabase URL: `https://rnhmvcpsvtqjlffpsayu.supabase.co`
- Project name: `Pro Exteriors LLC - Agent Workforce`

## Runtime Contract

The product surface is server-rendered and uses only server-side credentials.

Required environment:

- `SUPABASE_URL` or `PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not put the service-role key in any `PUBLIC_` variable. The current route returns sanitized source status, counts, and field coverage rather than raw rows. A later authenticated detail view can expose richer data after WorkOS is active in production.

## Product Sources

The initial surface calls four existing read RPCs:

- `price_list_snapshot`
- `invoice_gate_snapshot`
- `agreement_audit_snapshot`
- `catalog_snapshot(p_limit => 25)`

Relevant discovered pricing/product tables and views include:

- `abc_price_agreements`
- `abc_price_change_log`
- `abc_price_list_items`
- `abc_product_categories`
- `price_agreements`
- `price_agreement_items`
- `price_refresh_request`
- `product_color_variants`
- `product_taxonomy`
- `product_uom_conversions`
- `product_vendor_price_observations`
- `products`
- `v_current_negotiated_pricing`
- `v_invoice_pricing_gate`
- `v_price_list_currency`

Related property and lead layers are already present in Supabase, including `collin_cad_appraisal_data`, `lead_list`, and `call_priority_today`. Those belong in the next Command Center surfaces after this product-file lane is stable.

## Safety Notes

- No live business snapshot rows were exported into the implementation context.
- The Supabase connector reported an advisory that `public.spatial_ref_sys` has RLS disabled. This was not remediated because schema or policy changes need a separate approval pass.
- Views and RPCs should be audited before any public or agent-facing exposure. Views can bypass RLS unless created with `security_invoker = true` on supported Postgres versions.
- Keep imported website, pricing/accounting, and property-enrichment folders untouched until Maintenance produces an approved sanitize/extract manifest.

## Next Pass

1. Add generated Supabase TypeScript types once the schema is ready to freeze for this app lane.
2. Protect `/` and `/api/product-surface.json` with WorkOS before deploying live business details.
3. Add a product detail drill-in for negotiated pricing, agreement audit deltas, and invoice gate exceptions.
4. Add the property layer cake as its own Sales/Executive surface after the product-file lane is verified.
