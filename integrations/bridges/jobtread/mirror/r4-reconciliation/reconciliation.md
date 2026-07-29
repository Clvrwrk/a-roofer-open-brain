# JobTread / AccuLynx Reconciliation

## Views Created

```sql
CREATE OR REPLACE VIEW jt_mirror.v_recon_summary AS
WITH source_counts(domain, source_count) AS (
  VALUES
    (
      'jobs'::text,
      (
        SELECT count(*)::bigint
        FROM public.acculynx_jobs j
        WHERE j.archived_at IS NULL
          AND j.account_key <> 'sandbox'
      )
    ),
    (
      'customer_accounts',
      (
        WITH scoped_jobs AS (
          SELECT j.*
          FROM public.acculynx_jobs j
          WHERE j.archived_at IS NULL
            AND j.account_key <> 'sandbox'
        ),
        contacts AS (
          SELECT jc.contact_id
          FROM public.acculynx_job_contacts jc
          JOIN scoped_jobs j ON j.id = jc.job_id
          WHERE nullif(jc.contact_id, '') IS NOT NULL
          UNION
          SELECT c.el->'contact'->>'id'
          FROM scoped_jobs j
          CROSS JOIN LATERAL jsonb_array_elements(
            coalesce(j.raw->'contacts', '[]'::jsonb)
          ) c(el)
          WHERE coalesce((c.el->>'isPrimary')::boolean, false)
            AND nullif(c.el->'contact'->>'id', '') IS NOT NULL
        )
        SELECT count(*)::bigint
        FROM contacts
      )
    ),
    (
      'vendor_accounts',
      (
        SELECT count(*)::bigint
        FROM acculynx_backfill.vendors v
        WHERE v.archived_at IS NULL
          AND v.account_key <> 'sandbox'
      )
    ),
    (
      'locations',
      (
        SELECT count(*)::bigint
        FROM public.acculynx_jobs j
        WHERE j.archived_at IS NULL
          AND j.account_key <> 'sandbox'
      )
    ),
    (
      'documents',
      (
        SELECT count(*)::bigint
        FROM public.acculynx_estimates e
        JOIN public.acculynx_jobs j ON j.id = e.job_id
        WHERE j.archived_at IS NULL
          AND j.account_key <> 'sandbox'
      )
    ),
    (
      'daily_logs',
      (
        SELECT count(DISTINCT h.job_id)::bigint
        FROM public.acculynx_job_milestone_history h
        JOIN public.acculynx_jobs j ON j.id = h.job_id
        WHERE j.archived_at IS NULL
          AND j.account_key <> 'sandbox'
      )
    ),
    (
      'catalog_items',
      (
        SELECT count(*)::bigint
        FROM (
          SELECT DISTINCT
            coalesce(
              nullif(trim(i.override_name), ''),
              nullif(trim(i.name), '')
            ) AS effective_name,
            nullif(trim(i.estimate_unit), '') AS estimate_unit
          FROM acculynx_backfill.estimate_items i
          JOIN jt_mirror.pilot_jobs pj
            ON pj.acculynx_job_id = i.job_id
          WHERE coalesce(
                  nullif(trim(i.override_name), ''),
                  nullif(trim(i.name), '')
                ) IS NOT NULL
            AND nullif(trim(i.estimate_unit), '') IS NOT NULL
        ) catalog_scope
      )
    ),
    (
      'cost_codes',
      (
        SELECT count(*)::bigint
        FROM public.qbo_accounts q
        WHERE q.active IS TRUE
          AND q.account_type = 'Cost of Goods Sold'
      )
    ),
    (
      'custom_fields',
      (
        SELECT count(DISTINCT p.source_ref)::bigint
        FROM jt_mirror.pending_write p
        WHERE p.domain = 'custom_fields'
          AND p.pave_op = 'createCustomField'
      )
    ),
    (
      'units',
      (
        SELECT count(DISTINCT nullif(trim(i.estimate_unit), ''))::bigint
        FROM acculynx_backfill.estimate_items i
      )
    )
),
crosswalk_counts(domain, crosswalk_count) AS (
  VALUES
    (
      'jobs'::text,
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'jobs'
          AND x.jt_type = 'job'
      )
    ),
    (
      'customer_accounts',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'customer_accounts'
          AND x.jt_type = 'account'
      )
    ),
    (
      'vendor_accounts',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'vendor_accounts'
          AND x.jt_type = 'account'
      )
    ),
    (
      'locations',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'locations'
          AND x.jt_type = 'location'
      )
    ),
    (
      'documents',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'documents'
          AND x.jt_type = 'document'
      )
    ),
    (
      'daily_logs',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'daily_logs'
          AND lower(replace(x.jt_type, '_', '')) = 'dailylog'
      )
    ),
    (
      'catalog_items',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'catalog_items'
          AND lower(replace(x.jt_type, '_', '')) = 'costitem'
      )
    ),
    (
      'cost_codes',
      (
        SELECT count(*)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'cost_codes'
          AND lower(replace(x.jt_type, '_', '')) = 'costcode'
      )
    ),
    (
      'custom_fields',
      (
        SELECT count(DISTINCT x.jt_id)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'custom_fields'
          AND lower(replace(x.jt_type, '_', '')) = 'customfield'
      )
    ),
    (
      'units',
      (
        SELECT count(DISTINCT x.jt_id)::bigint
        FROM jt_mirror.crosswalk x
        WHERE x.domain = 'units'
          AND x.jt_type = 'unit'
      )
    )
),
executed_counts AS (
  SELECT p.domain, count(*)::bigint AS executed_count
  FROM jt_mirror.pending_write p
  WHERE p.status IN ('executed', 'skipped')
  GROUP BY p.domain
)
SELECT
  s.domain,
  s.source_count,
  x.crosswalk_count,
  coalesce(e.executed_count, 0::bigint) AS executed_count,
  s.source_count - x.crosswalk_count AS delta,
  round(
    100.0 * x.crosswalk_count / nullif(s.source_count, 0),
    2
  ) AS pct_mirrored
FROM source_counts s
JOIN crosswalk_counts x USING (domain)
LEFT JOIN executed_counts e USING (domain)
ORDER BY array_position(
  ARRAY[
    'jobs',
    'customer_accounts',
    'vendor_accounts',
    'locations',
    'documents',
    'daily_logs',
    'catalog_items',
    'cost_codes',
    'custom_fields',
    'units'
  ]::text[],
  s.domain
);

CREATE OR REPLACE VIEW jt_mirror.v_recon_jobs_by_branch AS
WITH job_crosswalk AS (
  SELECT DISTINCT x.source_id
  FROM jt_mirror.crosswalk x
  WHERE x.domain = 'jobs'
    AND x.jt_type = 'job'
)
SELECT
  j.account_key AS branch_key,
  count(*)::bigint AS source_jobs,
  count(x.source_id)::bigint AS mirrored_jobs,
  (count(*) - count(x.source_id))::bigint AS delta,
  round(
    100.0 * count(x.source_id) / nullif(count(*), 0),
    2
  ) AS pct_mirrored
FROM public.acculynx_jobs j
LEFT JOIN job_crosswalk x ON x.source_id = j.id
WHERE j.archived_at IS NULL
  AND j.account_key <> 'sandbox'
GROUP BY j.account_key
ORDER BY j.account_key;

CREATE OR REPLACE VIEW jt_mirror.v_recon_jobs_by_milestone AS
WITH milestone_field AS (
  SELECT x.jt_id
  FROM jt_mirror.crosswalk x
  WHERE x.domain = 'custom_fields'
    AND (
      (
        x.source_table = 'milestone_settings'
        AND x.source_id = 'custom-field-milestone'
      )
      OR (
        x.source_table = 'jt_stage_custom_field'
        AND x.source_id = 'AccuLynx Milestone'
      )
    )
  ORDER BY
    (x.source_table = 'milestone_settings') DESC,
    x.id
  LIMIT 1
),
source_milestones AS (
  SELECT
    coalesce(nullif(trim(j.current_milestone), ''), '(blank)') AS milestone,
    count(*)::bigint AS source_jobs
  FROM public.acculynx_jobs j
  WHERE j.archived_at IS NULL
    AND j.account_key <> 'sandbox'
  GROUP BY 1
),
mirrored_milestones AS (
  SELECT
    coalesce(
      nullif(
        trim(
          p.payload->'$'->'customFieldValues'->>(
            SELECT mf.jt_id FROM milestone_field mf
          )
        ),
        ''
      ),
      '(blank)'
    ) AS milestone,
    count(*)::bigint AS mirrored_jobs
  FROM jt_mirror.pending_write p
  WHERE p.domain = 'job_custom_values'
    AND p.status IN ('executed', 'skipped')
  GROUP BY 1
)
SELECT
  coalesce(s.milestone, m.milestone) AS milestone,
  coalesce(s.source_jobs, 0::bigint) AS source_jobs,
  coalesce(m.mirrored_jobs, 0::bigint) AS mirrored_jobs,
  coalesce(s.source_jobs, 0::bigint)
    - coalesce(m.mirrored_jobs, 0::bigint) AS delta,
  round(
    100.0 * coalesce(m.mirrored_jobs, 0::bigint)
      / nullif(coalesce(s.source_jobs, 0::bigint), 0),
    2
  ) AS pct_mirrored
FROM source_milestones s
FULL JOIN mirrored_milestones m USING (milestone)
ORDER BY milestone;

CREATE OR REPLACE VIEW jt_mirror.v_recon_documents_totals AS
WITH pending_document_totals AS (
  SELECT
    p.id AS pending_write_id,
    split_part(p.source_ref, ':', 2) AS estimate_id,
    p.status AS pending_status,
    p.jt_id AS pending_jt_document_id,
    count(li.el)::bigint AS line_item_count,
    coalesce(
      sum(
        coalesce(nullif(li.el->>'quantity', '')::numeric, 0)
        * coalesce(nullif(li.el->>'unitPrice', '')::numeric, 0)
      ),
      0
    )::numeric AS line_item_sum
  FROM jt_mirror.pending_write p
  LEFT JOIN LATERAL jsonb_array_elements(
    coalesce(p.payload->'lineItems', '[]'::jsonb)
  ) li(el) ON true
  WHERE p.domain = 'documents'
    AND p.status IN ('staged', 'executed')
  GROUP BY
    p.id,
    split_part(p.source_ref, ':', 2),
    p.status,
    p.jt_id
),
document_crosswalk AS (
  SELECT x.source_id AS estimate_id, x.jt_id
  FROM jt_mirror.crosswalk x
  WHERE x.domain = 'documents'
    AND x.jt_type = 'document'
)
SELECT
  e.id AS estimate_id,
  p.pending_status,
  coalesce(x.jt_id, p.pending_jt_document_id) AS jt_document_id,
  round(e.total_price, 2) AS source_total_price,
  CASE
    WHEN p.pending_write_id IS NULL THEN NULL::numeric
    ELSE round(p.line_item_sum, 2)
  END AS staged_executed_line_item_sum,
  CASE
    WHEN e.total_price IS NULL OR p.pending_write_id IS NULL
      THEN NULL::numeric
    ELSE round(e.total_price - p.line_item_sum, 2)
  END AS delta,
  coalesce(p.line_item_count, 0::bigint) AS line_item_count
FROM public.acculynx_estimates e
JOIN public.acculynx_jobs j ON j.id = e.job_id
LEFT JOIN pending_document_totals p ON p.estimate_id = e.id
LEFT JOIN document_crosswalk x ON x.estimate_id = e.id
WHERE j.archived_at IS NULL
  AND j.account_key <> 'sandbox'
ORDER BY e.id;

CREATE OR REPLACE VIEW jt_mirror.v_recon_unmirrored AS
WITH contact_attachments AS (
  SELECT
    jc.contact_id AS source_id,
    j.account_key,
    j.archived_at,
    true AS normalized_link,
    coalesce(jc.is_primary, false) AS is_primary
  FROM public.acculynx_job_contacts jc
  JOIN public.acculynx_jobs j ON j.id = jc.job_id
  WHERE nullif(jc.contact_id, '') IS NOT NULL
  UNION ALL
  SELECT
    c.el->'contact'->>'id' AS source_id,
    j.account_key,
    j.archived_at,
    false AS normalized_link,
    coalesce((c.el->>'isPrimary')::boolean, false) AS is_primary
  FROM public.acculynx_jobs j
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(j.raw->'contacts', '[]'::jsonb)
  ) c(el)
  WHERE nullif(c.el->'contact'->>'id', '') IS NOT NULL
),
customer_sources AS (
  SELECT
    'customer_accounts'::text AS domain,
    'acculynx_job_contacts+acculynx_jobs.raw.contacts'::text AS source_table,
    source_id,
    CASE
      WHEN count(DISTINCT account_key) = 1 THEN min(account_key)
      ELSE 'multiple'
    END::text AS source_account_key,
    bool_and(archived_at IS NOT NULL) AS is_archived,
    bool_and(account_key = 'sandbox') AS is_sandbox,
    bool_or(
      archived_at IS NULL
      AND account_key <> 'sandbox'
      AND (normalized_link OR is_primary)
    ) AS in_summary_scope,
    ('acculynx_contact:' || source_id)::text AS pending_source_ref,
    CASE
      WHEN NOT bool_or(normalized_link) AND NOT bool_or(is_primary)
        THEN 'raw-only non-primary job contact; absent from normalized job contacts'
      ELSE 'job-attached contact has no canonical account crosswalk'
    END::text AS gap_detail
  FROM contact_attachments
  GROUP BY source_id
),
job_sources AS (
  SELECT
    'jobs'::text AS domain,
    'acculynx_jobs'::text AS source_table,
    j.id::text AS source_id,
    j.account_key::text AS source_account_key,
    (j.archived_at IS NOT NULL) AS is_archived,
    (j.account_key = 'sandbox') AS is_sandbox,
    (j.archived_at IS NULL AND j.account_key <> 'sandbox') AS in_summary_scope,
    ('acculynx_jobs:' || j.id)::text AS pending_source_ref,
    'source job has no canonical job crosswalk'::text AS gap_detail
  FROM public.acculynx_jobs j
),
vendor_sources AS (
  SELECT
    'vendor_accounts'::text AS domain,
    'acculynx_backfill.vendors'::text AS source_table,
    v.acculynx_id::text AS source_id,
    v.account_key::text AS source_account_key,
    (v.archived_at IS NOT NULL) AS is_archived,
    (v.account_key = 'sandbox') AS is_sandbox,
    (v.archived_at IS NULL AND v.account_key <> 'sandbox') AS in_summary_scope,
    ('acculynx_vendor:' || v.acculynx_id)::text AS pending_source_ref,
    'vendor source has no canonical account crosswalk'::text AS gap_detail
  FROM acculynx_backfill.vendors v
),
location_sources AS (
  SELECT
    'locations'::text AS domain,
    'acculynx_jobs'::text AS source_table,
    j.id::text AS source_id,
    j.account_key::text AS source_account_key,
    (j.archived_at IS NOT NULL) AS is_archived,
    (j.account_key = 'sandbox') AS is_sandbox,
    (j.archived_at IS NULL AND j.account_key <> 'sandbox') AS in_summary_scope,
    ('acculynx_job:' || j.id)::text AS pending_source_ref,
    'job location has no canonical location crosswalk'::text AS gap_detail
  FROM public.acculynx_jobs j
),
document_sources AS (
  SELECT
    'documents'::text AS domain,
    'acculynx_estimates'::text AS source_table,
    e.id::text AS source_id,
    coalesce(e.account_key, j.account_key)::text AS source_account_key,
    (j.archived_at IS NOT NULL) AS is_archived,
    (j.account_key = 'sandbox') AS is_sandbox,
    (j.archived_at IS NULL AND j.account_key <> 'sandbox') AS in_summary_scope,
    ('acculynx_estimates:' || e.id)::text AS pending_source_ref,
    'estimate has no canonical document crosswalk'::text AS gap_detail
  FROM public.acculynx_estimates e
  LEFT JOIN public.acculynx_jobs j ON j.id = e.job_id
),
daily_sources AS (
  SELECT
    'daily_logs'::text AS domain,
    'acculynx_job_milestone_history'::text AS source_table,
    h.job_id::text AS source_id,
    CASE
      WHEN count(DISTINCT j.account_key) = 1 THEN min(j.account_key)
      ELSE 'multiple'
    END::text AS source_account_key,
    bool_and(j.archived_at IS NOT NULL) AS is_archived,
    bool_and(j.account_key = 'sandbox') AS is_sandbox,
    bool_or(
      j.archived_at IS NULL AND j.account_key <> 'sandbox'
    ) AS in_summary_scope,
    ('acculynx_job_milestone_history:' || h.job_id)::text AS pending_source_ref,
    'job with milestone history has no canonical daily-log crosswalk'::text AS gap_detail
  FROM public.acculynx_job_milestone_history h
  LEFT JOIN public.acculynx_jobs j ON j.id = h.job_id
  GROUP BY h.job_id
),
unit_map AS (
  SELECT
    x.jt_id,
    regexp_replace(x.source_id, '^unit-', '') AS estimate_unit
  FROM jt_mirror.crosswalk x
  WHERE x.domain = 'units'
    AND x.jt_type = 'unit'
    AND x.source_table = 'acculynx_estimate_items'
),
staged_catalog AS (
  SELECT
    p.source_ref,
    p.payload->>'name' AS effective_name,
    coalesce(
      um.estimate_unit,
      regexp_replace(
        p.payload#>>'{unitId,$ref}',
        '^acculynx_estimate_items:unit-',
        ''
      )
    ) AS estimate_unit
  FROM jt_mirror.pending_write p
  LEFT JOIN unit_map um ON um.jt_id = p.payload->>'unitId'
  WHERE p.domain = 'catalog_items'
    AND p.pave_op = 'createCostItem'
),
source_catalog AS (
  SELECT
    coalesce(
      nullif(trim(i.override_name), ''),
      nullif(trim(i.name), '')
    ) AS effective_name,
    nullif(trim(i.estimate_unit), '') AS estimate_unit,
    CASE
      WHEN count(DISTINCT j.account_key) = 1 THEN min(j.account_key)
      ELSE 'multiple'
    END::text AS source_account_key,
    bool_and(j.archived_at IS NOT NULL) AS is_archived,
    bool_and(j.account_key = 'sandbox') AS is_sandbox,
    bool_or(
      j.archived_at IS NULL
      AND j.account_key <> 'sandbox'
      AND nullif(trim(i.estimate_unit), '') IS NOT NULL
    ) AS in_summary_scope
  FROM acculynx_backfill.estimate_items i
  JOIN jt_mirror.pilot_jobs pj ON pj.acculynx_job_id = i.job_id
  LEFT JOIN public.acculynx_jobs j ON j.id = i.job_id
  WHERE coalesce(
          nullif(trim(i.override_name), ''),
          nullif(trim(i.name), '')
        ) IS NOT NULL
  GROUP BY 1, 2
),
catalog_sources AS (
  SELECT
    'catalog_items'::text AS domain,
    'acculynx_backfill.estimate_items'::text AS source_table,
    coalesce(
      substring(sc.source_ref FROM position(':' IN sc.source_ref) + 1),
      'unkeyed-catalog-'
        || md5(s.effective_name || chr(31) || coalesce(s.estimate_unit, ''))
    )::text AS source_id,
    s.source_account_key,
    coalesce(s.is_archived, false) AS is_archived,
    coalesce(s.is_sandbox, false) AS is_sandbox,
    coalesce(s.in_summary_scope, false) AS in_summary_scope,
    sc.source_ref::text AS pending_source_ref,
    CASE
      WHEN s.estimate_unit IS NULL
        THEN 'pilot estimate item has no estimate_unit and no catalog crosswalk'
      ELSE 'eligible pilot catalog key has no canonical cost-item crosswalk'
    END::text AS gap_detail
  FROM source_catalog s
  LEFT JOIN staged_catalog sc
    ON sc.effective_name = s.effective_name
   AND sc.estimate_unit IS NOT DISTINCT FROM s.estimate_unit
),
cost_code_sources AS (
  SELECT
    'cost_codes'::text AS domain,
    'qbo_accounts'::text AS source_table,
    q.qbo_id::text AS source_id,
    q.realm_id::text AS source_account_key,
    (q.active IS NOT TRUE) AS is_archived,
    false AS is_sandbox,
    (q.active IS TRUE) AS in_summary_scope,
    ('qbo_accounts:' || q.qbo_id)::text AS pending_source_ref,
    CASE
      WHEN q.active IS NOT TRUE
        THEN 'QBO Cost of Goods Sold account is inactive'
      ELSE 'active Cost of Goods Sold account has no canonical cost-code crosswalk'
    END::text AS gap_detail
  FROM public.qbo_accounts q
  WHERE q.account_type = 'Cost of Goods Sold'
),
custom_field_sources AS (
  SELECT
    'custom_fields'::text AS domain,
    coalesce(
      cx.source_table,
      split_part(p.source_ref, ':', 1)
    )::text AS source_table,
    coalesce(
      cx.source_id,
      substring(p.source_ref FROM position(':' IN p.source_ref) + 1)
    )::text AS source_id,
    NULL::text AS source_account_key,
    false AS is_archived,
    false AS is_sandbox,
    true AS in_summary_scope,
    p.source_ref::text AS pending_source_ref,
    'controlled custom-field definition has no canonical custom-field crosswalk'::text
      AS gap_detail
  FROM jt_mirror.pending_write p
  LEFT JOIN LATERAL (
    SELECT x.source_table, x.source_id
    FROM jt_mirror.crosswalk x
    WHERE x.domain = 'custom_fields'
      AND x.jt_id = p.jt_id
      AND lower(replace(x.jt_type, '_', '')) = 'customfield'
    ORDER BY
      (x.source_table = 'jt_stage_custom_field'),
      (x.disposition <> 'created'),
      x.id
    LIMIT 1
  ) cx ON true
  WHERE p.domain = 'custom_fields'
    AND p.pave_op = 'createCustomField'
),
unit_sources AS (
  SELECT
    'units'::text AS domain,
    'acculynx_backfill.estimate_items'::text AS source_table,
    ('unit-' || nullif(trim(i.estimate_unit), ''))::text AS source_id,
    NULL::text AS source_account_key,
    false AS is_archived,
    false AS is_sandbox,
    true AS in_summary_scope,
    (
      'acculynx_estimate_items:unit-'
      || nullif(trim(i.estimate_unit), '')
    )::text AS pending_source_ref,
    'nonblank estimate unit has no canonical unit crosswalk'::text AS gap_detail
  FROM acculynx_backfill.estimate_items i
  WHERE nullif(trim(i.estimate_unit), '') IS NOT NULL
  GROUP BY nullif(trim(i.estimate_unit), '')
),
source_universe AS (
  SELECT * FROM job_sources
  UNION ALL
  SELECT * FROM customer_sources
  UNION ALL
  SELECT * FROM vendor_sources
  UNION ALL
  SELECT * FROM location_sources
  UNION ALL
  SELECT * FROM document_sources
  UNION ALL
  SELECT * FROM daily_sources
  UNION ALL
  SELECT * FROM catalog_sources
  UNION ALL
  SELECT * FROM cost_code_sources
  UNION ALL
  SELECT * FROM custom_field_sources
  UNION ALL
  SELECT * FROM unit_sources
),
skipped AS (
  SELECT p.domain, p.source_ref, count(*)::bigint AS skipped_rows
  FROM jt_mirror.pending_write p
  WHERE p.status = 'skipped'
  GROUP BY p.domain, p.source_ref
)
SELECT
  s.domain,
  s.source_table,
  s.source_id,
  s.source_account_key,
  s.in_summary_scope,
  CASE
    WHEN coalesce(s.is_archived, false) THEN 'archived'
    WHEN coalesce(s.is_sandbox, false) THEN 'sandbox'
    WHEN sk.skipped_rows IS NOT NULL THEN 'skipped-dedupe'
    ELSE 'gap'
  END::text AS reason_category,
  CASE
    WHEN coalesce(s.is_archived, false) THEN s.gap_detail
    WHEN coalesce(s.is_sandbox, false)
      THEN 'source belongs to sandbox account_key'
    WHEN sk.skipped_rows IS NOT NULL
      THEN 'terminal skipped write exists but no canonical crosswalk'
    ELSE s.gap_detail
  END::text AS reason_evidence
FROM source_universe s
LEFT JOIN skipped sk
  ON sk.domain = s.domain
 AND sk.source_ref = s.pending_source_ref
WHERE NOT EXISTS (
  SELECT 1
  FROM jt_mirror.crosswalk x
  WHERE x.domain = s.domain
    AND x.source_id = s.source_id
)
ORDER BY s.domain, s.source_table, s.source_id;
```

