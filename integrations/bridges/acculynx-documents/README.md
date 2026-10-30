# AccuLynx job documents bridge

Loads a browser collection of AccuLynx job documents into the brain: the private `acculynx-job-documents` bucket plus `acculynx_job_documents` and its links to jobs and properties (migration 320). AccuLynx's API has no document GET, so there is no sync, only collections.

- Design, decisions and the first load: [`docs/121-acculynx-job-documents.md`](../../../docs/121-acculynx-job-documents.md)
- Script: [`load.mjs`](load.mjs) (no dependencies; optional `pdftotext`/`pdfinfo` from poppler for the text layer)

```bash
node integrations/bridges/acculynx-documents/load.mjs --root "<path to PE_Job_Documents>" --dry-run --env-file /dev/null
```

Files are matched by SHA-256, never by the inventory's saved path. Writes never delete and never touch a type or link a person set.
