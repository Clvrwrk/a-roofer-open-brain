-- cleverwork-roofer/72-read-rpcs-invoice-gate.sql
-- (1) Live-read RPCs the dashboard proxy calls (territory + price-list snapshots).
-- (2) The invoice-paid pricing gate: an invoice cannot be marked paid unless the
--     branch/region it came from has an approved (active + ceo_verified + in-date)
--     price agreement. Resolves invoice -> abc_line_items.region_code -> agreement,
--     with account_number as fallback. ADDITIVE + IDEMPOTENT. service-role-only.

BEGIN;

-- ── Territory snapshot (matches assets/territories.json shape) ────────────────
CREATE OR REPLACE FUNCTION public.territory_snapshot()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'generated_at', now(),
    'counts', (SELECT json_object_agg(pricing_status, n) FROM (SELECT pricing_status, count(*) n FROM public.vendor_branches GROUP BY 1) t),
    'offices', (SELECT json_agg(json_build_object(
         'id',o.id,'name',o.name,'lat',o.latitude,'lng',o.longitude,'region',r.region_code,
         'drive_time_minutes',o.drive_time_minutes,'boundary',ST_AsGeoJSON(o.boundary,5)::json) ORDER BY o.name)
       FROM public.office o LEFT JOIN public.regions r ON r.id=o.region_id WHERE o.boundary IS NOT NULL),
    'branches', (SELECT json_agg(json_build_object(
         'id',vb.id,'vendor',ven.name,'name',coalesce(nullif(vb.branch_name,''),vb.city),
         'city',vb.city,'state',vb.state,'lat',round(vb.latitude,5),'lng',round(vb.longitude,5),
         'status',vb.pricing_status,'assigned',vb.pricing_territory_office_id,'suggested',vb.suggested_office_id,
         'approved',public.branch_pricing_ok(vb.id),
         'cands',(SELECT json_agg(json_build_object('o',c.office_id,'km',c.straight_km) ORDER BY c.straight_km)
                   FROM public.branch_office_candidate c WHERE c.vendor_branch_id=vb.id)))
       FROM public.vendor_branches vb JOIN public.vendors ven ON ven.id=vb.vendor_id
       WHERE vb.geocode_status='ok')
  );
$$;

-- ── Price-list snapshot (matches assets/price-lists.json shape) ───────────────
CREATE OR REPLACE FUNCTION public.price_list_snapshot()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'generated_at', now(),
    'currency', (SELECT json_agg(json_build_object(
         'office',office_name,'region',region_code,'vendor',vendor_name,'version',version_label,
         'account',account_number,'rep',sales_rep,'effective',effective_date,'expiry',expiry_date,
         'verified',ceo_verified,'status',currency_status) ORDER BY vendor_name, office_name)
       FROM public.v_price_list_currency),
    'requests', (SELECT json_agg(json_build_object(
         'id',id,'vendor',(SELECT name FROM public.vendors v WHERE v.id=pr.vendor_id),
         'to_name',recipient_name,'to_email',recipient_email,'subject',subject,'body',body,
         'reason',reason,'regions',regions,'status',status,'verified_by',verified_by) ORDER BY created_at DESC)
       FROM public.price_refresh_request pr)
  );
$$;

-- ── Invoice -> pricing gate ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_pricing_gate(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_vendor uuid; v_invno text; v_cust text; v_region text; v_agr public.price_agreements%ROWTYPE;
  v_ok boolean := false; v_reason text;
BEGIN
  SELECT vendor_id, invoice_number, customer_number INTO v_vendor, v_invno, v_cust
  FROM public.invoice_documents WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'invoice not found'); END IF;

  -- Resolve the region from the invoice's line items (most frequent region_code).
  SELECT region_code INTO v_region
  FROM public.abc_line_items WHERE invoice_number = v_invno AND region_code IS NOT NULL
  GROUP BY region_code ORDER BY count(*) DESC LIMIT 1;

  -- Latest active agreement for this vendor matching the region (or account fallback).
  SELECT pa.* INTO v_agr
  FROM public.price_agreements pa
  LEFT JOIN public.regions r ON r.id = pa.region_id
  WHERE pa.is_active IS TRUE AND pa.vendor_id = v_vendor
    AND (r.region_code = v_region OR pa.account_number = v_cust)
  ORDER BY pa.effective_date DESC NULLS LAST LIMIT 1;

  IF v_agr.id IS NULL THEN
    v_reason := 'No price agreement on file for this vendor/region ('||coalesce(v_region,'unresolved')||') — negotiate before paying.';
  ELSIF v_agr.ceo_verified IS NOT TRUE THEN
    v_reason := 'Price list not CEO-verified.';
  ELSIF v_agr.expiry_date IS NOT NULL AND current_date > v_agr.expiry_date THEN
    v_reason := 'Price list expired '||v_agr.expiry_date||' — refresh before paying.';
  ELSIF v_agr.effective_date IS NOT NULL AND current_date < v_agr.effective_date THEN
    v_reason := 'Price list not yet effective.';
  ELSE
    v_ok := true; v_reason := 'Approved price list in effect.';
  END IF;

  RETURN jsonb_build_object('ok', v_ok, 'reason', v_reason, 'vendor_id', v_vendor,
    'region', v_region, 'agreement_id', v_agr.id, 'expiry', v_agr.expiry_date);
END $$;

-- ── Payment status + enforcement ──────────────────────────────────────────────
ALTER TABLE public.invoice_documents ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.invoice_documents ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.invoice_documents ADD COLUMN IF NOT EXISTS payment_blocked_reason text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_documents_payment_status_chk') THEN
    ALTER TABLE public.invoice_documents
      ADD CONSTRAINT invoice_documents_payment_status_chk
      CHECK (payment_status IN ('unpaid','approved_to_pay','paid','blocked'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_pricing_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g jsonb;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    g := public.invoice_pricing_gate(NEW.id);
    IF NOT (g->>'ok')::boolean THEN
      RAISE EXCEPTION 'PRICING_GATE_BLOCKED: invoice % cannot be paid — %', NEW.invoice_number, g->>'reason'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.paid_at := now();
    NEW.payment_blocked_reason := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoice_pricing_gate_guard ON public.invoice_documents;
CREATE TRIGGER invoice_pricing_gate_guard BEFORE UPDATE ON public.invoice_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_pricing_gate();

-- ── Gate view for dashboards ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_invoice_pricing_gate AS
SELECT id AS invoice_id, vendor_id, invoice_number, invoice_date, customer_number, payment_status,
       (public.invoice_pricing_gate(id)->>'ok')::boolean AS pricing_ok,
       public.invoice_pricing_gate(id)->>'reason' AS gate_reason,
       public.invoice_pricing_gate(id)->>'region' AS resolved_region
FROM public.invoice_documents;

COMMENT ON VIEW public.v_invoice_pricing_gate IS
  'Per-invoice pricing-gate status. pricing_ok=false means payment is blocked until an approved price list exists.';

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.territory_snapshot(), public.price_list_snapshot(),
       public.invoice_pricing_gate(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.territory_snapshot(), public.price_list_snapshot(),
       public.invoice_pricing_gate(uuid) TO service_role;
GRANT  SELECT ON public.v_invoice_pricing_gate TO service_role;
REVOKE ALL ON public.v_invoice_pricing_gate FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