## Parity Snapshot

Actual live output from `jt_mirror.v_recon_summary` after creating the views:

| domain | source_count | crosswalk_count | executed_count | delta | pct_mirrored |
| --- | ---: | ---: | ---: | ---: | ---: |
| jobs | 6,574 | 6,574 | 6,574 | 0 | 100.00% |
| customer_accounts | 6,585 | 6,585 | 6,585 | 0 | 100.00% |
| vendor_accounts | 1,313 | 1,313 | 1,313 | 0 | 100.00% |
| locations | 6,574 | 6,574 | 6,574 | 0 | 100.00% |
| documents | 212 | 212 | 212 | 0 | 100.00% |
| daily_logs | 6,466 | 6,466 | 6,466 | 0 | 100.00% |
| catalog_items | 123 | 123 | 123 | 0 | 100.00% |
| cost_codes | 13 | 13 | 13 | 0 | 100.00% |
| custom_fields | 5 | 5 | 6 | 0 | 100.00% |
| units | 10 | 10 | 10 | 0 | 100.00% |

The customer denominator is the final B2 account scope: 6,528 distinct
normalized job-contact IDs plus 57 raw primary contact IDs required by
Location account references. The customer crosswalk count is therefore 6,585
source mappings; one is a dedupe mapping to an existing JobTread Account.

