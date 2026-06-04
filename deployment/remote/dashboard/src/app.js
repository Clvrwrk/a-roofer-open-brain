const STORAGE_KEY = "pe-open-brain-admin-state-v1";

const seedState = {
  ui: {
    selectedPacketId: "cmr-abc-104882",
    selectedMatchId: "pmc-abc-srs-ridge-012",
    auditFilter: "all",
  },
  settings: [
    ["Environment", "Pilot", "Real reads later, internal-only outputs now"],
    ["System of Record", "Supabase", "Workflow/control tables only"],
    ["External Send", "Human Only", "Lucinda sends vendor email"],
    ["Follow-Up Cadence", "7 days", "Conductor escalates stale work"],
    ["Archive Rule", "Archive Only", "Agents never delete records"],
    ["Audit Rule", "Independent Gate", "No agent audits its own packet"],
  ],
  audits: [
    {
      id: "audit-abc-104882",
      invoiceNumber: "ABC-104882",
      invoiceDate: "2026-04-14",
      vendor: "ABC Supply",
      region: "Dallas / Richardson",
      branch: "Richardson TX",
      status: "ready",
      gate: "Auditor pass",
      disputedLines: 3,
      expectedCredit: 842.11,
      packetId: "cmr-abc-104882",
      source: "invoice_documents/abc/2026-04/ABC-104882.pdf",
    },
    {
      id: "audit-abc-105019",
      invoiceNumber: "ABC-105019",
      invoiceDate: "2026-04-21",
      vendor: "ABC Supply",
      region: "Fort Worth / Euless",
      branch: "Euless TX",
      status: "blocked",
      gate: "Product match pending",
      disputedLines: 2,
      expectedCredit: 396.44,
      matchId: "pmc-abc-srs-ridge-012",
      source: "invoice_documents/abc/2026-04/ABC-105019.pdf",
    },
    {
      id: "audit-srs-778021",
      invoiceNumber: "SRS-778021",
      invoiceDate: "2026-04-18",
      vendor: "SRS Distribution",
      region: "Denver / Greenwood Village",
      branch: "Greenwood Village CO",
      status: "ready",
      gate: "Auditor pass",
      disputedLines: 1,
      expectedCredit: 118.72,
      packetId: "cmr-srs-778021",
      source: "invoice_documents/srs/2026-04/SRS-778021.pdf",
    },
    {
      id: "audit-qxo-22018",
      invoiceNumber: "QXO-22018",
      invoiceDate: "2026-04-26",
      vendor: "QXO",
      region: "Colorado Springs",
      branch: "Colorado Springs CO",
      status: "clear",
      gate: "No discrepancy",
      disputedLines: 0,
      expectedCredit: 0,
      source: "invoice_documents/qxo/2026-04/QXO-22018.pdf",
    },
  ],
  productMatches: [
    {
      id: "pmc-abc-srs-ridge-012",
      status: "pending_review",
      confidence: 0.87,
      sourceVendor: "ABC Supply",
      sourceSku: "ABC-77219",
      sourceDescription: "GAF Seal-A-Ridge Charcoal Hip and Ridge Bundle",
      targetVendor: "SRS Distribution",
      targetSku: "SRS-GAF-SAR-CHA",
      targetDescription: "GAF Seal-A-Ridge Charcoal ridge cap shingles",
      normalizedProduct: "GAF Seal-A-Ridge Charcoal",
      uom: "bundle",
      evidence: "Manufacturer, color, UOM, and description align. Vendor SKU differs.",
    },
    {
      id: "pmc-abc-beacon-underlayment-004",
      status: "pending_review",
      confidence: 0.79,
      sourceVendor: "ABC Supply",
      sourceSku: "ABC-44901",
      sourceDescription: "Synthetic roof underlayment 10 SQ roll",
      targetVendor: "Beacon Building Products",
      targetSku: "BPP-SYN-10SQ",
      targetDescription: "Premium synthetic underlayment 10 square roll",
      normalizedProduct: "Synthetic underlayment, 10 square roll",
      uom: "roll",
      evidence: "UOM and coverage align. Brand is not conclusive.",
    },
    {
      id: "pmc-abc-gulfeagle-starter-021",
      status: "approved",
      confidence: 0.93,
      sourceVendor: "ABC Supply",
      sourceSku: "ABC-11780",
      sourceDescription: "GAF WeatherBlocker starter strip",
      targetVendor: "Gulfeagle Supply",
      targetSku: "GE-GAF-WB-START",
      targetDescription: "WeatherBlocker starter strip shingles",
      normalizedProduct: "GAF WeatherBlocker starter strip",
      uom: "bundle",
      evidence: "Exact manufacturer product line and UOM match.",
    },
  ],
  packets: [
    {
      id: "cmr-abc-104882",
      invoiceNumber: "ABC-104882",
      invoiceDate: "2026-04-14",
      vendor: "ABC Supply",
      vendorEmail: "accounts.receivable@example-vendor.test",
      region: "Dallas / Richardson",
      status: "pending_review",
      reviewer: "Lucinda",
      agreement: "ABC Dallas NPA 2026-H1",
      sourceInvoice: "invoice_documents/abc/2026-04/ABC-104882.pdf",
      sourceAgreement: "price_agreements/abc/dallas/2026-h1.pdf",
      followupDue: "2026-06-08",
      lines: [
        {
          sku: "ABC-11780",
          description: "GAF WeatherBlocker starter strip",
          quantity: 18,
          invoiceUom: "bundle",
          invoicePrice: 47.89,
          negotiatedPrice: 41.25,
          credit: 119.52,
        },
        {
          sku: "ABC-77219",
          description: "GAF Seal-A-Ridge Charcoal",
          quantity: 26,
          invoiceUom: "bundle",
          invoicePrice: 68.14,
          negotiatedPrice: 52.8,
          credit: 398.84,
        },
        {
          sku: "ABC-44901",
          description: "Synthetic underlayment 10 SQ roll",
          quantity: 14,
          invoiceUom: "roll",
          invoicePrice: 86.75,
          negotiatedPrice: 63.62,
          credit: 323.75,
        },
      ],
    },
    {
      id: "cmr-srs-778021",
      invoiceNumber: "SRS-778021",
      invoiceDate: "2026-04-18",
      vendor: "SRS Distribution",
      vendorEmail: "credits@example-vendor.test",
      region: "Denver / Greenwood Village",
      status: "draft",
      reviewer: "Lucinda",
      agreement: "SRS Denver NPA 2026-H1",
      sourceInvoice: "invoice_documents/srs/2026-04/SRS-778021.pdf",
      sourceAgreement: "price_agreements/srs/denver/2026-h1.pdf",
      followupDue: "2026-06-08",
      lines: [
        {
          sku: "SRS-GAF-WB-START",
          description: "GAF WeatherBlocker starter strip",
          quantity: 16,
          invoiceUom: "bundle",
          invoicePrice: 48.67,
          negotiatedPrice: 41.25,
          credit: 118.72,
        },
      ],
    },
  ],
  events: [
    {
      at: "2026-06-01T08:35:00-07:00",
      actor: "Auditor",
      title: "ABC-104882 packet passed math gate",
      detail: "One invoice, three disputed lines, agreement active for invoice date.",
    },
    {
      at: "2026-06-01T08:22:00-07:00",
      actor: "Product Catalog Manager",
      title: "Product match candidate created",
      detail: "ABC-77219 to SRS-GAF-SAR-CHA requires human approval.",
    },
    {
      at: "2026-06-01T08:10:00-07:00",
      actor: "Conductor",
      title: "Vendor audit pilot opened",
      detail: "Workflow mode is pilot. No external communication is enabled.",
    },
  ],
};

