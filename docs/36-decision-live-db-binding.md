# Decision: Estimate/KB Schemas Bind To The Live DB, Not The OB1 Template Core

Date: 2026-06-10
Status: Decided (Chris)
Affects: `schemas/cleverwork-roofer/89-jurisdiction-snapshot.sql`, `90-estimate-pipeline.sql`, `91-kb-research-loop.sql`; docs/33 §8

## Context

When applying the docs/33 Phase 1 schemas to the live Pro Exteriors brain
(`rnhmvcpsvtqjlffpsayu`), discovery showed the OB1-template property-first core
(`property`, `client`, `job`, `crew`, `jurisdiction`, `regulatory_snapshot` from
schema files 10–30) was never applied there. The live database evolved its own
operational model:

- `public.properties` (uuid ids, created 2026-05-08) is the canonical property table.
- `public.acculynx_jobs` (text ids — AccuLynx GUIDs) is the job record; AccuLynx
  remains the system of record per docs/33 §11.
- `public.roofr_measurements` already links measurements to `properties`.
- No crew table exists.

## Decision

Bind the new schemas to live reality instead of installing a parallel core:

1. Property FKs target `public.properties(id)` (uuid).
2. Job references are `acculynx_job_id text REFERENCES public.acculynx_jobs(id)`.
3. Crew is a plain `crew_ref text` until a crew table exists.
4. `jurisdiction` + `regulatory_snapshot` WERE applied (new file 89, extracted
   from template file 10) because the kb research loop requires them for
   era-aware findings and they conflict with nothing.

## Consequences

- Template files 10–30 remain the OB1-template option for fresh brains; this
  brain documents its divergence in the 89/90/91 file headers.
- Migrations applied 2026-06-10: `jurisdiction_and_regulatory_snapshot`,
  `estimate_pipeline_phase1`, `kb_research_loop_phase1` (36 tables, all RLS
  enabled, service-role-only grants).
- Security advisor check post-apply: new tables show only the expected
  `rls_enabled_no_policy` INFO (deny-all posture until WorkOS policies land).
  Pre-existing project lints (24 `security_definer_view` ERRORs, 3
  `rls_disabled_in_public` ERRORs) predate this change and are tracked
  separately.

## Revisit Triggers

- A crew/scheduling table lands → convert `crew_ref` to a real FK.
- A future brain provisioning from this template starts clean → use files
  10–30 as designed and skip file 89.
