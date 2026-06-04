import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(root, "..", "..", "..");

// Minimal .env loader (repo-root .env is git-ignored). Names mirror config/.env.example.
function loadEnv() {
  const p = join(repoRoot, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const port = Number(process.env.PORT ?? 4177);
const host = process.env.HOST ?? "127.0.0.1";
const MAPS_BROWSER_KEY = process.env.GOOGLE_MAPS_BROWSER_KEY ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const liveDb = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const contentTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png",
};

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function resolvePath(url) {
  const requestPath = new URL(url, `http://${host}:${port}`).pathname;
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const candidate = normalize(join(root, cleanPath));
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const sbHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// WorkOS-ready authorization guard. Today it is permissive (single trusted
// operator on localhost). When the WorkOS auth layer lands, replace the body
// with: validate the WorkOS session cookie/JWT, read the user's role, and
// return false for roles that may not perform write `action`s (e.g. a
// read-only "viewer"). Centralizing it here means every write path is gated.
const WRITE_ROLES = { ceo_approve: ["admin", "ceo"], add_agreement: ["admin", "purchasing"],
  assign_office: ["admin", "purchasing"], refresh_status: ["admin", "purchasing"],
  save_settings: ["admin"], invoice_pay: ["admin", "accounting"],
  gate_override: ["admin", "ceo", "accounting"], invoice_price: ["admin", "purchasing", "accounting"] };
function authorize(req, action) {
  // TODO(workos): const role = roleFromWorkOsSession(req); return (WRITE_ROLES[action]||[]).includes(role);
  return { ok: true, role: "operator" }; // permissive until WorkOS is wired
}
async function sbFetch(url, opts) {
  return fetch(url, { ...opts, headers: { ...sbHeaders, ...(opts && opts.headers) }, signal: AbortSignal.timeout(8000) });
}
async function logAction(invoice_id, action, actor, detail) {
  if (!liveDb) return;
  try {
    await sbFetch(`${SUPABASE_URL}/rest/v1/invoice_action_log`, { method: "POST",
      headers: { Prefer: "return=minimal" }, body: JSON.stringify({ invoice_id, action, actor, detail }) });
  } catch (e) { /* best-effort audit */ }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", `http://${host}:${port}`).pathname;

  // Inject browser-safe config (Maps JS key is referrer-restricted; never the server key).
  if (path === "/config.js") {
    return send(res, 200, contentTypes[".js"],
      `window.__PE_CONFIG__=${JSON.stringify({ mapsBrowserKey: MAPS_BROWSER_KEY, liveDb })};`);
  }

  // Territory data — live from Supabase when creds are present, else the baked snapshot.
  if (path === "/api/territories") {
    if (liveDb) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/territory_snapshot`, { method: "POST", headers: sbHeaders, body: "{}", signal: AbortSignal.timeout(6000) });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through to snapshot */ }
    }
    try {
      return send(res, 200, contentTypes[".json"], await readFile(join(root, "assets/territories.json")));
    } catch { return send(res, 404, "text/plain", "no snapshot"); }
  }

  // Persist an overlap routing decision (assign a branch to an office).
  if (path === "/api/territory/assign" && req.method === "POST") {
    const payload = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false, note: "set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist" }));
    try {
      const url = `${SUPABASE_URL}/rest/v1/vendor_branches?id=eq.${encodeURIComponent(payload.vendor_branch_id)}`;
      const r = await fetch(url, { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ pricing_territory_office_id: payload.office_id, pricing_status: "covered",
          territory_decided_by: payload.decided_by ?? "dashboard", territory_decided_at: new Date().toISOString() }) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Price-list currency + refresh queue (live RPC when creds present, else snapshot).
  if (path === "/api/price-lists") {
    if (liveDb) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/price_list_snapshot`, { method: "POST", headers: sbHeaders, body: "{}", signal: AbortSignal.timeout(6000) });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through */ }
    }
    try { return send(res, 200, contentTypes[".json"], await readFile(join(root, "assets/price-lists.json"))); }
    catch { return send(res, 404, "text/plain", "no snapshot"); }
  }

  // Fleet / vehicle dashboard snapshot (live).
  if (path === "/api/fleet") {
    if (liveDb) { try { const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/fleet_snapshot`, { method: "POST", body: "{}" }); if (r.ok) return send(res, 200, contentTypes[".json"], await r.text()); } catch (e) {} }
    return send(res, 200, contentTypes[".json"], JSON.stringify({ kpis: {}, vehicles: [] }));
  }

  // Catalog (single source of truth) for the audit in-view panel.
  if (path === "/api/catalog") {
    if (liveDb) {
      try { const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/catalog_snapshot`, { method: "POST", body: JSON.stringify({ p_limit: 500 }) });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text()); } catch (e) {}
    }
    return send(res, 200, contentTypes[".json"], JSON.stringify({ count: 0, products: [] }));
  }
  // Scope reference lists (regions + offices).
  if (path === "/api/scope-refs") {
    if (liveDb) { try { const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/scope_refs`, { method: "POST", body: "{}" }); if (r.ok) return send(res, 200, contentTypes[".json"], await r.text()); } catch (e) {} }
    return send(res, 200, contentTypes[".json"], JSON.stringify({ regions: [], offices: [] }));
  }
  // Branches for a vendor+region (branch-level tie editing).
  if (path === "/api/scope-branches") {
    const q = new URL(req.url, `http://${host}:${port}`).searchParams;
    if (liveDb) { try { const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/scope_branches`, { method: "POST", body: JSON.stringify({ p_vendor: q.get("vendor"), p_region: q.get("region") || null }) }); if (r.ok) return send(res, 200, contentTypes[".json"], await r.text()); } catch (e) {} }
    return send(res, 200, contentTypes[".json"], "[]");
  }
  // Edit which region/branch an agreement is tied to.
  if (path === "/api/agreement/scope" && req.method === "POST") {
    const a = authorize(req, "add_agreement"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const patch = {};
      if ("region_id" in p) patch.region_id = p.region_id || null;
      if ("vendor_branch_id" in p) patch.vendor_branch_id = p.vendor_branch_id || null;
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/price_agreements?id=eq.${encodeURIComponent(p.agreement_id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Price agreement audit snapshot (live).
  if (path === "/api/agreement-audit") {
    if (liveDb) {
      try {
        const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/agreement_audit_snapshot`, { method: "POST", body: "{}" });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through */ }
    }
    return send(res, 200, contentTypes[".json"], JSON.stringify({ agreements: [], changes: [] }));
  }

  // Invoice pricing-gate summary (live RPC when creds present, else snapshot).
  if (path === "/api/invoice-gate") {
    if (liveDb) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/invoice_gate_snapshot`, { method: "POST", headers: sbHeaders, body: "{}", signal: AbortSignal.timeout(6000) });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through */ }
    }
    try { return send(res, 200, contentTypes[".json"], await readFile(join(root, "assets/invoice-gate.json"))); }
    catch { return send(res, 404, "text/plain", "no snapshot"); }
  }

  // Set the send channel for a refresh request (gmail | ghl).
  if (path === "/api/price-refresh/channel" && req.method === "POST") {
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/price_refresh_request?id=eq.${encodeURIComponent(p.id)}`,
        { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ channel: p.channel }) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Advance a refresh request's status (Lucinda's verify -> approve -> ready_to_send -> sent).
  if (path === "/api/price-refresh/status" && req.method === "POST") {
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const patch = { status: p.status };
      if (p.status === "approved") { patch.verified_by = p.verified_by ?? "Lucinda"; patch.verified_at = new Date().toISOString(); }
      if (p.status === "sent") patch.sent_at = new Date().toISOString();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/price_refresh_request?id=eq.${encodeURIComponent(p.id)}`,
        { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Actionable invoice list (live).
  if (path === "/api/invoices") {
    const unpaid = !(new URL(req.url, `http://${host}:${port}`).searchParams.get("all") === "1");
    if (liveDb) {
      try {
        const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/invoice_list`, { method: "POST", body: JSON.stringify({ p_unpaid_only: unpaid, p_limit: 300 }) });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through */ }
    }
    return send(res, 200, contentTypes[".json"], "[]");
  }

  // Mark invoice paid / unpaid (paid is gate-enforced unless overridden).
  if (path === "/api/invoice/pay" && req.method === "POST") {
    const a = authorize(req, "invoice_pay"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    const paid = p.paid !== false;
    try {
      const body = paid ? { payment_status: "paid", paid_by: p.by ?? "operator" } : { payment_status: "unpaid", paid_at: null, paid_by: null };
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/invoice_documents?id=eq.${encodeURIComponent(p.id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
      if (!r.ok) { const txt = await r.text(); return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: false, blocked: true, error: txt.replace(/.*PRICING_GATE_BLOCKED:\s*/s, "").slice(0, 200) })); }
      await logAction(p.id, paid ? "mark_paid" : "mark_unpaid", p.by ?? "operator", null);
      return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: true }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Override the pricing gate for one invoice (records actor + reason).
  if (path === "/api/invoice/gate-override" && req.method === "POST") {
    const a = authorize(req, "gate_override"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const on = p.override !== false;
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/invoice_documents?id=eq.${encodeURIComponent(p.id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ gate_override: on, gate_override_by: on ? (p.by ?? "operator") : null, gate_override_at: on ? new Date().toISOString() : null, gate_override_reason: on ? (p.reason ?? null) : null }) });
      await logAction(p.id, on ? "gate_override" : "gate_override_clear", p.by ?? "operator", { reason: p.reason ?? null });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Set a per-invoice agreement or a one-time negotiated price.
  if (path === "/api/invoice/price" && req.method === "POST") {
    const a = authorize(req, "invoice_price"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    let body;
    if (p.mode === "onetime") body = { one_time_price: p.price, one_time_price_note: p.note ?? null, override_agreement_id: null };
    else if (p.mode === "agreement") body = { override_agreement_id: p.agreement_id, one_time_price: null, one_time_price_note: null };
    else body = { one_time_price: null, one_time_price_note: null, override_agreement_id: null };
    try {
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/invoice_documents?id=eq.${encodeURIComponent(p.id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
      await logAction(p.id, "set_price_" + (p.mode || "clear"), p.by ?? "operator", body);
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Agreement line items (for the line-by-line audit).
  if (path === "/api/agreement/lines") {
    const ag = new URL(req.url, `http://${host}:${port}`).searchParams.get("agreement");
    if (liveDb) { try { const r = await sbFetch(`${SUPABASE_URL}/rest/v1/rpc/agreement_lines`, { method: "POST", body: JSON.stringify({ p_agreement: ag }) }); if (r.ok) return send(res, 200, contentTypes[".json"], await r.text()); } catch (e) {} }
    return send(res, 200, contentTypes[".json"], "[]");
  }
  // Approve / reject one agreement line.
  if (path === "/api/agreement/line-approve" && req.method === "POST") {
    const a = authorize(req, "ceo_approve"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/abc_price_list_items?id=eq.${encodeURIComponent(p.line_id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ approval_status: p.decision, approved_by: p.by ?? "operator", approved_at: new Date().toISOString() }) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Mark a price agreement CEO-approved (ceo_verified=true).
  if (path === "/api/agreement/ceo-approve" && req.method === "POST") {
    const a = authorize(req, "ceo_approve"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/price_agreements?id=eq.${encodeURIComponent(p.agreement_id)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ ceo_verified: true, ceo_verified_at: new Date().toISOString(), ceo_verified_by: p.by ?? "dashboard" }) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Add a new price agreement from the territory/agreement view.
  if (path === "/api/agreement" && req.method === "POST") {
    const a = authorize(req, "add_agreement"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const vr = await sbFetch(`${SUPABASE_URL}/rest/v1/vendors?select=id&name=eq.${encodeURIComponent(p.vendor)}`, { method: "GET" });
      const vendor = (await vr.json())[0];
      const rr = await sbFetch(`${SUPABASE_URL}/rest/v1/regions?select=id&region_code=eq.${encodeURIComponent(p.region_code)}`, { method: "GET" });
      const region = (await rr.json())[0];
      if (!vendor || !region) return send(res, 400, contentTypes[".json"], JSON.stringify({ ok: false, error: "unknown vendor or region" }));
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/price_agreements`, { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ vendor_id: vendor.id, region_id: region.id, account_number: p.account || null,
          version_label: p.version || "v1", effective_date: p.effective || null, expiry_date: p.expiry || null,
          is_active: true, ceo_verified: false }) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Settings: read all + save (upsert).
  if (path === "/api/settings" && req.method === "GET") {
    if (liveDb) {
      try {
        const r = await sbFetch(`${SUPABASE_URL}/rest/v1/app_setting?select=key,value,label,description&order=label`, { method: "GET" });
        if (r.ok) return send(res, 200, contentTypes[".json"], await r.text());
      } catch (e) { /* fall through */ }
    }
    return send(res, 200, contentTypes[".json"], "[]");
  }
  if (path === "/api/settings" && req.method === "POST") {
    const a = authorize(req, "save_settings"); if (!a.ok) return send(res, 403, contentTypes[".json"], JSON.stringify({ ok: false, error: "forbidden" }));
    const p = JSON.parse((await readBody(req)) || "{}");
    if (!liveDb) return send(res, 200, contentTypes[".json"], JSON.stringify({ ok: true, persisted: false }));
    try {
      const rows = (p.settings || []).map((s) => ({ key: s.key, value: s.value, label: s.label, description: s.description, updated_by: p.by ?? "dashboard" }));
      const r = await sbFetch(`${SUPABASE_URL}/rest/v1/app_setting?on_conflict=key`, { method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
      return send(res, r.ok ? 200 : 502, contentTypes[".json"], JSON.stringify({ ok: r.ok, persisted: r.ok }));
    } catch (e) { return send(res, 502, contentTypes[".json"], JSON.stringify({ ok: false, error: String(e) })); }
  }

  // Static files
  const file = resolvePath(req.url ?? "/");
  if (!file) return send(res, 403, "text/plain", "forbidden");
  try {
    const body = await readFile(file);
    send(res, 200, contentTypes[extname(file)] ?? "application/octet-stream", body);
  } catch {
    send(res, 404, "text/plain; charset=utf-8", "not found");
  }
});

server.listen(port, host, () => {
  console.log(`Open Brain admin on http://${host}:${port}  (live DB: ${liveDb ? "yes" : "no — snapshot"})`);
});