`custom_fields.executed_count = 6` is not an entity overage. Five
`createCustomField` operations created the five fields and one terminal
`updateCustomField` operation extended the Sales Rep options. Custom-field and
unit crosswalk counts collapse alias rows by distinct JobTread ID so aliases do
not inflate logical-entity parity.

## Notable Deltas

No `v_recon_summary` domain is below 99%; all ten are at 100%, and every
summary `delta` is zero.

The supporting views intentionally expose four non-summary issues:

1. **Milestone freshness drift:** job identity parity remains 6,574 / 6,574,
   but `v_recon_jobs_by_milestone` finds seven current-source values that
   differ from the terminal `job_custom_values` payloads:

   | mirrored spelling | current source spelling | jobs |
   | --- | --- | ---: |
   | Approved | Completed | 1 |
   | Completed | Invoiced | 1 |
   | Lead | Prospect | 2 |
   | Prospect | Approved | 2 |
   | Prospect | Cancelled | 1 |

   All seven AccuLynx job rows were modified after their pending-write rows
   were staged; one was also modified after execution. This explains the
   milestone-distribution deltas without changing entity parity. All eight
   branch rows have zero delta.

2. **Four raw-only contacts:** `v_recon_unmirrored` contains four raw,
   non-primary job contacts that have no normalized
   `acculynx_job_contacts` row and no Account crosswalk. All have
   `in_summary_scope = false` because B2 includes normalized contacts plus raw
   primary contacts. They are categorized `gap`, not `skipped-dedupe`,
   because no skipped pending-write evidence exists. The data does not prove
   whether their omission was an intentional business decision.

