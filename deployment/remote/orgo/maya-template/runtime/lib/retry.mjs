export async function runBoundedRetry({ operation, fingerprint = (error) => error?.name ?? "Error", onPark = async () => {} }) {
  const identical = new Map();
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return { state: "succeeded", attempt, value: await operation(attempt) };
    } catch (error) {
      lastError = error;
      const key = String(fingerprint(error));
      identical.set(key, (identical.get(key) ?? 0) + 1);
      if (identical.get(key) >= 3 || attempt === 3) {
        const receipt = { state: "parked", attempts: attempt, fingerprint: key };
        await onPark(receipt, error);
        return { ...receipt, error };
      }
    }
  }
  throw lastError;
}
