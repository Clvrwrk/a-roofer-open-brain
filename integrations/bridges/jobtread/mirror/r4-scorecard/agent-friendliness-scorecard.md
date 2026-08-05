# JobTread vs. AccuLynx: AI-Agent Friendliness Scorecard

**Decision context:** Pro Exteriors; one human seat; API-driven operation; Supabase is the canonical source of truth, idempotency ledger, crosswalk, approval queue, and audit log. Scores use an equal-weight 1–5 scale: **1 = hostile/opaque, 3 = workable with an integration layer, 5 = agent-native**. Repository citations are relative to `/Users/chussey/Documents/a-roofers-open-brain/` unless an absolute path is shown.

## Executive Summary

**Verdict: choose JobTread as the agent action plane; it scores 28/40 versus AccuLynx's 20/40.** JobTread wins because one organization grant exposes a broad read/write surface—44 create, 40 update, and 43 delete operations—and its late-discovered `{schema:{}}` introspection returned the full 189-type schema, while AccuLynx required nine branch-scoped keys and exposed no comparable schema-discovery operation (evidence: `integrations/bridges/jobtread/mirror/pave-schema.json`; `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/README.md`; `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`). Live terminal SQL verifies 34,433 successful JobTread writes with zero failed or staged queue rows, covering 6,574 jobs, 7,898 account records, 6,574 location records, 6,466 daily logs, and 212 documents when executed and reconciled skips are counted correctly (evidence: `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`). This is not a frictionless win: JobTread's undocumented input unions, customer-order name rules, uniqueness constraints, and closed-job locks produced four probe rounds, nine executor passes, and 978 retained failed attempts before the queue finished cleanly (evidence: `integrations/bridges/jobtread/mirror/manifests/r4-verdict.json`; `integrations/bridges/jobtread/mirror/r3h-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h2-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h3-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h4-lineitem-probe/probe-transcript.md`; live `jt_mirror.write_action_log`). For Pro Exteriors, those costs are containable in a Supabase-backed adapter, whereas AccuLynx's branch-key partitioning, thin proven write queue, missing vendor typing, empty normalized invoice lines, and absent CoA endpoint are architectural limits rather than one-time integration defects (evidence: `integrations/bridges/jobtread/mirror/estimate-items-v2/backfill-report.md`; `integrations/bridges/jobtread/mirror/vendors/mapping.md`; `integrations/bridges/jobtread/mirror/estimates/mapping.md`; `integrations/bridges/jobtread/mirror/cost-accounting/mapping.md`).

### Live verification snapshot

Read-only SQL was rerun on 2026-07-28. “Terminal records” includes a reconciled `skipped` record when JobTread already contained the entity; it is not the same as “new objects created.”

| Measure | Live result | Interpretation |
| --- | ---: | --- |
| `jt_mirror.pending_write`, `executed` | 34,433 | Successful JobTread mutations |
| `jt_mirror.pending_write`, `skipped` | 21 | 1 account and 18 locations reconciled to existing objects, plus 2 intentionally skipped cost types |
| `jt_mirror.pending_write`, `failed` / `staged` | 0 / 0 | Clean terminal queue |
| Jobs | 6,574 executed | Migration cohort |
| Accounts | 7,898 terminal | 6,584 customer creates + 1 reconciled customer + 1,313 vendor creates |
| Locations | 6,574 terminal | 6,556 creates + 18 reconciled existing locations |
| Daily logs / documents | 6,466 / 212 executed | Successful creates |
| `jt_mirror.write_action_log` | 34,433 executed; 978 failed; 11 corrected | Immutable attempt history; a row can fail more than once before success |
| Current AccuLynx source | 6,574 jobs; 9 active branch keys; 0 normalized invoice lines | Current extraction shape |
| AccuLynx write control plane | 38 catalog rows; 5 pending writes executed; 2 rejected | A real but very thin proven write path |