let state = loadState();

function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seedState);
  try {
    return { ...structuredClone(seedState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  window.localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(seedState);
  render();
}

function addEvent(actor, title, detail) {
  state.events.unshift({
    at: new Date().toISOString(),
    actor,
    title,
    detail,
  });
  saveState();
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function packetTotal(packet) {
  return packet.lines.reduce((sum, line) => sum + line.credit, 0);
}

function statusText(status) {
  const labels = {
    pending_review: "Pending Review",
    approved_internal: "Approved",
    sent_by_human: "Sent By Human",
    received: "Received",
    rejected: "Rejected",
    changes_requested: "Changes Requested",
    draft: "Draft",
    ready: "Ready",
    blocked: "Blocked",
    clear: "Clear",
    approved: "Approved",
  };
  return labels[status] ?? status;
}

function statusClass(status) {
  if (["ready", "approved", "approved_internal", "received", "clear"].includes(status)) return "status-ready";
  if (["rejected", "blocked", "changes_requested"].includes(status)) return "status-blocked";
  if (["pending_review", "sent_by_human"].includes(status)) return "status-review";
  return "status-draft";
}

function selectedPacket() {
  return state.packets.find((packet) => packet.id === state.ui.selectedPacketId) ?? state.packets[0];
}

function selectedMatch() {
  return state.productMatches.find((match) => match.id === state.ui.selectedMatchId) ?? state.productMatches[0];
}

function renderMetrics() {
  const expectedCredit = state.packets.reduce((sum, packet) => sum + packetTotal(packet), 0);
  const pendingMatches = state.productMatches.filter((match) => match.status === "pending_review").length;
  const pendingPackets = state.packets.filter((packet) => ["draft", "pending_review", "changes_requested"].includes(packet.status)).length;
  const readyAudits = state.audits.filter((audit) => audit.status === "ready").length;

  const metrics = [
    ["Expected Credit", money(expectedCredit), "Open pilot packet total"],
    ["Ready Audits", readyAudits, "Auditor pass, human review next"],
    ["Pending Matches", pendingMatches, "Need catalog approval"],
    ["Packets Open", pendingPackets, "Draft or pending Lucinda"],
  ];

  document.querySelector("#metric-grid").innerHTML = metrics
    .map(([label, value, note]) => `
      <article class="metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(note)}</em>
      </article>
    `)
    .join("");
}

function queueCard({ kind, title, meta, status, amount, id, view }) {
  return `
    <button class="queue-item" data-select-kind="${kind}" data-id="${id}" data-view-target="${view}">
      <div class="queue-topline">
        <p class="queue-title">${escapeHtml(title)}</p>
        <span class="status-pill ${statusClass(status)}">${escapeHtml(statusText(status))}</span>
      </div>
      <div class="queue-meta">${escapeHtml(meta)}</div>
      ${amount ? `<strong>${escapeHtml(amount)}</strong>` : ""}
    </button>
  `;
}

function renderCommandQueue() {
  const matchCards = state.productMatches
    .filter((match) => match.status === "pending_review")
    .map((match) => queueCard({
      kind: "match",
      id: match.id,
      view: "matches",
      title: match.normalizedProduct,
      meta: `${match.sourceVendor} ${match.sourceSku} to ${match.targetVendor} ${match.targetSku}`,
      status: match.status,
      amount: `${Math.round(match.confidence * 100)}% confidence`,
    }));

  const packetCards = state.packets
    .filter((packet) => packet.status !== "received" && packet.status !== "rejected")
    .map((packet) => queueCard({
      kind: "packet",
      id: packet.id,
      view: "packets",
      title: `${packet.vendor} invoice ${packet.invoiceNumber}`,
      meta: `${packet.region} | ${packet.lines.length} disputed line${packet.lines.length === 1 ? "" : "s"}`,
      status: packet.status,
      amount: money(packetTotal(packet)),
    }));

  document.querySelector("#command-queue").innerHTML = [...packetCards, ...matchCards].join("") ||
    `<div class="empty-state">No open pilot work.</div>`;
}

function renderPacketPreview() {
  const packet = selectedPacket();
  if (!packet) {
    document.querySelector("#packet-preview").innerHTML = `<div class="empty-state">No packet selected.</div>`;
    return;
  }

  document.querySelector("#packet-preview").innerHTML = packetHtml(packet, true);
}

function packetHtml(packet, includeActions) {
  return `
    <div class="packet-body">
      <div class="queue-topline">
        <p class="queue-title">${escapeHtml(packet.vendor)} ${escapeHtml(packet.invoiceNumber)}</p>
        <span class="status-pill ${statusClass(packet.status)}">${escapeHtml(statusText(packet.status))}</span>
      </div>
      <p class="small-note">
        ${escapeHtml(packet.region)} | Invoice ${escapeHtml(packet.invoiceNumber)} dated ${escapeHtml(shortDate(packet.invoiceDate))}
      </p>
      <div class="packet-kpis">
        <div><span>Expected Credit</span><strong>${money(packetTotal(packet))}</strong></div>
        <div><span>Disputed Lines</span><strong>${packet.lines.length}</strong></div>
        <div><span>Follow-Up Due</span><strong>${shortDate(packet.followupDue)}</strong></div>
      </div>
      <div class="line-list">
        ${packet.lines.map((line) => `
          <div class="line-item">
            <strong>${escapeHtml(line.description)}</strong>
            <span>${escapeHtml(line.sku)} | ${line.quantity} ${escapeHtml(line.invoiceUom)} | Invoice ${money(line.invoicePrice)} vs. NPA ${money(line.negotiatedPrice)} | Credit ${money(line.credit)}</span>
          </div>
        `).join("")}
      </div>
      <p class="small-note">Sources: ${escapeHtml(packet.sourceInvoice)} | ${escapeHtml(packet.sourceAgreement)}</p>
      ${includeActions ? packetActions(packet) : ""}
    </div>
  `;
}

function packetActions(packet) {
  const approvalButtons = `
    <button class="primary-action" data-action="credit_memo_request.approve" data-id="${packet.id}">Approve Internal Packet</button>
    <button class="inline-action" data-action="credit_memo_request.request_changes" data-id="${packet.id}">Request Changes</button>
    <button class="danger-action" data-action="credit_memo_request.reject" data-id="${packet.id}">Reject</button>
  `;
  const sentButtons = `
    <button class="primary-action" data-action="credit_memo_followup.mark_sent_by_human" data-id="${packet.id}">Mark Sent By Human</button>
    <button class="inline-action" data-action="credit_memo_followup.mark_received" data-id="${packet.id}">Mark Credit Received</button>
  `;
  const receivedButtons = `<span class="small-note">Closed with received credit memo.</span>`;

  let buttons = approvalButtons;
  if (packet.status === "approved_internal") buttons = sentButtons;
  if (packet.status === "sent_by_human") buttons = sentButtons;
  if (packet.status === "received" || packet.status === "rejected") buttons = receivedButtons;

  return `<div class="packet-actions">${buttons}</div>`;
}

function renderAudits() {
  const filter = state.ui.auditFilter;
  const audits = state.audits.filter((audit) => {
    if (filter === "ready") return audit.status === "ready";
    if (filter === "blocked") return audit.status === "blocked";
    return true;
  });

  document.querySelector("#audit-table").innerHTML = audits
    .map((audit) => `
      <tr>
        <td><strong>${escapeHtml(audit.invoiceNumber)}</strong><br><span class="small-note">${escapeHtml(shortDate(audit.invoiceDate))}</span></td>
        <td>${escapeHtml(audit.vendor)}</td>
        <td>${escapeHtml(audit.region)}</td>
        <td><span class="status-pill ${statusClass(audit.status)}">${escapeHtml(statusText(audit.status))}</span></td>
        <td>${audit.disputedLines}</td>
        <td>${money(audit.expectedCredit)}</td>
        <td>${escapeHtml(audit.gate)}</td>
      </tr>
    `)
    .join("");

  document.querySelectorAll("[data-audit-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.auditFilter === filter);
  });
}

function renderMatches() {
  document.querySelector("#match-list").innerHTML = state.productMatches
    .map((match) => queueCard({
      kind: "match",
      id: match.id,
      view: "matches",
      title: match.normalizedProduct,
      meta: `${match.sourceVendor} ${match.sourceSku} to ${match.targetVendor} ${match.targetSku}`,
      status: match.status,
      amount: `${Math.round(match.confidence * 100)}% confidence`,
    }))
    .join("");

  document.querySelectorAll('[data-select-kind="match"]').forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.id === state.ui.selectedMatchId);
  });

  const match = selectedMatch();
  document.querySelector("#match-detail").innerHTML = match ? matchDetailHtml(match) : `<div class="empty-state">No match selected.</div>`;
}

