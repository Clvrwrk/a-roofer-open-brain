import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseRuntimeConfig {
  configured: boolean;
  projectRef: string | null;
  url: string | null;
  authMode: "service-role" | "unconfigured";
  missing: string[];
}

export interface ServerSupabaseClient {
  client: SupabaseClient | null;
  config: SupabaseRuntimeConfig;
}

function cleanUrl(value?: string) {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized ? normalized : null;
}

function parseProjectRef(url: string | null) {
  if (!url) return null;

  try {
    const host = new URL(url).hostname;
    const [projectRef] = host.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

export function getSupabaseRuntimeConfig(env: ImportMetaEnv = import.meta.env): SupabaseRuntimeConfig {
  const url = cleanUrl(env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing: string[] = [];

  if (!url) missing.push("SUPABASE_URL or PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    configured: Boolean(url && serviceRoleKey),
    projectRef: parseProjectRef(url),
    url,
    authMode: serviceRoleKey ? "service-role" : "unconfigured",
    missing,
  };
}

export function createServerSupabaseClient(env: ImportMetaEnv = import.meta.env): ServerSupabaseClient {
  const config = getSupabaseRuntimeConfig(env);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!config.configured || !config.url || !serviceRoleKey) {
    return {
      client: null,
      config,
    };
  }

  return {
    client: createClient(config.url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          "x-open-brain-client": "command-center",
        },
      },
    }),
    config,
  };
}