The terminal JobTread totals are independently reported in `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`; the pilot terminal state and echo-back sample are in `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`. The principal live queries were:

```sql
select domain, status, count(*)
from jt_mirror.pending_write
group by domain, status
order by domain, status;

select status, count(*)
from jt_mirror.write_action_log
group by status
order by status;

select count(*) from public.acculynx_jobs;
select count(*) from public.acculynx_accounts where is_active;
select count(*) from public.acculynx_invoice_lines;
select status, count(*) from public.acculynx_pending_write group by status;
select count(*) from public.acculynx_write_catalog;
```

The schema figures need one terminology correction: the earlier static JobTread KB extracted **187 root-operation pairs**—44 create, 40 update, 43 delete, and 60 other—while the later live introspection artifact contains **189 schema types**. Thus the project shorthand “187/189” means 187 static root operations versus 189 introspected types, not 187 successful operations out of 189 attempts (evidence: `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/schema-surface.json`; `integrations/bridges/jobtread/mirror/pave-schema.json`).

## Scorecard Table

| Dimension | JobTread | AccuLynx |
| --- | --- | --- |
| **Schema discoverability** | **5/5.** `{schema:{}}` yielded a complete 189-type, machine-readable schema including nested inputs, enum values, limits, write flags, and operation costs; it was found late, but it decisively exposed facts the prose scrape missed (evidence: `integrations/bridges/jobtread/mirror/pave-schema.json`). | **1/5.** The generated guide inventories documented REST/OpenAPI endpoints but identifies no live schema-discovery endpoint; branch visibility had to be inferred from 404 behavior rather than discovered as capability metadata (evidence: `integrations/bridges/acculynx/API.md`; `integrations/bridges/jobtread/mirror/estimate-items/backfill-report.md`). |
| **Write path** | **5/5.** The static surface contains 44 create, 40 update, and 43 delete operations across CRM, jobs, costs, documents, tasks, files, workflows, and configuration; 34,433 writes actually completed (evidence: `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/README.md`; `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`). | **2/5.** AccuLynx is read-mostly for this use case: it documents some writes and the brain has a guarded pending-write system, but live proof is only 5 executed and 2 rejected queue rows; its 38-row write catalog is metadata, not broad end-to-end CRUD proof (evidence: `integrations/bridges/acculynx/API.md`; `integrations/bridges/jobtread/mirror/pricing-catalog/mapping.md`; live `public.acculynx_pending_write` and `public.acculynx_write_catalog`). |
| **Error quality** | **4/5.** Errors usually named the exact field or rule—missing booleans, field paths, length limits, allowed document names, due-date exclusivity—and drove surgical repairs; the exception was line-item union resolution, whose error named the four variants but not the required discriminator value (evidence: `integrations/bridges/jobtread/mirror/r3c-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3d-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3i-fix-lineitems/fix-report.md`). | **2/5.** A critical estimate sweep returned 219 bare `404 NotFound` responses and could not distinguish wrong key, wrong branch, missing object, or forbidden visibility; some 400s were precise, so this is weak rather than uniformly opaque (evidence: `integrations/bridges/jobtread/mirror/estimate-items/backfill-report.md`; `integrations/bridges/jobtread/mirror/vendors-v2/backfill-report.md`). |
| **Identity rules** | **2/5.** Five identity/business constraints surfaced only during execution: unique customer names, unique job numbers, account-plus-address location uniqueness, customer-order name enums, and closed-job write locks; `suffixIfNecessary` solved only the first class (evidence: `integrations/bridges/jobtread/mirror/b3b-fix-accounts/fix-report.md`; `integrations/bridges/jobtread/mirror/b3c-fix-identity/fix-report.md`; `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3i-fix-lineitems/fix-report.md`). | **4/5.** Source objects are GUID-addressed and no job/contact GUID collision was observed; the demerit is that identity must still be namespaced by `account_key` because authorization and data are branch-partitioned (evidence: `integrations/bridges/jobtread/mirror/jobs-core/mapping.md`; `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`). |
| **Input ergonomics** | **2/5.** The canonical Pave shape is regular once learned—operation inputs under `$`, response selection as a sibling—but prose docs omitted deep union inputs, and `_type: "costItem"` was discovered only after four failed probe rounds (evidence: `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md`; `integrations/bridges/jobtread/mirror/pave-schema.json`). | **3/5.** Conventional bearer-auth REST URLs and JSON are easier initially, but read-shaped `POST` search, per-endpoint includes, branch-key routing, and a live date format that contradicted the documented date-time format keep it merely workable (evidence: `integrations/bridges/acculynx/API.md`; `integrations/bridges/jobtread/mirror/vendors-v2/backfill-report.md`). |
| **Rate limits** | **2/5.** Limits are per grant, but the local official-doc snapshot publishes no numeric ceiling or planning budget; the migration had to serialize, checkpoint, and adapt empirically (evidence: `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/docs/docs_home.md`; `integrations/bridges/jobtread/mirror/jobs-core/mapping.md`). | **3/5.** The guide publishes 10 requests/second per API key and 30 per second per IP, which is planable, but each of nine keys has its own quota and routing state (evidence: `integrations/bridges/acculynx/API.md`; `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`). |
| **Docs quality** | **3/5.** The official SPA has useful examples, an Explorer, auth guidance, and a wide operation inventory, but guessed subpaths are shells and the prose/static scrape omitted the nested types that mattered most (evidence: `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/README.md`; `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/docs/docs_home.md`). | **3/5.** The local guide gives base URLs, endpoint families, gotchas, and numeric limits, but it is docs-first rather than discoverable at runtime and did not prevent the key-partition or date-format surprises (evidence: `integrations/bridges/acculynx/API.md`; `integrations/bridges/jobtread/mirror/estimate-items-v2/backfill-report.md`; `integrations/bridges/jobtread/mirror/vendors-v2/backfill-report.md`). |
| **Single-seat operability** | **5/5.** One grant authenticated one user to the Pro Exteriors organization and supported organization-wide reads/writes without creating users for source representatives; people could remain custom-field values (evidence: `integrations/bridges/jobtread/mirror/r0-pave-auth/r0-probe-transcript.md`; `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`). | **2/5.** API access does not inherently require nine UI seats, but Pro Exteriors' data requires nine active branch keys and an `account_key → credential` router; the default key could see zero estimates that branch-routed keys fetched successfully (evidence: `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`; `integrations/bridges/jobtread/mirror/estimate-items/backfill-report.md`; `integrations/bridges/jobtread/mirror/estimate-items-v2/backfill-report.md`). |
| **Total** | **28/40** | **20/40** |

