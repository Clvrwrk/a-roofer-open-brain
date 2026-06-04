// db.ts — minimal PostgREST client for the brain.
// The MCP container reaches Supabase PostgREST as service_role. No client-side
// keys; the service-role key comes from the container environment (Coolify/vault),
// never from the repo. See CONVENTIONS.md §4 and SECURITY.md.

export interface DbConfig {
  url: string; // SUPABASE_URL
  serviceRoleKey: string; // SUPABASE_SERVICE_ROLE_KEY (env only)
}

export interface BrainDb {
  /** Call a PostgREST RPC (a SQL function) by name. */
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
}

/** Real PostgREST-backed implementation (used in production). */
export function createBrainDb(cfg: DbConfig): BrainDb {
  const base = cfg.url.replace(/\/+$/, "");
  return {
    async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
      const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": cfg.serviceRoleKey,
          "Authorization": `Bearer ${cfg.serviceRoleKey}`,
        },
        body: JSON.stringify(args ?? {}),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`PostgREST rpc ${fn} failed: ${res.status} ${detail}`);
      }
      return (await res.json()) as T;
    },
  };
}
