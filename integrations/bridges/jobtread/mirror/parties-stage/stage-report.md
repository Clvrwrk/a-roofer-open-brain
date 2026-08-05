# Parties Staging Report

## Domains Staged

Live SQL counts from `jt_mirror.pending_write` where `status = 'staged'`:

| Domain | Pave op | Execution order | Rows |
| --- | --- | ---: | ---: |
| `vendor_accounts` | `createAccount` | 60 | 1,313 |
| `customer_accounts` | `createAccount` | 70 | 25 |
| `locations` | `createLocation` | 80 | 25 |

The idempotency cleanup deleted zero pre-existing staged rows in these three domains. Post-stage validation found zero duplicate `(domain, source_ref)` pairs, blank names, blank location addresses, incorrect op names, incorrect execution bands, incorrect account types, or non-`staged` rows in these domains.

## Ref Graph

- `locations` emits `{"$ref":"acculynx_contact:<contact_id>"}` in `createLocation.accountId`.
- The reference is satisfied by `customer_accounts` at execution band 70. Each customer row uses the matching `source_ref = 'acculynx_contact:<contact_id>'`.
- `locations` executes at band 80, after the referenced customer Account.
- Post-stage validation found zero unresolved location account references.
- `vendor_accounts` and `customer_accounts` emit no `$ref` values.

## Assumptions

- Vendor rows were deduplicated case-insensitively by trimmed `company_name`; the current 1,313 source rows produced 1,313 distinct nonblank company names. The deterministic representative is the lowest `acculynx_id`, and its source reference is `acculynx_vendor:<acculynx_id>`.
- Every pilot job has one active primary contact. Contact selection orders active links by `is_primary DESC`, then association ID as a deterministic fallback. The 25 pilot jobs resolve to 25 distinct contacts.
- Customer Account names use trimmed `first_name + last_name`, then `company_name`, then `Unknown Customer — AccuLynx <id>`. Contacts shared across pilot jobs are deduplicated by contact ID.
- Backfill enrichment exists for 22 of 25 pilot contacts for email and 25 of 25 for phone. The documented `createAccount` input has no native email or phone field, and no earlier `custom_fields` staging rows exist to supply valid JobTread custom-field IDs. Email and phone were therefore not placed into payloads: inventing `email`, `phone`, or logical custom-field-name keys would violate the documented Pave shape and mapping contract. The executor needs provisioned Account custom-field IDs, or a separately authorized follow-up op, to carry those values into JobTread.
- Location addresses follow `jobs-core/mapping.md`: trimmed street, city, preferred state abbreviation (falling back to state), and ZIP, with a non-US country appended. All 25 pilot addresses contain street, city, state, and ZIP, so `parseAddress` is `true` for all 25.
- Location names use `<job_name> — Job Site`, falling back to the formatted address and then `AccuLynx Job Site <id>`.
- No user invite, membership, assignee, role, or real-user reference was staged.

## Verdict

**STAGED WITH DOCUMENTED CONTACT-DETAIL LIMITATION.** All three assigned domains are compiled into valid documented Pave operation shapes, use the required execution bands and source-reference convention, and pass live SQL structural/ref validation. The staged Account payloads cannot carry email/phone until valid JobTread Account custom-field IDs or another authorized documented operation is available.
