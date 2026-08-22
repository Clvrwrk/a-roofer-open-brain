# JobTread–AccuLynx Mirror Pilot Selection

## Selection SQL

Table creation (run once):

```sql
CREATE TABLE IF NOT EXISTS jt_mirror.pilot_jobs (
  acculynx_job_id text PRIMARY KEY,
  job_name text,
  job_number text,
  branch_key text,
  milestone text,
  has_estimate boolean,
  has_invoice boolean,
  selection_reason text,
  created_at timestamptz DEFAULT now()
);
```

Exact idempotent insert executed:

```sql
BEGIN;
DELETE FROM jt_mirror.pilot_jobs;

WITH eligible AS (
  SELECT
    j.id,
    j.job_name,
    j.job_number,
    j.account_key AS branch_key,
    j.current_milestone AS milestone,
    j.modified_date,
    EXISTS (
      SELECT 1 FROM public.acculynx_estimates e WHERE e.job_id = j.id
    ) AS has_estimate,
    EXISTS (
      SELECT 1 FROM public.acculynx_invoices i WHERE i.job_id = j.id
    ) AS has_invoice,
    EXISTS (
      SELECT 1 FROM public.acculynx_job_contacts c WHERE c.job_id = j.id
    ) AS has_contact,
    EXISTS (
      SELECT 1 FROM public.acculynx_job_financials f WHERE f.job_id = j.id
    ) AS has_financial
  FROM public.acculynx_jobs j
  WHERE j.archived_at IS NULL
    AND lower(coalesce(j.account_key, '')) NOT LIKE '%sandbox%'
),
terminal AS (
  SELECT id, 'Rich terminal-stage coverage'::text AS reason
  FROM eligible
  WHERE milestone IN ('Completed', 'Closed')
    AND has_estimate AND has_invoice AND has_contact AND has_financial
  ORDER BY modified_date DESC NULLS LAST, id
  LIMIT 2
),
early AS (
  SELECT id, 'Rich early-stage coverage'::text AS reason
  FROM eligible
  WHERE milestone IN ('Lead', 'Prospect')
    AND has_estimate AND has_contact AND has_financial
    AND id NOT IN (SELECT id FROM terminal)
  ORDER BY modified_date DESC NULLS LAST, id
  LIMIT 2
),
branch_ranked AS (
  SELECT
    e.id,
    row_number() OVER (
      PARTITION BY e.branch_key
      ORDER BY
        (e.has_estimate AND e.has_invoice) DESC,
        e.has_contact DESC,
        e.has_financial DESC,
        e.modified_date DESC NULLS LAST,
        e.id
    ) AS rn
  FROM eligible e
  WHERE e.branch_key IN ('colorado', 'kansas_city', 'texas', 'wichita')
    AND e.id NOT IN (SELECT id FROM terminal UNION ALL SELECT id FROM early)
),
branch_seed AS (
  SELECT id, 'Four-branch rich-data coverage'::text AS reason
  FROM branch_ranked
  WHERE rn = 1
),
estimate_fill AS (
  SELECT id, 'Estimate-rich recent job'::text AS reason
  FROM eligible
  WHERE has_estimate AND has_contact AND has_financial
    AND id NOT IN (
      SELECT id FROM terminal
      UNION ALL SELECT id FROM early
      UNION ALL SELECT id FROM branch_seed
    )
  ORDER BY has_invoice DESC, modified_date DESC NULLS LAST, id
  LIMIT 6
),
invoice_fill AS (
  SELECT id, 'Invoice-rich recent job'::text AS reason
  FROM eligible
  WHERE has_invoice AND has_contact AND has_financial
    AND id NOT IN (
      SELECT id FROM terminal
      UNION ALL SELECT id FROM early
      UNION ALL SELECT id FROM branch_seed
      UNION ALL SELECT id FROM estimate_fill
    )
  ORDER BY has_estimate DESC, modified_date DESC NULLS LAST, id
  LIMIT 6
),
recent_fill AS (
  SELECT id, 'Recent job with contacts and financials'::text AS reason
  FROM eligible
  WHERE has_contact AND has_financial
    AND id NOT IN (
      SELECT id FROM terminal
      UNION ALL SELECT id FROM early
      UNION ALL SELECT id FROM branch_seed
      UNION ALL SELECT id FROM estimate_fill
      UNION ALL SELECT id FROM invoice_fill
    )
  ORDER BY
    has_estimate DESC,
    has_invoice DESC,
    modified_date DESC NULLS LAST,
    id
  LIMIT 5
),
chosen AS (
  SELECT * FROM terminal
  UNION ALL SELECT * FROM early
  UNION ALL SELECT * FROM branch_seed
  UNION ALL SELECT * FROM estimate_fill
  UNION ALL SELECT * FROM invoice_fill
  UNION ALL SELECT * FROM recent_fill
)
INSERT INTO jt_mirror.pilot_jobs (
  acculynx_job_id,
  job_name,
  job_number,
  branch_key,
  milestone,
  has_estimate,
  has_invoice,
  selection_reason
)
SELECT
  e.id,
  e.job_name,
  e.job_number,
  e.branch_key,
  e.milestone,
  e.has_estimate,
  e.has_invoice,
  c.reason
FROM chosen c
JOIN eligible e USING (id);

DO $$
BEGIN
  IF (SELECT count(*) FROM jt_mirror.pilot_jobs) <> 25 THEN
    RAISE EXCEPTION 'pilot cohort must contain exactly 25 jobs';
  END IF;
END $$;
COMMIT;
```

