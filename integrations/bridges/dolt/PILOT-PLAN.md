# Dolt Pilot Plan

Status: active KB v1
Last verified: 2026-06-10

## Objective

Evaluate whether Dolt improves review quality for versioned, non-sensitive Open Brain reference datasets without weakening Supabase as the source of truth.

## Pilot Dataset Candidates

Start with one of these:

| Dataset | Reason | Risk |
| --- | --- | --- |
| Roofing product category taxonomy | Small, useful, easy to inspect. | Low if pricing is excluded. |
| Manufacturer public product mapping | Diffable and repeatable. | Medium because licensing/source provenance must be checked. |
| Jurisdiction code references | Good for data PR workflow. | Medium because source freshness matters. |
| Sanitized vendor branch coverage | Useful for branch mapping QA. | Medium-high because addresses/contact details need approval. |

Do not start with customer, invoice, negotiated pricing, or memory tables.

## Phase 1: Local-Only Baseline

1. Pick one approved dataset.
2. Export a sanitized CSV.
3. Import into a local Dolt repo.
4. Commit the baseline.
5. Record row count, schema, and source.

Exit criteria:

- `node scripts/dolt-lab-preflight.mjs --offline` passes or has only the expected "no Dolt repo" warning before repo creation.
- Import succeeds with a primary key.
- `dolt diff` is understandable to a reviewer.

## Phase 2: Change Review

1. Create a branch.
2. Apply a representative update file.
3. Generate `dolt diff main..HEAD`.
4. Ask Auditor or Quality Control to review.

Exit criteria:

- Reviewer can identify all adds/edits/deletes.
- No sensitive fields appear.
- Proposed promotion path is clear.

## Phase 3: Promotion Dry Run

1. Export accepted rows from Dolt.
2. Build a Supabase import dry run or migration.
3. Run Supabase preflight against a branch or local target.
4. Compare post-import counts against Dolt.

Exit criteria:

- No direct production write.
- Row-count and sample checks match.
- Rollback approach is documented.

## Phase 4: Remote Evaluation

Only after local success, decide whether a DoltHub/DoltLab remote is useful.

Remote approval requires:

- Data-class approval.
- No secrets or PII.
- Repo visibility decision.
- Retention owner.
- Naming convention.

## Success Metrics

- Reviewer can understand dataset changes faster than CSV-only review.
- No blocked data classes enter Dolt.
- Promotion back to Supabase stays migration/import based.
- Lab cleanup is repeatable.

## Go/No-Go Decision

Go if Dolt produces clearer data reviews without introducing secret, privacy, or operational risk.

No-go if the dataset review remains easier in Supabase, the data class is too sensitive, or remote controls are not strong enough for our governance model.