The scores answer a narrow question: which system is the better **agent-operated target** when Supabase owns canonical state. They do not claim JobTread is the richer historical source or that AccuLynx lacks useful roofing workflows.

## The Write-Path Story

The migration specification records **nine executor passes** across pilot and bulk execution. The final reports are terminal snapshots rather than one report per pass, while the immutable action log preserves the cost: 34,433 successful responses, 978 failed attempts, and 11 corrected bookkeeping records before `pending_write` reached zero failed/staged rows (evidence: `integrations/bridges/jobtread/mirror/manifests/r4-verdict.json`; `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`; `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`; live `jt_mirror.write_action_log`).

### Repair ledger

| Repair class | What the agent learned | Evidence |
| --- | --- | --- |
| 1. Setup enums and required defaults | Custom-field type was `option`, not prose-level “dropdown”; cost types required `isTaxable`, then `isTimeTrackable`; catalog items required quantity and resolved cost-code/type/unit IDs. | `integrations/bridges/jobtread/mirror/r3c-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3d-fix-staging/fix-report.md` |
| 2. Existing-object reconciliation | Two cost types and a duplicate customer already existed; crosswalk aliases and read-before-create reconciliation resolved all 753 remaining staged `$ref` occurrences. | `integrations/bridges/jobtread/mirror/r3e-reconcile/reconcile-report.md` |
| 3. Job/update shape | Job names were capped at 30 characters; `updateJob` required all inputs under `$`; seven jobs rejected updates as closed/locked even though their staged create payloads had not carried `closedOn`. | `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/pave-schema.json` |
| 4. First document-union theory | Wrapping elements as `newCostItem` resolved cost IDs but did not satisfy Pave's actual discriminated union. | `integrations/bridges/jobtread/mirror/r3g-fix-documents/fix-report.md` |
| 5. Four probe rounds | Fifteen wrapped, bare, existing-item, numeric/string, and `_type` variants all failed because they tried discriminator values such as `newCostItem`; no probe created a lingering document. | `integrations/bridges/jobtread/mirror/r3h-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h2-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h3-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3h4-lineitem-probe/probe-transcript.md` |
| 6. Full schema changed the answer | Live introspection showed that both new and existing item variants use the constant discriminator `_type: "costItem"`; group variants use `"costGroup"`. | `integrations/bridges/jobtread/mirror/pave-schema.json`; `integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md` |
| 7. Document business rules | A `customerOrder` had to be named `Proposal`, `Selections`, or `Change Order`; it also required from/to context, a job location, exactly one of due date/due days, and valid typed cost items. | `integrations/bridges/jobtread/mirror/r3i-fix-lineitems/fix-report.md`; `integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md` |
| 8. External identity size | Document `externalId` had a 32-character maximum, so namespaced GUIDs were normalized to unique 32-character hex values while the full source identity remained in `source_ref`. | `integrations/bridges/jobtread/mirror/r3k-fix-externalid/fix-report.md`; `integrations/bridges/jobtread/mirror/pave-schema.json` |
| 9. Bulk identity collisions | `suffixIfNecessary=true` repaired 380 duplicate-name customer attempts; 57 missing dependency accounts were staged; 18 duplicate locations were reconciled; job-number collisions received deterministic GUID suffixes. | `integrations/bridges/jobtread/mirror/b3b-fix-accounts/fix-report.md`; `integrations/bridges/jobtread/mirror/b3c-fix-identity/fix-report.md`; `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md` |

