-- 236 — Credit-memo → original-invoice matching protocol. Additive + idempotent.
--
-- Problem: only 73 of 261 ABC credit memos (28%) carry `original_invoice_reference`,
-- so v_credit_memo_audit reported 'no_reference' for the other 188 and the work surface
-- could not link a memo to the invoice it credits. The CM PDF prints an "Orig. Inv.
-- Number", but that is an ABC-internal id in a different number space from our
-- invoice_number and it is not in the API payload — the structured fields we DO have
-- get us there without any OCR.
--
-- Signals evaluated (measured 2026-08-19 over all 261 memos):
--   originalInvoiceReference  73 memos  — explicit, exact
--   orderNumber               USELESS — a memo's orderNumber is its own invoice root,
--                             not the original's. 0 matches. Do not re-try this.
--   purchaseOrderNumber       249 memos — the job key (Customer PO# on the printed memo)
--   ship_to_number            every memo — the ABC account/branch
--   line item overlap         corroborates a PO match
--
-- Four tiers, ordered strongest first, each carrying its own confidence so a weak
-- guess is never displayed as a confirmed match (trust-tier discipline, hard rule 4):
--   reference   exact      73   original_invoice_reference root -> invoice_number root
--   po_item     confident  82   same PO + same ship-to + >=1 shared item + on/before CM date
--   po_only     probable   42   same PO + same ship-to + on/before CM date
--   shipto_item weak       57   same ship-to + >=1 shared item, within 60 days before
--   none        none        7
-- 254 of 261 matched (97%), up from 73 (28%).
--
-- The job (Customer PO#) resolves from the memo's own AccuLynx match, falling back to
-- the matched original invoice's — a memo with no PO of its own still lands on the job
-- once its original invoice is known.
--
-- PERF (236b, applied same day): office/branch are resolved directly from abc_invoices +
-- vendor_branches rather than by joining v_invoice_audit_invoice. That view recomputes the
-- whole pricing CTE, so joining it for three columns cost 2.9s and discarded 292,581 rows
-- in the join filter; resolving inline is 651ms. The office expression below is the same
-- one v_invoice_audit_invoice uses, and the two agree on all 261 memos (0 mismatches).

CREATE OR REPLACE VIEW public.v_credit_memo_match AS
WITH cm AS (
  SELECT c.invoice_number,
         c.invoice_date::date                                                   AS cm_date,
         c.total_amount,
         c.ship_to_number,
         NULLIF(btrim(c.purchase_order_number), '')                             AS po_number,
         c.original_invoice_reference,
         NULLIF(split_part(COALESCE(c.original_invoice_reference, ''), '-', 1), '') AS ref_root,
         COALESCE(c.raw ->> '_source', 'abc_api')                               AS ingest_source,
         c.raw ->> 'creditRebillReason'                                         AS credit_reason,
         c.branch_number_extracted                                              AS br_no,
         c.branch_name_extracted                                                AS br_nm,
         c.branch_city_extracted                                                AS br_city,
         c.branch_state_extracted                                               AS br_state
    FROM public.abc_invoices c
   WHERE c.is_credit_memo OR c.total_amount < 0
), cm_items AS (
  SELECT l.invoice_number, array_agg(DISTINCT l.item_number) AS items
    FROM public.v_invoice_lines_complete l
    JOIN cm ON cm.invoice_number = l.invoice_number
   GROUP BY 1
), matched AS (
  SELECT cm.*,
         COALESCE(t1.inv, t2.inv, t3.inv, t4.inv) AS original_invoice_number,
         CASE WHEN t1.inv IS NOT NULL THEN 'reference'
              WHEN t2.inv IS NOT NULL THEN 'po_item'
              WHEN t3.inv IS NOT NULL THEN 'po_only'
              WHEN t4.inv IS NOT NULL THEN 'shipto_item'
              ELSE 'none' END AS match_tier
    FROM cm
    LEFT JOIN cm_items ci ON ci.invoice_number = cm.invoice_number
    -- tier 1 · the memo names its original
    LEFT JOIN LATERAL (
      SELECT i.invoice_number AS inv
        FROM public.abc_invoices i
       WHERE cm.ref_root IS NOT NULL
         AND split_part(i.invoice_number, '-', 1) = cm.ref_root
       ORDER BY (i.invoice_number = cm.ref_root || '-001') DESC, i.invoice_number
       LIMIT 1) t1 ON true
    -- tier 2 · same job + same account + shares an item
    LEFT JOIN LATERAL (
      SELECT i.invoice_number AS inv
        FROM public.abc_invoices i
       WHERE t1.inv IS NULL AND cm.po_number IS NOT NULL AND ci.items IS NOT NULL
         AND lower(btrim(i.purchase_order_number)) = lower(cm.po_number)
         AND i.ship_to_number = cm.ship_to_number
         AND NOT (i.is_credit_memo OR i.total_amount < 0)
         AND i.invoice_date::date <= cm.cm_date
         AND EXISTS (SELECT 1 FROM public.v_invoice_lines_complete ol
                      WHERE ol.invoice_number = i.invoice_number
                        AND ol.item_number = ANY (ci.items))
       ORDER BY i.invoice_date DESC
       LIMIT 1) t2 ON true
    -- tier 3 · same job + same account, no shared item
    LEFT JOIN LATERAL (
      SELECT i.invoice_number AS inv
        FROM public.abc_invoices i
       WHERE t1.inv IS NULL AND t2.inv IS NULL AND cm.po_number IS NOT NULL
         AND lower(btrim(i.purchase_order_number)) = lower(cm.po_number)
         AND i.ship_to_number = cm.ship_to_number
         AND NOT (i.is_credit_memo OR i.total_amount < 0)
         AND i.invoice_date::date <= cm.cm_date
       ORDER BY i.invoice_date DESC
       LIMIT 1) t3 ON true
    -- tier 4 · same account + shares an item, inside 60 days. A hint, not a finding.
    LEFT JOIN LATERAL (
      SELECT i.invoice_number AS inv
        FROM public.abc_invoices i
       WHERE t1.inv IS NULL AND t2.inv IS NULL AND t3.inv IS NULL AND ci.items IS NOT NULL
         AND i.ship_to_number = cm.ship_to_number
         AND NOT (i.is_credit_memo OR i.total_amount < 0)
         AND i.invoice_date::date BETWEEN cm.cm_date - 60 AND cm.cm_date
         AND EXISTS (SELECT 1 FROM public.v_invoice_lines_complete ol
                      WHERE ol.invoice_number = i.invoice_number
                        AND ol.item_number = ANY (ci.items))
       ORDER BY i.invoice_date DESC
       LIMIT 1) t4 ON true
)
SELECT m.invoice_number,
       m.cm_date,
       abs(m.total_amount)                                   AS credit_amount,
       m.ship_to_number,
       m.po_number,
       m.original_invoice_reference,
       m.ingest_source,
       m.credit_reason,
       m.original_invoice_number,
       m.match_tier,
       CASE m.match_tier WHEN 'reference'   THEN 'exact'
                         WHEN 'po_item'     THEN 'confident'
                         WHEN 'po_only'     THEN 'probable'
                         WHEN 'shipto_item' THEN 'weak'
                         ELSE 'none' END                     AS match_confidence,
       oi.invoice_date::date                                 AS original_invoice_date,
       oi.total_amount                                       AS original_invoice_amount,
       NULLIF(btrim(oi.purchase_order_number), '')           AS original_po_number,
       -- office / branch, resolved exactly as the Invoice Audit resolves them
       m.br_no                                               AS branch_number,
       COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), m.br_nm,
                'Branch ' || COALESCE(m.br_no, m.ship_to_number))   AS branch_name,
       COALESCE((SELECT o.name FROM public.office o WHERE o.id = vb.pricing_territory_office_id),
                NULLIF(btrim((COALESCE(m.br_city, avb.city, '') || ', ') || COALESCE(m.br_state, avb.state, '')), ',') || ' area',
                'Unassigned')                                AS office,
       -- job: the memo's own AccuLynx match, else the original invoice's
       COALESCE(jc.pe_job_number, jo.pe_job_number)          AS job_number,
       COALESCE(jc.acculynx_job_id, jo.acculynx_job_id)      AS acculynx_job_id,
       COALESCE(jc.client_name, jo.client_name)              AS client_name,
       CASE WHEN jc.pe_job_number IS NOT NULL THEN 'credit_memo'
            WHEN jo.pe_job_number IS NOT NULL THEN 'original_invoice'
            ELSE NULL END                                    AS job_source
  FROM matched m
  LEFT JOIN public.abc_invoices oi ON oi.invoice_number = m.original_invoice_number
  LEFT JOIN LATERAL (SELECT a.branch_name, a.city, a.state
                       FROM public.abc_vendor_branches a
                      WHERE m.br_no IS NOT NULL AND ltrim(a.branch_number,'0') = ltrim(m.br_no,'0')
                      LIMIT 1) avb ON true
  -- 238: vendor-scoped. The unscoped version of this lateral (my copy of the one in
  -- v_invoice_audit_invoice) put memo 2009375632-001 and its $422.14 under Richardson, TX
  -- because QXO shares ABC's branch number 472.
  LEFT JOIN LATERAL public.abc_display_branch(m.br_no) vb ON true
  LEFT JOIN public.v_invoice_acculynx_match jc ON jc.invoice_number = m.invoice_number
  LEFT JOIN public.v_invoice_acculynx_match jo ON jo.invoice_number = m.original_invoice_number;

COMMENT ON VIEW public.v_credit_memo_match IS
  'Credit memo -> original invoice matching protocol (migration 236). Four tiers with explicit confidence: reference (exact) > po_item (confident) > po_only (probable) > shipto_item (weak). Never present a weak tier as a confirmed match. Also carries office/branch (resolved exactly as v_invoice_audit_invoice does, without joining that view) and the AccuLynx job, inherited from the original invoice when the memo has none.';
