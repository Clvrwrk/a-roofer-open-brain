// Overview page: "Refresh data" re-runs the server-side validation queries by
// reloading the SSR page (every loader recomputes from live source tables).
const refresh = document.querySelector<HTMLButtonElement>("[data-pf-refresh]");

refresh?.addEventListener("click", () => {
  refresh.disabled = true;
  refresh.textContent = "Refreshing…";
  window.location.reload();
});