### The five JobTread identity/business rules encountered

1. **Customer account names are organization-unique.** The schema did contain the correct escape hatch—`suffixIfNecessary`—but it was not part of the initial payload design (evidence: `integrations/bridges/jobtread/mirror/b3b-fix-accounts/fix-report.md`; `integrations/bridges/jobtread/mirror/pave-schema.json`).
2. **Job numbers are organization-unique.** The final population contains 814 jobs whose JobTread-native number uses an approved deterministic source-GUID suffix while the original AccuLynx number remains preserved separately (evidence: `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`; `integrations/bridges/jobtread/mirror/b3c-fix-identity/fix-report.md`).
3. **Locations are unique by account plus address.** Eighteen attempted locations were correctly crosswalked to existing JobTread locations rather than replayed (evidence: `integrations/bridges/jobtread/mirror/b3c-fix-identity/fix-report.md`).
4. **Document type controls legal names.** For `customerOrder`, the live rule accepted `Proposal`, `Selections`, or `Change Order`; the schema exposed `documentType` but not this conditional name enum (evidence: `integrations/bridges/jobtread/mirror/r3i-fix-lineitems/fix-report.md`; `integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md`).
5. **Closed jobs can reject API updates.** Seven pilot jobs returned “You don't have permission to update this job,” forcing reopen/update/restore handling or a terminal lock disposition (evidence: `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`).

The errors were valuable: they were generally precise enough to turn a failed row into a bounded payload repair. But an agent-oriented platform should have made the following trivial before the first mutation: fetch the complete schema; generate a valid input fixture; know every conditional enum; provide a conflict code plus the existing object ID; submit an idempotency key; and read exact quota/retry metadata. Supabase made the eventual migration safe—dependency bands, deterministic `source_ref`, idempotency keys, crosswalks, immutable attempts, and echo-back verification compensated for capabilities the target API did not consistently provide (evidence: `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`; `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`).

