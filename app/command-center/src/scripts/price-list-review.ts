// Client for the Price List Review surface: confirm/reject/edit a match, then promote a doc to a
// live agreement. Talks to /api/price-agreement/review/{update,promote}.

const setStatus = (row: HTMLElement, status: string) => {
  row.dataset.status = status;
  const pill = row.querySelector(".plr-stat") as HTMLElement | null;
  if (pill) { pill.textContent = status; pill.className = `pill plr-stat plr-${status}`; }
};

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "bad_response" }));
}

document.querySelectorAll<HTMLButtonElement>("[data-confirm]").forEach((b) =>
  b.addEventListener("click", async () => {
    const row = b.closest("tr") as HTMLElement;
    const id = b.dataset.confirm!;
    const itemNumber = (row.querySelector(".plr-item") as HTMLInputElement)?.value.trim();
    b.disabled = true;
    const r = await post("/api/price-agreement/review/update", { id, status: "confirmed", itemNumber });
    b.disabled = false;
    if (r?.ok) setStatus(row, "confirmed");
  }));

document.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((b) =>
  b.addEventListener("click", async () => {
    const row = b.closest("tr") as HTMLElement;
    b.disabled = true;
    const r = await post("/api/price-agreement/review/update", { id: b.dataset.reject!, status: "rejected" });
    b.disabled = false;
    if (r?.ok) setStatus(row, "rejected");
  }));

document.querySelectorAll<HTMLButtonElement>("[data-promote]").forEach((b) =>
  b.addEventListener("click", async () => {
    const sourceDoc = b.dataset.promote!;
    b.disabled = true; b.textContent = "Promoting…";
    const r = await post("/api/price-agreement/review/promote", { sourceDoc });
    if (r?.ok) { b.textContent = `Promoted ✓ (${r.items} items)`; }
    else { b.disabled = false; b.textContent = "Promote → agreement"; alert("Promote failed: " + (r?.error_description || r?.error || "unknown")); }
  }));