function matchDetailHtml(match) {
  return `
    <div class="match-body">
      <div class="queue-topline">
        <p class="queue-title">${escapeHtml(match.normalizedProduct)}</p>
        <span class="status-pill ${statusClass(match.status)}">${escapeHtml(statusText(match.status))}</span>
      </div>
      <div class="match-score">
        <div class="meter"><span style="width: ${Math.round(match.confidence * 100)}%"></span></div>
        <strong>${Math.round(match.confidence * 100)}%</strong>
      </div>
      <div class="evidence-grid">
        <div class="evidence-tile">
          <span>Source</span>
          <strong>${escapeHtml(match.sourceVendor)} ${escapeHtml(match.sourceSku)}</strong>
          <p class="small-note">${escapeHtml(match.sourceDescription)}</p>
        </div>
        <div class="evidence-tile">
          <span>Target</span>
          <strong>${escapeHtml(match.targetVendor)} ${escapeHtml(match.targetSku)}</strong>
          <p class="small-note">${escapeHtml(match.targetDescription)}</p>
        </div>
        <div class="evidence-tile">
          <span>UOM</span>
          <strong>${escapeHtml(match.uom)}</strong>
        </div>
        <div class="evidence-tile">
          <span>Evidence</span>
          <strong>${escapeHtml(match.evidence)}</strong>
        </div>
      </div>
      <div class="packet-actions">
        <button class="primary-action" data-action="product_match.approve" data-id="${match.id}">Approve Match</button>
        <button class="danger-action" data-action="product_match.reject" data-id="${match.id}">Reject Match</button>
        <button class="inline-action" data-action="product_match.needs_review" data-id="${match.id}">Needs Review</button>
      </div>
    </div>
  `;
}

