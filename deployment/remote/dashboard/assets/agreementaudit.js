/* Price Agreement Audit — agreements with currency + CEO approval, plus per-row
   actions: View (PDF + full catalog below), Approve (CEO), + Add (new agreement
   for that vendor/region), and Edit scope (which region/office + branch it ties
   to). Read/write via /api/agreement-audit, /api/agreement[/ceo-approve|/scope],
   /api/catalog, /api/scope-refs, /api/scope-branches. */
(function () {
  "use strict";
  var COLOR = { current: "#059669", expiring: "#eaa221", expired: "#DC2626", unverified: "#0066cc" };
  var state = { inited: false, data: null, refs: null, catalog: null, expanded: null, op: localStorage.getItem("pe_operator") || "operator" };
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function pill(s) { var c = COLOR[s] || "#6B7280"; return '<span class="status-pill" style="background:' + c + '22;color:' + c + '">' + s + "</span>"; }
  function post(u, b) { return fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().catch(function () { return {}; }); }); }
  function getJSON(u, f) { return fetch(u).then(function (r) { return r.ok ? r.json() : f; }).catch(function () { return f; }); }
  function inp(ph, type) { var i = document.createElement("input"); if (ph) i.placeholder = ph; if (type) i.type = type; i.style.cssText = "min-height:34px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 8px"; return i; }

  function load() {
    return Promise.all([
      getJSON("/api/agreement-audit", { agreements: [], changes: [] }),
      state.refs ? Promise.resolve(state.refs) : getJSON("/api/scope-refs", { regions: [], offices: [] }),
    ]).then(function (res) { state.data = res[0]; state.refs = res[1]; render(); });
  }

  // ── Inline editors ──────────────────────────────────────────────────────────
  function addForm(a) {
    var box = el("td"); box.colSpan = 11; box.style.background = "var(--color-surface-inset)";
    var wrap = el("div"); wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 2px";
    wrap.appendChild(el("span", "small-note", "New agreement for " + a.vendor + " · " + a.region + ":"));
    var ver = inp("Version"); ver.value = "v" + (parseInt((a.version || "v1").replace(/\D/g, "")) + 1 || 2);
    var acct = inp("Account"); acct.value = a.account || "";
    var eff = inp("", "date"), exp = inp("", "date");
    [["Version", ver], ["Account", acct], ["Effective", eff], ["Expiry", exp]].forEach(function (f) { var d = el("div"); d.appendChild(el("label", "small-note", f[0])); f[1].style.display = "block"; d.appendChild(f[1]); wrap.appendChild(d); });
    var create = el("button", "primary-action", "Create agreement"); create.style.cssText = "min-height:34px;padding:0 12px";
    create.addEventListener("click", function () {
      create.disabled = true;
      post("/api/agreement", { vendor: a.vendor, region_code: a.region, account: acct.value, version: ver.value, effective: eff.value || null, expiry: exp.value || null })
        .then(function (r) { if (r && r.ok === false) { alert("Add failed: " + (r.error || "")); create.disabled = false; } else { state.expanded = null; load(); } });
    });
    wrap.appendChild(create);
    box.appendChild(wrap); var tr = el("tr"); tr.appendChild(box); return tr;
  }

  function scopeForm(a) {
    var box = el("td"); box.colSpan = 11; box.style.background = "var(--color-surface-inset)";
    var wrap = el("div"); wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 2px";
    wrap.appendChild(el("span", "small-note", "Tie this agreement to:"));
    var regSel = document.createElement("select"); regSel.style.cssText = "min-height:34px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 8px";
    (state.refs.regions || []).forEach(function (r) { var o = new Option(r.code + " — " + (r.name || ""), r.id); regSel.appendChild(o); });
    regSel.value = a.region_id || "";
    var offNote = el("span", "small-note", "");
    function setOffNote() { var offs = (state.refs.offices || []).filter(function (o) { return o.region_id === regSel.value; }).map(function (o) { return o.name; }); offNote.textContent = offs.length ? "Offices: " + offs.join(", ") : "No offices in this region"; }
    setOffNote();
    var brSel = document.createElement("select"); brSel.style.cssText = regSel.style.cssText;
    function loadBranches() {
      brSel.innerHTML = ""; brSel.appendChild(new Option("(all branches in region)", ""));
      getJSON("/api/scope-branches?vendor=" + encodeURIComponent(a.vendor_id) + "&region=" + encodeURIComponent(regSel.value), []).then(function (bs) {
        (bs || []).forEach(function (b) { brSel.appendChild(new Option(b.name + " (" + b.city + ", " + b.state + ")", b.id)); });
        brSel.value = a.vendor_branch_id || "";
      });
    }
    regSel.addEventListener("change", function () { setOffNote(); loadBranches(); });
    loadBranches();
    var rd = el("div"); rd.appendChild(el("label", "small-note", "Region / offices")); regSel.style.display = "block"; rd.appendChild(regSel); rd.appendChild(offNote); wrap.appendChild(rd);
    var bd = el("div"); bd.appendChild(el("label", "small-note", "Branch (optional)")); brSel.style.display = "block"; bd.appendChild(brSel); wrap.appendChild(bd);
    var save = el("button", "primary-action", "Save scope"); save.style.cssText = "min-height:34px;padding:0 12px";
    save.addEventListener("click", function () {
      save.disabled = true;
      post("/api/agreement/scope", { agreement_id: a.id, region_id: regSel.value, vendor_branch_id: brSel.value || null }).then(function () { state.expanded = null; load(); });
    });
    wrap.appendChild(save);
    box.appendChild(wrap); var tr = el("tr"); tr.appendChild(box); return tr;
  }

  // ── Line-by-line agreement audit ──────────────────────────────────────────────
  function loadLines(a, holder) {
    getJSON("/api/agreement/lines?agreement=" + encodeURIComponent(a.id), []).then(function (lines) { renderLines(a, holder, lines); });
  }
  function renderLines(a, holder, lines) {
    holder.innerHTML = "";
    if (!lines || !lines.length) { holder.appendChild(el("p", "small-note", "No line items loaded for this agreement.")); return; }
    var pending = lines.filter(function (l) { return l.approval === "pending"; }).length;
    holder.appendChild(el("p", "small-note", lines.length + " line items · " + pending + " pending review. Approve or reject each changed SKU; unchanged lines carry forward."));
    var t = el("table");
    t.innerHTML = "<thead><tr><th>Product</th><th>SKU</th><th>UOM</th><th>Prior</th><th>New</th><th>Δ%</th><th>Status</th><th></th></tr></thead>";
    var tb = el("tbody");
    lines.forEach(function (l) {
      var changed = l.prior != null && l.price != null && Number(l.prior) !== Number(l.price);
      var pctColor = l.pct > 0 ? "#DC2626" : l.pct < 0 ? "#059669" : "#6B7280";
      var stColor = l.approval === "approved" ? "#059669" : l.approval === "rejected" ? "#DC2626" : "#eaa221";
      var tr = el("tr");
      tr.innerHTML = "<td>" + (l.product || "") + "</td><td>" + (l.internal_sku || l.mfr_sku || "") + "</td><td>" + (l.uom || "") +
        "</td><td>" + (l.prior != null ? "$" + l.prior : "—") + "</td><td><strong>" + (l.price != null ? "$" + l.price : "—") +
        '</strong></td><td style="color:' + pctColor + '">' + (l.pct != null ? l.pct + "%" : "") +
        '</td><td><span class="status-pill" style="background:' + stColor + '22;color:' + stColor + '">' + l.approval + "</span></td>";
      var act = el("td"); act.style.whiteSpace = "nowrap";
      if (l.approval === "pending") {
        var ok = el("button", "primary-action", "Approve"); ok.style.cssText = "min-height:28px;padding:0 10px;font-size:11px;margin-right:4px";
        ok.addEventListener("click", function () { ok.disabled = true; post("/api/agreement/line-approve", { line_id: l.id, decision: "approved", by: state.op }).then(function () { loadLines(a, holder); load(); }); });
        var no = el("button", "danger-action", "Reject"); no.style.cssText = "min-height:28px;padding:0 10px;font-size:11px";
        no.addEventListener("click", function () { no.disabled = true; post("/api/agreement/line-approve", { line_id: l.id, decision: "rejected", by: state.op }).then(function () { loadLines(a, holder); load(); }); });
        act.appendChild(ok); act.appendChild(no);
      } else { act.innerHTML = '<span class="small-note">' + (l.approved_by ? "by " + l.approved_by : "") + "</span>"; }
      tr.appendChild(act); tb.appendChild(tr);
    });
    t.appendChild(tb); holder.appendChild(t);
  }

  // ── Detail panel: PDF + catalog ───────────────────────────────────────────────
  function showDetail(a) {
    var surface = document.getElementById("agreement-detail-surface");
    var panel = document.getElementById("agreement-detail");
    document.getElementById("agreement-detail-title").textContent = a.vendor + " · " + a.region + " " + (a.version || "");
    surface.style.display = "block";
    panel.innerHTML = "";
    var pdf = a.source_pdf_url || a.source_file;
    var doc = el("div", "small-note");
    doc.innerHTML = "Agreement document: " + (pdf ? '<a href="' + pdf + '" target="_blank" rel="noopener">' + pdf + "</a>" : "<em>none on file</em>");
    panel.appendChild(doc);

    // Line-by-line review of this agreement's items.
    panel.appendChild(el("p", "eyebrow", "Line items — approve each changed SKU"));
    var linesHolder = el("div", "table-wrap"); linesHolder.innerHTML = '<p class="small-note">Loading line items…</p>';
    panel.appendChild(linesHolder);
    loadLines(a, linesHolder);

    panel.appendChild(el("p", "eyebrow", "Catalog — single source of truth (UOM from invoice)"));
    var holder = el("div", "table-wrap"); holder.innerHTML = '<p class="small-note">Loading catalog…</p>'; panel.appendChild(holder);
    var cat = state.catalog ? Promise.resolve(state.catalog) : getJSON("/api/catalog", { count: 0, products: [] });
    cat.then(function (c) {
      state.catalog = c;
      var money = function (n) { return n == null ? "—" : "$" + Number(n).toFixed(2); };
      var t = el("table");
      t.innerHTML = "<thead><tr><th>Product</th><th>Internal SKU</th><th>UOM</th><th>Min</th><th>Mean (blended)</th><th>Max</th><th>Vendors</th><th>Lowest price → vendor</th></tr></thead>";
      var tb = el("tbody");
      (c.products || []).forEach(function (p) {
        var low = p.lowest_vendor ? (money(p.lowest_price) + " → <strong>" + p.lowest_vendor + "</strong>") : "—";
        var tr = el("tr");
        tr.innerHTML = "<td>" + (p.name || "") + "</td><td>" + (p.internal_sku || "") + "</td><td>" + (p.base_uom || "") +
          "</td><td>" + money(p.min_price) + '</td><td><strong>' + money(p.mean_price) + "</strong></td><td>" + money(p.max_price) +
          "</td><td>" + (p.vendors || 0) + "</td><td>" + low + "</td>";
        tb.appendChild(tr);
      });
      t.appendChild(tb); holder.innerHTML = "";
      holder.appendChild(el("p", "small-note", "Showing " + (c.products || []).length + " of " + c.count + " catalog products."));
      holder.appendChild(t);
    });
    surface.scrollIntoView({ block: "nearest" });
  }

  function renderAgreements(root, list) {
    root.innerHTML = "";
    if (!list || !list.length) { root.appendChild(el("p", "empty-state", "No price agreements on file.")); return; }
    var t = el("table");
    t.innerHTML = "<thead><tr><th>Vendor</th><th>Region</th><th>Ver</th><th>Account</th><th>Effective</th><th>Expiry</th><th>Status</th><th>CEO approved</th><th>Lines</th><th>Review</th><th>Actions</th></tr></thead>";
    var tb = el("tbody");
    list.forEach(function (a) {
      var ceo = a.ceo_verified ? ("✓ " + (a.ceo_verified_by || "yes") + (a.ceo_verified_at ? " · " + String(a.ceo_verified_at).slice(0, 10) : "")) : "—";
      var tr = el("tr");
      tr.innerHTML = "<td>" + (a.vendor || "") + "</td><td>" + (a.region || "") + "</td><td>" + (a.version || "") +
        "</td><td>" + (a.account || "—") + "</td><td>" + (a.effective || "—") + "</td><td>" + (a.expiry || "—") +
        "</td><td>" + pill(a.status) + "</td><td>" + ceo + "</td><td>" + (a.line_items || 0) +
        "</td><td>" + (a.lines_need_review ? '<strong style="color:#DC2626">' + a.lines_need_review + "</strong>" : "0") + "</td>";
      var act = el("td"); act.style.whiteSpace = "nowrap";
      function mini(label, cls) { var b = el("button", cls || "button-ghost", label); b.style.cssText = "min-height:28px;padding:0 8px;font-size:11px;margin:0 4px 4px 0"; return b; }
      var view = mini("View"); view.addEventListener("click", function () { showDetail(a); }); act.appendChild(view);
      if (!a.ceo_verified) { var ap = mini("Approve", "inline-action"); ap.addEventListener("click", function () { ap.disabled = true; post("/api/agreement/ceo-approve", { agreement_id: a.id, by: state.op }).then(load); }); act.appendChild(ap); }
      var add = mini("+ Add"); add.addEventListener("click", function () { state.expanded = state.expanded && state.expanded.id === a.id && state.expanded.mode === "add" ? null : { id: a.id, mode: "add" }; render(); }); act.appendChild(add);
      var sc = mini("Edit scope"); sc.addEventListener("click", function () { state.expanded = state.expanded && state.expanded.id === a.id && state.expanded.mode === "scope" ? null : { id: a.id, mode: "scope" }; render(); }); act.appendChild(sc);
      tr.appendChild(act);
      tb.appendChild(tr);
      if (state.expanded && state.expanded.id === a.id) tb.appendChild(state.expanded.mode === "add" ? addForm(a) : scopeForm(a));
    });
    t.appendChild(tb); root.appendChild(t);
  }

  function renderChanges(root, changes) {
    root.innerHTML = "";
    if (!changes || !changes.length) { root.appendChild(el("p", "empty-state", "No line-item price changes detected yet. When a new price sheet is loaded, changed SKUs appear here for line-by-line approval.")); return; }
    var t = el("table");
    t.innerHTML = "<thead><tr><th>Item</th><th>Item #</th><th>Region</th><th>Was</th><th>Now</th><th>%</th><th>Dir</th></tr></thead>";
    var tb = el("tbody");
    changes.forEach(function (c) {
      var dc = c.dir === "increase" ? "#DC2626" : c.dir === "decrease" ? "#059669" : "#6B7280";
      var tr = el("tr");
      tr.innerHTML = "<td>" + (c.item || "") + "</td><td>" + (c.item_number || "") + "</td><td>" + (c.region || "") + "</td><td>" + (c.v1 != null ? "$" + c.v1 : "—") + "</td><td>" + (c.v2 != null ? "$" + c.v2 : "—") + '</td><td style="color:' + dc + '">' + (c.pct != null ? c.pct + "%" : "") + "</td><td>" + (c.dir || "") + "</td>";
      tb.appendChild(tr);
    });
    t.appendChild(tb); root.appendChild(t);
  }

  function render() {
    renderAgreements(document.getElementById("agreement-audit-list"), state.data.agreements);
    renderChanges(document.getElementById("agreement-audit-changes"), state.data.changes);
  }

  function init() {
    if (state.inited) return; state.inited = true;
    load().catch(function () { var l = document.getElementById("agreement-audit-list"); if (l) l.innerHTML = '<p class="empty-state">Could not load. Restart <code>npm run dev</code>.</p>'; });
  }
  function hook() { var b = document.querySelector('[data-view="agreementaudit"]'); if (b) b.addEventListener("click", function () { setTimeout(init, 40); }); }
  if (document.readyState !== "loading") hook(); else document.addEventListener("DOMContentLoaded", hook);
})();