## AccuLynx Assessment

### Authentication and data partitioning

AccuLynx is not one logical Pro Exteriors API namespace in practice. `public.acculynx_accounts` currently contains nine active account keys—eight production branches/programs plus sandbox—and the loader must route every object request through the key matching its `account_key` (evidence: `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`).

The strongest proof is the estimate backfill. A default-key run made 221 calls, including a complete 210-estimate sweep, and received 219 `404`s plus one valid empty list; the branch-routed retry made 213 calls, all `200`, and loaded 305 sections and 4,740 items for the same 210 estimates (evidence: `integrations/bridges/jobtread/mirror/estimate-items/backfill-report.md`; `integrations/bridges/jobtread/mirror/estimate-items-v2/backfill-report.md`). That is an agent-hostile failure mode because “not visible with this key” was represented as “not found.”

### Domain fidelity

- **Vendor typing is absent.** The original mapping found no vendor/subcontractor/supplier table or contact type marker. A later exhaustive search across all nine branch keys inspected 6,742 contact/type memberships and still found no explicit vendor, supplier, subcontractor, installer, crew, or trade-partner flag; QBO therefore supplied the 1,313 canonical vendors (evidence: `integrations/bridges/jobtread/mirror/vendors/mapping.md`; `integrations/bridges/jobtread/mirror/vendors-v2/backfill-report.md`).
- **Normalized invoice lines are empty.** `public.acculynx_invoice_lines` has zero rows, and embedded invoice items contain sale-price fields but no proven quantity, UOM, or cost fields; a lossless accounting/estimating write path cannot be reconstructed from those fields alone (evidence: `integrations/bridges/jobtread/mirror/estimates/mapping.md`; `integrations/bridges/jobtread/mirror/cost-accounting/mapping.md`).
- **There is no identified AccuLynx CoA endpoint.** The accounting contract had to choose `public.qbo_accounts` as canonical—211 accounts, with 13 COGS accounts in the initial JobTread scope—because AccuLynx financials are job-level transactions rather than a company chart of accounts (evidence: `integrations/bridges/jobtread/mirror/cost-accounting/mapping.md`; `integrations/bridges/acculynx/API.md`).
- **There is no confirmed company-wide pricing-catalog read.** The documented estimate-item reads support an observed-item catalog, not proof of the full unused/archived/template catalog (evidence: `integrations/bridges/jobtread/mirror/pricing-catalog/mapping.md`).
- **Production data is thin.** The mirror has milestone history but no production tasks, task dependencies, checklist instances, crews, material schedules, or budget-to-task rules; milestone-derived daily logs are honest, but reconstructed production tasks would be inference (evidence: `integrations/bridges/jobtread/mirror/production/mapping.md`).
- **Stage fidelity is also lossy in JobTread.** AccuLynx has a customer-configurable milestone vocabulary, while the inspected JobTread Pave surface has no native stage/pipeline mutation; the migration therefore used job custom fields and history artifacts rather than claiming native pipeline equivalence (evidence: `integrations/bridges/jobtread/mirror/stages-milestones/mapping.md`).
- **CompanyCam is not available from the AccuLynx mirror.** The interim contract requires a separate CompanyCam lookup and conservative crosswalk; no AccuLynx endpoint in the reviewed guide supplies the project link (evidence: `integrations/bridges/jobtread/mirror/companycam-links/mapping.md`).

AccuLynx is therefore a useful source system with conventional REST mechanics, explicit numerical rate limits, and roofing-specific data, but it is not the better autonomous action plane for this architecture. Its hardest problems—authorization partitioning and missing domain surfaces—cannot be repaired merely by better payload generation.

## What JobTread Should Fix / What AccuLynx Should Fix

### What JobTread should fix

