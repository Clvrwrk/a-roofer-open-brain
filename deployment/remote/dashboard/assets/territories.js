/* Territories map — PE offices, 2-hour drive-time boundaries, vendor branches
   colored by pricing status. Overlap branches get a suggest-nearest / confirm
   decision; out-of-boundary branches route to negotiation. Reads a Supabase
   snapshot (assets/territories.json) or the live /api/territories proxy. */
(function () {
  "use strict";

  var BRAND = {
    primary: "#11133F", covered: "#059669", overlap: "#eaa221",
    out: "#DC2626", surface: "#FFFFFF",
  };
  var STATUS_LABEL = {
    covered: "Covered — regional price",
    overlap_pending: "Overlap — needs decision",
    out_of_boundary: "Out of boundary — negotiate",
  };

  var state = { data: null, map: null, inited: false, markers: {}, offices: {}, selected: null };

  // Local decision overrides (pilot persistence; server seam = POST /api/territory/assign)
  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem("pe_territory_overrides") || "{}"); }
    catch (e) { return {}; }
  }
  function saveOverride(branchId, officeId) {
    var o = loadOverrides(); o[branchId] = officeId;
    localStorage.setItem("pe_territory_overrides", JSON.stringify(o));
    fetch("/api/territory/assign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_branch_id: branchId, office_id: officeId, decided_by: "dashboard" }),
    }).catch(function () {});
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function loadMapsApi(key) {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.maps) return resolve();
      if (!key) return reject(new Error("no-key"));
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&v=quarterly";
      s.async = true; s.onload = resolve; s.onerror = function () { reject(new Error("maps-load-failed")); };
      document.head.appendChild(s);
    });
  }

  function pin(color, big) {
    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      fillColor: color, fillOpacity: 1, strokeColor: "#FFFFFF",
      strokeWeight: 2, scale: big ? 8 : 6,
    };
  }

  function effectiveStatus(b, overrides) {
    if (overrides[b.id]) return "covered";
    return b.status;
  }

  function render() {
    var d = state.data, overrides = loadOverrides();
    var g = window.google.maps;
    state.map = new g.Map(document.getElementById("territory-map"), {
      center: { lat: 37.8, lng: -97.5 }, zoom: 5, mapTypeControl: false, streetViewControl: false,
      styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
    });

    d.offices.forEach(function (o) {
      state.offices[o.id] = o;
      new g.Polygon({
        paths: o.boundary.coordinates[0].map(function (c) { return { lat: c[1], lng: c[0] }; }),
        strokeColor: BRAND.primary, strokeOpacity: 0.7, strokeWeight: 1.5,
        fillColor: BRAND.primary, fillOpacity: 0.07, map: state.map,
      });
      new g.Marker({
        position: { lat: o.lat, lng: o.lng }, map: state.map, title: o.name,
        icon: { path: "M -7 6 L 0 -7 L 7 6 Z", fillColor: BRAND.primary, fillOpacity: 1,
                strokeColor: "#FFFFFF", strokeWeight: 2, scale: 1.4 },
        zIndex: 999,
      });
    });

    d.branches.forEach(function (b) {
      if (b.lat == null) return;
      var st = effectiveStatus(b, overrides);
      var color = st === "covered" ? BRAND.covered : st === "overlap_pending" ? BRAND.overlap : BRAND.out;
      var m = new g.Marker({ position: { lat: b.lat, lng: b.lng }, map: state.map, icon: pin(color),
        title: b.vendor + " — " + b.name });
      m.addListener("click", function () { selectBranch(b); });
      state.markers[b.id] = m;
    });

    renderCounts();
  }

  function renderCounts() {
    var overrides = loadOverrides(), d = state.data;
    var c = { covered: 0, overlap_pending: 0, out_of_boundary: d.counts.out_of_boundary || 0 };
    d.branches.forEach(function (b) {
      var st = effectiveStatus(b, overrides);
      if (st === "covered") c.covered++; else if (st === "overlap_pending") c.overlap_pending++;
    });
    var box = document.getElementById("territory-counts");
    box.innerHTML = "";
    [["covered", "Covered", BRAND.covered], ["overlap_pending", "Overlap — decide", BRAND.overlap],
     ["out_of_boundary", "Outside — negotiate", BRAND.out]].forEach(function (row) {
      var t = el("div", "terr-stat");
      t.innerHTML = '<span class="terr-dot" style="background:' + row[2] + '"></span>' +
        '<strong>' + c[row[0]] + '</strong><span>' + row[1] + '</span>';
      box.appendChild(t);
    });
  }

  function selectBranch(b) {
    state.selected = b;
    var overrides = loadOverrides();
    var panel = document.getElementById("territory-detail");
    panel.innerHTML = "";
    var st = effectiveStatus(b, overrides);
    panel.appendChild(el("p", "eyebrow", b.vendor));
    panel.appendChild(el("h3", "queue-title", b.name + ", " + b.state));
    var pill = el("span", "status-pill " + (st === "covered" ? "status-approved" : st === "overlap_pending" ? "status-review" : "status-blocked"),
      STATUS_LABEL[st] || st);
    panel.appendChild(pill);

    var gate = el("div", "small-note");
    gate.style.marginTop = "10px";
    gate.innerHTML = "Pricing gate: <strong style='color:" + (b.approved ? BRAND.covered : BRAND.out) + "'>" +
      (b.approved ? "APPROVED" : "BLOCKED") + "</strong> — " +
      (b.approved ? "purchases and invoice payment allowed." :
        "no active CEO-verified price agreement covers this branch; invoice-paid is blocked.");
    panel.appendChild(gate);

    if (st === "overlap_pending" || (b.cands && b.cands.length > 1)) {
      panel.appendChild(el("p", "small-note", "<br>This branch falls inside more than one office territory. Pick which office's negotiated price it defaults to:"));
      (b.cands || []).forEach(function (cand) {
        var off = state.offices[cand.o] || { name: cand.o };
        var suggested = b.suggested === cand.o;
        var miles = Math.round((cand.km || 0) * 0.621371);
        var btn = el("button", suggested ? "primary-action" : "inline-action",
          (suggested ? "Confirm " : "Use ") + off.name + " · " + miles + " mi" + (suggested ? "  (suggested)" : ""));
        btn.style.margin = "6px 6px 0 0";
        btn.addEventListener("click", function () {
          saveOverride(b.id, cand.o);
          state.markers[b.id].setIcon(pin(BRAND.covered));
          renderCounts(); selectBranch(b);
        });
        panel.appendChild(btn);
      });
    } else if (st === "covered") {
      var off = state.offices[b.assigned || (overrides[b.id])] || {};
      panel.appendChild(el("p", "small-note", "<br>Assigned to <strong>" + (off.name || "office") +
        "</strong>. Inherits that office's regional negotiated price."));
    } else {
      panel.appendChild(el("p", "small-note", "<br>Outside every 2-hour territory. A branch-level price must be negotiated and CEO-verified before purchase."));
      var neg = el("button", "primary-action", "Start price negotiation");
      neg.style.marginTop = "10px";
      neg.addEventListener("click", function () { alert("Negotiation workflow: opens a price-agreement draft for this branch (server seam)."); });
      panel.appendChild(neg);
    }
  }

  function showError(msg) {
    document.getElementById("territory-map").innerHTML =
      '<div class="empty-state" style="padding:40px">' + msg + "</div>";
  }

  // Try the live/proxy endpoint; fall back to the static snapshot file so the
  // map still renders even if the dev server wasn't restarted.
  function fetchData() {
    return fetch("/api/territories")
      .then(function (r) {
        if (r.ok && (r.headers.get("content-type") || "").indexOf("json") !== -1) return r.json();
        throw new Error("api-miss");
      })
      .catch(function () {
        return fetch("assets/territories.json").then(function (r) {
          if (!r.ok) throw new Error("no-data");
          return r.json();
        });
      });
  }

  function init() {
    if (state.inited) { if (state.map) google.maps.event.trigger(state.map, "resize"); return; }
    state.inited = true;
    var key = (window.__PE_CONFIG__ || {}).mapsBrowserKey || "";
    fetchData()
      .then(function (d) { state.data = d; return loadMapsApi(key); })
      .then(function () { render(); })
      .catch(function (e) {
        var m = e && e.message;
        if (m === "no-key")
          showError("Map data loaded, but the Google Maps browser key isn't available. Restart <code>npm run dev</code> so the server injects config.js (it reads GOOGLE_MAPS_BROWSER_KEY from .env), then add <code>http://127.0.0.1:4177/*</code> to the key's HTTP-referrer allowlist.");
        else if (m === "maps-load-failed")
          showError("Google Maps failed to load — check that this origin is allowed in the key's HTTP-referrer restrictions and that the Maps JavaScript API is enabled.");
        else if (m === "no-data")
          showError("Could not load territory data. Restart <code>npm run dev</code> so /api/territories is served.");
        else showError("Could not load the map: " + (m || e));
      });
  }

  function hook() {
    var btn = document.querySelector('[data-view="territories"]');
    if (btn) btn.addEventListener("click", function () { setTimeout(init, 60); });
    if (btn && btn.classList.contains("is-active")) setTimeout(init, 60);
  }
  if (document.readyState !== "loading") hook();
  else document.addEventListener("DOMContentLoaded", hook);
})();
