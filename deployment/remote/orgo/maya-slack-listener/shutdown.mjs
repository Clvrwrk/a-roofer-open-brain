export function createShutdownCoordinator({ onExit, onLog }) {
  let active = false;
  let attemptController;
  let requested = false;

  return Object.freeze({
    beginAttempt() {
      if (active || requested) return undefined;
      active = true;
      attemptController = new AbortController();
      return attemptController.signal;
    },
    handleSignal() {
      requested = true;
      onLog?.("shutdown_requested", { active });
      if (attemptController && !attemptController.signal.aborted) {
        attemptController.abort(new Error("Shutdown requested"));
      }
      if (!active) onExit();
    },
    completeAttempt() {
      active = false;
      attemptController = undefined;
      if (requested) onExit();
    },
    isActive() {
      return active;
    },
    isShuttingDown() {
      return requested;
    },
  });
}

export function createSerialQueue({ handler, onError }) {
  let tail = Promise.resolve();
  let pending = 0;

  return Object.freeze({
    enqueue(value) {
      pending += 1;
      const task = tail
        .then(() => handler(value))
        .catch((error) => onError?.(error))
        .finally(() => {
          pending -= 1;
        });
      tail = task;
      return task;
    },
    pendingCount() {
      return pending;
    },
    whenIdle() {
      return tail;
    },
  });
}
