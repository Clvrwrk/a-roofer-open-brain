# Bulk Parties Staging Report

## Scope

- Compiled against 6,574 non-archived AccuLynx jobs with `account_key <> 'sandbox'`.
- Current source exclusions were zero archived jobs and zero non-archived `sandbox` jobs. The sandbox exclusion was nevertheless applied to every source join and validation query.
- The normalized job-contact join contained 6,579 links and 6,528 distinct contacts. Of those contacts, 25 already had an Account crosswalk and were excluded, leaving exactly 6,503 customers in the B2 staging scope.
- Sixty-one jobs have no normalized `public.acculynx_job_contacts` link. Raw contact data is not part of the specified customer-account scope and was therefore excluded.
- Twenty-five in-scope jobs already had a Location crosswalk from the pilot and were excluded from Location staging.
- All source tables were read-only. Mutations were limited to the assigned `jt_mirror.pending_write` domains.

## Domains Staged

| Domain | Pave operation | Execution order | Live staged rows | Action |
| --- | --- | ---: | ---: | --- |
| `vendor_accounts` | `createAccount` | 60 | 1,263 | Reset exactly the rows previously marked `skipped` with `error = 'deferred-to-bulk'` to `staged`, cleared `error`, and set `attempt = 0`. The 50 executed rows were untouched. |
| `customer_accounts` | `createAccount` | 70 | 6,503 | Inserted one row per distinct normalized job-attached contact without an Account crosswalk. |
| `locations` | `createLocation` | 80 | 6,549 | Inserted one row per in-scope job without a Location crosswalk. |

Customer names use trimmed first and last name, then company name, then `Unknown Customer — AccuLynx <id>`; two staged customers required the final fallback.

Of the 6,549 staged Location `accountId` values, 6,492 resolve to a staged customer row. The remaining 57 refer to raw-only contacts on jobs that lack a normalized `public.acculynx_job_contacts` link. The 25 pilot Locations were excluded through their literal crosswalk mappings.

Validation found:

- zero staged source entities already crosswalked to the target JT type;
- zero duplicate `(domain, source_ref)` pairs;
- zero payload-shape or execution-order defects;
- 57 unresolved Location Account references caused by missing normalized job-contact links;
- zero archived or sandbox source rows;
- zero occurrences of `notify: true`.

## Truncations Applied

No truncations were required in these domains. The job-name and `externalId` hard-limit rules do not apply to the assigned Account and Location payload templates. No staged Account name exceeded 255 characters.

## Assumptions

- Raw-only contacts are not staged as customer Accounts because the B2 scope and live validation gate define customers strictly through `public.acculynx_job_contacts`. This removed 57 previously staged out-of-scope customer rows and brought the live staged count to the required 6,503.
- Locations remain one-per-in-scope-job as required. For the 61 jobs missing normalized contact links, the existing deterministic raw-contact fallback remains in the Location payload. Fifty-seven distinct fallback contacts have neither a staged customer Account nor an Account crosswalk, so those Location rows are not executor-ready. Resolving them requires either backfilling the normalized job-contact links or approving a different Account assignment policy.
- Email and phone backfill selection was validated primary-first and then deterministically by source ID. Among the newly staged customers, 3,475 have an available email and 5,558 have an available phone. These values were not serialized because the executed pilot's proven `createAccount` payload has exactly `name`, `type`, `organizationId`, and `__execution_order`; the documented Pave surface has no native Account email/phone inputs, and no Account-level email/phone custom fields have literal crosswalk IDs. Adding unproven keys would violate the exact-template convention and make execution unsafe.
- Location addresses follow the pilot formatter: street, city, state abbreviation (falling back to state), postal code, and a non-US country when present. Eighty-four staged Locations have at least one missing street/city/state/postal component; 70 compile to a blank address because all mapped address columns are blank. No address data was invented.
- `parseAddress` remains `true` for every Location to match the executed pilot payload exactly.
- The current source snapshot reports no archived jobs and no non-archived sandbox jobs, but both filters remain enforced.

## Verdict

**B2 PASS; EXECUTION BLOCKED FOR 57 LOCATIONS.** The live B2 parties gate passes all four assertions with 1,263 vendor Accounts, 6,503 customer Accounts, and 6,549 Locations staged. Crosswalk recreation, duplicate staged source rows, invalid domain shapes/orders, sandbox/archive leakage, and `notify: true` are all zero. Do not run the Location band until the 57 unresolved raw-only contact references are normalized or an alternate Account assignment is explicitly approved. The executor should also expect 84 incomplete addresses (70 blank).
