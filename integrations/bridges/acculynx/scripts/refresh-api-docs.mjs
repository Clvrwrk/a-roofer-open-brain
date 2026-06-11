#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const cacheDir =
  process.env.ACCULYNX_DOCS_CACHE || "/private/tmp/acculynx-api-docs-cache";

const LLMS_URL = "https://apidocs.acculynx.com/llms.txt";
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const outDir = path.join(
  repoRoot,
  "skills/cleverwork-roofer/acculynx-api/reference",
);
const apiDocPath = path.join(repoRoot, "integrations/bridges/acculynx/API.md");
const endpointReferencePath = path.join(outDir, "full-endpoint-reference.md");
const indexJsonPath = path.join(outDir, "openapi-index.json");
const sourceIndexPath = path.join(outDir, "source-index.md");

await mkdir(cacheDir, { recursive: true });
await mkdir(outDir, { recursive: true });

function cachePath(url) {
  return path.join(cacheDir, encodeURIComponent(url).replaceAll("%", "_"));
}

async function fetchText(url) {
  const cached = cachePath(url);
  if (existsSync(cached) && !process.env.ACCULYNX_DOCS_REFRESH) {
    return readFile(cached, "utf8");
  }

  const response = await fetch(url, {
    headers: {
      accept: "text/markdown,text/plain,application/json,*/*",
      "user-agent": "cleverwork-open-brain-acculynx-docs-refresh/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const text = await response.text();
  await writeFile(cached, text, "utf8");
  return text;
}

function cleanText(input) {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\\_/g, "_")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLlmsIndex(text) {
  const rows = [];
  let section = "Other";

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    const match = line.match(/^- \[(.+?)\]\((https?:\/\/[^)]+)\)(?::\s*(.*))?$/);
    if (!match) continue;

    const [, title, url, summary = ""] = match;
    rows.push({
      section,
      title: cleanText(title),
      url,
      summary: cleanText(summary),
      slug: path.basename(new URL(url).pathname).replace(/\.md$/, ""),
    });
  }

  return rows;
}

function extractOpenApi(markdown) {
  for (const match of markdown.matchAll(/```json\s*([\s\S]*?)```/g)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.openapi && parsed.paths) return parsed;
    } catch {
      // Skip JSON examples that are not complete OpenAPI documents.
    }
  }
  return null;
}

function resolveRef(spec, value) {
  if (!value?.$ref) return value;
  if (!value.$ref.startsWith("#/")) return value;
  return value.$ref
    .slice(2)
    .split("/")
    .reduce((acc, key) => acc?.[key], spec);
}

function schemaLabel(schema, spec, seen = new Set()) {
  if (!schema) return null;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    if (seen.has(schema.$ref)) return { ref: name };
    seen.add(schema.$ref);
    return {
      ref: name,
      ...schemaLabel(resolveRef(spec, schema), spec, seen),
    };
  }
  if (schema.allOf || schema.oneOf || schema.anyOf) {
    const key = schema.allOf ? "allOf" : schema.oneOf ? "oneOf" : "anyOf";
    return {
      type: key,
      variants: schema[key].map((item) => schemaLabel(item, spec, seen)).filter(Boolean),
    };
  }
  if (schema.type === "array") {
    return {
      type: "array",
      items: schemaLabel(schema.items, spec, seen),
    };
  }
  const properties = schema.properties
    ? Object.entries(schema.properties)
        .slice(0, 40)
        .map(([name, value]) => ({
          name,
          type:
            value.type ||
            (value.$ref ? value.$ref.split("/").pop() : null) ||
            (value.items?.$ref ? `${value.items.$ref.split("/").pop()}[]` : null) ||
            (value.items?.type ? `${value.items.type}[]` : null),
          format: value.format || null,
          enum: value.enum || null,
        }))
    : [];

  return {
    type: schema.type || null,
    format: schema.format || null,
    enum: schema.enum || null,
    required: schema.required || [],
    properties,
  };
}

function summarizeParameter(spec, parameter) {
  const resolved = resolveRef(spec, parameter);
  return {
    name: resolved.name,
    in: resolved.in,
    required: Boolean(resolved.required),
    description: cleanText(resolved.description),
    schema: schemaLabel(resolved.schema, spec),
  };
}

function summarizeContent(spec, content = {}) {
  return Object.entries(content).map(([contentType, media]) => ({
    contentType,
    schema: schemaLabel(media.schema, spec),
  }));
}

