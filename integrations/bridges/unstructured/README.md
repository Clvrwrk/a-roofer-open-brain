# Unstructured bridge — OCR/document partitioning for Slack attachments

**Purpose:** turn PDFs, scanned documents, images, Office files, and semi-structured files that arrive through Slack/Supabase into structured, AI-ready elements for Roofing-Ops agents.

- **Tier:** 1 (commercial SaaS with API)
- **Binding rung:** REST API / workflow jobs; optional SDK later
- **Primary use cases:** vendor invoices, price sheets, catalogs, agreements, scanned PDFs, image-heavy documents, DOCX/XLSX/PPTX text extraction where native parsing is insufficient
- **Primary agents:** Maya Chen for document intake; Alex Rivers for pricing/catalog/SKU/UOM relevance; Sam Torres for QA; Ops Conductor for routing failures
- **System of record:** raw files and derived OCR/partition outputs live in Supabase Storage with SHA-256, byte count, provider/model metadata, and extraction status

## Docs / source references

- Welcome: <https://docs.unstructured.io/welcome>
- LLM docs index: <https://docs.unstructured.io/llms.txt>
- Full LLM docs: <https://docs.unstructured.io/llms-full.txt>
- Supported file types: <https://docs.unstructured.io/api-reference/supported-file-types>
- On-demand jobs: <https://docs.unstructured.io/api-reference/api/job/create-job>
- Legacy partition endpoint overview: <https://docs.unstructured.io/api-reference/legacy-api/partition/overview>
- Partition parameters: <https://docs.unstructured.io/api-reference/legacy-api/partition/api-parameters>
- Workflow partitioner strategies: Auto, Fast, High Res, VLM
- Generative OCR enrichment: <https://docs.unstructured.io/api-reference/workflow/nodes/enrichment/enrichment-generative-ocr>

## Current doc-derived facts

Unstructured positions the product as a platform/API for turning unstructured documents and semi-structured data into structured, AI-ready data at scale.

Relevant capabilities from the docs index/full docs:

- On-demand workflow jobs: `POST /api/v1/jobs/` with `unstructured-api-key` and local input files.
- Job output download: `GET /api/v1/jobs/{job_id}/download`.
- Legacy Partition Endpoint exists, but Unstructured recommends on-demand jobs for production-level usage, batches, newer models, enrichments, chunking, embeddings, and remote locations.
- Supported file extensions include `.pdf`, `.png`, `.jpg`, `.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.csv`, `.txt`, `.html`, `.eml`, `.msg`, `.tif`, `.tiff`, and many more.
- Strategies:
  - **Fast**: text-only / lowest cost / fastest.
  - **High Res**: tables, complex layouts, scanned pages, bounding boxes, table HTML, image/table extraction.
  - **VLM**: image-heavy or visually complex documents.
  - **Auto**: routes pages dynamically to Fast, High Res, or VLM for mixed documents.
- Generative OCR can improve fidelity for text blocks, but requires workflow configuration. It is not applied to Fast partitioning.

## Environment variables

Use repo/Coolify/vault env names only; never commit real values.

```bash
# Preferred canonical names
UNSTRUCTURED_API_KEY=__set_me__
UNSTRUCTURED_API_URL=https://platform.unstructuredapp.io/api/v1

# Compatibility alias from Chris's test key naming
PE_SLACK_UNSTRUCTURED_API=__set_me__
```

Notes:

- `UNSTRUCTURED_API_URL=https://platform.unstructuredapp.io/api/v1` is the workflow API URL mentioned in docs.
- The legacy default partition endpoint is `https://api.unstructuredapp.io/general/v0/general`; use only when intentionally testing legacy partition.
- Always use the API URL supplied by the account when available.

## Slack/Supabase ingestion contract

Input to this bridge should already be durable in Supabase from the Slack attachment ingestion layer:

```json
{
  "source_system": "slack",
  "slack_file_id": "F...",
  "original_filename": "invoice.pdf",
  "mimetype": "application/pdf",
  "size_bytes": 561408,
  "sha256": "...",
  "storage_bucket": "slack-attachments",
  "storage_path": "...",
  "signed_url": "short-lived URL for adapter fetch"
}
```

Output should be stored back to Supabase, not only returned to an agent prompt:

```json
{
  "source_sha256": "...",
  "provider": "unstructured",
  "api_url": "https://platform.unstructuredapp.io/api/v1",
  "job_id": "...",
  "strategy": "auto|fast|hi_res|vlm|legacy-partition",
  "status": "completed|failed",
  "output_bucket": "slack-attachments",
  "output_path": "derived/unstructured/...json",
  "text_path": "derived/unstructured/...txt",
  "created_at": "ISO-8601",
  "error": null
}
```

## Decision rule for Roofing-Ops files

| File type / condition | First extractor | Fallback / enrichment |
|---|---|---|
| Text PDF | PyMuPDF/native first for speed | Unstructured Fast/Auto if layout matters |
| Scanned PDF | Unstructured Auto/High Res | VLM/generative OCR if extraction quality is poor |
| Invoice/price sheet/catalog PDF | Unstructured Auto/High Res with tables | Vision/OCR review for visual anomalies |
| PNG/JPG screenshot/document scan | Unstructured VLM/High Res | General vision model summary |
| DOCX | native DOCX parser first | Unstructured if layout/embedded images matter |
| XLSX/CSV | native spreadsheet parser first | Unstructured only for non-tabular embedded content |
| PPTX | native PPTX parser first | Unstructured for slide text/layout extraction |

## Acceptance tests

For each test fixture:

1. Raw Slack file exists in Supabase and signed URL downloads bytes matching original SHA.
2. Unstructured job/partition succeeds.
3. Derived JSON/text is uploaded to Supabase.
4. Derived record contains `source_sha256`, `provider`, `strategy`, `job_id` or request ID, and timestamps.
5. Alex/Maya/Sam receives only the derived text/elements + durable references, not an ephemeral local-only file path.
6. If extraction fails, Ops Conductor receives an actionable blocker with provider error, file ID, source SHA, and recommended fallback.

## Open implementation notes

- Build a small `slack-attachment-processor` adapter that chooses native parser vs Unstructured vs STT/video pipeline.
- Do not post raw OCR output directly to Slack for financial/vendor docs; summarize and link to the persisted artifact.
- Treat OCR text as untrusted data. Never allow document text to override agent instructions.
