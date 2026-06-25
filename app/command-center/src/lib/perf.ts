export interface PerfMetric {
  name: string;
  durationMs: number;
  description?: string;
}

const roundMs = (value: number) => Math.round(value * 10) / 10;

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export async function timeAsync<T>(name: string, run: () => Promise<T>, metrics: PerfMetric[] = []): Promise<T> {
  const started = nowMs();
  try {
    return await run();
  } finally {
    metrics.push({ name, durationMs: roundMs(nowMs() - started) });
  }
}

export function payloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function serverTiming(metrics: PerfMetric[]): string {
  return metrics
    .map((metric) => {
      const token = metric.name.replace(/[^A-Za-z0-9_-]/g, "_");
      const desc = metric.description ? `;desc="${metric.description.replaceAll('"', "'")}"` : "";
      return `${token};dur=${metric.durationMs}${desc}`;
    })
    .join(", ");
}

export function logPerfMetrics(scope: string, metrics: PerfMetric[]) {
  if (process.env.COMMAND_CENTER_PERF_LOG !== "1") return;
  const summary = metrics.map((metric) => `${metric.name}=${metric.durationMs}ms${metric.description ? ` (${metric.description})` : ""}`).join(" ");
  console.info(`[command-center:perf] ${scope} ${summary}`);
}
