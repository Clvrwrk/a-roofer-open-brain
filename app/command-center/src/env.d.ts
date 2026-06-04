/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly WORKOS_CLIENT_ID?: string;
  readonly WORKOS_COOKIE_PASSWORD?: string;
  readonly COMMAND_CENTER_AUTH_MODE?: "disabled" | "workos";
  readonly AGENT_RUNTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
