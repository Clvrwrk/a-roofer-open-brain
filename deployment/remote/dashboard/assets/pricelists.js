/* Price Agreements — currency of each territory's vendor agreement, add new
   agreements, mark them CEO-approved, and run the refresh-request queue Lucinda
   verifies (with copy-to-clipboard) before sending. Reads /api/price-lists (live
   RPC) or the baked snapshot; writes via /api/agreement[/ceo-approve],
   /api/price-refresh/*. */
(function () {
  "use strict";
  var COLOR = { current: "#059669", expiring: "#eaa221", expired: "#DC2626",
    unverified: "#0066cc", missing: "#9CA3AF", future: "#6B7280" };
  var state = { data: null, inited: false };

  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function overrides() { try { return JSON.parse(localStorage.getItem("pe_refresh_status") || "{}"); } catch (e) { return {}; } }
  function chOverrides() { try { return JSON.parse(localStorage.getItem("pe_refresh_channel") || "{}"); } catch (e) { return {}; } }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function setOverride(id, status) { var o = overrides(); o[id] = status; localStorage.setItem("pe_refresh_status", JSON.stringify(o)); post("/api/price-refresh/status", { id: id, status: status, verified_by: localStorage.getItem("pe_operator") || "Roberto Huerta" }); }
  function setChannel(id, channel) { var o = chOverrides(); o[id] = channel; localStorage.setItem("pe_refresh_channel", JSON.stringify(o)); post("/api/price-refresh/channel", { id: id, channel: channel }); }

  function copyText(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = "Copied!"; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); }
  }

  function pill(status) {
    var c = COLOR[status] || "#6B7280";
    return '<span class="status-pill" style="background:' + c + '22;color:' + c + '">' + status + "</span>";
  }

  function renderMatrix(root) {
    var rows = state.data.currency || [];
    var offices = [], vendors = [];
    rows.forEach(function (r) {
      if (offices.indexOf(r.office) < 0) offices.push(r.office);
      if (vendors.indexOf(r.vendor) < 0) vendors.push(r.vendor);
    });
    var idx = {}; rows.forEach(function (r) { idx[r.office + "|" + r.vendor] = r; });
    var t = el("table"); var thead = el("thead");
    var hr = el("tr"); hr.appendChild(el("th", null, "Office / Territory"));
    vendors.forEach(function (v) { hr.appendChild(el("th", null, v)); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    offices.forEach(function (off) {
      var tr = el("tr"); tr.appendChild(el("td", null, "<strong>" + off + "</strong>"));
      vendors.forEach(function (v) {
        var r = idx[off + "|" + v]; var td = el("td");
        if (!r) { td.innerHTML = "—"; tr.appendChild(td); return; }
        td.innerHTML = pill(r.status) +
          (r.expiry ? '<div class="small-note">exp ' + r.expiry + (r.account ? " · acct " + r.account : "") + "</div>" : "");
        if (r.agreement_id && r.verified !== true) {
          var ok = el("button", "inline-action", "Mark CEO Approved");
          ok.style.cssText = "min-height:28px;padding:0 8px;font-size:11px;margin-top:6px";
          ok.addEventListener("click", function () { ok.disabled = true; post("/api/agreement/ceo-approve", { agreement_id: r.agreement_id, by: "Chris" }).then(load); });
          td.appendChild(ok);
        } else if (r.verified === true) {
          td.appendChild(el("div", "small-note", "✓ CEO-approved"));
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    root.innerHTML = ""; root.appendChild(t);
  }

  function renderAddForm(root) {
    if (!root) return;
    var rows = state.data.currency || [];
    var vendors = [], regions = {};
    rows.forEach(function (r) { if (vendors.indexOf(r.vendor) < 0) vendors.push(r.vendor); if (r.region) regions[r.region] = r.office; });
    var wrap = el("div", "card-alt"); wrap.style.marginTop = "14px";
    wrap.appendChild(el("p", "eyebrow", "Add a price agreement"));
    var grid = el("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end";
    function field(label, node) { var d = el("div"); d.appendChild(el("label", "small-note", label)); node.style.cssText = "width:100%;min-height:38px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 8px"; d.appendChild(node); return d; }
    var vSel = document.createElement("select"); vendors.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; vSel.appendChild(o); });
    var rSel = document.createElement("select"); Object.keys(regions).forEach(function (code) { var o = document.createElement("option"); o.value = code; o.textContent = code + " — " + regions[code]; rSel.appendChild(o); });
    var acct = document.createElement("input"); acct.placeholder = "Account #";
    var ver = document.createElement("input"); ver.placeholder = "Version"; ver.value = "v1";
    var eff = document.createElement("input"); eff.type = "date";
    var exp = document.createElement("input"); exp.type = "date";
    grid.appendChild(field("Vendor", vSel)); grid.appendChild(field("Region", rSel));
    grid.appendChild(field("Account", acct)); grid.appendChild(field("Version", ver));
    grid.appendChild(field("Effective", eff)); grid.appendChild(field("Expiry", exp));
    wrap.appendChild(grid);
    var btn = el("button", "primary-action", "Add agreement"); btn.style.marginTop = "10px";
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Adding…";
      post("/api/agreement", { vendor: vSel.value, region_code: rSel.value, account: acct.value, version: ver.value, effective: eff.value || null, expiry: exp.value || null })
        .then(function (res) { if (res && res.ok === false) { alert("Add failed: " + (res.error || "unknown")); btn.disabled = false; btn.textContent = "Add agreement"; } else { load(); } });
    });
    wrap.appendChild(btn);
    wrap.appendChild(el("div", "small-note", "New agreements start un-verified — mark them CEO-approved above once confirmed."));
    root.innerHTML = ""; root.appendChild(wrap);
  }

  var STEP = { awaiting_verification: { next: "approved", label: "Verify & approve" },
               approved: { next: "ready_to_send", label: "Mark ready to send" },
               ready_to_send: { next: "sent", label: "Mark sent" } };

  function renderQueue(root) {
    var ov = overrides(); root.innerHTML = "";
    var reqs = state.data.requests || [];
    if (!reqs.length) { root.appendChild(el("p", "empty-state", "No refresh requests. Every territory has a current price agreement.")); return; }
    reqs.forEach(function (q) {
      var status = ov[q.id] || q.status;
      var card = el("div", "queue-item"); card.style.borderLeftColor = COLOR.expired;
      var top = el("div", "queue-topline");
      top.innerHTML = '<p class="queue-title">' + q.vendor + " &rarr; " + q.to_name + "</p>" +
        '<span class="status-pill ' + (status === "sent" ? "status-approved" : status === "ready_to_send" ? "status-review" : "status-draft") + '">' + status.replace(/_/g, " ") + "</span>";
      card.appendChild(top);
      card.appendChild(el("div", "small-note", "To: " + q.to_email + "  ·  Regions: " + (q.regions || []).join(", ")));
      card.appendChild(el("div", "small-note", "<strong>" + q.subject + "</strong>"));

      var curChan = chOverrides()[q.id] || q.channel || "gmail";
      var chanRow = el("div", "row-actions"); chanRow.style.margin = "8px 0 2px";
      chanRow.appendChild(el("span", "small-note", "Send via:"));
      [["gmail", "Gmail (draft)"], ["ghl", "GoHighLevel (send)"]].forEach(function (opt) {
        var b = el("button", "button-ghost", opt[1]);
        if (curChan === opt[0]) { b.style.background = "var(--color-primary)"; b.style.color = "#fff"; b.style.borderColor = "var(--color-primary)"; }
        b.style.cssText += ";min-height:30px;padding:0 10px;font-size:12px";
        b.addEventListener("click", function () { setChannel(q.id, opt[0]); render(); });
        chanRow.appendChild(b);
      });
      card.appendChild(chanRow);

      var body = el("pre", "draft-box"); body.textContent = q.body; body.style.maxHeight = "180px"; body.style.overflow = "auto";
      card.appendChild(body);

      var actions = el("div", "row-actions");
      // Copy button — full email, ready to paste.
      var copy = el("button", "inline-action", "Copy email");
      copy.addEventListener("click", function () {
        copyText("To: " + q.to_email + "\nSubject: " + q.subject + "\n\n" + q.body, copy);
        var cta = card.querySelector(".primary-action");
        if (cta) { cta.classList.add("blink-cta"); cta.scrollIntoView({ block: "nearest" }); }
      });
      actions.appendChild(copy);
      var step = STEP[status];
      if (step) {
        var btn = el("button", "primary-action", step.label);
        btn.addEventListener("click", function () { setOverride(q.id, step.next); render(); });
        actions.appendChild(btn);
      } else { actions.appendChild(el("span", "small-note", status === "sent" ? "Sent." : status)); }
      if (status !== "sent" && status !== "declined") {
        var dec = el("button", "danger-action", "Decline");
        dec.addEventListener("click", function () { setOverride(q.id, "declined"); render(); });
        actions.appendChild(dec);
      }
      card.appendChild(actions);
      if (status === "awaiting_verification") card.appendChild(el("div", "small-note", "Awaiting Lucinda's verification. Use Copy to paste into email, or approve to route via the channel above."));
      root.appendChild(card);
    });
  }

  function render() {
    renderMatrix(document.getElementById("pricelist-matrix"));
    renderAddForm(document.getElementById("agreement-add"));
    renderQueue(document.getElementById("pricelist-queue"));
  }

  function fetchData() {
    return fetch("/api/price-lists").then(function (r) {
      if (r.ok && (r.headers.get("content-type") || "").indexOf("json") !== -1) return r.json();
      throw 0;
    }).catch(function () { return fetch("assets/price-lists.json").then(function (r) { return r.json(); }); });
  }
  function load() { return fetchData().then(function (d) { state.data = d; render(); }); }

  function init() {
    if (state.inited) return; state.inited = true;
    load().catch(function () {
      document.getElementById("pricelist-matrix").innerHTML =
        '<p class="empty-state">Could not load agreement data. Restart <code>npm run dev</code>.</p>';
    });
  }

  function hook() {
    var btn = document.querySelector('[data-view="pricelists"]');
    if (btn) btn.addEventListener("click", function () { setTimeout(init, 40); });
  }
  if (document.readyState !== "loading") hook();
  else document.addEventListener("DOMContentLoaded", hook);
})();