1. **Make `{schema:{}}` the documented first step.** Publish a downloadable, versioned schema artifact and a changelog; the live 189-type schema was more useful than the entire static/prose discovery pass (evidence: `integrations/bridges/jobtread/mirror/pave-schema.json`; `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/README.md`).
2. **Document input unions with valid create examples.** `createDocument.lineItems` should show the four variants and the actual constants—`_type: "costItem"` or `_type: "costGroup"`—instead of leaving integrators to infer them from response-oriented `_type` prose (evidence: `integrations/bridges/jobtread/mirror/r3h4-lineitem-probe/probe-transcript.md`; `integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md`).
3. **Return structured errors.** Every validation/conflict response should include a stable code, field path, allowed values or numeric bounds, whether retry is safe, and the conflicting object ID when one exists. The human-readable messages were often good, but the union and closed-job cases were not actionable enough (evidence: `integrations/bridges/jobtread/mirror/r3i-fix-lineitems/fix-report.md`; `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`).
4. **Offer first-class idempotency.** Accept an idempotency key on every mutation and make `externalId` consistently queryable, uniqueness-scoped, and large enough for a namespaced source identity; the current document field is capped at 32 characters (evidence: `integrations/bridges/jobtread/mirror/r3k-fix-externalid/fix-report.md`; `integrations/bridges/jobtread/mirror/pave-schema.json`).
5. **Expose conflict-safe identity operations.** “Create or return existing” semantics for accounts, locations, and import-numbered jobs would remove a large class of read/reconcile/retry logic; at minimum, conflict responses should identify the existing entity (evidence: `integrations/bridges/jobtread/mirror/b3b-fix-accounts/fix-report.md`; `integrations/bridges/jobtread/mirror/b3c-fix-identity/fix-report.md`).
6. **Define closed-job API behavior.** Provide a documented permission/capability check and a safe administrative update path that does not require an undocumented reopen/update/restore dance (evidence: `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`; `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`).
7. **Publish quotas and headers.** Exact per-grant budgets, operation-cost semantics, batch guarantees, `Retry-After`, and remaining-quota headers should be machine-readable (evidence: `/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/docs/docs_home.md`; `integrations/bridges/jobtread/mirror/pave-schema.json`).

### What AccuLynx should fix

1. **Issue an organization-scoped integration grant.** One token should be able to enumerate authorized branches and either read across them or request explicit branch scopes; nine opaque keys should not be the discovery mechanism (evidence: `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`; `integrations/bridges/jobtread/mirror/estimate-items-v2/backfill-report.md`).
2. **Differentiate 404 classes.** Return machine codes such as `OBJECT_NOT_FOUND`, `OUTSIDE_KEY_SCOPE`, `BRANCH_KEY_REQUIRED`, and `FEATURE_NOT_LICENSED`, plus the expected account/branch identifier where safe (evidence: `integrations/bridges/jobtread/mirror/estimate-items/backfill-report.md`).
3. **Expose runtime schema and capability discovery.** Publish a versioned OpenAPI document from the live environment and endpoints for token scopes, enabled modules, branch coverage, webhook entitlement, and writable operations (evidence: `integrations/bridges/acculynx/API.md`).
4. **Complete the accounting domain.** Add typed vendors/subcontractors, a company cost-code/CoA surface, and invoice/estimate lines with explicit quantity, pricing UOM, order UOM, unit conversion, unit cost, unit price, tax, and stable identities (evidence: `integrations/bridges/jobtread/mirror/vendors/mapping.md`; `integrations/bridges/jobtread/mirror/cost-accounting/mapping.md`; `integrations/bridges/jobtread/mirror/estimates/mapping.md`).
5. **Expose production artifacts as data.** Tasks, checklists, completion events, crews, dependencies, appointments, material schedules, and history should be read/write resources rather than gaps inferred from milestones (evidence: `integrations/bridges/jobtread/mirror/production/mapping.md`).
6. **Align documentation with live validators.** Parameter formats and pagination rules should be generated from the same contract the API enforces; the documented date-time format versus live `YYYY-MM-DD` requirement is a concrete counterexample (evidence: `integrations/bridges/jobtread/mirror/vendors-v2/backfill-report.md`).
7. **Broaden the idempotent write surface.** The local write queue and catalog are good control-plane primitives, but the platform needs consistent CRUD, request idempotency, dry-run validation, and post-write echo-back across the operational entities an agent is expected to manage (evidence: live `public.acculynx_pending_write`, `public.acculynx_write_action_log`, and `public.acculynx_write_catalog`; `integrations/bridges/acculynx/API.md`).

