# JobTread Pilot Staging Report

## Domains Staged

Live SQL verification of `jt_mirror.pending_write` after replacement of this
stager's prior `status = 'staged'` rows:

| Domain | Pave op | Execution band | Staged rows |
| --- | --- | ---: | ---: |
| `jobs` | `createJob` | 90 | 25 |
| `job_custom_values` | `updateJob` | 100 | 25 |

All 50 owned rows have `status = 'staged'`. No row in either owned domain has
another status.

The `jobs` payloads contain the documented `createJob` inputs `locationId`,
`name`, and, where nonblank, `number`. Two pilot jobs have blank source job
numbers, so their native `number` input is omitted. The
`job_custom_values` payloads contain the documented `updateJob` inputs `id` and
`customFieldValues`.

Custom-field value coverage:

| Custom field reference | Values staged |
| --- | ---: |
| `AccuLynx Branch` | 25 |
| `AccuLynx Sales Rep` | 25 |
| `AccuLynx Milestone` | 25 |
| `AccuLynx Job #` | 25 |
| `CompanyCam Link` | 24 |

## Ref Graph

| Emitted `$ref` type | Used by | Satisfied by |
| --- | --- | --- |
| `acculynx_job:<id>` | `createJob.locationId` | Location rows staged earlier at band 80 |
| `acculynx_job:<id>` | `updateJob.id` | Job rows in this report at band 90 |
| `jt_stage_custom_field:AccuLynx Branch` | Branch custom value | Custom-field row staged earlier at band 10 |
| `jt_stage_custom_field:AccuLynx Sales Rep` | Sales-rep custom value | Custom-field row staged earlier at band 10 |
| `jt_stage_custom_field:AccuLynx Milestone` | Milestone custom value | Custom-field row staged earlier at band 10 |
| `jt_stage_custom_field:AccuLynx Job #` | Source job-number custom value | Custom-field row staged earlier at band 10 |
| `jt_stage_custom_field:CompanyCam Link` | CompanyCam URL custom value | Custom-field row staged earlier at band 10 |

## Assumptions

- The staging executor accepts dynamic custom-field entries as
  `{"customFieldId":{"$ref":"jt_stage_custom_field:<name>"},"value":<value>}`
  elements under `customFieldValues`, then resolves them into Pave's documented
  ID-keyed object before execution. This preserves the required object-form
  `$ref`; JSON cannot use an object directly as an object key.
- Branch labels come from the exact `public.acculynx_accounts.label` matching
  `pilot_jobs.branch_key`.
- The live normalized representative table names the requested discriminator
  `representative_type`, not `rep_kind`. No pilot job has a normalized
  `SalesOwner`/`sales-owner` row, so all 25 sales-rep values are `Unassigned`.
  No user, membership, invite, or assignee is staged.
- CompanyCam values use `public_url` when populated, otherwise `project_url`,
  and only rows whose `match_confidence` is `high` or `medium`. Twenty-four
  pilot jobs have an eligible link.
- Two pilot jobs have multiple eligible CompanyCam URLs: job
  `4ebb6d7d-58ea-41f9-a087-d8680963f325` has 16 and job
  `6969b369-4299-40c6-b1a6-88f8c249cb3b` has 2. The staged link is chosen
  deterministically by confidence (`high` before `medium`), newest
  `fetched_at`, then project `id`.
- Blank native JobTread job numbers are omitted per the jobs-core mapping.
  The `AccuLynx Job #` custom value remains present for all 25 jobs, using an
  empty string for the two blank source values.

## Verdict

**PASS — ready for executor preflight.** Exactly 25 pilot jobs and 25
corresponding custom-value updates are staged in the two assigned domains, with
the required execution bands and reference dependencies. No source table was
mutated, no external vendor API was called, and no seat-bearing operation was
staged.
