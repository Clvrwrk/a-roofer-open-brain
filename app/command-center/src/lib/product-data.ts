import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type ProductSurfaceStatus = "live" | "degraded" | "unconfigured";
export type ProductSourceStatus = "ok" | "error" | "unconfigured";

export interface ProductMetric {
  label: string;
  value: string;
}

export interface ProductSourceCard {
  id: string;
  label: string;
  department: string;
  rpc: string;
  status: ProductSourceStatus;
  payloadKind: string;
  primaryMetric: ProductMetric;
  metrics: ProductMetric[];
  fieldCoverage: string[];
  errorMessage?: string;
}

export interface ProductSurface {
  status: ProductSurfaceStatus;
  generatedAt: string;
  project: {
    ref: string;
    name: string;
    url: string;
    runtimeRef: string | null;
  };
  missingConfig: string[];
  sources: ProductSourceCard[];
}

interface ProductRpcSource {
  id: string;
  label: string;
  department: string;
  rpc: string;
  args?: Record<string, unknown>;
}

const PRODUCT_PROJECT = {
  ref: "rnhmvcpsvtqjlffpsayu",
  name: "Pro Exteriors LLC - Agent Workforce",
  url: "https://rnhmvcpsvtqjlffpsayu.supabase.co",
};

const PRODUCT_RPC_SOURCES: ProductRpcSource[] = [
  {
    id: "price-list",
    label: "ABC Price List",
    department: "Accounting",
    rpc: "price_list_snapshot",
  },
  {
    id: "invoice-gate",
    label: "Invoice Gate",
    department: "Accounting",
    rpc: "invoice_gate_snapshot",
  },
  {
    id: "agreement-audit",
    label: "Agreement Audit",
    department: "Accounting",
    rpc: "agreement_audit_snapshot",
  },
  {
    id: "catalog-sample",
    label: "Product Catalog",
    department: "Operations",
    rpc: "catalog_snapshot",
    args: { p_limit: 25 },
  },
];

const SENSITIVE_KEY_PATTERN = /(address|email|phone|name|customer|owner|contact|token|secret|key|jwt|assertion)/i;

function labelize(value: string) {
  return value
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPayloadKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function formatValue(value: unknown) {
  if (typeof value === "number") return new Intl.NumberFormat("en-US").format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return String(value);
}

function isDisplayablePrimitive(key: string, value: unknown) {
  if (SENSITIVE_KEY_PATTERN.test(key)) return false;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  return /(status|state|mode|currency|date|ref|version|updated|generated|window)/i.test(key);
}

function collectSummary(value: unknown, path = "payload", depth = 0) {
  const metrics: ProductMetric[] = [];
  const fields = new Set<string>();

  function visit(node: unknown, nodePath: string, nodeDepth: number) {
    if (nodeDepth > 4 || node === null || node === undefined) return;

    if (Array.isArray(node)) {
      metrics.push({
        label: `${labelize(nodePath)} Rows`,
        value: new Intl.NumberFormat("en-US").format(node.length),
      });

      const firstObject = node.find((item) => item && typeof item === "object" && !Array.isArray(item));
      if (firstObject && typeof firstObject === "object") {
        Object.keys(firstObject).forEach((field) => {
          if (!SENSITIVE_KEY_PATTERN.test(field)) fields.add(field);
        });
      }
      return;
    }

    if (typeof node !== "object") return;

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) fields.add(key);

      if (isDisplayablePrimitive(key, child)) {
        metrics.push({
          label: labelize(key),
          value: formatValue(child),
        });
      }

      if (typeof child === "object" && child !== null) {
        visit(child, key, nodeDepth + 1);
      }
    }
  }

  visit(value, path, depth);

  return {
    metrics: metrics.slice(0, 5),
    fieldCoverage: Array.from(fields).sort().slice(0, 12),
  };
}

function summarizePayload(source: ProductRpcSource, payload: unknown): ProductSourceCard {
  const { metrics, fieldCoverage } = collectSummary(payload);
  const primaryMetric = metrics[0] ?? {
    label: "Snapshot",
    value: getPayloadKind(payload),
  };

  return {
    id: source.id,
    label: source.label,
    department: source.department,
    rpc: source.rpc,
    status: "ok",
    payloadKind: getPayloadKind(payload),
    primaryMetric,
    metrics: metrics.slice(1),
    fieldCoverage,
  };
}

function summarizeUnavailable(source: ProductRpcSource, missingConfig: string[]): ProductSourceCard {
  return {
    id: source.id,
    label: source.label,
    department: source.department,
    rpc: source.rpc,
    status: "unconfigured",
    payloadKind: "unavailable",
    primaryMetric: {
      label: "Config",
      value: `${missingConfig.length} vars`,
    },
    metrics: missingConfig.map((name) => ({ label: "Missing", value: name })),
    fieldCoverage: [],
  };
}

function summarizeError(source: ProductRpcSource, error: { message?: string; code?: string }): ProductSourceCard {
  return {
    id: source.id,
    label: source.label,
    department: source.department,
    rpc: source.rpc,
    status: "error",
    payloadKind: "error",
    primaryMetric: {
      label: "RPC",
      value: "Error",
    },
    metrics: error.code ? [{ label: "Code", value: error.code }] : [],
    fieldCoverage: [],
    errorMessage: error.message?.slice(0, 180) ?? "Unknown Supabase error",
  };
}

export async function loadProductSurface(env: RuntimeEnv = getRuntimeEnv()): Promise<ProductSurface> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return {
      status: "unconfigured",
      generatedAt: new Date().toISOString(),
      project: {
        ...PRODUCT_PROJECT,
        runtimeRef: config.projectRef,
      },
      missingConfig: config.missing,
      sources: PRODUCT_RPC_SOURCES.map((source) => summarizeUnavailable(source, config.missing)),
    };
  }

  const sources = await Promise.all(
    PRODUCT_RPC_SOURCES.map(async (source) => {
      const { data, error } = await client.rpc(source.rpc, source.args ?? {});
      if (error) return summarizeError(source, error);
      return summarizePayload(source, data);
    }),
  );

  return {
    status: sources.every((source) => source.status === "ok") ? "live" : "degraded",
    generatedAt: new Date().toISOString(),
    project: {
      ...PRODUCT_PROJECT,
      runtimeRef: config.projectRef,
    },
    missingConfig: [],
    sources,
  };
}