function summarizeRequestBody(spec, requestBody) {
  if (!requestBody) return null;
  const resolved = resolveRef(spec, requestBody);
  return {
    required: Boolean(resolved.required),
    description: cleanText(resolved.description),
    content: summarizeContent(spec, resolved.content),
  };
}

function summarizeResponses(spec, responses = {}) {
  return Object.entries(responses).map(([status, response]) => {
    const resolved = resolveRef(spec, response);
    return {
      status,
      description: cleanText(resolved?.description),
      content: summarizeContent(spec, resolved?.content),
    };
  });
}

function serverBase(spec, apiPath) {
  const explicit = spec.servers?.[0]?.url;
  if (explicit) return explicit.replace(/\/$/, "");
  if (apiPath.startsWith("/subscriptions") || apiPath.startsWith("/topics")) {
    return "https://api.acculynx.com/webhooks/v2";
  }
  return "https://api.acculynx.com/api/v2";
}

function categoryFor(operation, apiPath, source) {
  const tag = operation.tags?.[0];
  if (tag) {
    return tag
      .replace(/^acculynx/i, "AccuLynx")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/^Accu Lynx\b/, "AccuLynx")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (source.section === "Changelog") return "Changelog";
  if (apiPath.startsWith("/subscriptions") || apiPath.startsWith("/topics")) {
    return "Webhook Management";
  }
  const first = apiPath.split("/").filter(Boolean)[0] || "Other";
  return first.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function operationFromSpec(source, spec) {
  const operations = [];
  const version = spec.info?.version || null;

  for (const [apiPath, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const mergedParameters = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || []),
      ];
      const baseUrl = serverBase(spec, apiPath);
      operations.push({
        slug: source.slug,
        title: source.title,
        sourceUrl: source.url.replace(/\.md$/, ""),
        docsMarkdownUrl: source.url,
        version,
        category: categoryFor(operation, apiPath, source),
        method: method.toUpperCase(),
        path: apiPath,
        baseUrl,
        url: `${baseUrl}${apiPath}`,
        operationId: operation.operationId || null,
        summary: cleanText(operation.summary || source.title),
        description: cleanText(operation.description || source.summary),
        tags: operation.tags || [],
        parameters: mergedParameters.map((parameter) =>
          summarizeParameter(spec, parameter),
        ),
        requestBody: summarizeRequestBody(spec, operation.requestBody),
        responses: summarizeResponses(spec, operation.responses),
        security: operation.security || spec.security || [],
      });
    }
  }

  return operations;
}

function markdownTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? cleanText(match[1]) : null;
}

function webhookEventFromMarkdown(source, markdown) {
  const title = markdownTitle(markdown) || source.title;
  const looksLikeWebhookEvent =
    /\bWebhook\b/i.test(source.title) || /^Triggered when/i.test(source.summary);

  if (!looksLikeWebhookEvent) return null;

  const eventMarkdown = markdown.split(/\n# OpenAPI definition/i)[0];
  const text = cleanText(
    eventMarkdown
      .replace(/^>[\s\S]*?\n\n/, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^#+\s+/gm, ""),
  );

  const topic =
    eventMarkdown.match(/\*\*Webhook Name\*\*:\s*`([^`]+)`/)?.[1] ||
    eventMarkdown.match(/`([a-z][a-z0-9._-]+)`/)?.[1] ||
    null;

  return {
    slug: source.slug,
    title,
    topic,
    topicHint: topic || source.slug,
    sourceUrl: source.url.replace(/\.md$/, ""),
    docsMarkdownUrl: source.url,
    description: text.slice(0, 900),
  };
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Other";
    acc[value] ||= [];
    acc[value].push(item);
    return acc;
  }, {});
}

function dedupeOperations(operations) {
  const byEndpoint = new Map();
  for (const operation of operations) {
    const key = `${operation.method} ${operation.baseUrl}${operation.path}`;
    const existing = byEndpoint.get(key);
    if (!existing) {
      byEndpoint.set(key, {
        ...operation,
        alternateDocs: [],
      });
      continue;
    }

    existing.alternateDocs.push({
      slug: operation.slug,
      title: operation.title,
      docsMarkdownUrl: operation.docsMarkdownUrl,
    });

    const operationMatchesSource =
      operation.operationId &&
      operation.slug &&
      operation.operationId.toLowerCase() === operation.slug.toLowerCase();
    const existingMatchesSource =
      existing.operationId &&
      existing.slug &&
      existing.operationId.toLowerCase() === existing.slug.toLowerCase();

    if (operationMatchesSource && !existingMatchesSource) {
      byEndpoint.set(key, {
        ...operation,
        alternateDocs: [
          {
            slug: existing.slug,
            title: existing.title,
            docsMarkdownUrl: existing.docsMarkdownUrl,
          },
          ...existing.alternateDocs,
        ],
      });
    }
  }

  return [...byEndpoint.values()];
}

function mdEscape(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .trim();
}

function schemaToInline(schema) {
  if (!schema) return "";
  if (schema.ref) return `\`${schema.ref}\``;
  if (schema.type === "array") return `array of ${schemaToInline(schema.items) || "items"}`;
  if (schema.type === "oneOf" || schema.type === "anyOf" || schema.type === "allOf") {
    return `${schema.type}(${(schema.variants || [])
      .map(schemaToInline)
      .filter(Boolean)
      .join(", ")})`;
  }
  return [schema.type, schema.format ? `(${schema.format})` : ""].filter(Boolean).join(" ");
}

function schemaFields(schema) {
  const fields = schema?.properties || schema?.items?.properties || [];
  if (!fields.length) return "";
  return fields
    .map((field) => {
      const type = field.enum
        ? `enum: ${field.enum.join(", ")}`
        : [field.type, field.format ? `(${field.format})` : ""]
            .filter(Boolean)
            .join(" ");
      return `\`${field.name}\`${type ? ` ${type}` : ""}`;
    })
    .join(", ");
}

function renderParameters(operation) {
  if (!operation.parameters.length) return "None.";
  return [
    "| Name | In | Required | Type | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...operation.parameters.map((parameter) =>
      [
        `\`${parameter.name}\``,
        parameter.in,
        parameter.required ? "yes" : "no",
        schemaToInline(parameter.schema),
        mdEscape(parameter.description),
      ].join(" | "),
    ),
  ].join("\n");
}

