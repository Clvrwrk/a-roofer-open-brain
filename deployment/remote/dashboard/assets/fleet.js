/* Fleet / Vehicle dashboard — KPI cards + vehicles, variance alerts, maintenance
   due, compliance, driver scorecards, and monthly fuel. Read-only over the
   fleet_* tables via /api/fleet (fleet_snapshot RPC). Distances in miles. */
(function () {
  "use strict";
  var SEV = { critical: "#DC2626", high: "#DC2626", medium: "#eaa221", low: "#0066cc" };
  var FLAG = { expired: "#DC2626", due: "#eaa221", ok: "#059669" };
  var inited = false;
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function tag(text, color) { return '<span class="status-pill" style="background:' + color + '22;color:' + color + '">' + text + "</span>"; }
  function table(root, head, rows) {
    root.innerHTML = "";
    if (!rows || !rows.length) { root.appendChild(el("p", "empty-state", "No data.")); return; }
    var t = el("table"); t.innerHTML = "<thead><tr>" + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead>";
    var tb = el("tbody"); rows.forEach(function (r) { tb.appendChild(el("tr", null, r.map(function (c) { return "<td>" + (c == null ? "" : c) + "</td>"; }).join(""))); });
    t.appendChild(tb); root.appendChild(t);
  }
  function num(n) { return n == null ? "—" : Number(n).toLocaleString(); }

  function renderKpis(k) {
    var g = document.getElementById("fleet-kpis"); g.innerHTML = "";
    function card(label, value, sub, color) {
      var d = el("div", "metric");
      d.innerHTML = "<span>" + label + "</span><strong" + (color ? ' style="color:' + color + '"' : "") + ">" + value + "</strong><em>" + (sub || "") + "</em>";
      g.appendChild(d);
    }
    card("Vehicles", num(k.vehicles), "in fleet");
    card("Drivers approved", num(k.drivers_approved), "cleared to drive", k.drivers_approved ? null : "#DC2626");
    card("Open variance alerts", num(k.alerts_open), "fuel / usage", k.alerts_open ? "#eaa221" : "#059669");
    card("Compliance due", num(k.compliance_due), "renewals ≤ lead time", k.compliance_due ? "#DC2626" : "#059669");
    card("Fuel spend", k.fuel_spend_latest != null ? "$" + num(k.fuel_spend_latest) : "—", "latest month");
  }

  function renderAlerts(root, alerts) {
    root.innerHTML = "";
    if (!alerts || !alerts.length) { root.appendChild(el("p", "empty-state", "No open variance alerts.")); return; }
    alerts.forEach(function (a) {
      var c = SEV[a.severity] || "#6B7280";
      var card = el("div", "queue-item"); card.style.borderLeftColor = c;
      card.innerHTML = '<div class="queue-topline"><p class="queue-title">' + (a.type || "alert") + " · " + (a.unit_code || "—") +
        '</p>' + tag(a.severity || "", c) + "</div>" +
        '<div class="small-note">' + (a.driver ? a.driver + " · " : "") + (a.month || "") + (a.status ? " · " + a.status : "") + "</div>" +
        '<div class="small-note">' + (a.detail || "") + (a.baseline != null ? " (baseline " + a.baseline + " vs actual " + a.actual + ")" : "") + "</div>";
      root.appendChild(card);
    });
  }

  function render(d) {
    renderKpis(d.kpis || {});
    table(document.getElementById("fleet-vehicles"),
      ["Unit", "Year/Make/Model", "Class", "Status", "Odometer (mi)", "Office", "Driver"],
      (d.vehicles || []).map(function (v) {
        return [v.unit_code, (v.year || "") + " " + (v.make || "") + " " + (v.model || ""), v.class,
          tag(v.status || "", v.status === "active" ? "#059669" : "#6B7280"), num(v.odometer), v.office || "—", v.driver || "—"];
      }));
    renderAlerts(document.getElementById("fleet-alerts"), d.alerts);
    table(document.getElementById("fleet-maintenance"),
      ["Unit", "Service", "Interval (mi)", "Next due (mi)", "Remaining (mi)"],
      (d.maintenance || []).map(function (m) {
        var rem = m.remaining;
        var remCell = rem != null && rem <= 1000 ? '<strong style="color:#eaa221">' + num(rem) + "</strong>" : num(rem);
        return [m.unit_code, m.service, num(m.interval_miles), num(m.next_due), remCell];
      }));
    table(document.getElementById("fleet-compliance"),
      ["Unit", "Item", "Provider", "Renewal", "Days", "Flag"],
      (d.compliance || []).map(function (c) {
        return [c.unit_code, c.item, c.provider || "—", c.renewal || "—", c.days, tag(c.flag, FLAG[c.flag] || "#6B7280")];
      }));
    table(document.getElementById("fleet-drivers"),
      ["Driver", "Approved", "Score", "Odo %", "Training %", "Incidents", "Fuel alerts"],
      (d.drivers || []).map(function (v) {
        return [v.name, v.approved ? "✓" : '<span style="color:#DC2626">no</span>', v.score == null ? "—" : v.score,
          v.odo_pct, v.training_pct, v.incidents, v.fuel_alerts];
      }));
    table(document.getElementById("fleet-fuel"),
      ["Unit", "Month", "Miles", "Gallons", "MPG", "Spend"],
      (d.fuel || []).map(function (f) {
        return [f.unit_code, f.month, num(f.miles), f.gallons, f.mpg, f.spend != null ? "$" + num(f.spend) : "—"];
      }));
  }

  function init() {
    if (inited) return; inited = true;
    fetch("/api/fleet").then(function (r) { return r.ok ? r.json() : { kpis: {}, vehicles: [] }; })
      .then(render)
      .catch(function () { var g = document.getElementById("fleet-kpis"); if (g) g.innerHTML = '<p class="empty-state">Could not load fleet data. Restart <code>npm run dev</code>.</p>'; });
  }
  function hook() { var b = document.querySelector('[data-view="fleet"]'); if (b) b.addEventListener("click", function () { setTimeout(init, 40); }); }
  if (document.readyState !== "loading") hook(); else document.addEventListener("DOMContentLoaded", hook);
})();