## Recommendation

For **Pro Exteriors' agent workforce**, adopt JobTread as the controlled operational destination and retain Supabase as the source of truth. Agents should never treat either vendor system as canonical memory: they should read normalized Supabase views, draft an intended state transition, write it to an approval/idempotency queue, execute through a narrow JobTread Pave adapter, store the returned opaque ID in the crosswalk, and verify by read-back (evidence: `integrations/bridges/jobtread/mirror/r3b-execute/execution-report.md`; `integrations/bridges/jobtread/mirror/b3-execute/execution-report.md`).

The production pattern should be:

```text
AccuLynx/QBO/other sources
        ↓ extract + normalize
Supabase canonical state
        ↓ policy + human approval where required
pending_write + idempotency key + dependency order
        ↓ one organization-scoped JobTread grant
Pave mutation
        ↓ returned ID + echo-back
crosswalk + immutable write_action_log + reconciliation
```

Keep AccuLynx connected as a legacy/read source during transition, with an explicit nine-key router and per-branch checkpoints. Do not make free-form agents call either vendor API directly; provide typed adapter operations generated from the cached JobTread schema and guarded by Supabase policy. Preserve the single-seat rule by representing AccuLynx representatives and owners as source identities/custom-field values, never as new JobTread memberships (evidence: `integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md`; `integrations/bridges/jobtread/mirror/jobs-core/mapping.md`).

This recommendation is strong but conditional: JobTread remains the winner only if the adapter owns schema caching, idempotency, collision handling, rate control, closed-job handling, and read-back verification. Without that layer, the nine-pass history shows that the raw Pave surface is too sharp-edged for unconstrained autonomous writes (evidence: `integrations/bridges/jobtread/mirror/manifests/r4-verdict.json`; `integrations/bridges/jobtread/mirror/r3c-fix-staging/fix-report.md` through `integrations/bridges/jobtread/mirror/r3k-fix-externalid/fix-report.md`).

## Open Questions

1. Is `{schema:{}}` an officially supported, versioned contract, and can its result differ by grant, organization, feature flag, or subscription?
2. What are JobTread's exact per-grant quotas, how do schema `cost` values map to those quotas, and which response headers can an agent use for adaptive throttling?
3. Are multiple root mutations atomic, independently committed, or unsupported as a batching mechanism?
4. What is the official, supported way to update a closed job, and why did seven jobs appear locked when their recorded create payloads did not include `closedOn` (evidence: `integrations/bridges/jobtread/mirror/r3f-fix-staging/fix-report.md`)?
5. What is the uniqueness scope of JobTread document `externalId`, and can it be queried efficiently for post-timeout reconciliation?
6. Can JobTread return the existing Account, Location, or Job ID in a uniqueness-conflict response?
7. Can AccuLynx issue one organization-level credential that enumerates and scopes all nine branches, or is per-branch key routing a permanent product invariant?
8. Does AccuLynx offer private/tier-gated endpoints for vendor typing, a company CoA/cost-code master, complete invoice lines with quantity/UOM/cost, or production task/checklist instances?
9. Which AccuLynx 404s mean missing object, wrong branch key, disabled module, or insufficient subscription tier?
10. Can both vendors provide webhook delivery IDs, replay windows, ordering guarantees, and idempotent event processing sufficient to keep Supabase current without polling?
