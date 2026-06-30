# Unstructured sources

Primary docs:

- Welcome: https://docs.unstructured.io/welcome
- LLM index: https://docs.unstructured.io/llms.txt
- Full LLM docs: https://docs.unstructured.io/llms-full.txt
- Supported file types: https://docs.unstructured.io/api-reference/supported-file-types
- Job create endpoint: https://docs.unstructured.io/api-reference/api/job/create-job
- Job output download: https://docs.unstructured.io/api-reference/api/job/download-job-output
- Legacy partition endpoint overview: https://docs.unstructured.io/api-reference/legacy-api/partition/overview
- Legacy partition parameters: https://docs.unstructured.io/api-reference/legacy-api/partition/api-parameters
- Partitioner Auto strategy: https://docs.unstructured.io/api-reference/workflow/nodes/partitioner/partitioner-auto
- Partitioner High Res strategy: https://docs.unstructured.io/api-reference/workflow/nodes/partitioner/partitioner-high-res
- Partitioner VLM strategy: https://docs.unstructured.io/api-reference/workflow/nodes/partitioner/partitioner-vlm
- Generative OCR enrichment: https://docs.unstructured.io/api-reference/workflow/nodes/enrichment/enrichment-generative-ocr

Fetch notes:

- `web_extract` was unavailable due configured Firecrawl auth failure during setup.
- Direct docs fetch worked via `https://docs.unstructured.io/llms.txt` and `https://docs.unstructured.io/llms-full.txt`.
- Docs state Unstructured recommends on-demand jobs over the legacy Partition Endpoint for production-level usage, batches, latest models, enrichments, chunking, embeddings, and remote locations.