## Cohort

| job_number | name | branch | milestone | has_estimate | has_invoice | reason |
| --- | --- | --- | --- | --- | --- | --- |
| CO-354 | CO-354: Melissa Kepler | colorado | Completed | true | true | Rich terminal-stage coverage |
| CO-352 | CO-352: Melissa Kepler | colorado | Invoiced | true | true | Four-branch rich-data coverage |
| INS-4 | INS-4: Sarita Alfaro | insurance_program | Invoiced | true | true | Recent job with contacts and financials |
| KC-12 | KC-12: private client | kansas_city | Completed | true | true | Four-branch rich-data coverage |
| MC-49 | MC-49: Lone Star Towers - Condos (Texas Motor Speedway) | multi_family_commercial | Completed | true | true | Invoice-rich recent job |
| TX-281 | TX-281: Dana Woodward | texas | Completed | true | true | Four-branch rich-data coverage |
| — | David Abbott | texas | Prospect | true | false | Rich early-stage coverage |
| KS-155 | KS-155: Greg Zielke | wichita | Approved | true | true | Estimate-rich recent job |
| KS-158 | KS-158: William Fish | wichita | Approved | true | true | Estimate-rich recent job |
| KS-161 | KS-161: Steve Rooker | wichita | Approved | true | true | Invoice-rich recent job |
| KS-162 | KS-162: David Martens | wichita | Approved | true | true | Estimate-rich recent job |
| KS-167 | KS-167: Josh Plenert | wichita | Approved | true | true | Invoice-rich recent job |
| KS-173 | KS-173: NEVADA J GILARDI | wichita | Approved | true | true | Recent job with contacts and financials |
| KS-174 | KS-174: Tammy Smith | wichita | Approved | true | true | Invoice-rich recent job |
| KS-177 | KS-177: Francine Hiebert | wichita | Approved | true | true | Recent job with contacts and financials |
| KS-180 | KS-180: WADE PUGH | wichita | Approved | true | true | Invoice-rich recent job |
| KS-182 | KS-182: Charles Reinhardt | wichita | Approved | true | true | Recent job with contacts and financials |
| KS-185 | KS-185: RODNEY BILLINGS | wichita | Approved | true | true | Invoice-rich recent job |
| KS-140 | KS-140: Dale Klassen | wichita | Completed | true | true | Four-branch rich-data coverage |
| KS-141 | KS-141: Andy Klassen | wichita | Completed | true | true | Rich terminal-stage coverage |
| KS-159 | KS-159: Marjorie Hufman | wichita | Completed | true | true | Estimate-rich recent job |
| KS-164 | KS-164: Judy Klein | wichita | Completed | true | true | Estimate-rich recent job |
| KS-166 | KS-166: Lonny Kent | wichita | Completed | true | true | Estimate-rich recent job |
| KS-171 | KS-171: Keith Price | wichita | Completed | true | true | Recent job with contacts and financials |
| — | Brent Inslee | wichita | Prospect | true | false | Rich early-stage coverage |

## Coverage Summary

- Total jobs: **25**
- Jobs with estimates: **25**
- Jobs with invoices: **23**
- Jobs with contacts: **25**
- Jobs with financials: **25**
- Distinct branches: **6**
- Distinct milestones: **4**
- Completed/closed-stage jobs: **10**
- Lead/prospect-stage jobs: **2**
- Archived jobs: **0**
- Sandbox-branch jobs: **0**

Branch counts:

| branch | jobs |
| --- | ---: |
| colorado | 2 |
| insurance_program | 1 |
| kansas_city | 1 |
| multi_family_commercial | 1 |
| texas | 2 |
| wichita | 18 |

Milestone counts:

| milestone | jobs |
| --- | ---: |
| Approved | 11 |
| Completed | 10 |
| Invoiced | 2 |
| Prospect | 2 |

The source milestone vocabulary inspected before selection was: Approved, Cancelled, Closed, Completed, Invoiced, Lead, and Prospect.
