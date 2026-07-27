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
      onExit();
    },
    isActive() {
      return active;
    },
    isShuttingDown() {
      return requested;
    },
  });
}