function renderPackets() {
  document.querySelector("#packet-list").innerHTML = state.packets
    .map((packet) => queueCard({
      kind: "packet",
      id: packet.id,
      view: "packets",
      title: `${packet.vendor} invoice ${packet.invoiceNumber}`,
      meta: `${packet.region} | ${packet.lines.length} disputed line${packet.lines.length === 1 ? "" : "s"}`,
      status: packet.status,
      amount: money(packetTotal(packet)),
    }))
    .join("");

  document.querySelectorAll('[data-select-kind="packet"]').forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.id === state.ui.selectedPacketId);
  });

  renderEmailDraft();
}

function renderEmailDraft() {
  const packet = selectedPacket();
  if (!packet) {
    document.querySelector("#email-draft").innerHTML = `<div class="empty-state">No packet selected.</div>`;
    return;
  }

  const lines = packet.lines
    .map((line) => `- ${line.description}: invoice ${money(line.invoicePrice)} vs negotiated ${money(line.negotiatedPrice)} x ${line.quantity} ${line.invoiceUom} = ${money(line.credit)}`)
    .join("\n");

  const draft = `Subject: Credit Memo Request - Invoice ${packet.invoiceNumber}

Please review invoice ${packet.invoiceNumber} dated ${shortDate(packet.invoiceDate)}.

We found the following line items billed above the negotiated agreement ${packet.agreement}:

${lines}

Expected credit memo total: ${money(packetTotal(packet))}.

Source invoice: ${packet.sourceInvoice}
Source agreement: ${packet.sourceAgreement}`;

  document.querySelector("#email-draft").innerHTML = `
    <div class="packet-body">
      <div class="queue-topline">
        <p class="queue-title">${escapeHtml(packet.vendor)} ${escapeHtml(packet.invoiceNumber)}</p>
        <span class="status-pill ${statusClass(packet.status)}">${escapeHtml(statusText(packet.status))}</span>
      </div>
      <p class="draft-meta">Reviewer: ${escapeHtml(packet.reviewer)} | Vendor email is not sent by the agent.</p>
    </div>
    <pre class="draft-box" id="email-draft-text">${escapeHtml(draft)}</pre>
    <div class="packet-body">
      <div class="row-actions" style="margin-bottom:10px">
        <button class="inline-action" data-copy-email>Copy email</button>
      </div>
      ${packetActions(packet)}
    </div>
  `;
}

