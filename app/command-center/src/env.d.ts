/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    actor: import("@lib/access-control").CommandCenterActor | null;
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly WORKOS_API_KEY?: string;
  readonly WORKOS_CLIENT_ID?: string;
  readonly WORKOS_COOKIE_PASSWORD?: string;
  readonly WORKOS_REDIRECT_URI?: string;
  readonly COMMAND_CENTER_AUTH_MODE?: "disabled" | "workos";
  readonly COMMAND_CENTER_PUBLIC_URL?: string;
  readonly AGENT_AUTH_ISSUER?: string;
  readonly AGENT_RUNTIME_URL?: string;
  readonly AGENT_SERVICE_TOKENS?: string;
  readonly COMMAND_CENTER_HUMAN_ADMIN_EMAILS?: string;
  readonly COMMAND_CENTER_ROLE_PURCHASING_EMAILS?: string;
  readonly COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS?: string;
  readonly COMMAND_CENTER_VIEWER_DOMAINS?: string;
  /** D-09/OQ-2: CSV of approver emails granted approval.decide_prod_write. Empty by default — human/config step. */
  readonly PROD_WRITE_APPROVER_EMAILS?: string;
  readonly AGENTMAIL_API_KEY?: string;
  readonly AGENTMAIL_DOMAIN?: string;
  readonly AGENTMAIL_WEBHOOK_URL?: string;
  readonly AGENTMAIL_WEBHOOK_SECRET?: string;
  readonly AGENTMAIL_WEBHOOK_SECRETS?: string;
  readonly LINEAR_API_KEY?: string;
  readonly GITHUB_WEBHOOK_SECRET?: string;
  readonly SENTRY_WEBHOOK_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
