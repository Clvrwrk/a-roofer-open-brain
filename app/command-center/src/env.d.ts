/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly WORKOS_CLIENT_ID?: string;
  readonly WORKOS_COOKIE_PASSWORD?: string;
  readonly COMMAND_CENTER_AUTH_MODE?: "disabled" | "workos";
  readonly COMMAND_CENTER_PUBLIC_URL?: string;
  readonly AGENT_AUTH_ISSUER?: string;
  readonly AGENT_RUNTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