function renderEvents() {
  document.querySelector("#event-stream").innerHTML = state.events
    .map((event) => `
      <li>
        <div class="event-time">${escapeHtml(shortDate(event.at))}</div>
        <div class="event-copy">
          <strong>${escapeHtml(event.actor)}: ${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(event.detail)}</span>
        </div>
      </li>
    `)
    .join("");
}

function slugKey(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Closed option lists — settings are single-select only, so an unrecognized
// value can never reach the system.
const SETTING_OPTIONS = {
  environment: ["Pilot", "Production"],
  system_of_record: ["Supabase", "AccuLynx", "QuickBooks"],
  external_send: ["Human Only", "Agent + Human Review", "Agent Auto"],
  follow_up_cadence: ["3 days", "5 days", "7 days", "14 days"],
  archive_rule: ["Archive Only", "Allow Delete (Admin)"],
  audit_rule: ["Independent Gate", "Self-Audit Allowed"],
};

function renderSettings() {
  document.querySelector("#settings-grid").innerHTML = state.settings
    .map(([label, value, note]) => {
      const key = slugKey(label);
      const opts = (SETTING_OPTIONS[key] || []).slice();
      if (value && opts.indexOf(value) < 0) opts.unshift(value);
      const optionHtml = opts.map((o) => `<option value="${escapeHtml(o)}"${o === value ? " selected" : ""}>${escapeHtml(o)}</option>`).join("");
      return `
      <div class="setting-tile">
        <span>${escapeHtml(label)}</span>
        <select class="setting-select" data-setting-key="${escapeHtml(key)}"
                data-setting-label="${escapeHtml(label)}" data-setting-note="${escapeHtml(note)}"
                data-prev="${escapeHtml(value)}">${optionHtml}</select>
        <p class="small-note">${escapeHtml(note)}</p>
      </div>`;
    })
    .join("") +
    `<div class="setting-tile" style="justify-content:flex-end;gap:8px">
       <button class="primary-action" data-settings-save>Save settings</button>
       <span class="small-note" id="settings-save-note"></span>
     </div>`;
}

function loadSettings() {
  fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      if (Array.isArray(rows) && rows.length) {
        state.settings = rows.map((r) => [r.label || r.key, r.value, r.description || ""]);
        renderSettings();
      }
    })
    .catch(() => {});
}