function renderRequestBody(operation) {
  const body = operation.requestBody;
  if (!body) return "None.";
  const lines = [`Required: ${body.required ? "yes" : "no"}.`];
  for (const content of body.content || []) {
    lines.push(
      `- \`${content.contentType}\`: ${schemaToInline(content.schema) || "schema not named"}`,
    );
    const fields = schemaFields(content.schema);
    if (fields) lines.push(`  Fields: ${fields}`);
  }
  return lines.join("\n");
}

function renderResponses(operation) {
  if (!operation.responses.length) return "None documented.";
  return [
    "| Status | Description | Schema |",
    "| --- | --- | --- |",
    ...operation.responses.map((response) => {
      const schemas = (response.content || [])
        .map((content) => schemaToInline(content.schema))
        .filter(Boolean)
        .join(", ");
      return [
        `\`${response.status}\``,
        mdEscape(response.description),
        mdEscape(schemas),
      ].join(" | ");
    }),
  ].join("\n");
}

function renderEndpointReference(operations, webhookEvents, sources) {
  const grouped = groupBy(
    [...operations].sort((a, b) =>
      `${a.category} ${a.path} ${a.method}`.localeCompare(
        `${b.category} ${b.path} ${b.method}`,
      ),
    ),
    "category",
  );

  const lines = [
    "# AccuLynx API Full Endpoint Reference",
    "",
    `Generated: ${generatedAt}`,
    "Source: https://apidocs.acculynx.com/llms.txt",
    "",
    "This file is generated from AccuLynx's public Markdown pages and embedded OpenAPI definitions. Use it with `openapi-index.json` for endpoint selection, request planning, and bridge maintenance.",
    "",
    "## Summary",
    "",
    `- API operations parsed: ${operations.length}`,
    `- Webhook event references parsed: ${webhookEvents.length}`,
    `- Source pages fetched: ${sources.length}`,
    "",
    "## Endpoint Catalog",
    "",
  ];

  for (const [category, categoryOps] of Object.entries(grouped)) {
    lines.push(`### ${category}`, "");
    lines.push("| Method | Path | Operation | Source |");
    lines.push("| --- | --- | --- | --- |");
    for (const op of categoryOps) {
      lines.push(
        `| \`${op.method}\` | \`${op.path}\` | ${mdEscape(op.summary)} | [${op.slug}](${op.docsMarkdownUrl}) |`,
      );
    }
    lines.push("");
  }

  lines.push("## Operation Details", "");
  for (const op of operations.sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  )) {
    lines.push(`### ${op.method} ${op.path}`, "");
    lines.push(`- Title: ${op.title}`);
    lines.push(`- Operation ID: ${op.operationId ? `\`${op.operationId}\`` : "not provided"}`);
    lines.push(`- Base URL: \`${op.baseUrl}\``);
    lines.push(`- Source: ${op.docsMarkdownUrl}`);
    lines.push(`- Summary: ${op.summary}`);
    if (op.description && op.description !== op.summary) {
      lines.push(`- Notes: ${op.description}`);
    }
    lines.push("");
    lines.push("Parameters:");
    lines.push("");
    lines.push(renderParameters(op));
    lines.push("");
    lines.push("Request body:");
    lines.push("");
    lines.push(renderRequestBody(op));
    lines.push("");
    lines.push("Responses:");
    lines.push("");
    lines.push(renderResponses(op));
    lines.push("");
  }

  if (webhookEvents.length) {
    lines.push("## Webhook Event References", "");
    lines.push(
      "Topic hints are generated from the event documentation page. Call `GET /topics` in the target AccuLynx account before creating or updating a subscription.",
      "",
    );
    lines.push("| Topic hint | Event | Source |");
    lines.push("| --- | --- | --- |");
    for (const event of webhookEvents.sort((a, b) =>
      (a.topic || a.topicHint).localeCompare(b.topic || b.topicHint),
    )) {
      lines.push(
        `| \`${event.topic || event.topicHint}\` | ${mdEscape(event.title)} | [${event.slug}](${event.docsMarkdownUrl}) |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderApiGuide(operations, webhookEvents, changelogSources) {
  const categories = Object.entries(groupBy(operations, "category"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, ops]) => ({ category, count: ops.length }));

  const pathFor = (operationId) =>
    operations.find((op) => op.operationId === operationId)?.path || null;

  const lines = [
    "# AccuLynx API Documentation",
    "",
    `Last generated: ${generatedAt}`,
    "",
    "This is the local working guide for AccuLynx API tasks in the roofer Open Brain. It is generated from `https://apidocs.acculynx.com/llms.txt` plus each linked Markdown/OpenAPI page. Use the `acculynx-api` skill before implementing AccuLynx bridge work, planning one-off API calls, or creating webhook subscriptions.",
    "",
    "## Source Scope",
    "",
    "- Guides: getting started, rate limits, webhook endpoint guidance, listener guidance, and code samples.",
    "- API reference: all operations discoverable from AccuLynx `llms.txt` with embedded OpenAPI definitions.",
    "- Changelog: all changelog Markdown pages discoverable from `llms.txt`.",
    "",
    "## Base URLs",
    "",
    "| Surface | Base URL | Notes |",
    "| --- | --- | --- |",
    "| AccuLynx API V2 | `https://api.acculynx.com/api/v2` | Jobs, contacts, estimates, financials, company settings, users, reports, supplements. |",
    "| AccuLynx Webhooks API | `https://api.acculynx.com/webhooks/v2` | Subscription CRUD, topics, and test events. |",
    "",
    "## Authentication",
    "",
    "- Use a Bearer API key: `Authorization: Bearer {ACCULYNX_API_KEY}`.",
    "- API keys are created in the AccuLynx account API page. Use descriptive, per-integration keys so keys can be rotated without breaking unrelated systems.",
    "- Never store API keys, webhook secrets, raw customer exports, or unredacted homeowner PII in curated memory.",
    "- Production API calls affect real AccuLynx data. Treat `POST`, `PUT`, `PATCH`, and `DELETE` as write operations that require explicit human approval unless the user has already authorized that exact action.",
    "",
    "## Rate Limits",
    "",
    "- Public docs state an IP concurrent limit of 30 requests per second and an API-key limit of 10 requests per second.",
    "- On HTTP `429`, back off with jitter and retry only idempotent reads by default.",
    "- For backfills, page by date windows instead of trying to sweep more than 100,000 records from one listing query.",
    "",
    "## Endpoint Coverage",
    "",
    "| Category | Operations |",
    "| --- | ---: |",
    ...categories.map(({ category, count }) => `| ${category} | ${count} |`),
    "",
    "## Common Endpoint Choices",
    "",
    `- Countries/states: \`GET ${pathFor("getAccuLynxCountries") || "/acculynx/countries"}\`, \`GET ${pathFor("getAccuLynxStates") || "/acculynx/countries/{countryId}/states"}\`. Use ` + "`includes=states`" + " where supported.",
    "- Company settings lookups: use job categories, trade types, work types, lead sources, insurance companies, photo/video tags, milestones, and statuses before hard-coding customer-specific IDs.",
    "- Job sync: use `GET /jobs` for listing and `GET /jobs/{jobId}` for detail. Use `assignment=unassigned` in a separate request when you need unassigned/dead leads.",
    "- Job writes: use the specific update endpoints for insurance, adjuster, initial appointment, job location address, priority, category, lead source, trade types, and work type. Do not fake these through generic job update calls.",
    "- Contacts: use contact list/detail/search endpoints, then contact email/phone/custom-field endpoints for enrichment.",
    "- Financials: use job financials, estimates, invoices, worksheet, amendments, payments, and supplements endpoints. Supplements are top-level under `/supplements`, not nested under `/jobs/{jobId}`.",
    "- Webhook management: use `/subscriptions`, `/subscriptions/{subscriptionId}`, `/subscriptions/{subscriptionId}/test-event`, and `/topics` on the webhooks base URL.",
    "",
    "## Roofing Bridge Gotchas",
    "",
    "- AccuLynx treats leads as job files. In bridge code, distinguish lead/job state by milestone and assignment filters, not by assuming a separate lead object.",
    "- Milestone names are customer-configurable and case-sensitive. Pull company milestones and map them through `config/roofer.config.yaml`.",
    "- Some fields are only available through includes. Check the endpoint detail before assuming nested objects will be present.",
    "- Dedicated message/log endpoints may be write-only. Use history/detail endpoints for read paths when the public reference does not expose a `GET` route.",
    "- Webhook access can be account-tier gated. If `/topics` does not return JSON, fall back to polling and ask the human to confirm account capabilities.",
    "",
    "## Changelog Signals",
    "",
    ...changelogSources.map((source) => `- ${source.title}: ${source.url.replace(/\.md$/, "")}`),
    "",
    "## Local Reference Files",
    "",
    "- `skills/cleverwork-roofer/acculynx-api/SKILL.md` — execution playbook for agents.",
    "- `skills/cleverwork-roofer/acculynx-api/reference/full-endpoint-reference.md` — human-readable endpoint details.",
    "- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — machine-readable operation index.",
    "- `skills/cleverwork-roofer/acculynx-api/reference/source-index.md` — fetched source inventory.",
  ];

  return lines.join("\n");
}

function renderSourceIndex(sources) {
  const lines = [
    "# AccuLynx API Source Index",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Section | Title | URL |",
    "| --- | --- | --- |",
    ...sources.map((source) =>
      `| ${source.section} | ${mdEscape(source.title)} | ${source.url} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

const llms = await fetchText(LLMS_URL);
const sources = parseLlmsIndex(llms);

const fetched = [];
const parsedOperations = [];
const webhookEvents = [];

for (const source of sources) {
  const markdown = await fetchText(source.url);
  fetched.push({ ...source, bytes: Buffer.byteLength(markdown, "utf8") });

  if (source.section === "API Reference") {
    const event = webhookEventFromMarkdown(source, markdown);
    if (event) webhookEvents.push(event);
  }

  const openApi = extractOpenApi(markdown);
  if (openApi) {
    parsedOperations.push(...operationFromSpec(source, openApi));
  }
}

const operations = dedupeOperations(parsedOperations);

const index = {
  generatedAt,
  source: LLMS_URL,
  counts: {
    sources: fetched.length,
    operations: operations.length,
    webhookEvents: webhookEvents.length,
  },
  operations: operations.sort((a, b) =>
    `${a.category} ${a.path} ${a.method}`.localeCompare(
      `${b.category} ${b.path} ${b.method}`,
    ),
  ),
  webhookEvents: webhookEvents.sort((a, b) =>
    (a.topic || a.topicHint).localeCompare(b.topic || b.topicHint),
  ),
  sources: fetched,
};

await writeFile(indexJsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
await writeFile(
  endpointReferencePath,
  `${renderEndpointReference(operations, webhookEvents, fetched)}\n`,
  "utf8",
);
await writeFile(
  apiDocPath,
  `${renderApiGuide(
    operations,
    webhookEvents,
    fetched.filter((source) => source.section === "Changelog"),
  )}\n`,
  "utf8",
);
await writeFile(sourceIndexPath, `${renderSourceIndex(fetched)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      generatedAt,
      sources: fetched.length,
      operations: operations.length,
      webhookEvents: webhookEvents.length,
      outputs: [
        path.relative(repoRoot, apiDocPath),
        path.relative(repoRoot, endpointReferencePath),
        path.relative(repoRoot, indexJsonPath),
        path.relative(repoRoot, sourceIndexPath),
      ],
    },
    null,
    2,
  ),
);
