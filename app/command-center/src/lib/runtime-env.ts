export type RuntimeEnv = Partial<Record<string, string | undefined>>;

export function getRuntimeEnv(): RuntimeEnv {
  return globalThis.process?.env ?? {};
}