function setView(view) {
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-visible", section.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  const titles = {
    command: "Command Center",
    audits: "Invoice Audits",
    matches: "Product Matches",
    packets: "Credit Memos",
    auditlog: "Audit Log",
    fleet: "Fleet",
    territories: "Vendor Territories",
    pricelists: "Price Agreements",
    settings: "Settings",
  };
  document.querySelector("#view-title").textContent = titles[view] ?? "Command Center";
}

function handleAction(action, id) {
  if (action.startsWith("product_match.")) {
    const match = state.productMatches.find((item) => item.id === id);
    if (!match) return;

    if (action === "product_match.approve") {
      match.status = "approved";
      addEvent("Lucinda", "Product match approved", `${match.sourceSku} to ${match.targetSku} is instruction-grade pending Auditor record check.`);
    }
    if (action === "product_match.reject") {
      match.status = "rejected";
      addEvent("Lucinda", "Product match rejected", `${match.sourceSku} to ${match.targetSku} remains archived as a rejected candidate.`);
    }
    if (action === "product_match.needs_review") {
      match.status = "pending_review";
      addEvent("Lucinda", "Product match kept in review", `${match.sourceSku} needs more evidence before catalog promotion.`);
    }
  }

  if (action.startsWith("credit_memo_")) {
    const packet = state.packets.find((item) => item.id === id);
    if (!packet) return;

    if (action === "credit_memo_request.approve") {
      packet.status = "approved_internal";
      addEvent("Lucinda", "Credit memo packet approved internally", `${packet.invoiceNumber} is ready for Lucinda to send outside the system.`);
    }
    if (action === "credit_memo_request.request_changes") {
      packet.status = "changes_requested";
      addEvent("Lucinda", "Credit memo packet needs changes", `${packet.invoiceNumber} was sent back to Accounting agent for correction.`);
    }
    if (action === "credit_memo_request.reject") {
      packet.status = "rejected";
      addEvent("Lucinda", "Credit memo packet rejected", `${packet.invoiceNumber} is retained in the audit trail and not sent externally.`);
    }
    if (action === "credit_memo_followup.mark_sent_by_human") {
      packet.status = "sent_by_human";
      packet.sentByHumanAt = new Date().toISOString();
      addEvent("Lucinda", "Credit memo request marked sent", `${packet.invoiceNumber} follow-up is due by ${shortDate(packet.followupDue)}.`);
    }
    if (action === "credit_memo_followup.mark_received") {
      packet.status = "received";
      packet.receivedAt = new Date().toISOString();
      addEvent("Lucinda", "Credit memo received", `${packet.invoiceNumber} closed at ${money(packetTotal(packet))}.`);
    }
  }

  saveState();
  render();
}

function wireEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-view]");
    if (nav) {
      setView(nav.dataset.view);
      return;
    }

    const filter = event.target.closest("[data-audit-filter]");
    if (filter) {
      state.ui.auditFilter = filter.dataset.auditFilter;
      saveState();
      renderAudits();
      return;
    }

    const select = event.target.closest("[data-select-kind]");
    if (select) {
      if (select.dataset.selectKind === "packet") state.ui.selectedPacketId = select.dataset.id;
      if (select.dataset.selectKind === "match") state.ui.selectedMatchId = select.dataset.id;
      saveState();
      render();
      if (select.dataset.viewTarget) setView(select.dataset.viewTarget);
      return;
    }

    const copyEmail = event.target.closest("[data-copy-email]");
    if (copyEmail) {
      const txt = (document.querySelector("#email-draft-text") || {}).textContent || "";
      const blink = () => {
        const cta = document.querySelector("#email-draft .primary-action");
        if (cta) { cta.classList.add("blink-cta"); cta.scrollIntoView({ block: "nearest" }); try { cta.focus(); } catch (e) {} }
        copyEmail.textContent = "Copied — now click the blinking button";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(blink, blink);
      else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); blink(); }
      return;
    }

    const saveBtn = event.target.closest("[data-settings-save]");
    if (saveBtn) {
      if (!confirm("Save settings changes?\n\nFinal confirmation — review the values above before saving.")) return;
      const inputs = Array.from(document.querySelectorAll(".setting-select"));
      state.settings = inputs.map((inp) => [inp.dataset.settingLabel, inp.value, inp.dataset.settingNote]);
      saveState();
      const note = document.querySelector("#settings-save-note");
      if (note) note.textContent = "Saving…";
      fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "dashboard", settings: inputs.map((inp) => ({
          key: inp.dataset.settingKey, value: inp.value, label: inp.dataset.settingLabel, description: inp.dataset.settingNote })) }),
      }).then((r) => r.json()).then((res) => { if (note) note.textContent = res && res.persisted ? "Saved to Supabase." : "Saved locally."; })
        .catch(() => { if (note) note.textContent = "Saved locally (offline)."; });
      return;
    }

    const action = event.target.closest("[data-action]");
    if (action) {
      handleAction(action.dataset.action, action.dataset.id);
      return;
    }
  });

  // Settings are single-select; confirm on change (1st chance) and again on Save (2nd).
  document.addEventListener("change", (event) => {
    const sel = event.target.closest(".setting-select");
    if (!sel) return;
    const prev = sel.dataset.prev;
    if (sel.value === prev) return;
    const ok = window.confirm(
      `Change "${sel.dataset.settingLabel}" from "${prev}" to "${sel.value}"?\n\n` +
      `This changes how the workflow behaves. Click OK to stage it — you'll confirm once more on Save.`);
    if (!ok) { sel.value = prev; return; }
    sel.dataset.prev = sel.value;
  });

  document.querySelector("#reset-demo").addEventListener("click", resetState);
  document.querySelector("#run-audit").addEventListener("click", () => {
    addEvent("Accounting Agent", "Pilot audit run completed", "Sample invoice queue refreshed. Supabase wiring will replace this local event.");
    render();
  });
}

function render() {
  renderMetrics();
  renderCommandQueue();
  renderPacketPreview();
  renderAudits();
  renderMatches();
  renderPackets();
  renderEvents();
  renderSettings();
}

wireEvents();
render();
loadSettings();
