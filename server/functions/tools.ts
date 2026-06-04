// tools.ts — the internal brain MCP tools.
// IMPORTANT (security boundary, CONVENTIONS.md §4): this server is the
// INTERNAL brain (Historian/Capture side). It exposes retrieval + write tools
// over the client's own brain only. The Researcher (external retrieval) is a
// SEPARATE MCP container with NO database credentials and is never registered here.

import type { BrainDb } from "./db.ts";

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (db: BrainDb, args: Record<string, unknown>) => Promise<ToolResult>;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`missing required string argument: ${key}`);
  }
  return v;
}

export const TOOLS: Tool[] = [
  {
    name: "brain.remember",
    description:
      "Write an atom to the brain. Inferred/generated content lands at trust_tier 'evidence' by default; 'instruction' requires human confirmation (CONVENTIONS §3).",
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string", description: "the atom text" },
        metadata: { type: "object", description: "type, source_type, topics, people, etc." },
      },
    },
    async handler(db, args): Promise<ToolResult> {
      const content = requireString(args, "content");
      const metadata = (args.metadata as Record<string, unknown>) ?? {};
      const data = await db.rpc("upsert_thought", { p_content: content, p_payload: { metadata } });
      return { ok: true, data };
    },
  },
  {
    name: "brain.recall",
    description:
      "Full-text recall over the client's own brain. Internal-only; never reaches the public internet.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number", default: 25 },
        filter: { type: "object", description: "metadata containment filter" },
      },
    },
    async handler(db, args): Promise<ToolResult> {
      const query = requireString(args, "query");
      const limit = typeof args.limit === "number" ? args.limit : 25;
      const filter = (args.filter as Record<string, unknown>) ?? {};
      const data = await db.rpc("search_thoughts_text", {
        p_query: query,
        p_limit: limit,
        p_filter: filter,
        p_offset: 0,
      });
      return { ok: true, data };
    },
  },
  {
    name: "brain.property_history",
    description:
      "Consent-gated cross-client property history. Returns anonymized atoms about a property authored by OTHER clients in different trades. Every read is logged to atom_access_log.",
    inputSchema: {
      type: "object",
      required: ["property_id", "requesting_client_id", "requesting_trade"],
      properties: {
        property_id: { type: "string", format: "uuid" },
        requesting_client_id: { type: "string", format: "uuid" },
        requesting_trade: { type: "string" },
        query: { type: "string" },
        limit: { type: "number", default: 50 },
      },
    },
    async handler(db, args): Promise<ToolResult> {
      const data = await db.rpc("property_history_for", {
        p_property_id: requireString(args, "property_id"),
        p_requesting_client_id: requireString(args, "requesting_client_id"),
        p_requesting_trade: requireString(args, "requesting_trade"),
        p_query: typeof args.query === "string" ? args.query : null,
        p_limit: typeof args.limit === "number" ? args.limit : 50,
      });
      return { ok: true, data };
    },
  },
];

export function listTools(): Array<Omit<Tool, "handler">> {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function callTool(
  db: BrainDb,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `unknown tool: ${name}` };
  try {
    return await tool.handler(db, args ?? {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
