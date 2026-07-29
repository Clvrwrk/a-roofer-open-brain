## Scope

- Source jobs: 6,574.
- Non-archived jobs after applying `archived_at IS NULL`: 6,574; 0 archived rows excluded.
- Non-sandbox jobs after applying `account_key <> 'sandbox'`: 6,574; 0 sandbox rows existed in the current source snapshot. The sandbox exclusion was applied throughout.
- Jobs already mapped as JobTread `job` entities and excluded: 25 pilot jobs.
- Bulk jobs eligible for staging: 6,549.
- Distinct nonblank representative names considered for the Sales Rep option set: 78. This is below the 300-option cap, so the full set was used.
- Eligible bulk jobs with a high- or medium-confidence CompanyCam match: 4,788.

## Domains Staged

- `custom_fields`: 1 `updateCustomField` row at execution order 15. The literal Sales Rep field ID is used, and its options contain the existing options plus all distinct representative names and `Unassigned` (79 options total).
- `jobs`: 6,549 `createJob` rows at execution order 90.
- `job_custom_values`: 6,549 `updateJob` rows at execution order 100, one for every staged bulk job.
- Existing `executed`, `skipped`, and `failed` rows were not modified. Idempotent cleanup was limited to prior rows with `status = 'staged'` in these three domains.

## Truncations Applied

- 748 job names exceeded JobTread's 30-character limit and were shortened at a word boundary with an ellipsis.
- All 748 truncated jobs received `AccuLynx name: <full name>` at the start of the description, matching the pilot convention.
- 0 staged job names remain over 30 characters.
- No `externalId` is part of the proven `createJob` payload used by this domain, so no external ID truncation was required.

## Assumptions

- The nine branch labels come from `public.acculynx_accounts.label`; the applied non-sandbox labels are Florida, Colorado, Georgia, Kansas City, Texas, Wichita, Insurance Program, and Multi-Family / Commercial.
- Sales Rep values use the nonblank `SalesOwner` representative for the job; jobs without one receive `Unassigned`. People are represented only as custom-field values—no invites, memberships, or assignees were staged.
- When multiple eligible CompanyCam projects match one job, selection is deterministic: high confidence before medium, exact street/ZIP before disambiguated matches, then the most recently fetched row. The public timeline URL is preferred, with the project URL as fallback.
- Blank AccuLynx job numbers are omitted from `createJob` and preserved as an empty string in the AccuLynx Job # custom field, matching the executed pilot behavior.
- Job and location references use `$ref` because all staged jobs are deliberately absent from the `job` crosswalk. Literal custom-field IDs are used for every custom value.

## Verdict

PASS — 13,099 rows are staged across the assigned domains (1 custom-field option extension, 6,549 jobs, and 6,549 job custom-value updates). The repository B2 jobs gate passes all five checks. Additional live validation found zero crosswalked jobs restaged, zero overlength names, zero malformed truncation descriptions, zero mismatched job references, zero blank branch or Sales Rep values, zero Sales Rep values missing from the extended option set, zero duplicate domain/source references, and zero staged `notify=true` payloads.
