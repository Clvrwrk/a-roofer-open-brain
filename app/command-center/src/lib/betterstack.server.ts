// Better Stack Uptime read client for the runtime board (docs/109 D2, D3, D10).
// Server-only: the token never reaches the browser. Cached in-process for 45 s so a
// 30 s page poll from several viewers does not fan out into API calls.
import { getRuntimeEnv, type RuntimeEnv } from "./runtime-env";

const API = "https://uptime.betterstack.com/api/v2";
const CACHE_MS = 45_000;

export type BetterStackMonitorStatus = "up" | "down" | "pending" | "paused" | "validating" | "maintenance" | string;
export type BetterStackHeartbeatStatus = "up" | "down" | "pending" | "paused" | string;

export interface BetterStackMonitor {
  id: string;
  name: string;
  url: string;
  status: BetterStackMonitorStatus;
  checkFrequency: number | null;
  lastCheckedAt: string | null;
  paused: boolean;
}

export interface BetterStackHeartbeat {
  id: string;
  name: string;
  status: BetterStackHeartbeatStatus;
  period: number | null;
  grace: number | null;
  paused: boolean;
}

export interface BetterStackSnapshot {
  state: "ok" | "unconfigured" | "error";
  detail: string;
  fetchedAt: string;
  monitors: BetterStackMonitor[];
  heartbeats: BetterStackHeartbeat[];
}

let cache: { at: number; snapshot: BetterStackSnapshot } | null = null;

async function listAll<T>(token: string, path: string, map: (row: any) => T): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}?per_page=250`;
  let guard = 0;
  while (url && guard++ < 10) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!res.ok) throw new Error(`Better Stack ${path} → HTTP ${res.status}`);
    const body: any = await res.json();
    for (const row of body?.data ?? []) out.push(map(row));
    url = body?.pagination?.next ?? null;
  }
  return out;
}

export async function loadBetterStackSnapshot(env: RuntimeEnv = getRuntimeEnv(), now = Date.now()): Promise<BetterStackSnapshot> {
  if (cache && now - cache.at < CACHE_MS) return cache.snapshot;
  const token = env.BETTERSTACK_API_TOKEN?.trim();
  const fetchedAt = new Date(now).toISOString();
  if (!token || token === "__set_me__") {
    const snapshot: BetterStackSnapshot = {
      state: "unconfigured",
      detail: "BETTERSTACK_API_TOKEN is not set on this deployment — external probes and heartbeats are not visible.",
      fetchedAt,
      monitors: [],
      heartbeats: [],
    };
    cache = { at: now, snapshot };
    return snapshot;
  }
  try {
    const [monitors, heartbeats] = await Promise.all([
      listAll<BetterStackMonitor>(token, "/monitors", (row) => ({
        id: String(row.id),
        name: String(row.attributes?.pronounceable_name ?? ""),
        url: String(row.attributes?.url ?? ""),
        status: String(row.attributes?.status ?? "unknown"),
        checkFrequency: row.attributes?.check_frequency ?? null,
        lastCheckedAt: row.attributes?.last_checked_at ?? null,
        paused: Boolean(row.attributes?.paused),
      })),
      listAll<BetterStackHeartbeat>(token, "/heartbeats", (row) => ({
        id: String(row.id),
        name: String(row.attributes?.name ?? ""),
        status: String(row.attributes?.status ?? "unknown"),
        period: row.attributes?.period ?? null,
        grace: row.attributes?.grace ?? null,
        paused: Boolean(row.attributes?.paused),
      })),
    ]);
    const snapshot: BetterStackSnapshot = {
      state: "ok",
      detail: `${monitors.length} monitors, ${heartbeats.length} heartbeats`,
      fetchedAt,
      monitors,
      heartbeats,
    };
    cache = { at: now, snapshot };
    return snapshot;
  } catch (error) {
    const snapshot: BetterStackSnapshot = {
      state: "error",
      detail: error instanceof Error ? error.message : "Better Stack request failed",
      fetchedAt,
      monitors: [],
      heartbeats: [],
    };
    // Cache a failure briefly too, so a Better Stack outage does not multiply into a request storm.
    cache = { at: now, snapshot };
    return snapshot;
  }
}

/** Test hook. */
export function resetBetterStackCache() {
  cache = null;
}
