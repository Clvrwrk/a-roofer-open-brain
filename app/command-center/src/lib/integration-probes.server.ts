// Direct HTTPS pings from the Command Center to every system we depend on (docs/109 D16).
// Chris, 2026-09-12: "do not use Better Stack for third parties — just our active
// connections; if we ping JT and get a 200 it's green." So the app itself asks each
// system, once a minute, and judges the answer against the documented healthy code.
// Where the Command Center holds the credential (WorkOS, Supabase, Better Stack, …)
// the ping authenticates; where the credential deliberately lives elsewhere (JobTread,
// AccuLynx, QuickBooks keys on the agent host / in edge-function secrets) the ping is
// a reachability check and the expected code is whatever that endpoint returns to an
// anonymous caller (documented per row in runtime-registry.ts).
import type { RuntimeEnv } from "./runtime-env";
import type { IntegrationSpec } from "./runtime-registry";

export interface ProbeResult {
  key: string;
  mode: "authenticated" | "reachability";
  url: string | null;
  status: number | null;
  /** The answer matched the expected code (and the expected body fragment, when one is declared). */
  ok: boolean;
  ms: number;
  error: string | null;
  checkedAt: string;
  /** null when the spec declares no credential; otherwise whether this deployment has it. */
  credentialConfigured: boolean | null;
}

export const PROBE_TIMEOUT_MS = 6_000;
export const PROBE_CACHE_MS = 60_000;
const cache = new Map<string, { at: number; result: ProbeResult }>();

function credential(env: RuntimeEnv, name?: string): string | undefined {
  const value = name ? env[name]?.trim() : undefined;
  return value && value !== "__set_me__" ? value : undefined;
}

/** Fills `{ENV_NAME}` placeholders from the runtime env; null when any placeholder is unset. */
export function resolveProbeUrl(template: string, env: RuntimeEnv): string | null {
  let missing = false;
  const url = template.replace(/\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const value = credential(env, name);
    if (!value) missing = true;
    return (value ?? "").replace(/\/$/, "");
  });
  return missing ? null : url;
}

export function expectedStatus(spec: IntegrationSpec, mode: ProbeResult["mode"]): number {
  return mode === "authenticated" ? spec.expectAuthed ?? 200 : spec.expectAnon;
}

export async function runProbe(spec: IntegrationSpec, env: RuntimeEnv, now = Date.now(), fetchFn: typeof fetch = fetch): Promise<ProbeResult> {
  const cred = credential(env, spec.authEnv);
  const mode: ProbeResult["mode"] = cred ? "authenticated" : "reachability";
  const url = resolveProbeUrl(mode === "authenticated" ? spec.url : spec.anonUrl ?? spec.url, env);
  const base: ProbeResult = { key: spec.key, mode, url, status: null, ok: false, ms: 0, error: null, checkedAt: new Date(now).toISOString(), credentialConfigured: spec.authEnv ? Boolean(cred) : null };
  if (!url) return { ...base, error: "probe URL needs an env value this deployment does not have" };
  const headers: Record<string, string> = { accept: "application/json, text/plain;q=0.8, */*;q=0.5", "user-agent": "open-brain-command-center/runtime-board" };
  if (cred) {
    if (spec.auth === "apikey") { headers.apikey = cred; headers.authorization = `Bearer ${cred}`; }
    else if (spec.auth === "raw") headers.authorization = cred;
    else headers.authorization = `Bearer ${cred}`;
  }
  const method = spec.method ?? "GET";
  if (method === "POST") headers["content-type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetchFn(url, { method, headers, body: method === "POST" ? spec.body ?? "{}" : undefined, redirect: "manual", signal: controller.signal });
    const ms = Date.now() - started;
    const expected = expectedStatus(spec, mode);
    let bodyOk = true;
    if (spec.expectBody) {
      const text = (await res.text()).slice(0, 4_096);
      bodyOk = text.includes(spec.expectBody);
    }
    return { ...base, status: res.status, ok: res.status === expected && bodyOk, ms };
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? (error.name === "AbortError" ? `timeout after ${PROBE_TIMEOUT_MS} ms` : error.message) : "fetch failed";
    return { ...base, ms, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every probe in parallel; each key is cached for PROBE_CACHE_MS so a 30 s poll costs one ping a minute. */
export async function probeIntegrations(specs: IntegrationSpec[], env: RuntimeEnv, now = Date.now(), fetchFn: typeof fetch = fetch): Promise<ProbeResult[]> {
  return Promise.all(specs.map(async (spec) => {
    const hit = cache.get(spec.key);
    if (hit && now - hit.at < PROBE_CACHE_MS) return hit.result;
    const result = await runProbe(spec, env, now, fetchFn);
    cache.set(spec.key, { at: now, result });
    return result;
  }));
}

export function resetProbeCache() { cache.clear(); }
