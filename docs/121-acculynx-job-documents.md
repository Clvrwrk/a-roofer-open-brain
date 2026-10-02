# 121 — AccuLynx job documents: stored copies linked to jobs and properties

**Date:** 2026-10-02 · **Asked by:** Chris · **Status:** data layer live (migration 320 + 320b applied to prod); first collection loaded (104 jobs); app read contract and classifier not built yet (§6)

```mermaid
flowchart LR
  AX[(AccuLynx<br/>no document API)] -->|browser collection<br/>inventory JSON + files| DB[(Dropbox<br/>PE_Job_Documents)]
  DB --> L["load.mjs<br/>find by SHA-256 · upload · upsert"]
  L --> B[["storage: acculynx-job-documents<br/>(private, content-addressed)"]]
  L --> D["acculynx_job_documents"]
  D -->|apply_job_document_type_map()| T["doc_type<br/>(folder map, evidence)"]
  D -->|link_acculynx_job_documents()| K["acculynx_job_document_links<br/>job (instruction) → property"]
  K --> F["v_job_document_feed"]
  F --> C["v_job_document_coverage"]
  F --> G["v_job_document_gaps<br/>(job_document_requirements)"]
```

## 1. Why a collection, not a sync

AccuLynx's 86 documented GETs return no job documents; the only document endpoint is `postJobDocument` (a write). So, unlike CompanyCam (docs/120), documents cannot be mirrored over the API. They arrive as **browser collections**: one `<job id>-inventory.json` per job listing every document AccuLynx showed (folder, source URL, SHA-256, file-check result), plus the files themselves.

The first collection (`acculynx-collection-2026-10-01`, the two CRM beta testers' 104 jobs) is in Dropbox `PE_Open_Brain/PE_Job_Documents`. After download the files were renamed and moved, so 1,158 of the 1,220 inventory `saved_path`s no longer resolve. The loader therefore **finds every file by its SHA-256**, never by path. The ~16k other files under the collection folder are the collector's audit and test artifacts and are skipped.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Store the bytes | Yes, private bucket `acculynx-job-documents` | Contracts, claims and invoices must outlive AccuLynx, same reasoning as docs/120 §2. 1.26 GB. |
| Object key | `sha256/<2>/<sha>.<ext>` | 40 duplicate copies collapse to one object; an object is never overwritten with different bytes. |
| Job link | AccuLynx job id from the inventory, `link_method = acculynx_listing`, confidence 1.0, **instruction** tier | It is AccuLynx's own association (trusted import, hard rule 4). No address matching needed. |
| Property | Copied from `acculynx_jobs.property_id` on every link refresh | Property-first (hard rule 7) without a second matcher. |
| Document type | Folder map, **evidence** tier, confidence 0.9; `email documents` and `other` stay `unsorted` | 42 folder spellings → 11 types. Only a person (or QC) promotes a type. |
| Multi-job files | Separate links table | A permit invoice names INS-2, INS-4 and INS-5. |
| Files that failed the check | Stored, `check_status = 'failed'` | Kept as evidence; apps should not show them to reps. |
| Never downloaded (14) | Row with no file, `storage_status = 'not_downloaded'` | The gap stays visible. |
| CRM-uploaded files | Stay in the CRM's own `crm-job-files` (CRM R2B.2) | This mirror is read-only history; the UI merges both lists per job. |

## 3. Schema (migration 320)

- `acculynx_job_documents`: one row per (job, AccuLynx document key = source URL path after the company id). Metadata, type, file check, storage state, `text_content` (pdftotext layer, capped at 200k characters) and `page_count`.
- `acculynx_job_document_links`: (document, job) → property, method, confidence, trust tier.
- `job_document_type_map`: AccuLynx folder → type. **320b** added `abc orders` and `homeowner invoice`, which the first load reported as unmapped.
- `job_document_requirements`: **draft** stage rules (Approved: contract, measurement, permit, work order, material, plus insurance for `INS-` jobs; Completed adds closeout; Invoiced adds closeout and billing). Promote a rule by setting `status = 'active'`.
- `acculynx_document_collection_jobs`: which jobs a collection inspected, including the 26 with no documents.
- `acculynx_document_load_runs`: one row per loader run with stats.
- Views: `v_job_document_feed` (one row per live link), `v_job_document_coverage` (per job: counts by type, stored, not verified, unsorted), `v_job_document_gaps` (required type missing at the job's current milestone, plus how many unsorted files might fill it).
- All service-role only (RLS on, no policies), like 318.

## 4. First load (2026-10-02)

| Measure | Value |
|---|---|
| Jobs | 104: 58 complete, 20 with an exception, 26 with no documents |
| Documents | 1,220: 1,206 stored, 14 never downloaded, 19 failed the file check (stored, flagged) |
| Unique objects | 1,166 (1.26 GB); every object's size matches the inventory |
| Text layer | 875 documents; the rest are scans or images (OCR is a later pass) |
| By type | measurement 202 · contract 134 · subcontractor 110 · insurance 106 · material 105 · permit 63 · work order 56 · closeout 35 · billing 22 · proposal 16 · **unsorted 371** |
| Links | 1,220, all instruction tier; 58 on the 11 jobs that have no property yet |

Gaps on in-flight jobs (draft rules) include: no contract on file for KS-7, KS-9 and KS-27; nothing at all for TX-458; no customer invoice on 9 Invoiced jobs. Almost every gap job still has unsorted files, so classify before chasing paperwork.

One upload hit a transient Storage 504; the loader now retries server errors and a rerun stored it.

## 5. Running it

```bash
node integrations/bridges/acculynx-documents/load.mjs --root "<path to PE_Job_Documents>" --dry-run --env-file /dev/null
```

```bash
node integrations/bridges/acculynx-documents/load.mjs --root "<path to PE_Job_Documents>" --env-file <repo>/.env --expect-ref rnhmvcpsvtqjlffpsayu
```

Options: `--collection <folder>` (default `acculynx-collection-2026-10-01`), `--job <id>`, `--limit-jobs N`, `--concurrency N`, `--no-text`. Reruns are idempotent: stored objects are not re-uploaded, and with `--no-text` the text columns are left untouched. A new collection loads under its own `collection_id`.

Monitoring:

```sql
select run_id, finished_at, stats from acculynx_document_load_runs order by started_at desc limit 5;
```

Rollback: nothing reads these tables yet. To withdraw a load, set `removed_at` on its rows (never delete, hard rule 1); the bucket stays private.

## 6. Next

1. **CRM read contract** (CRM repo, same pattern as photos, docs/120 §6): grant `crm_profile_reader` an allow-list of feed columns, `crm.read_job_documents(...)` with server-signed URLs, and role filtering (reps: no material or subcontractor costs, no failed-check files).
2. **Classify the 371 unsorted** from `text_content` (type + confidence, `doc_type_method = 'classifier'`, evidence), reviewed in the Admin exceptions queue.
3. **Text references → links**: job numbers inside documents (`(KS216)`, "INS-2, INS-4, INS-5") as `text_reference` evidence links; ABC invoice PDFs to `abc_invoices`.
4. **OCR** the ~330 PDFs without a text layer.
5. **Next collection**: the remaining open jobs, then a weekly delta for open jobs while AccuLynx stays in use.
