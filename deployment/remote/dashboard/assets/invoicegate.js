/* Invoice Audits — live pricing-gate summary + an actionable per-invoice table:
   mark paid/unpaid, override the gate (records actor + reason), and set a
   per-invoice agreement or a one-time negotiated price. Every action is recorded
   in invoice_action_log for audit (and, once agents are live, the One Brain).
   Reads /api/invoice-gate (summary) + /api/invoices (rows) + /api/price-lists
   (agreement options). Writes via /api/invoice/*. */
(function () {
  "use strict";
  var state = { inited: false, gate: null, rows: [], agreements: [], expanded: null, blockedOnly: true,
    op: localStorage.getItem("pe_operator") || "" };
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function post(url, body) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }); }); }
  function actor() { return state.op || "operator"; }

  function getJSON(url, fallback) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : fallback; }).catch(function () { return fallback; });
  }

  function load() {
    return Promise.all([
      getJSON("/api/invoice-gate", null).catch(function () { return null; }),
      getJSON("/api/invoices", []),
      getJSON("/api/price-lists", { currency: [] }),
    ]).then(function (res) {
      state.gate = res[0]; state.rows = Array.isArray(res[1]) ? res[1] : [];
      var seen = {}; state.agreements = [];
      (res[2].currency || []).forEach(function (c) { if (c.agreement_id && !seen[c.agreement_id]) { seen[c.agreement_id] = 1; state.agreements.push(c); } });
      render();
    });
  }

  function summaryAndRegions(root) {
    var d = state.gate; if (!d) return;
    var s = d.summary || { total: 0, ok: 0, blocked: 0 };
    var kpis = el("div", "packet-kpis");
    kpis.appendChild(el("div", null, '<span>Unpaid invoices</span><strong>' + s.total + "</strong>"));
    kpis.appendChild(el("div", null, '<span>Payable</span><strong style="color:#059669">' + s.ok + "</strong>"));
    kpis.appendChild(el("div", null, '<span>Blocked</span><strong style="color:#DC2626">' + s.blocked + "</strong>"));
    root.appendChild(kpis);
  }

  function gatePill(ok) {
    return ok ? '<span class="status-pill status-approved">payable</span>'
              : '<span class="status-pill status-blocked">blocked</span>';
  }
  function payPill(status) {
    return '<span class="status-pill ' + (status === "paid" ? "status-approved" : "status-draft") + '">' + status + "</span>";
  }

  function actionPanel(row) {
    var box = el("td"); box.colSpan = 7; box.style.background = "var(--color-surface-inset)";
    var wrap = el("div"); wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 2px";

    if (row.payment_status !== "paid") {
      var pay = el("button", "primary-action", "Mark paid");
      pay.style.cssText = "min-height:34px;padding:0 12px";
      pay.addEventListener("click", function () {
        pay.disabled = true;
        post("/api/invoice/pay", { id: row.id, paid: true, by: actor() }).then(function (r) {
          if (r && r.blocked) alert("Blocked: " + (r.error || "pricing gate") + "\n\nUse Override, a one-time price, or a per-invoice agreement first.");
          load();
        });
      });
      wrap.appendChild(pay);
    } else {
      var unpay = el("button", "inline-action", "Mark unpaid");
      unpay.style.cssText = "min-height:34px;padding:0 12px";
      unpay.addEventListener("click", function () { post("/api/invoice/pay", { id: row.id, paid: false, by: actor() }).then(load); });
      wrap.appendChild(unpay);
    }

    var ov = el("button", "inline-action", row.gate_override ? "Clear override" : "Override gate");
    ov.style.cssText = "min-height:34px;padding:0 12px";
    ov.addEventListener("click", function () {
      if (row.gate_override) { post("/api/invoice/gate-override", { id: row.id, override: false, by: actor() }).then(load); return; }
      var reason = prompt("Override the pricing gate for invoice " + row.invoice_number + ".\nReason (recorded for audit):", "");
      if (reason === null) return;
      post("/api/invoice/gate-override", { id: row.id, override: true, reason: reason, by: actor() }).then(load);
    });
    wrap.appendChild(ov);

    var ot = el("button", "inline-action", "One-time price");
    ot.style.cssText = "min-height:34px;padding:0 12px";
    ot.addEventListener("click", function () {
      var v = prompt("One-time negotiated price for invoice " + row.invoice_number + " (number). Leave blank to clear:", row.one_time_price || "");
      if (v === null) return;
      if (v.trim() === "") post("/api/invoice/price", { id: row.id, mode: "clear", by: actor() }).then(load);
      else post("/api/invoice/price", { id: row.id, mode: "onetime", price: Number(v), note: "manual one-time", by: actor() }).then(load);
    });
    wrap.appendChild(ot);

    // Assign a specific agreement
    if (state.agreements.length) {
      var sel = document.createElement("select");
      sel.style.cssText = "min-height:34px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 8px";
      sel.appendChild(new Option("Assign agreement…", ""));
      state.agreements.forEach(function (a) { sel.appendChild(new Option(a.vendor + " · " + a.region + " " + (a.version || "") + " (" + a.status + ")", a.agreement_id)); });
      sel.value = row.override_agreement_id || "";
      sel.addEventListener("change", function () {
        if (!sel.value) post("/api/invoice/price", { id: row.id, mode: "clear", by: actor() }).then(load);
        else post("/api/invoice/price", { id: row.id, mode: "agreement", agreement_id: sel.value, by: actor() }).then(load);
      });
      wrap.appendChild(sel);
    }
    box.appendChild(wrap);
    var tr = el("tr"); tr.appendChild(box); return tr;
  }

  function render() {
    var root = document.getElementById("invoice-gate-panel");
    if (!root) return; root.innerHTML = "";
    summaryAndRegions(root);

    var ctrl = el("div", "row-actions"); ctrl.style.margin = "10px 0";
    var opWrap = el("label", "small-note", "Operator (recorded on actions): ");
    var opIn = document.createElement("input"); opIn.value = state.op; opIn.placeholder = "your name";
    opIn.style.cssText = "min-height:32px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 8px;margin-left:6px";
    opIn.addEventListener("change", function () { state.op = opIn.value; localStorage.setItem("pe_operator", state.op); });
    opWrap.appendChild(opIn); ctrl.appendChild(opWrap);
    var only = document.createElement("label"); only.className = "small-note"; only.style.marginLeft = "16px";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.blockedOnly;
    cb.addEventListener("change", function () { state.blockedOnly = cb.checked; render(); });
    only.appendChild(cb); only.appendChild(document.createTextNode(" Blocked only"));
    ctrl.appendChild(only);
    root.appendChild(ctrl);

    var rows = state.rows.filter(function (r) { return !state.blockedOnly || !r.pricing_ok; });
    var t = el("table");
    t.innerHTML = "<thead><tr><th>Invoice</th><th>Date</th><th>Vendor</th><th>Region</th><th>Gate</th><th>Payment</th><th></th></tr></thead>";
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.innerHTML = "<td>" + r.invoice_number + "</td><td>" + (r.invoice_date || "") + "</td><td>" + (r.vendor || "") +
        "</td><td>" + (r.region || "") + '</td><td title="' + (r.gate_reason || "").replace(/"/g, "") + '">' + gatePill(r.pricing_ok) +
        "</td><td>" + payPill(r.payment_status) + "</td>";
      var actTd = el("td");
      var btn = el("button", "button-ghost", state.expanded === r.id ? "Close" : "Actions");
      btn.style.cssText = "min-height:30px;padding:0 10px;font-size:12px";
      btn.addEventListener("click", function () { state.expanded = state.expanded === r.id ? null : r.id; render(); });
      actTd.appendChild(btn); tr.appendChild(actTd);
      tb.appendChild(tr);
      if (state.expanded === r.id) tb.appendChild(actionPanel(r));
    });
    t.appendChild(tb);
    var wrap = el("div", "table-wrap"); wrap.appendChild(t); root.appendChild(wrap);
    root.appendChild(el("p", "small-note", "Showing " + rows.length + " of " + state.rows.length + " loaded (unpaid). Actions are recorded with the operator name for audit."));
  }

  function init() {
    if (state.inited) return; state.inited = true;
    load().catch(function () {
      var root = document.getElementById("invoice-gate-panel");
      if (root) root.innerHTML = '<p class="empty-state">Could not load invoice data. Restart <code>npm run dev</code>.</p>';
    });
  }
  function hook() { var b = document.querySelector('[data-view="audits"]'); if (b) b.addEventListener("click", function () { setTimeout(init, 40); }); }
  if (document.readyState !== "loading") hook(); else document.addEventListener("DOMContentLoaded", hook);
})();
