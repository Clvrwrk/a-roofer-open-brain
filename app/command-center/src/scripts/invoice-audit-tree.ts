// Invoice Audit — PE Office → Vendor/Branch → Invoice → Line drill-down.
// Lazy-renders invoice lines + disposition on expand. Reads ?office=/?branch=
// to land pre-filtered (scoped deep-link from the map popup / side card).

interface InvLine { lineId: string; itemNumber: string; itemDescription: string; qty: number; uom: string; unitPrice: number; extendedPrice: number; negotiatedPrice: number | null; apiPrice: number | null; variancePct: number | null; varianceExt: number | null; recentPrice: number | null; orgInvPrice: number | null; thirdPrice: number | null; thirdPriceDate: string; benchmarkSource: "negotiated" | "api" | "recent" | "org_inv" | "none" | ""; benchmarkPrice: number | null; cascadeVariancePct: number | null; cascadeVarianceExt: number | null; uomMismatch: boolean; negotiatedUom: string; categoryKey: string; audited: boolean; auditStatus: string; auditedBy: string; auditNote: string; auditSource: string; auditedAt: string; actorLabel: string; actorKind: "agent" | "human" | "system"; actorPersona: "Alex" | "Maya" | null; agreementId: number | null; agreementCurrent: boolean | null; agreementExpiry: string; }
interface Category { key: string; label: string; sortOrder: number; }
interface Invoice { invoiceNumber: string; invoiceDate: string; orderDate: string; totalAmount: number; isCreditMemo: boolean; salesType: string; po: string; branchCode: string; branchName: string; office: string; lineCount: number; noPriceLines: number; flaggedLines: number; atRisk: number; worstPct: number; auditedLines: number; pendingLines: number; hasWork?: boolean; paid: boolean; paidAt: string; processedAt?: string; toBePaid?: boolean; awaitingPayment?: boolean; actionable?: boolean; paymentStatus?: string; hasPdf: boolean; jobNumber: string; clientName: string; jobCategory: string; lines: InvLine[]; hasPriceList?: boolean; searchText?: string; linesLoaded?: boolean; }
interface Branch { branchCode: string; branchName: string; office: string; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; toBePaid?: number; invoices: Invoice[]; }
interface Office { office: string; branchCount: number; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; toBePaid?: number; branches: Branch[]; }
interface Action { id: string; group: string; label: string; hint: string; }
interface CommunicationMessagePreview {
  id: string;
  channel_type: "slack" | "email";
  subject: string;
  body_html: string;
  body_text: string;
  recipients: string[];
  attachments: Array<{ label: string; href: string }>;
  validation_state: "pending" | "ready" | "failed";
  validation_errors: string[];
}
interface CommunicationPreviewPayload {
  threadId: string;
  status: string;
  subject: string;
  validationState: "pending" | "ready" | "failed";
  validationErrors: string[];
  messages: CommunicationMessagePreview[];
}

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const payload = JSON.parse(dataEl.textContent || "{}") as { offices: Office[]; actions: Action[]; categories: Category[] };
  const offices = payload.offices ?? [];
  const actions = payload.actions ?? [];
  const categories = payload.categories ?? [];
  const catList: Category[] = (categories ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const catLabel = new Map(catList.map((c) => [c.key, c.label]));

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const worstCls = (w: number) => (w > 6 ? "pill-red" : w > 3 ? "pill-orange" : w > 0.01 ? "pill-yellow" : "pill-green");
  const tolCls = (p: number | null) => { if (p == null) return "pill-grey"; const a = Math.abs(p); return a < 0.01 ? "pill-green" : a <= 3 ? "pill-yellow" : a <= 6 ? "pill-orange" : "pill-red"; };
  const tolLab = (p: number | null) => { if (p == null) return "No Price"; const a = Math.abs(p); return a < 0.01 ? "In Tolerance" : a <= 3 ? "Minor" : a <= 6 ? "Moderate" : "Major"; };
  const isToBePaid = (inv: Invoice) => !inv.paid && !inv.isCreditMemo && !inv.processedAt && inv.pendingLines === 0 && inv.auditedLines > 0;
  const refreshToBePaid = (inv: Invoice) => { inv.toBePaid = isToBePaid(inv); return inv.toBePaid; };

  function syncPayloadSnapshot() {
    dataEl.textContent = JSON.stringify({ offices, actions, categories }).replace(/</g, "\\u003c");
  }

  /* ---- actor attribution badge (docs/59 Task 5) ---- */
  // Agent (Alex/Maya) vs human vs the historical System seed. Persona name is carried in
  // actorLabel; the badge says which kind of actor it was.
  const ACTOR_BADGE: Record<string, { lab: string; cls: string; tip: string }> = {
    agent: { lab: "Agent", cls: "pill-brand", tip: "Automated agent action" },
    human: { lab: "Human", cls: "pill-grey", tip: "Human action" },
    system: { lab: "System", cls: "pill-grey", tip: "Historical system import" },
  };
  function actorBadge(kind: string): string {
    const b = ACTOR_BADGE[kind];
    return b ? ` <span class="pill ${b.cls}" title="${esc(b.tip)}">${b.lab}</span>` : "";
  }

  /* ---- line + disposition (lazy) ---- */
  function auditCell(l: InvLine): string {
    if (l.audited) {
      const meta = [l.auditNote, l.agreementId ? `Agreement #${l.agreementId}${l.agreementCurrent === false ? " (expired " + l.agreementExpiry + ")" : ""}` : "", l.auditedAt].filter(Boolean).join(" · ");
      return `<span class="iv-audited" title="${esc(meta)}">✓ ${esc(l.actorLabel || l.auditedBy || "Passed")}</span>${actorBadge(l.actorKind)}`;
    }
    return `<button class="iv-mark" data-mark data-line="LIDX">Mark passed</button>`;
  }
  // The 3rd price column is contextual (docs/59 D5/D7): newest prior invoice for normal
  // invoices, the referenced original-invoice price for credit memos.
  const thirdHead = (inv: Invoice) => (inv.isCreditMemo ? "Org Inv Price" : "Most Recent");
  const thirdDateHead = (inv: Invoice) => (inv.isCreditMemo ? "Org Inv Date" : "Most Recent Date");
  const thead = (inv: Invoice) =>
    `<thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Inv Price</th><th class="num">API Price</th><th class="num">${thirdHead(inv)}</th><th>${thirdDateHead(inv)}</th><th>Negotiated</th><th class="num">Var %</th><th class="num">Var $</th><th>Tolerance</th><th>Audited</th></tr></thead>`;
  // Which benchmark drove the cascaded Var%/$ (docs/59 D6).
  const BENCH_LAB: Record<string, string> = { negotiated: "Negotiated", api: "API", recent: "Recent", org_inv: "Org Inv" };
  const BENCH_CLS: Record<string, string> = { negotiated: "pill-green", api: "pill-brand", recent: "pill-yellow", org_inv: "pill-grey" };
  function benchBadge(src: string, price: number | null): string {
    const lab = BENCH_LAB[src];
    if (!lab) return ""; // 'none' / unknown → no benchmark
    const tip = price == null ? `Variance vs ${lab}` : `Variance vs ${lab} (${money2(price)})`;
    return ` <span class="pill ${BENCH_CLS[src]}" title="${esc(tip)}">${lab}</span>`;
  }
  function lineRow(l: InvLine, li: number): string {
    // UOM mismatch: the agreement is priced in a different unit than the invoice line,
    // so a variance would be meaningless — surface it for manual review instead (schema 120).
    const negCell = l.uomMismatch
      ? `<span class="pill pill-orange" title="Agreement priced per ${esc(l.negotiatedUom || "?")} but invoiced per ${esc(l.uom)} — review">UOM mismatch</span>`
      : (l.negotiatedPrice == null ? '<span class="pill pill-red">No Price</span>' : `${money2(l.negotiatedPrice)} <span class="pill pill-green">Negotiated</span>`);
    // Var%/$ + tolerance reflect the benchmark cascade (negotiated → API → recent/org-inv).
    // UOM-mismatched lines have no meaningful price comparison → keep them in manual review.
    const tolCell = l.uomMismatch
      ? '<span class="pill pill-grey">Review (UOM)</span>'
      : `<span class="pill ${tolCls(l.cascadeVariancePct)}">${tolLab(l.cascadeVariancePct)}</span>`;
    const varPctCell = l.uomMismatch || l.cascadeVariancePct == null ? "—" : pct(l.cascadeVariancePct) + benchBadge(l.benchmarkSource, l.benchmarkPrice);
    const varExtCell = l.uomMismatch || l.cascadeVarianceExt == null ? "—" : money2(l.cascadeVarianceExt);
    return `
      <tr class="iv-ln${l.audited ? " is-audited" : ""}" data-line="${li}">
        <td class="iv-sku">${esc(l.itemNumber)}</td>
        <td>${esc(l.itemDescription)}</td>
        <td class="num">${l.qty}</td>
        <td>${esc(l.uom)}</td>
        <td class="num">${money2(l.unitPrice)}</td>
        <td class="num">${l.apiPrice == null ? "—" : money2(l.apiPrice)}</td>
        <td class="num">${l.thirdPrice == null ? "—" : money2(l.thirdPrice)}</td>
        <td>${l.thirdPriceDate || "—"}</td>
        <td>${negCell}</td>
        <td class="num">${varPctCell}</td>
        <td class="num">${varExtCell}</td>
        <td>${tolCell}</td>
        <td class="iv-audit-cell">${auditCell(l).replace("LIDX", String(li))}</td>
      </tr>`;
  }
  // Group lines into collapsible roof-system category sections (preserving each line's
  // original index so disposition still maps to inv.lines[idx]). Default-collapsed.
  function invoiceBody(inv: Invoice): string {
    const groups = new Map<string, number[]>();
    inv.lines.forEach((l, li) => {
      const k = l.categoryKey || "uncategorized";
      (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(li);
    });
    const orderedKeys = catList.map((c) => c.key).filter((k) => groups.has(k));
    for (const k of groups.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    const sections = orderedKeys.map((k) => {
      const idxs = groups.get(k)!;
      const lines = idxs.map((li) => inv.lines[li]);
      const subtotal = lines.reduce((s, l) => s + (l.extendedPrice || 0), 0);
      const atRisk = lines.reduce((s, l) => s + (!l.audited && (l.varianceExt || 0) > 0 ? l.varianceExt! : 0), 0);
      const pend = lines.filter((l) => !l.audited).length;
      const catDone = lines.length - pend;
      const catPct = lines.length ? Math.round((catDone / lines.length) * 100) : 0;
      const tags = [
        `<span class="pill pill-grey">${lines.length} lines</span>`,
        pend > 0 ? `<span class="pill pill-brand">${pend} to audit</span>` : '<span class="pill pill-green">✓</span>',
        `<span class="iv-cat-sub">${money(subtotal)}</span>`,
        atRisk > 0 ? `<span class="pill pill-red">${money(atRisk)} at risk</span>` : "",
      ].filter(Boolean).join("");
      const catBar = `<span class="iv-bar${catDone >= lines.length ? " is-complete" : ""}" title="${catDone}/${lines.length} audited"><span class="iv-bar-fill" style="width:${catPct}%"></span></span>`;
      return `
        <details class="iv-cat" data-cat="${esc(k)}" data-pend="${pend}">
          <summary><span class="iv-chev" aria-hidden="true">›</span><b>${esc(catLabel.get(k) || k)}</b><span class="iv-cat-tags">${tags}</span>${catBar}</summary>
          <table class="iv-table">${thead(inv)}<tbody>${idxs.map((li) => lineRow(inv.lines[li], li)).join("")}</tbody></table>
        </details>`;
    }).join("");

    return `
      <div class="iv-cats">${sections || '<p class="iv-disp-lead">No lines.</p>'}</div>
      <div class="iv-disp"><div class="iv-disp-lead">Select a line item above to disposition it, or use “Mark passed”.</div></div>`;
  }

  async function recordAudit(inv: Invoice, l: InvLine, body: { status?: string; decision?: string; note: string }) {
    try {
      const res = await fetch("/api/invoice-audit/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceLineId: l.lineId, invoiceNumber: inv.invoiceNumber, itemNumber: l.itemNumber, status: body.status ?? "passed", decision: body.decision, note: body.note }) });
      const r = await res.json();
      if (!r.ok) { toast("Save failed: " + (r.error_description || r.error || "error")); return; }
      l.audited = (body.status ?? "passed") === "passed";
      l.auditStatus = body.status ?? "passed";
      l.auditedBy = r.record?.approved_by || "operator";
      l.auditNote = r.record?.approval_note || body.note;
      l.auditSource = "manual";
      l.auditedAt = (r.record?.decided_at || "").slice(0, 10);
      // Manual mark from the dashboard = a human operator (docs/59 Task 5).
      l.actorLabel = l.auditedBy;
      l.actorKind = "human";
      l.actorPersona = null;
      inv.auditedLines = inv.lines.filter((x) => x.audited).length;
      inv.pendingLines = inv.lines.length - inv.auditedLines;
      refreshToBePaid(inv);
      syncPayloadSnapshot();
      reRenderInvoice(inv);
      toast("Audit recorded: " + body.note);
    } catch (e) {
      toast("Save failed — network error");
    }
  }

  // docs/59 Task 6 — per-invoice "Go back". Confirms, calls the WorkOS-gated reset
  // endpoint, then reloads the invoice from the server so the tree reflects the new
  // (all-pending) state. Append-only on the server; here we just re-fetch the truth.
  async function resetInvoice(inv: Invoice, det: HTMLDetailsElement, btn: HTMLButtonElement) {
    const ok = window.confirm(
      `Reset invoice ${inv.invoiceNumber}?\n\nThis re-pends every line, reverses not-to-be-paid holds, and cancels any draft credit memo. Prior decisions stay in history and sent communications are not affected.`,
    );
    if (!ok) return;
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Resetting…";
    try {
      const res = await fetch("/api/invoice-audit/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceNumber: inv.invoiceNumber }),
      });
      const r = await res.json();
      if (!r.ok) {
        toast("Reset failed: " + (r.error_description || r.error || "error"));
        btn.disabled = false;
        btn.textContent = prevLabel;
        return;
      }
      toast(
        `Invoice ${inv.invoiceNumber} reset — ${r.linesReset} line(s) re-pended` +
          (r.creditMemosCancelled ? `, ${r.creditMemosCancelled} draft credit memo cancelled` : "") + ".",
      );
      // Re-fetch the invoice (loadInvoiceLines syncs the summary tags + bar via the tree).
      inv.lines = [];
      inv.linesLoaded = false;
      invoiceDetailInflight.delete(inv.invoiceNumber);
      await loadInvoiceLines(inv);
      const body = det.querySelector(".iv-inv-body") as HTMLElement | null;
      if (body) {
        delete body.dataset.rendered;
        if (det.open) await renderInvoiceDetail(det, body, inv);
      }
      btn.remove(); // invoice is now all-pending — nothing left to go back to
    } catch {
      toast("Reset failed — network error");
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  }

  function parsePreview(raw: any): CommunicationPreviewPayload {
    const messages = Array.isArray(raw?.messages) ? raw.messages : [];
    return {
      threadId: String(raw?.threadId ?? ""),
      status: String(raw?.status ?? "draft"),
      subject: String(raw?.subject ?? ""),
      validationState: raw?.validationState === "failed" ? "failed" : raw?.validationState === "ready" ? "ready" : "pending",
      validationErrors: Array.isArray(raw?.validationErrors) ? raw.validationErrors.map((v: unknown) => String(v)) : [],
      messages: messages.map((msg: any) => ({
        id: String(msg.id ?? ""),
        channel_type: msg.channel_type === "email" ? "email" : "slack",
        subject: String(msg.subject ?? ""),
        body_html: String(msg.body_html ?? ""),
        body_text: String(msg.body_text ?? ""),
        recipients: Array.isArray(msg.recipients) ? msg.recipients.map((v: unknown) => String(v)) : [],
        attachments: Array.isArray(msg.attachments) ? msg.attachments.map((a: any) => ({ label: String(a?.label ?? "Attachment"), href: String(a?.href ?? "#") })) : [],
        validation_state: msg.validation_state === "failed" ? "failed" : msg.validation_state === "ready" ? "ready" : "pending",
        validation_errors: Array.isArray(msg.validation_errors) ? msg.validation_errors.map((v: unknown) => String(v)) : [],
      })),
    };
  }

  function sanitizeClientHtml(input: string) {
    return String(input ?? "")
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
      .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, " $1=\"#\"");
  }

  async function createPreview(inv: Invoice, l: InvLine, action: Action): Promise<CommunicationPreviewPayload | null> {
    try {
      const status = action.group === "credit" ? "disputed" : "passed";
      const res = await fetch("/api/invoice-audit/communications/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceLineId: l.lineId,
          invoiceNumber: inv.invoiceNumber,
          itemNumber: l.itemNumber,
          itemDescription: l.itemDescription,
          triggerAction: action.id,
          auditStatus: status,
          note: action.label,
          unitPrice: l.unitPrice,
          negotiatedPrice: l.negotiatedPrice,
          variancePct: l.variancePct,
          varianceExt: l.varianceExt,
        }),
      });
      const payload = await res.json();
      if (!payload?.ok) {
        toast("Preview failed: " + (payload?.error_description || payload?.error || "error"));
        return null;
      }
      return parsePreview(payload.preview);
    } catch {
      toast("Preview failed - network error");
      return null;
    }
  }

  async function runCommunicationAction(threadId: string, action: string, payload: Record<string, unknown> = {}) {
    const res = await fetch("/api/invoice-audit/communications/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, action, ...payload }),
    });
    return res.json();
  }

  function openWysiwygModal(title: string, initialHtml: string, onSubmit: (html: string, text: string) => Promise<void>) {
    const overlay = document.createElement("div");
    overlay.className = "iv-modal";
    overlay.innerHTML = `
      <div class="iv-modal-card">
        <div class="iv-modal-head">
          <strong>${esc(title)}</strong>
          <button class="iv-modal-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="iv-wysiwyg-tools">
          <button type="button" data-cmd="bold"><b>B</b></button>
          <button type="button" data-cmd="italic"><i>I</i></button>
          <button type="button" data-cmd="insertUnorderedList">• List</button>
          <button type="button" data-cmd="createLink">Link</button>
        </div>
        <div class="iv-wysiwyg" contenteditable="true"></div>
        <div class="iv-modal-actions">
          <button type="button" class="iv-modal-btn" data-role="cancel">Cancel</button>
          <button type="button" class="iv-modal-btn iv-modal-btn-primary" data-role="save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const editor = overlay.querySelector(".iv-wysiwyg") as HTMLElement;
    editor.innerHTML = initialHtml;
    const close = () => overlay.remove();
    overlay.querySelector(".iv-modal-close")?.addEventListener("click", close);
    overlay.querySelector('[data-role="cancel"]')?.addEventListener("click", close);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) close();
    });
    overlay.querySelectorAll<HTMLButtonElement>(".iv-wysiwyg-tools [data-cmd]").forEach((button) =>
      button.addEventListener("click", () => {
        const cmd = button.dataset.cmd || "";
        if (cmd === "createLink") {
          const href = window.prompt("Link URL");
          if (!href) return;
          const trimmed = href.trim();
          const isRelative = trimmed.startsWith("/");
          const isHttp = /^https?:\/\/[^\s]+$/i.test(trimmed);
          if (!isRelative && !isHttp) {
            toast("Links must be http(s) or relative URLs");
            return;
          }
          document.execCommand(cmd, false, trimmed);
          return;
        }
        document.execCommand(cmd, false);
      }),
    );
    overlay.querySelector('[data-role="save"]')?.addEventListener("click", async () => {
      const html = editor.innerHTML.trim();
      const text = (editor.textContent || "").trim();
      if (!html) {
        toast("Content is required");
        return;
      }
      await onSubmit(html, text);
      close();
    });
  }

  function reRenderInvoice(inv: Invoice) {
    const body = mount!.querySelector(`.iv-inv-body[data-inv="${CSS.escape(inv.invoiceNumber)}"]`) as HTMLElement | null;
    const det = body?.closest("details.iv-inv") as HTMLDetailsElement | null;
    if (!body || !det) return;
    body.innerHTML = invoiceBody(inv);
    bindInvoice(det, inv);
    refreshInvoiceTags(det, inv);
    applyFilter();
    syncPayloadSnapshot();
    document.dispatchEvent(new CustomEvent("command-center:render-ready"));
  }

  function refreshInvoiceTags(det: HTMLElement, inv: Invoice) {
    const tags = det.querySelector(".iv-inv-tags");
    if (tags) tags.innerHTML = invoiceTags(inv);
    refreshToBePaid(inv);
    det.dataset.pending = String(inv.pendingLines);
    det.dataset.audited = String(inv.auditedLines);
    det.dataset.auditable = String(inv.auditedLines + inv.pendingLines);
    det.dataset.topay = inv.toBePaid ? "1" : "0";
  }

  let filtersReady = false;
  function syncInvoiceProgressToTree(inv: Invoice) {
    const body = mount!.querySelector(`.iv-inv-body[data-inv="${CSS.escape(inv.invoiceNumber)}"]`) as HTMLElement | null;
    const det = body?.closest("details.iv-inv") as HTMLDetailsElement | null;
    if (det) refreshInvoiceTags(det, inv);
    if (filtersReady) applyFilter();
  }

  function bindInvoice(det: HTMLDetailsElement, inv: Invoice) {
    const disp = det.querySelector(".iv-disp") as HTMLElement;
    det.querySelectorAll<HTMLButtonElement>("[data-mark]").forEach((b) =>
      b.addEventListener("click", (ev) => { ev.stopPropagation(); recordAudit(inv, inv.lines[+b.dataset.line!], { status: "passed", note: "Manually passed" }); }));
    const dispReset = '<div class="iv-disp-lead">Select a line item above to disposition it, or use “Mark passed”.</div>';
    let selectedLine: InvLine | null = null;
    let selectedAction: Action | null = null;
    let previewState: CommunicationPreviewPayload | null = null;

    // Clear any selected line + collapse the disposition panel back to its prompt.
    const clearSelection = () => {
      det.querySelectorAll(".iv-ln").forEach((r) => r.classList.remove("sel"));
      disp.innerHTML = dispReset;
      selectedLine = null;
      selectedAction = null;
      previewState = null;
    };
    // Collapsing a category section nests its lines away → universal deselect, so the
    // disposition panel never lingers under a collapsed line (client request 2026-06-28).
    det.querySelectorAll<HTMLDetailsElement>(".iv-cat").forEach((cat) =>
      cat.addEventListener("toggle", () => { if (!cat.open) clearSelection(); }));

    const drawPreview = () => {
      if (!selectedLine || !selectedAction) {
        disp.querySelector<HTMLElement>('[data-panel="preview"]')!.innerHTML = '<div class="iv-disp-lead">Choose an action in the Actions tab to generate a communication preview.</div>';
        return;
      }
      const panel = disp.querySelector<HTMLElement>('[data-panel="preview"]')!;
      if (!previewState) {
        panel.innerHTML = '<div class="iv-disp-lead">Generating preview…</div>';
        return;
      }
      const msgs = previewState.messages
        .map((msg) => {
          const recipientLabel = msg.channel_type === "slack" ? "Channel" : "Recipients";
          const recipientValue = msg.recipients.length ? msg.recipients.join(", ") : "Not resolved";
          const attachments = msg.attachments.length
            ? `<ul class="iv-attachments">${msg.attachments.map((a) => `<li><a href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a></li>`).join("")}</ul>`
            : '<p class="iv-msg-muted">No attachments</p>';
          const valClass = msg.validation_state === "ready" ? "pill-green" : msg.validation_state === "failed" ? "pill-red" : "pill-yellow";
          const valErrors = msg.validation_errors.length
            ? `<div class="iv-msg-errors">${msg.validation_errors.map((err) => `<span class="pill pill-red">${esc(err)}</span>`).join("")}</div>`
            : "";
          return `
            <article class="iv-msg-card" data-channel="${msg.channel_type}">
              <header><span class="pill ${valClass}">${esc(msg.channel_type.toUpperCase())}</span> <strong>${esc(msg.subject)}</strong></header>
              <div class="iv-msg-row"><b>${recipientLabel}:</b> ${esc(recipientValue)}</div>
              <div class="iv-msg-body">${sanitizeClientHtml(msg.body_html)}</div>
              <div class="iv-msg-row"><b>Attachments:</b>${attachments}</div>
              ${valErrors}
            </article>`;
        })
        .join("");
      const validationPills = previewState.validationErrors.length
        ? previewState.validationErrors.map((err) => `<span class="pill pill-red">${esc(err)}</span>`).join("")
        : '<span class="pill pill-green">All validation checks passed</span>';
      panel.innerHTML = `
        <div class="iv-preview-head">
          <div><strong>${esc(previewState.subject)}</strong></div>
          <div class="iv-msg-muted">Thread ${esc(previewState.threadId.slice(0, 8))} · ${esc(previewState.status)}</div>
        </div>
        <div class="iv-preview-validation">${validationPills}</div>
        <div class="iv-msg-grid">${msgs || '<div class="iv-disp-lead">No channel drafts returned.</div>'}</div>
        <div class="iv-exec-row">
          <button class="iv-exec approve" data-exec="approve">Approved</button>
          <button class="iv-exec edit" data-exec="edit">Edit (WYSIWYG)</button>
          <button class="iv-exec reject" data-exec="reject">Rejected (reason)</button>
          <button class="iv-exec delete" data-exec="delete">Delete</button>
        </div>`;
      panel.querySelectorAll<HTMLButtonElement>(".iv-exec").forEach((button) =>
        button.addEventListener("click", async () => {
          if (!previewState || !selectedLine || !selectedAction) return;
          const mode = button.dataset.exec || "";
          if (mode === "approve") {
            const response = await runCommunicationAction(previewState.threadId, "approve");
            if (!response?.ok) {
              toast("Approve failed: " + (response?.error_description || response?.error || "error"));
              return;
            }
            const status = selectedAction.group === "credit" ? "disputed" : "passed";
            selectedLine.audited = status === "passed";
            selectedLine.auditStatus = status;
            selectedLine.auditedBy = response?.result?.auditRecord?.approved_by || "operator";
            selectedLine.auditNote = selectedAction.label;
            selectedLine.auditSource = "manual";
            selectedLine.auditedAt = String(response?.result?.auditRecord?.decided_at || "").slice(0, 10);
            // Disposition applied from the dashboard = a human operator (docs/59 Task 5).
            selectedLine.actorLabel = selectedLine.auditedBy;
            selectedLine.actorKind = "human";
            selectedLine.actorPersona = null;
            inv.auditedLines = inv.lines.filter((x) => x.audited).length;
            inv.pendingLines = inv.lines.length - inv.auditedLines;
            refreshToBePaid(inv);
            reRenderInvoice(inv);
            toast("Communication approved and queued for release");
            return;
          }
          if (mode === "delete") {
            const response = await runCommunicationAction(previewState.threadId, "delete");
            if (!response?.ok) {
              toast("Delete failed: " + (response?.error_description || response?.error || "error"));
              return;
            }
            previewState = null;
            drawPreview();
            toast("Draft deleted");
            return;
          }
          if (mode === "reject") {
            openWysiwygModal("Reject reason", "<p>Reason required…</p>", async (html, text) => {
              const response = await runCommunicationAction(previewState!.threadId, "reject", {
                reasonHtml: html,
                reasonText: text,
              });
              if (!response?.ok) {
                toast("Reject failed: " + (response?.error_description || response?.error || "error"));
                return;
              }
              previewState = null;
              drawPreview();
              toast("Draft rejected");
            });
            return;
          }
          if (mode === "edit") {
            const editable = previewState.messages.find((m) => m.channel_type === "email") || previewState.messages[0];
            if (!editable) {
              toast("No draft available to edit");
              return;
            }
            openWysiwygModal(`Edit ${editable.channel_type.toUpperCase()} draft`, editable.body_html, async (html, text) => {
              const response = await runCommunicationAction(previewState!.threadId, "edit", {
                channelType: editable.channel_type,
                subject: editable.subject,
                bodyHtml: html,
                bodyText: text,
              });
              if (!response?.ok) {
                toast("Edit failed: " + (response?.error_description || response?.error || "error"));
                return;
              }
              const valid = await runCommunicationAction(previewState!.threadId, "validate");
              if (!valid?.ok) {
                toast("Validation failed: " + (valid?.error_description || valid?.error || "error"));
              }
              const refreshed = await createPreview(inv, selectedLine!, selectedAction!);
              if (refreshed) {
                previewState = refreshed;
                drawPreview();
              }
              toast("Draft updated");
            });
          }
        }));
    };

    det.querySelectorAll<HTMLElement>(".iv-ln").forEach((row) =>
      row.addEventListener("click", () => {
        // Click an already-active line to deselect + collapse the disposition
        // panel (keeps long invoices from running off-screen).
        const wasSel = row.classList.contains("sel");
        clearSelection();
        if (wasSel) return;
        row.classList.add("sel");
        const l = inv.lines[+row.dataset.line!];
        selectedLine = l;
        selectedAction = null;
        previewState = null;
        const accepts = actions.filter((a) => a.group === "accept");
        const credits = actions.filter((a) => a.group === "credit");
        const btn = (a: Action) => `<button class="iv-act ${a.group}" data-action="${a.id}" data-group="${a.group}" data-label="${esc(a.label)}"><span class="t">${esc(a.label)}</span><span class="h">${esc(a.hint)}</span></button>`;
        disp.innerHTML = `
          <div class="iv-disp-lead">Disposition <b>${esc(l.itemNumber)}</b> — ${esc(l.itemDescription)} · Inv ${money2(l.unitPrice)} vs ${l.benchmarkPrice != null ? money2(l.benchmarkPrice) : (l.negotiatedPrice == null ? "No benchmark" : money2(l.negotiatedPrice))}${(!l.uomMismatch && l.cascadeVariancePct != null) ? ` · <span class="pill ${tolCls(l.cascadeVariancePct)}">${pct(l.cascadeVariancePct)} ${tolLab(l.cascadeVariancePct)}</span>${benchBadge(l.benchmarkSource, l.benchmarkPrice)}` : ""}${l.audited ? ` · <span class="pill pill-green">Audited · ${esc(l.actorLabel || l.auditedBy)}</span>${actorBadge(l.actorKind)}` : ""}</div>
          <div class="iv-disp-tabs">
            <button type="button" data-tab="actions" class="is-active">Actions</button>
            <button type="button" data-tab="preview">Communications Preview</button>
          </div>
          <div class="iv-disp-panel" data-panel="actions">
            <div class="iv-grid2"><div class="iv-grp">Accept pricing</div>${accepts.map(btn).join("")}<div class="iv-grp">Dispute — generate credit memo</div>${credits.map(btn).join("")}</div>
          </div>
          <div class="iv-disp-panel is-hidden" data-panel="preview"></div>`;
        const setTab = (tab: "actions" | "preview") => {
          disp.querySelectorAll<HTMLButtonElement>(".iv-disp-tabs [data-tab]").forEach((button) =>
            button.classList.toggle("is-active", button.dataset.tab === tab));
          disp.querySelectorAll<HTMLElement>(".iv-disp-panel").forEach((panel) =>
            panel.classList.toggle("is-hidden", panel.dataset.panel !== tab));
        };
        disp.querySelectorAll<HTMLButtonElement>(".iv-disp-tabs [data-tab]").forEach((button) =>
          button.addEventListener("click", () => setTab((button.dataset.tab as "actions" | "preview") || "actions")));
        disp.querySelectorAll<HTMLButtonElement>(".iv-act").forEach((b) =>
          b.addEventListener("click", async () => {
            disp.querySelectorAll(".iv-act").forEach((x) => x.classList.remove("chosen"));
            b.classList.add("chosen");
            selectedAction = actions.find((a) => a.id === b.dataset.action) || null;
            if (!selectedAction) return;
            setTab("preview");
            previewState = null;
            drawPreview();
            const preview = await createPreview(inv, l, selectedAction);
            if (!preview) return;
            previewState = preview;
            drawPreview();
          }));
      }));
  }

  /* ---- tree render ---- */
  function invoiceTags(inv: Invoice): string {
    refreshToBePaid(inv);
    return [
      inv.pendingLines > 0 ? `<span class="pill pill-brand">${inv.pendingLines}/${inv.lineCount} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      inv.isCreditMemo ? '<span class="pill pill-grey">Credit Memo</span>' : "",
      inv.paid ? `<span class="pill pill-green" title="Paid ${esc(inv.paidAt)}">Paid</span>` : '<span class="pill pill-yellow">Open</span>',
      inv.toBePaid ? '<span class="pill pill-pay"><input type="checkbox" checked disabled aria-label="To Be Paid" /> To Be Paid</span>' : "",
      inv.awaitingPayment ? '<span class="pill pill-brand" title="Exported for payment; not yet confirmed paid">Awaiting Payment</span>' : "",
      inv.worstPct > 0.01 ? `<span class="pill ${worstCls(inv.worstPct)}">${inv.worstPct.toFixed(1)}% worst</span>` : "",
      inv.atRisk > 0 ? `<span class="pill pill-red">${money(inv.atRisk)} at risk</span>` : "",
    ].filter(Boolean).join("");
  }
  function invoiceNode(inv: Invoice, hasPriceList: boolean): string {
    // Purple callout: PO is shown for every invoice that has one (169/172); client name + job
    // type are appended when the PO matches an AccuLynx job (v_invoice_acculynx_match).
    // The job number usually equals the PO (that's how they matched), so show it only when it differs.
    const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const calloutBits = [
      inv.po ? "PO " + esc(inv.po) : (inv.jobNumber ? esc(inv.jobNumber) : ""),
      inv.jobNumber && norm(inv.jobNumber) !== norm(inv.po) ? esc(inv.jobNumber) : "",
      inv.clientName ? esc(inv.clientName) : "",
      inv.jobCategory ? esc(inv.jobCategory) : "",
    ].filter(Boolean);
    const job = calloutBits.length ? ` · <span class="iv-job">${calloutBits.join(" · ")}</span>` : "";
    // Invoice PDF: always an active link — the endpoint fetches it on demand from ABC
    // and stores it if no PDF is on file yet (so every invoice resolves to a document).
    const invoiceBtn = `<a class="iv-rowbtn" href="/api/invoice-audit/pdf/${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📄 Invoice</a>`;
    // Price List: greyed + non-navigating when this branch has no negotiated price list
    // (otherwise the link lands on a blank price-list screen).
    const priceListBtn = hasPriceList
      ? `<a class="iv-rowbtn" href="/accounting/price-list/branch?branch=${encodeURIComponent(inv.branchCode)}&invoice=${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📋 Price List</a>`
      : `<span class="iv-rowbtn is-disabled" aria-disabled="true" title="No price list on file for this branch" onclick="event.stopPropagation()">📋 Price List</span>`;
    // "Go back" reset (docs/59 Task 6 + 2026-06-28 polish): re-pend every line, reverse
    // not-to-be-paid holds, cancel any draft credit memo. Shown on ANY invoice that is open
    // (not paid) and not yet exported AND has had audit work — human OR agent, credit memos
    // included. cc.proexteriorsus.net is where a human fixes agent work, so the option must be
    // universal for open+unpaid worked invoices. Hidden only on paid/exported (server refuses those).
    const resetBtn = (!inv.paid && !inv.awaitingPayment && inv.hasWork === true)
      ? `<button type="button" class="iv-rowbtn iv-reset" data-reset="${esc(inv.invoiceNumber)}" title="Reset all lines to pending, reverse not-to-be-paid holds, and cancel any draft credit memo (sent communications are not affected)" onclick="event.stopPropagation()">↩ Go back</button>`
      : "";
    return `
      <details class="iv-inv" data-search="${esc(inv.searchText || (inv.invoiceNumber + " " + inv.po + " " + inv.lines.map((l) => l.itemNumber + " " + l.itemDescription).join(" ")).toLowerCase())}" data-worst="${inv.worstPct}" data-noprice="${inv.noPriceLines}" data-pending="${inv.pendingLines}" data-audited="${inv.auditedLines}" data-auditable="${inv.auditedLines + inv.pendingLines}" data-atrisk="${inv.atRisk}" data-paid="${inv.paid ? "1" : "0"}" data-cm="${inv.isCreditMemo ? "1" : "0"}" data-date="${esc(inv.invoiceDate)}" data-actionable="${inv.actionable ? "1" : "0"}" data-topay="${refreshToBePaid(inv) ? "1" : "0"}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-inv-id"><span class="iv-inv-no">${esc(inv.invoiceNumber)}</span> <span class="iv-inv-sub">${inv.invoiceDate}${job}</span></span>
          <span class="iv-rowbtns">${priceListBtn}${invoiceBtn}${resetBtn}</span>
          <span class="iv-inv-tags">${invoiceTags(inv)}</span>
          ${auditBar()}
        </summary>
        <div class="iv-inv-body" data-inv="${esc(inv.invoiceNumber)}"></div>
      </details>`;
  }

  // Rollup pills/stats are rebuilt from the *visible* invoices on every filter change
  // (applyFilter), so the office/branch bars always match the active scope — open-only
  // by default, since that is this dashboard's sole task. Shared builders keep the
  // render-time and recompute-time markup identical.
  interface Roll { invoiceCount: number; pending: number; toBePaid: number; atRisk: number; noPrice: number; audited: number; auditable: number; }
  // Set a level's own audited progress bar (the bar in this details' direct <summary>).
  function setBar(scopeEl: HTMLElement, done: number, total: number) {
    const bar = scopeEl.querySelector<HTMLElement>(":scope > summary .iv-bar");
    const fill = bar?.querySelector<HTMLElement>("[data-audbar]");
    if (!bar || !fill) return;
    const p = total ? Math.round((done / total) * 100) : 0;
    fill.style.width = p + "%";
    bar.classList.toggle("is-complete", total > 0 && done >= total);
    bar.title = `${done}/${total} audited`;
  }
  function branchTags(r: Roll): string {
    return [
      `<span class="pill pill-grey">${r.invoiceCount} invoices</span>`,
      r.toBePaid ? `<span class="pill pill-pay">${r.toBePaid} to be paid</span>` : "",
      r.pending ? `<span class="pill pill-brand">${r.pending} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      r.atRisk > 0 ? `<span class="pill pill-red">${money(r.atRisk)} at risk</span>` : "",
      r.noPrice ? `<span class="pill pill-yellow">${r.noPrice} no-price</span>` : "",
    ].filter(Boolean).join("");
  }
  function officeMini(r: Roll): string {
    return [
      `<div><strong>${r.pending}</strong><span>To Audit</span></div>`,
      `<div><strong>${r.toBePaid}</strong><span>To Pay</span></div>`,
      `<div><strong>${r.invoiceCount}</strong><span>Invoices</span></div>`,
      `<div><strong>${money(r.atRisk)}</strong><span>At Risk</span></div>`,
      `<div><strong>${r.noPrice}</strong><span>No-Price</span></div>`,
    ].join("");
  }

  // Compact audited-progress bar shown at each nesting level (rolls up audit_status, the
  // existing DB disposition — no separate review state). Fill is set live in applyFilter.
  const auditBar = () => '<span class="iv-bar" title="Audited"><span class="iv-bar-fill" data-audbar></span></span>';

  function branchNode(br: Branch): string {
    // A branch has a price list iff at least one of its lines resolved a negotiated price.
    const branchHasPriceList = br.invoices.some((i) => i.hasPriceList || i.lines.some((l) => l.negotiatedPrice != null));
    return `
      <details class="iv-branch" data-branch="${esc(br.branchCode)}" data-search="${esc((br.branchName + " " + br.branchCode).toLowerCase())}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-branch-name">${esc(br.branchName)}</span> <span class="iv-inv-sub">#${esc(br.branchCode)}</span></span>
          <span class="iv-branch-tags">${branchTags({ invoiceCount: br.invoiceCount, pending: br.pending, toBePaid: br.toBePaid ?? 0, atRisk: br.atRisk, noPrice: br.noPrice, audited: 0, auditable: 0 })}</span>
          ${auditBar()}
        </summary>
        <div class="iv-branch-body">${br.invoices.map((inv) => invoiceNode(inv, branchHasPriceList)).join("")}</div>
      </details>`;
  }

  function officeNode(off: Office): string {
    return `
      <details class="iv-office" data-office="${esc(off.office)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-office-name">${esc(off.office)}</span>
          <span class="iv-mini">${officeMini({ invoiceCount: off.invoiceCount, pending: off.pending, toBePaid: off.toBePaid ?? 0, atRisk: off.atRisk, noPrice: off.noPrice, audited: 0, auditable: 0 })}</span>
          ${auditBar()}
        </summary>
        <div class="iv-office-body">${off.branches.map(branchNode).join("")}</div>
      </details>`;
  }

  const isRenderedSnapshot = document.documentElement.dataset.commandCenterSnapshot === "last-complete-render";
  if (!isRenderedSnapshot || !mount.children.length) {
    mount.innerHTML = offices.map(officeNode).join("");
  }

  // Lazy-load invoice detail on first expand; the initial payload carries summaries only.
  const invByNumber = new Map<string, Invoice>();
  offices.forEach((o) => o.branches.forEach((b) => b.invoices.forEach((i) => invByNumber.set(i.invoiceNumber, i))));

  const invoiceDetailInflight = new Map<string, Promise<boolean>>();

  function bodyHasLineRows(body: HTMLElement) {
    return body.querySelector(".iv-ln") !== null;
  }

  function invoiceNeedsLineFetch(inv: Invoice) {
    return !inv.lines.length && (inv.lineCount > 0 || !inv.linesLoaded);
  }

  async function loadInvoiceLines(inv: Invoice): Promise<boolean> {
    if (inv.lines.length > 0) return true;
    if (inv.linesLoaded && inv.lineCount <= 0) return true;
    let inflight = invoiceDetailInflight.get(inv.invoiceNumber);
    if (!inflight) {
      inflight = fetch(`/api/invoice-audit/invoice?invoiceNumber=${encodeURIComponent(inv.invoiceNumber)}`, { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload?.ok || !payload.invoice) throw new Error(payload?.error_description || payload?.error || "invoice detail failed");
          if ((payload.invoice.lines?.length ?? 0) === 0 && (payload.invoice.lineCount ?? inv.lineCount ?? 0) > 0) {
            throw new Error("invoice detail returned no line rows");
          }
          Object.assign(inv, payload.invoice, { linesLoaded: true });
          syncInvoiceProgressToTree(inv);
          syncPayloadSnapshot();
          return true;
        })
        .catch(() => false)
        .finally(() => invoiceDetailInflight.delete(inv.invoiceNumber));
      invoiceDetailInflight.set(inv.invoiceNumber, inflight);
    }
    return inflight;
  }

  async function ensureInvoiceLines(inv: Invoice, body: HTMLElement): Promise<boolean> {
    if (!invoiceNeedsLineFetch(inv)) return true;
    body.innerHTML = '<p class="iv-disp-lead">Loading invoice detail...</p>';
    const ok = await loadInvoiceLines(inv);
    if (!ok) body.innerHTML = '<p class="iv-disp-lead">Invoice detail failed to load: network error</p>';
    return ok;
  }

  function prefetchInvoiceDetails(invoices: Invoice[], limit = 6) {
    const pending = invoices.filter((inv) => !inv.linesLoaded && !inv.lines.length).slice(0, limit);
    if (!pending.length) return;
    pending.forEach((inv, index) => {
      window.setTimeout(() => void loadInvoiceLines(inv), 250 + index * 140);
    });
  }

  async function renderInvoiceDetail(det: HTMLDetailsElement, body: HTMLElement, inv: Invoice): Promise<boolean> {
    const siblingInvoices = Array.from(det.parentElement?.querySelectorAll<HTMLElement>(".iv-inv-body[data-inv]") || [])
      .map((node) => invByNumber.get(node.dataset.inv || ""))
      .filter(Boolean) as Invoice[];
    prefetchInvoiceDetails(siblingInvoices.filter((candidate) => candidate.invoiceNumber !== inv.invoiceNumber), 2);
    if (body.dataset.rendered && !bodyHasLineRows(body)) {
      body.innerHTML = '<p class="iv-disp-lead">Refreshing invoice line detail...</p>';
    }
    if (!(await ensureInvoiceLines(inv, body))) return false;
    syncInvoiceProgressToTree(inv);
    body.innerHTML = invoiceBody(inv);
    body.dataset.rendered = "1";
    bindInvoice(det, inv);
    document.dispatchEvent(new CustomEvent("command-center:render-ready"));
    return true;
  }

  mount.querySelectorAll<HTMLDetailsElement>(".iv-inv").forEach((det) => {
    det.addEventListener("toggle", async () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-inv-body") as HTMLElement;
      const inv = invByNumber.get(body.dataset.inv!);
      if (!inv) return;
      if (body.dataset.rendered && inv.lines.length > 0 && bodyHasLineRows(body)) return;
      if (body.dataset.rendered && (!inv.lines.length || !bodyHasLineRows(body))) delete body.dataset.rendered;
      await renderInvoiceDetail(det, body, inv);
    });
  });

  mount.querySelectorAll<HTMLDetailsElement>(".iv-inv").forEach((det) => {
    const body = det.querySelector(".iv-inv-body") as HTMLElement | null;
    if (!body?.dataset.rendered) return;
    const inv = invByNumber.get(body.dataset.inv || "");
    if (inv?.lines?.length && bodyHasLineRows(body)) {
      bindInvoice(det, inv);
      return;
    }
    delete body.dataset.rendered;
    if (det.open && inv) void renderInvoiceDetail(det, body, inv);
  });

  mount.querySelectorAll<HTMLButtonElement>("button.iv-reset[data-reset]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const det = btn.closest("details.iv-inv") as HTMLDetailsElement | null;
      const inv = invByNumber.get(btn.dataset.reset || "");
      if (det && inv) void resetInvoice(inv, det, btn);
    });
  });

  mount.querySelectorAll<HTMLDetailsElement>(".iv-office,.iv-branch").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const invoices = Array.from(det.querySelectorAll<HTMLElement>(".iv-inv-body[data-inv]"))
        .map((node) => invByNumber.get(node.dataset.inv || ""))
        .filter(Boolean) as Invoice[];
      prefetchInvoiceDetails(invoices, det.classList.contains("iv-office") ? 4 : 3);
    });
  });

  prefetchInvoiceDetails(Array.from(invByNumber.values()), 3);

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  const tolSel = document.getElementById("iv-tol") as HTMLSelectElement;
  const date1El = document.getElementById("iv-date1") as HTMLInputElement | null;
  const date2El = document.getElementById("iv-date2") as HTMLInputElement | null;
  const showAllBox = document.getElementById("iv-showall") as HTMLInputElement | null;
  const pendingBox = document.getElementById("iv-pending") as HTMLInputElement;
  // "Show all" escapes the default open+60-day actionable bound (docs/59 D2): it reveals
  // paid / recent / credit-memo invoices and lifts the date inputs' ≤cutoff cap.
  function syncDateBounds() {
    const showAll = !!showAllBox?.checked;
    for (const el of [date1El, date2El]) {
      if (!el) continue;
      if (showAll) el.removeAttribute("max");
      else if (el.dataset.cap) el.max = el.dataset.cap;
    }
  }
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    const tol = tolSel.value;
    const showAll = !!showAllBox?.checked;
    const date1 = date1El?.value || "";
    const date2 = date2El?.value || "";
    const pendingOnly = pendingBox?.checked;
    root!.classList.toggle("iv-pending-only", !!pendingOnly); // CSS hides audited line rows
    mount.querySelectorAll<HTMLElement>(".iv-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      const offRoll: Roll = { invoiceCount: 0, pending: 0, toBePaid: 0, atRisk: 0, noPrice: 0, audited: 0, auditable: 0 };
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        let branchHas = false;
        const brRoll: Roll = { invoiceCount: 0, pending: 0, toBePaid: 0, atRisk: 0, noPrice: 0, audited: 0, auditable: 0 };
        bEl.querySelectorAll<HTMLElement>(".iv-inv").forEach((iEl) => {
          const worst = parseFloat(iEl.dataset.worst || "0");
          const noprice = parseInt(iEl.dataset.noprice || "0", 10);
          const pending = parseInt(iEl.dataset.pending || "0", 10);
          const audited = parseInt(iEl.dataset.audited || "0", 10);
          const auditable = parseInt(iEl.dataset.auditable || "0", 10);
          const atrisk = parseFloat(iEl.dataset.atrisk || "0");
          const toPay = iEl.dataset.topay === "1";
          const invDate = iEl.dataset.date || "";
          const actionable = iEl.dataset.actionable === "1";
          const tolOk = !tol ? true : tol === "noprice" ? noprice > 0 : worst >= parseFloat(tol);
          // Scope: default = the actionable set (open + ≥60d + non-CM); "Show all" lifts it.
          // The date range narrows within whichever scope is active (docs/59 D2/Task 4).
          const scopeOk = showAll ? true : actionable;
          const dateOk = (!date1 || invDate >= date1) && (!date2 || invDate <= date2);
          const pendOk = !pendingOnly || pending > 0;
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && tolOk && scopeOk && dateOk && pendOk && qOk;
          iEl.style.display = ok ? "" : "none";
          setBar(iEl, audited, auditable); // an invoice's own bar reflects its state regardless of filter
          if (ok) branchHas = true;
          // Rollup bars/headcounts track the active scope (actionable by default, or all when
          // "Show all" is on) + date range — not the tol/to-audit/search drill filters.
          if (scopeOk && dateOk && officeOk) {
            brRoll.invoiceCount++; brRoll.pending += pending; brRoll.atRisk += atrisk; brRoll.noPrice += noprice;
            if (toPay) brRoll.toBePaid++;
            brRoll.audited += audited; brRoll.auditable += auditable;
          }
        });
        bEl.style.display = branchHas ? "" : "none";
        const brTags = bEl.querySelector<HTMLElement>(".iv-branch-tags");
        if (brTags) brTags.innerHTML = branchTags({ ...brRoll, atRisk: Math.round(brRoll.atRisk) });
        setBar(bEl, brRoll.audited, brRoll.auditable);
        if (branchHas) {
          officeHas = true;
          offRoll.invoiceCount += brRoll.invoiceCount; offRoll.pending += brRoll.pending;
          offRoll.toBePaid += brRoll.toBePaid;
          offRoll.atRisk += brRoll.atRisk; offRoll.noPrice += brRoll.noPrice;
          offRoll.audited += brRoll.audited; offRoll.auditable += brRoll.auditable;
        }
      });
      oEl.style.display = officeHas ? "" : "none";
      const mini = oEl.querySelector<HTMLElement>(".iv-mini");
      if (mini) mini.innerHTML = officeMini({ ...offRoll, atRisk: Math.round(offRoll.atRisk) });
      setBar(oEl, offRoll.audited, offRoll.auditable);
    });
  }
  [search, officeSel, tolSel, date1El, date2El, pendingBox].forEach((el) => el?.addEventListener("input", applyFilter));
  showAllBox?.addEventListener("change", () => { syncDateBounds(); applyFilter(); });
  syncDateBounds();
  applyFilter();
  filtersReady = true;

  /* ---- scoped deep-link: ?office= / ?branch= ---- */
  const params = new URLSearchParams(window.location.search);
  if ((params.has("refresh") || params.has("live")) && offices.length > 0) {
    const clean = new URL(window.location.href);
    clean.searchParams.delete("refresh");
    clean.searchParams.delete("live");
    window.history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
  }

  const rootText = root.textContent?.toLowerCase() || "";
  const needsLiveRefresh = offices.length === 0 || rootText.includes("supabase pending") || rootText.includes("no invoices found in the live pipeline");
  if (needsLiveRefresh && !params.has("refresh") && !params.has("live")) {
    const key = "invoiceAuditLiveRefreshAt";
    let shouldRefresh = true;
    try {
      const last = Number(window.sessionStorage.getItem(key) || "0");
      shouldRefresh = !Number.isFinite(last) || Date.now() - last > 30_000;
      if (shouldRefresh) window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      shouldRefresh = true;
    }
    if (shouldRefresh) {
      window.setTimeout(() => {
        const live = new URL(window.location.href);
        live.searchParams.set("refresh", String(Date.now()));
        window.location.replace(live.pathname + live.search + live.hash);
      }, 250);
    }
  }

  const wantOffice = params.get("office");
  const wantBranch = params.get("branch");
  if (wantOffice || wantBranch) {
    let target: HTMLElement | null = null;
    mount.querySelectorAll<HTMLDetailsElement>(".iv-office").forEach((oEl) => {
      const oName = (oEl.dataset.office || "").toLowerCase();
      const officeHit = wantOffice && oName.includes(decodeURIComponent(wantOffice).toLowerCase());
      if (officeHit) { oEl.open = true; if (!target) target = oEl; officeSel.value = oEl.dataset.office!; }
      oEl.querySelectorAll<HTMLDetailsElement>(".iv-branch").forEach((bEl) => {
        if (wantBranch && bEl.dataset.branch === decodeURIComponent(wantBranch)) {
          oEl.open = true; bEl.open = true; target = bEl;
        }
      });
    });
    if (officeSel.value) applyFilter();
    if (target) (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---- theme toggle ---- */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    root!.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".iv-theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem("ivTheme") || "system"; } catch {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".iv-theme button").forEach((b) =>
    b.addEventListener("click", () => { try { localStorage.setItem("ivTheme", b.dataset.setTheme!); } catch {} applyTheme(b.dataset.setTheme!); }));
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---- toast ---- */
  let timer: number | undefined;
  const toastEl = document.getElementById("iv-toast")!;
  function toast(msg: string) { toastEl.textContent = msg; toastEl.classList.add("show"); window.clearTimeout(timer); timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200); }

  /* ---- payments: export → awaiting → confirm / reconcile ---- */
  const fmtMoney = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; data: any }> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: body ? JSON.stringify(body) : "{}" });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch {
      return { ok: false, data: { error_description: "network error" } };
    }
  }
  function triggerDownload(url: string) {
    const a = document.createElement("a");
    a.href = url; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }

  const processBtn = document.getElementById("iv-process") as HTMLButtonElement | null;
  processBtn?.addEventListener("click", async () => {
    const count = parseInt(processBtn.dataset.count || "0", 10);
    if (!count) return;
    if (!window.confirm(`Export ${count} fully-reviewed invoice(s) for payment and download the QuickBooks CSV?\n\nThey move to Awaiting Payment — this does NOT mark them paid.`)) return;
    processBtn.disabled = true;
    const { ok, data } = await postJson("/api/invoice-audit/process-batch");
    if (!ok) { toast("Export failed: " + (data?.error_description || data?.error || "error")); processBtn.disabled = false; return; }
    const files: any[] = data.files ?? [];
    files.forEach((f, i) => window.setTimeout(() => triggerDownload(f.downloadUrl), i * 500));
    toast(`Exported ${data.count} invoice(s) — ${files.length} vendor file(s)`);
    window.setTimeout(() => window.location.reload(), 1700 + files.length * 500);
  });

  const payBtn = document.getElementById("iv-payments");
  let payDirty = false;
  function closePay(overlay: HTMLElement) { overlay.remove(); if (payDirty) window.location.reload(); }
  async function renderPay(body: HTMLElement) {
    body.innerHTML = '<p class="iv-pay-empty">Loading…</p>';
    const [batchesRes, recRes] = await Promise.all([
      fetch("/api/invoice-audit/batches", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/invoice-audit/reconcile", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    const batches: any[] = batchesRes?.batches ?? [];
    const exceptions: any[] = recRes?.exceptions ?? [];
    const parts: string[] = [];
    parts.push(`<div class="iv-pay-row"><button class="iv-process-btn iv-secondary" data-pay="reconcile">Reconcile with ABC AR</button><span class="iv-msg-muted">Auto-confirms exported invoices ABC now reports paid.</span></div>`);
    parts.push(`<div class="iv-pay-sec-title">Exceptions${exceptions.length ? ` (${exceptions.length})` : ""}</div>`);
    if (!exceptions.length) parts.push('<p class="iv-pay-empty">No reconciliation exceptions.</p>');
    for (const e of exceptions) {
      const lab = e.driftFlag === "exported_uncleared" ? "Exported &gt;14d, ABC still open" : "Marked paid here, ABC shows open";
      parts.push(`<div class="iv-pay-exc"><strong>${esc(e.invoiceNumber)}</strong> — ${lab} · ${fmtMoney(e.totalDue)} <span class="iv-msg-muted">(${esc(e.ledgerStatus)} / ABC ${esc(e.abcArStatus || "—")})</span></div>`);
    }
    parts.push(`<div class="iv-pay-sec-title">Export batches</div>`);
    if (!batches.length) parts.push('<p class="iv-pay-empty">No export batches yet.</p>');
    for (const b of batches) {
      const stamp = b.processedAt ? new Date(b.processedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
      const tags = [b.counts.exported ? `<span class="pill pill-brand">${b.counts.exported} awaiting</span>` : "", b.counts.paid ? `<span class="pill pill-green">${b.counts.paid} paid</span>` : "", b.counts.returned ? `<span class="pill pill-grey">${b.counts.returned} returned</span>` : ""].filter(Boolean).join(" ");
      const confirmBtn = b.counts.exported > 0 ? `<button class="is-paid" data-pay="confirm" data-batch="${esc(b.batchId)}">Confirm Paid</button>` : "";
      const returnBtn = (b.counts.exported > 0 || b.counts.paid > 0) ? `<button class="is-return" data-pay="return" data-batch="${esc(b.batchId)}">Return</button>` : "";
      const files: any[] = b.files ?? [];
      const title = files.length === 1 ? esc(files[0].fileName || files[0].vendor) : `${files.length} vendor files`;
      const dl = files.map((f) => `<a href="${esc(f.downloadUrl)}" download>⬇ ${esc(f.fileName || f.vendor)}</a>`).join("");
      parts.push(`<div class="iv-pay-batch"><div class="iv-pay-row"><strong>${title}</strong> ${tags}</div><div class="iv-msg-muted">${stamp} · ${b.invoices.length} invoice(s) · ${fmtMoney(b.totalDue)}</div><div class="iv-pay-actions">${dl}${confirmBtn}${returnBtn}</div></div>`);
    }
    body.innerHTML = parts.join("");
    body.querySelectorAll<HTMLElement>("[data-pay]").forEach((el) => el.addEventListener("click", async () => {
      const kind = el.dataset.pay;
      const batchId = el.dataset.batch;
      if (kind === "reconcile") {
        const { ok, data } = await postJson("/api/invoice-audit/reconcile");
        if (!ok) { toast("Reconcile failed: " + (data?.error_description || "error")); return; }
        payDirty = true; toast(`Reconciled ${data.reconciled} · ${data.counts?.exportedUncleared || 0} uncleared, ${data.counts?.paidButArOpen || 0} drift`); renderPay(body); return;
      }
      if (kind === "confirm") {
        if (!window.confirm("Confirm this batch actually paid? Invoices will be marked Paid.")) return;
        const { ok, data } = await postJson("/api/invoice-audit/confirm-paid", { batchId });
        if (!ok) { toast("Confirm failed: " + (data?.error_description || "error")); return; }
        payDirty = true; toast(`Confirmed ${data.confirmed} invoice(s) paid`); renderPay(body); return;
      }
      if (kind === "return") {
        const reason = window.prompt("Return this batch to the To-Be-Paid queue. Reason (optional):", "");
        if (reason === null) return;
        const { ok, data } = await postJson("/api/invoice-audit/return-batch", { batchId, reason });
        if (!ok) { toast("Return failed: " + (data?.error_description || "error")); return; }
        payDirty = true; toast(`Returned ${data.returned} invoice(s)`); renderPay(body); return;
      }
    }));
  }
  payBtn?.addEventListener("click", () => {
    payDirty = false;
    const overlay = document.createElement("div");
    overlay.className = "iv-modal";
    // Self-styled + attached inside `.iv` so the theme CSS variables resolve and
    // the modal is readable regardless of stylesheet scoping.
    overlay.style.cssText = "position:fixed;inset:0;z-index:120;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;background:rgba(11,17,25,.55);overflow:auto";
    overlay.innerHTML = `<div class="iv-modal-card" style="background:var(--panel,#fff);color:var(--ink,#1c2733);border:1px solid var(--line,#e3e8ef);max-width:780px;width:100%;max-height:85vh;overflow:auto;border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4)"><div class="iv-modal-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong>Invoice Payments</strong><button class="iv-modal-close" aria-label="Close" style="cursor:pointer;background:transparent;border:1px solid var(--line,#e3e8ef);border-radius:8px;padding:2px 9px;font-size:18px;line-height:1;color:inherit">×</button></div><div class="iv-pay-body"></div></div>`;
    (root || document.body).appendChild(overlay);
    const panelBody = overlay.querySelector(".iv-pay-body") as HTMLElement;
    overlay.querySelector(".iv-modal-close")?.addEventListener("click", () => closePay(overlay));
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) closePay(overlay); });
    renderPay(panelBody);
  });
}
