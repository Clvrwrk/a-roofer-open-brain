export const COMPOSIO_SEND_TIMEOUT_MS = 30_000;

export function composioSendRequestOptions(
  timeoutMs = COMPOSIO_SEND_TIMEOUT_MS,
  externalSignal,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Composio timeout must be a positive safe integer");
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal,
  };
}