3. **One catalog record without a unit:** `v_recon_unmirrored` also contains
   one pilot catalog observation whose effective name is `Permit` and whose
   `estimate_unit` is null. It is outside the 123-row B2 catalog denominator,
   which requires a nonblank unit that can resolve through the unit
   crosswalk. It is categorized `gap` because it has neither a pending-write
   record nor a crosswalk; the database does not establish whether this was
   intentionally excluded or is an unhandled catalog case.

4. **Document-dollar parity is not measurable:** all 212
   `public.acculynx_estimates.total_price` values are null. The 212 executed
   document payloads contain 4,740 line items across 210 documents, with an
   aggregate `quantity * unitPrice` sum of **$4,618,896.68**; two executed
   documents have zero line items. Consequently every document `delta` is
   null, not zero. No financial-parity conclusion can be derived from the
   available estimate headers, and that limitation is unexplained beyond the
   missing source values.

## Verdict

**PASS for B2 identity parity; conditional for ongoing content parity.** All
five permanent `jt_mirror.v_recon*` views are live, every in-scope summary
domain is crosswalk-complete at 100%, all 34,433 executed writes plus 21
relevant skips remain terminal, and jobs reconcile exactly across every
branch.

The mirror should not be described as financially reconciled: source estimate
header totals are absent, so document deltas cannot be calculated. The seven
post-staging milestone changes and five out-of-scope unmirrored records are
now visible rather than suppressed and should remain open reconciliation
signals until a refresh or explicit scope decision resolves them.
