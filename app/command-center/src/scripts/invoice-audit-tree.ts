// Invoice Audit — PE Office → Vendor/Branch → Invoice → Line drill-down.
// Lazy-renders invoice lines + disposition on expand. Reads ?office=/?branch=
// to land pre-filtered (scoped deep-link from the map popup / side card).
import { priceListUrl } from "./price-list-url";

interface InvLine { lineId: string; itemNumber: string; itemDescription: string; qty: number; uom: string; unitPrice: number; extendedPrice: number; negotiatedPrice: number | null; apiPrice: number | null; variancePct: number | null; varianceExt: number | null; recentPrice: number | null; orgInvPrice: number | null; thirdPrice: number | null; thirdPriceDate: string; benchmarkSource: "negotiated" | "api" | "recent" | "org_inv" | "none" | ""; benchmarkPrice: number | null; cascadeVariancePct: number | null; cascadeVarianceExt: number | null; uomMismatch: boolean; negotiatedUom: string; categoryKey: string; audited: boolean; auditStatus: string; auditedBy: string; auditNote: string; auditSource: string; auditedAt: string; actorLabel: string; actorKind: "agent" | "human" | "system"; actorPersona: "Alex" | "Maya" | null; agreementId: number | null; agreementCurrent: boolean | null; agreementExpiry: string; }
interface Category { key: string; label: string; sortOrder: number; }
interface Invoice { invoiceNumber: string; vendor?: string; invoiceDate: string; orderDate: string; totalAmount: number; isCreditMemo: boolean; salesType: string; po: string; branchCode: string; branchName: string; office: string; lineCount: number; noPriceLines: number; flaggedLines: number; atRisk: number; worstPct: number; auditedLines: number; pendingLines: number; hasWork?: boolean; paid: boolean; paidAt: string; processedAt?: string; toBePaid?: boolean; transferred?: boolean; held?: boolean; approvedToPay?: boolean; awaitingPayment?: boolean; actionable?: boolean; dueNow?: boolean; paymentStatus?: string; hasPdf: boolean; jobNumber: string; clientName: string; jobCategory: string; canonicalPo?: string; namingStatus?: string; acculynxJobId?: string; needsAcculynxLink?: boolean; lines: InvLine[]; hasPriceList?: boolean; searchText?: string; linesLoaded?: boolean; }
interface Branch { branchCode: string; branchName: string; office: string; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; toBePaid?: number; invoices: Invoice[]; }
interface Office { office: string; branchCount: number; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; toBePaid?: number; branches: Branch[]; }
const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const payload = JSON.parse(dataEl.textContent || "{}") as { offices: Office[]; categories: Category[] };
  const offices = payload.offices ?? [];
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
  // MUST mirror lib/invoice-audit.ts isInvoiceToBePaid / isInvoicePayable. This client
  // predicate drifting from the server (missing `transferred`, ignoring credit-memo
  // holds) is what made the KPI card, tree pills, and Process button disagree (2026-07-06).
  const isToBePaid = (inv: Invoice) => !inv.paid && !inv.isCreditMemo && !inv.processedAt && (!!inv.transferred || (inv.pendingLines === 0 && inv.auditedLines > 0));
  const isPayable = (inv: Invoice) => isToBePaid(inv) && inv.approvedToPay !== false;
  const refreshToBePaid = (inv: Invoice) => { inv.toBePaid = isToBePaid(inv); return inv.toBePaid; };

  function syncPayloadSnapshot() {
    dataEl.textContent = JSON.stringify({ offices, categories }).replace(/</g, "\\u003c");
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

  /* ---- KPI pill realtime refresh (PEC-197/198) ----
     Re-fetches /api/accounting/kpi-pills after every mutating action (and on a 60s
     visible-tab poll) and patches the 7-pill row in place — no full reload. Pill
     markup contract: data-kpi-val/-sub hooks in invoice-audit.astro. */
  async function refreshKpiPills() {
    try {
      const res = await fetch("/api/accounting/kpi-pills", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const k = await res.json();
      const m$ = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
      const num$ = (n: number) => (Number(n) || 0).toLocaleString("en-US");
      const set = (sel: string, txt: string) => { const el = document.querySelector<HTMLElement>(sel); if (el) el.textContent = txt; };
      set('[data-kpi-val="claims"]', num$(k.claimsUnreviewed));
      set('[data-kpi-sub="claims"]', `of ${num$(k.claimsTotal)} claim lines · ${m$(k.atRisk)} at risk`);
      set('[data-kpi-val="cm"]', m$((k.cmApprovedTotal || 0) + (k.cmDraftTotal || 0)));
      set('[data-kpi-sub="cm"]', `${num$(k.cmApprovedCount)} approved (${m$(k.cmApprovedTotal)}) · ${num$(k.cmDraftCount)} draft (${m$(k.cmDraftTotal)})`);
      const vend = document.querySelector<HTMLElement>("[data-kpi-vendors]");
      if (vend && Array.isArray(k.cmByVendor)) {
        vend.innerHTML = k.cmByVendor.map((v: any) => {
          if (v.cmStatus === "coming_soon") return `<span class="iv-process-btn iv-secondary iv-vendor-off" title="Coming Soon">${esc(v.acronym)}</span>`;
          if (!v.count) return `<span class="iv-process-btn iv-secondary iv-vendor-off" title="No data available — report empty">${esc(v.acronym)}</span>`;
          return `<a class="iv-process-btn iv-secondary" href="/accounting/credit-memos/weekly?vendor=${encodeURIComponent(v.slug)}" title="Open the ${esc(v.label)} credit memo email + downloads">${esc(v.acronym)} →</a>`;
        }).join("");
      }
      const pb = document.getElementById("iv-process") as HTMLButtonElement | null;
      if (pb) {
        const n = Number(k.auditPendingCount || 0);
        pb.dataset.count = String(n);
        pb.disabled = n === 0;
        pb.classList.toggle("is-disabled", n === 0);
        const span = pb.querySelector('[data-kpi-val="auditPending"]');
        if (span) span.textContent = num$(n);
        // Empty is the normal resting state — label it honestly, not "report empty".
        pb.querySelector<HTMLElement>("[data-kpi-empty]")?.toggleAttribute("hidden", n !== 0);
        pb.querySelector<HTMLElement>("[data-kpi-full]")?.toggleAttribute("hidden", n === 0);
        pb.title = n === 0
          ? "Nothing awaiting a stamp — invoices enter this queue only when a re-audit or a “Go back” reset produces new claim lines."
          : "Stamp audited invoices Invoice Audit Complete (auto-fires when a vendor email is marked sent)";
      }
      set('[data-kpi-val="awaiting"]', num$(k.awaitingCount));
      const aw = document.querySelector<HTMLElement>('[data-kpi-sub="awaiting"]');
      if (aw) aw.innerHTML = `${m$(k.awaitingTotal)} requested · <span class="${Number(k.awaitingOverdue) > 0 ? "iv-overdue" : ""}" data-kpi-overdue>${num$(k.awaitingOverdue)}</span> overdue (+14d)`;
      set('[data-kpi-val="dueNow"]', num$(k.dueNow));
      set('[data-kpi-val="verify"]', num$(k.pendingVerification));
      set('[data-kpi-val="qb"]', num$(k.qbPendingTotal));
      const qbSub = document.querySelector<HTMLElement>('[data-kpi-sub="qb"]');
      if (qbSub) {
        qbSub.textContent = Array.isArray(k.qbPendingByVendor) && k.qbPendingByVendor.length
          ? k.qbPendingByVendor.map((r: any) => `${r.slug} ${r.pending}`).join(" · ")
          : "all ledgers exported";
        const qbBtn = qbSub.closest(".iv-kpi")?.querySelector<HTMLElement>(".iv-process-btn");
        if (qbBtn) {
          qbBtn.outerHTML = Number(k.qbPendingTotal) > 0
            ? `<a class="iv-process-btn iv-secondary" href="/accounting/qb-bank-export" title="Preview + download the per-vendor QB bank CSVs">Export →</a>`
            : `<span class="iv-process-btn iv-secondary iv-vendor-off" title="No data available — report empty">Export →</span>`;
        }
      }
      set('[data-kpi-val="alex"]', num$(k.alexCandidates));
      set('[data-kpi-sub="scope"]', `${num$(k.openInvoices)} open invoices · ${num$(k.paidInvoices)} paid/closed · ${num$(k.creditMemosOpen)} credit memos open`);
    } catch {}
  }

  /* ---- credit memo requests (v2 R2, docs/82): Approve-into-weekly-email flow ---- */
  const cmByInvoice = new Map<string, { status: string; expectedCredit: number; claimLines: number; reviewedLines: number }>();
  // Per-line claim review state (Chris 2026-08-05: the check-off lives on the audit
  // lines too, synced with the Weekly CM page). Key = abc invoice line uuid.
  const claimByLineId = new Map<string, { reauditId: number; reviewed: boolean }>();
  async function loadCreditMemoRequests() {
    try {
      const res = await fetch("/api/credit-memos/pending", { credentials: "same-origin", cache: "no-store" });
      const payload = await res.json();
      if (!payload?.requests) return;
      cmByInvoice.clear();
      claimByLineId.clear();
      for (const r of payload.requests) {
        cmByInvoice.set(r.invoiceNumber, { status: r.status, expectedCredit: r.expectedCredit, claimLines: r.claimLines ?? 0, reviewedLines: r.reviewedLines ?? 0 });
        for (const c of r.claims ?? []) if (c.lineId) claimByLineId.set(String(c.lineId), { reauditId: Number(c.id), reviewed: Boolean(c.reviewed) });
      }
      // PEC-197: the whole KPI row refreshes from the pills endpoint (replaces the
      // old single-card patch — the pill set changed in PEC-198).
      void refreshKpiPills();
      mount!.querySelectorAll<HTMLElement>(".iv-inv-body[data-inv]").forEach((node) => {
        const inv = invByNumber.get(node.dataset.inv || "");
        const det = node.closest("details.iv-inv") as HTMLElement | null;
        if (inv && det) refreshInvoiceTags(det, inv);
      });
      if (filtersReady) applyFilter();
    } catch {}
  }

  /* ---- discrepancy lines (lazy; docs/81 v2 — no dispositions) ---- */
  // v2 classification is binary vs the matched agreement price: over price, No-Price,
  // or UOM mismatch = discrepancy (shown); everything else is valid (hidden).
  const isDiscrepancy = (l: InvLine) =>
    l.uomMismatch || l.negotiatedPrice == null || (l.qty > 0 && l.unitPrice > l.negotiatedPrice);
  const lineCredit = (l: InvLine) => {
    if (l.uomMismatch || l.negotiatedPrice == null || l.qty <= 0 || l.unitPrice <= l.negotiatedPrice) return 0;
    const credit = (l.unitPrice - l.negotiatedPrice) * l.qty;
    // Sub-nickel variance is In Tolerance (matches the claim engine's 0.05 floor) —
    // it gets the reviewed-valid checkbox, never an unclickable "CM $0.00".
    return credit >= 0.05 ? credit : 0;
  };
  function auditCell(inv: Invoice, l: InvLine): string {
    if (l.audited) {
      const meta = [l.auditNote, l.agreementId ? `Agreement #${l.agreementId}${l.agreementCurrent === false ? " (expired " + l.agreementExpiry + ")" : ""}` : "", l.auditedAt].filter(Boolean).join(" · ");
      return `<span class="iv-audited" title="${esc(meta)}">✓ ${esc(l.actorLabel || l.auditedBy || "Passed")}</span>${actorBadge(l.actorKind)}`;
    }
    const credit = lineCredit(l);
    const chip = credit > 0 ? `<span class="pill pill-red" title="Credit memo candidate">CM ${money2(credit)}</span>` : '<span class="pill pill-grey">Review</span>';
    // Human line check-off (Chris 2026-08-05, corrected same day): a checked
    // negotiated-VARIANCE line JOINS the credit-memo claim set (it never accepts the
    // price); claim lines sync the Weekly CM review stamps; only No-Price / UOM lines
    // record a reviewed-valid audit decision.
    const claim = claimByLineId.get(l.lineId);
    let box: string;
    if (claim) {
      box = `<input type="checkbox" class="iv-ln-review" data-review-claim="${claim.reauditId}"${claim.reviewed ? " checked" : ""} title="Mark this claim line reviewed — all claim lines checked activates the CM Approve button" onclick="event.stopPropagation()">`;
    } else if (credit > 0) {
      box = `<input type="checkbox" class="iv-ln-review" data-cm-add="${esc(l.lineId)}" data-inv="${esc(inv.invoiceNumber)}" title="Add this overcharged line to the credit memo request (marks it reviewed)" onclick="event.stopPropagation()">`;
    } else {
      box = `<input type="checkbox" class="iv-ln-review" data-review-ack="${esc(l.lineId)}" data-inv="${esc(inv.invoiceNumber)}" data-item="${esc(l.itemNumber)}" data-kind="${l.uomMismatch ? "uom" : "noprice"}" title="Mark this line reviewed — records your audit decision on this line" onclick="event.stopPropagation()">`;
    }
    return `${chip} ${box}`;
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
  function lineRow(inv: Invoice, l: InvLine, li: number): string {
    // UOM mismatch: the agreement is priced in a different unit than the invoice line,
    // so a variance would be meaningless — surface it for manual review instead (schema 120).
    const negCell = l.uomMismatch
      ? `<span class="pill pill-orange" title="Agreement priced per ${esc(l.negotiatedUom || "?")} but invoiced per ${esc(l.uom)} — review">UOM mismatch</span>`
      : (l.negotiatedPrice == null ? '<span class="pill pill-red">No Price</span>' : `${money2(l.negotiatedPrice)} <span class="pill pill-green">Negotiated</span>`);
    // v2: Var%/$ compare to the matched agreement (negotiated) price ONLY — the
    // benchmark cascade no longer drives classification (docs/81 decision 5).
    // UOM-mismatched lines have no meaningful price comparison → manual review.
    const tolCell = l.uomMismatch
      ? '<span class="pill pill-grey">Review (UOM)</span>'
      : `<span class="pill ${tolCls(l.variancePct)}">${tolLab(l.variancePct)}</span>`;
    const varPctCell = l.uomMismatch || l.variancePct == null ? "—" : pct(l.variancePct);
    const varExtCell = l.uomMismatch || l.varianceExt == null ? "—" : money2(l.varianceExt);
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
        <td class="iv-audit-cell">${auditCell(inv, l)}</td>
      </tr>`;
  }
  // v2 audit view (docs/81 decision 6): show ONLY discrepancy lines — over agreement
  // price, No-Price, or UOM mismatch — grouped into roof-system category sections.
  // Valid lines are hidden entirely; the human's only decision is the credit memo.
  function invoiceBody(inv: Invoice): string {
    const groups = new Map<string, number[]>();
    inv.lines.forEach((l, li) => {
      if (!isDiscrepancy(l)) return;
      const k = l.categoryKey || "uncategorized";
      (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(li);
    });
    const orderedKeys = catList.map((c) => c.key).filter((k) => groups.has(k));
    for (const k of groups.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    const sections = orderedKeys.map((k) => {
      const idxs = groups.get(k)!;
      const lines = idxs.map((li) => inv.lines[li]);
      const subtotal = lines.reduce((s, l) => s + (l.extendedPrice || 0), 0);
      // At-risk = overcharge NOT yet decided — a claim-reviewed (disputed) line is in
      // the CM request, not "at risk" (matches v_invoice_audit_invoice, migration 214).
      const atRisk = lines.reduce((s, l) => s + (!l.audited && l.auditStatus !== "disputed" && (l.varianceExt || 0) > 0 ? l.varianceExt! : 0), 0);
      // PEC-194: decided = passed OR disputed (claim-reviewed). Counting only `audited`
      // left CM-checked lines stuck "to audit" in this header forever.
      const pend = lines.filter((l) => !l.audited && l.auditStatus !== "disputed").length;
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
          <div class="iv-tablewrap"><table class="iv-table">${thead(inv)}<tbody>${idxs.map((li) => lineRow(inv, inv.lines[li], li)).join("")}</tbody></table></div>
        </details>`;
    }).join("");

    const totalCredit = inv.lines.reduce((s, l) => s + lineCredit(l), 0);
    const discCount = inv.lines.filter(isDiscrepancy).length;
    const hasCm = cmByInvoice.has(inv.invoiceNumber);
    const cmLead = discCount
      ? `<div class="iv-disp-lead">Credit memo candidate: <b>${money2(totalCredit)}</b> across ${discCount} discrepancy line(s)${hasCm ? ` — <a href="/accounting/credit-memos/${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener">view credit memo request →</a>` : " — no credit memo request on file yet (created by the audit run)"}.</div>`
      : "";
    return `
      ${cmLead}
      <div class="iv-cats">${sections || '<p class="iv-disp-lead">No discrepancies — every line is within agreement pricing (or no agreement applies → valid as billed).</p>'}</div>`;
  }

  // docs/59 Task 6 — per-invoice "Go back". Confirms, calls the WorkOS-gated reset
  // endpoint, then reloads the invoice from the server so the tree reflects the new
  // (all-pending) state. Append-only on the server; here we just re-fetch the truth.
  async function resetInvoice(inv: Invoice, det: HTMLDetailsElement, btn: HTMLButtonElement) {
    const ok = window.confirm(
      `Reset invoice ${inv.invoiceNumber}?\n\nThis re-pends every decided line, clears the claim-line review checks, cancels the draft/approved (un-sent) credit memo request, and returns the invoice to Audit Pending. Prior decisions stay in history; sent requests and communications are not affected.`,
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
          (r.creditMemosCancelled ? `, ${r.creditMemosCancelled} credit memo request cancelled` : "") +
          (r.reviewsCleared ? `, ${r.reviewsCleared} review check(s) cleared` : "") + ".",
      );
      void loadCreditMemoRequests(); // the CM pill/Approve state changed
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
    // topay drives the branch/office "to be paid" roll-ups — count what Process
    // will actually export (payable), matching the KPI card.
    det.dataset.topay = isPayable(inv) ? "1" : "0";
  }

  let filtersReady = false;
  // Re-render an invoice body WITHOUT losing which category sections are open
  // (Chris 2026-08-05 QA: a 6-line review must not cost 12 clicks).
  function reRenderInvoiceBody(invObj: Invoice) {
    const body = mount!.querySelector(`.iv-inv-body[data-inv="${CSS.escape(invObj.invoiceNumber)}"]`) as HTMLElement | null;
    const det = body?.closest("details.iv-inv") as HTMLDetailsElement | null;
    if (body) {
      const openCats = new Set(
        Array.from(body.querySelectorAll<HTMLDetailsElement>("details.iv-cat")).filter((d) => d.open).map((d) => d.dataset.cat || ""),
      );
      body.innerHTML = invoiceBody(invObj);
      body.querySelectorAll<HTMLDetailsElement>("details.iv-cat").forEach((d) => {
        if (openCats.has(d.dataset.cat || "")) d.open = true;
      });
    }
    if (det) refreshInvoiceTags(det, invObj);
  }

  function syncInvoiceProgressToTree(inv: Invoice) {
    const body = mount!.querySelector(`.iv-inv-body[data-inv="${CSS.escape(inv.invoiceNumber)}"]`) as HTMLElement | null;
    const det = body?.closest("details.iv-inv") as HTMLDetailsElement | null;
    if (det) refreshInvoiceTags(det, inv);
    if (filtersReady) applyFilter();
  }

  // v2 (docs/81): no dispositions, no comms preview — the invoice body is read-only
  // discrepancy detail. Kept as the single post-render hook for future bindings.
  function bindInvoice(_det: HTMLDetailsElement, _inv: Invoice) {}

  // v2 R2: credit-memo pill + the human Approve action (draft -> approved -> weekly email).
  function cmTag(invoiceNumber: string): string {
    const cm = cmByInvoice.get(invoiceNumber);
    if (!cm) return "";
    const amt = money2(cm.expectedCredit);
    if (cm.status === "approved") {
      return `<span class="pill pill-green" title="Approved into this week's credit memo request">CM approved · ${amt}</span>` +
        `<button class="iv-mark" data-cm-approve="${esc(invoiceNumber)}" data-approve="0" title="Remove from this week's email (back to draft)">Un-approve</button>`;
    }
    if (cm.expectedCredit < 0.05) {
      // legacy/zero-credit draft — nothing claimable; no approve action
      return `<span class="pill pill-grey" title="Credit memo request on file with no recoverable credit">CM draft · ${amt}</span>`;
    }
    // Chris 2026-08-05: every claim line must carry a human review acknowledgment
    // (checkboxes on the Weekly Credit Memo Request page) before Approve activates.
    const allReviewed = cm.claimLines > 0 && cm.reviewedLines >= cm.claimLines;
    const reviewBadge = cm.claimLines > 0 ? ` · ${cm.reviewedLines}/${cm.claimLines} reviewed` : "";
    if (!allReviewed) {
      return `<span class="pill pill-orange" title="Credit memo request drafted — review every claim line to activate Approve">CM draft · ${amt}${reviewBadge}</span>` +
        `<button class="iv-mark" disabled title="Greyed until all ${cm.claimLines} claim line(s) are checked as reviewed — use the checkboxes on the discrepancy lines below">Approve</button>`;
    }
    return `<span class="pill pill-orange" title="All claim lines reviewed — approve to add to this week's vendor email">CM draft · ${amt}${reviewBadge}</span>` +
      `<button class="iv-mark" data-cm-approve="${esc(invoiceNumber)}" data-approve="1" title="Approve into this week's credit memo request email">Approve</button>`;
  }

  /* ---- tree render ---- */
  function invoiceTags(inv: Invoice): string {
    refreshToBePaid(inv);
    return [
      inv.pendingLines > 0 ? `<span class="pill pill-brand">${inv.pendingLines}/${inv.lineCount} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      inv.isCreditMemo ? '<span class="pill pill-grey">Credit Memo</span>' : "",
      inv.paid ? `<span class="pill pill-green" title="Paid ${esc(inv.paidAt)}">Paid</span>` : '<span class="pill pill-yellow">Open</span>',
      inv.worstPct > 0.01 ? `<span class="pill ${worstCls(inv.worstPct)}">${inv.worstPct.toFixed(1)}% worst</span>` : "",
      inv.atRisk > 0 ? `<span class="pill pill-red">${money(inv.atRisk)} at risk</span>` : "",
      inv.namingStatus === "po_mismatch" ? `<span class="pill pill-yellow" title="Canonical PO ${esc(inv.canonicalPo || "")}">PO mismatch</span>` : "",
      inv.namingStatus === "needs_link" || inv.needsAcculynxLink ? '<span class="pill pill-red">Needs AccuLynx link</span>' : "",
      inv.namingStatus === "temp_job" ? '<span class="pill pill-grey">TEMP job</span>' : "",
      cmTag(inv.invoiceNumber),
    ].filter(Boolean).join("");
  }
  function invoiceNode(inv: Invoice, hasPriceList: boolean): string {
    // Purple callout: PO is shown for every invoice that has one (169/172); client name + job
    // type are appended when the PO matches an AccuLynx job (v_invoice_acculynx_match).
    // The job number usually equals the PO (that's how they matched), so show it only when it differs.
    const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const calloutBits = [
      inv.po ? "PO " + esc(inv.po) : "",
      inv.canonicalPo && norm(inv.canonicalPo) !== norm(inv.po) ? "should be " + esc(inv.canonicalPo) : "",
      inv.jobNumber ? esc(inv.jobNumber) : "",
      inv.clientName ? esc(inv.clientName) : "",
      inv.jobCategory ? esc(inv.jobCategory) : "",
    ].filter(Boolean);
    const job = calloutBits.length ? ` · <span class="iv-job">${calloutBits.join(" · ")}</span>` : "";
    // Invoice PDF: always an active link — the endpoint fetches it on demand from ABC
    // and stores it if no PDF is on file yet (so every invoice resolves to a document).
    const invoiceBtn = `<a class="iv-rowbtn" href="/api/invoice-audit/pdf/${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📄 Invoice</a>`;
    // Price List: canonical vendor-scoped URL (PEC-193) — office rides along so the
    // target resolves the same (vendor, office) agreement set this gate checked.
    // No data → greyed with tooltip, pointer events kept alive (Chris 2026-08-09).
    const priceListBtn = hasPriceList
      ? `<a class="iv-rowbtn" href="${priceListUrl({ branch: inv.branchCode, vendor: inv.vendor || "abc-supply", invoice: inv.invoiceNumber, office: inv.office })}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📋 Price List</a>`
      : `<span class="iv-rowbtn is-disabled" aria-disabled="true" title="No data available — report empty" onclick="event.stopPropagation()">📋 Price List</span>`;
    // "Go back" reset (docs/59 Task 6 + 2026-06-28 polish): re-pend every line, reverse
    // not-to-be-paid holds, cancel any draft credit memo. Shown on ANY invoice that is open
    // (not paid) and not yet exported AND has had audit work — human OR agent, credit memos
    // included. cc.proexteriorsus.net is where a human fixes agent work, so the option must be
    // universal for open+unpaid worked invoices. Hidden only on paid/exported (server refuses those).
    const resetBtn = (!inv.paid && !inv.awaitingPayment && inv.hasWork === true)
      ? `<button type="button" class="iv-rowbtn iv-reset" data-reset="${esc(inv.invoiceNumber)}" title="Reset: re-pend all lines, clear claim-line review checks, and cancel the un-sent credit memo request (sent requests and communications are not affected)" onclick="event.stopPropagation()">↩ Go back</button>`
      : "";
    return `
      <details class="iv-inv" data-search="${esc(inv.searchText || (inv.invoiceNumber + " " + inv.po + " " + inv.lines.map((l) => l.itemNumber + " " + l.itemDescription).join(" ")).toLowerCase())}" data-worst="${inv.worstPct}" data-noprice="${inv.noPriceLines}" data-pending="${inv.pendingLines}" data-audited="${inv.auditedLines}" data-auditable="${inv.auditedLines + inv.pendingLines}" data-atrisk="${inv.atRisk}" data-paid="${inv.paid ? "1" : "0"}" data-cm="${inv.isCreditMemo ? "1" : "0"}" data-date="${esc(inv.invoiceDate)}" data-actionable="${inv.actionable ? "1" : "0"}" data-duenow="${inv.dueNow ? "1" : "0"}" data-topay="${(refreshToBePaid(inv) && isPayable(inv)) ? "1" : "0"}">
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
      r.pending ? `<span class="pill pill-brand">${r.pending} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      r.atRisk > 0 ? `<span class="pill pill-red">${money(r.atRisk)} at risk</span>` : "",
      r.noPrice ? `<span class="pill pill-yellow">${r.noPrice} no-price</span>` : "",
    ].filter(Boolean).join("");
  }
  function officeMini(r: Roll): string {
    return [
      `<div><strong>${r.pending}</strong><span>To Audit</span></div>`,
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
    // PEC-215 guard: never request detail for a blank invoice number. A CSV
    // totals row ingested as an invoice used to reach this surface and fire
    // /api/invoice-audit/invoice?invoiceNumber= → 404 on every page load. The
    // row is quarantined (mig 232) and the ingest now fails closed, but keep
    // the client honest so a malformed row can never re-emit that 404.
    if (!String(inv.invoiceNumber ?? "").trim()) return false;
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

  // Approve / Un-approve clicks (delegated — tags re-render often)
  mount.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement)?.closest?.("[data-cm-approve]") as HTMLButtonElement | null;
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const invoiceNumber = btn.dataset.cmApprove || "";
    const approve = btn.dataset.approve === "1";
    btn.disabled = true;
    const { ok, data } = await postJson("/api/credit-memos/approve", { invoiceNumber, approve });
    if (!ok) { toast((approve ? "Approve" : "Un-approve") + " failed: " + (data?.error_description || data?.error || "error")); btn.disabled = false; return; }
    const cm = cmByInvoice.get(invoiceNumber);
    if (cm) cm.status = data.status;
    const body = mount.querySelector(`.iv-inv-body[data-inv="${CSS.escape(invoiceNumber)}"]`);
    const det = body?.closest("details.iv-inv") as HTMLElement | null;
    const inv = invByNumber.get(invoiceNumber);
    if (det && inv) refreshInvoiceTags(det, inv);
    await loadCreditMemoRequests(); // flips the Credit Memo Requested KPI card (N approved)
    toast(approve ? `${invoiceNumber} approved into this week's credit memo request` : `${invoiceNumber} returned to draft`);
  });
  void loadCreditMemoRequests();

  // Per-line review check-off (delegated — line tables re-render on expand).
  // Claim lines toggle the same invoice_line_reaudit stamp as the Weekly CM page;
  // non-claim discrepancy lines (No-Price / UOM / variance without a CM) record a
  // human 'valid' classification via the v2 classify endpoint (one-way).
  mount.addEventListener("change", async (ev) => {
    const box = ev.target as HTMLInputElement | null;
    if (!box?.classList?.contains("iv-ln-review")) return;
    ev.stopPropagation();
    box.disabled = true;

    if (box.dataset.reviewClaim) {
      const reauditId = Number(box.dataset.reviewClaim);
      const { ok, data } = await postJson("/api/credit-memos/review-line", { lineId: reauditId, reviewed: box.checked });
      if (!ok) { toast("Review failed: " + (data?.error_description || data?.error || "error")); box.checked = !box.checked; box.disabled = false; return; }
      const claimLineId = [...claimByLineId.keys()].find((k) => claimByLineId.get(k)?.reauditId === reauditId) || "";
      const claim = claimByLineId.get(claimLineId);
      if (claim) claim.reviewed = box.checked;
      // Reviewing IS the line's audit decision — drop/restore it in the to-audit counts.
      // PEC-194: re-render the body (open sections preserved) so the category header's
      // "N to audit" pill and bar move too, then re-roll the branch/office pills.
      const claimInv = invByNumber.get((data as any)?.invoiceNumber || "");
      const claimLine = claimInv?.lines.find((l) => l.lineId === claimLineId);
      if (claimInv && claimLine) {
        claimLine.auditStatus = box.checked ? "disputed" : "pending";
        claimInv.pendingLines = Math.max(0, claimInv.pendingLines + (box.checked ? -1 : 1));
        reRenderInvoiceBody(claimInv);
        if (filtersReady) applyFilter();
      }
      box.disabled = false;
      await loadCreditMemoRequests(); // r/N + Approve gating changed
      return;
    }

    if (box.dataset.cmAdd) {
      // Corrected semantics (Chris 2026-08-05): checking a negotiated-variance line
      // ADDS it to the invoice's credit-memo claim set and stamps it reviewed.
      const invoiceNumber = box.dataset.inv || "";
      if (!box.checked) { box.disabled = false; return; }
      const { ok, data } = await postJson("/api/credit-memos/add-line", { invoiceNumber, lineId: box.dataset.cmAdd });
      if (!ok) { toast("Add to credit memo failed: " + (data?.error_description || data?.error || "error")); box.checked = false; box.disabled = false; return; }
      await loadCreditMemoRequests(); // claim set + totals changed
      const invObj = invByNumber.get(invoiceNumber);
      if (invObj) {
        const addedLine = invObj.lines.find((l) => l.lineId === box.dataset.cmAdd);
        if (addedLine) {
          addedLine.auditStatus = "disputed";
          invObj.pendingLines = Math.max(0, invObj.pendingLines - 1);
        }
        reRenderInvoiceBody(invObj); // checkbox re-renders as a checked claim box; open sections preserved
      }
      toast(`Line added to credit memo — ${invoiceNumber} now claims ${money2(data.expectedCredit)} across ${data.lineCount} line(s)`);
      return;
    }

    const lineId = box.dataset.reviewAck || "";
    const invoiceNumber = box.dataset.inv || "";
    if (!box.checked || !lineId || !invoiceNumber) { box.disabled = false; return; }
    const kind = box.dataset.kind || "var";
    const note =
      kind === "uom" ? "Reviewed — UOM mismatch acknowledged by operator"
      : kind === "noprice" ? "Reviewed — no agreement price (valid per docs/81)"
      : "Reviewed — variance accepted by operator";
    const { ok, data } = await postJson("/api/invoice-audit/classify", {
      invoiceNumber,
      lines: [{ invoiceLineId: lineId, itemNumber: box.dataset.item || null, classification: "valid", note }],
    });
    if (!ok) { toast("Review failed: " + (data?.error_description || data?.error || "error")); box.checked = false; box.disabled = false; return; }
    const invObj = invByNumber.get(invoiceNumber);
    const line = invObj?.lines.find((l) => l.lineId === lineId);
    if (invObj && line) {
      line.audited = true;
      line.auditedBy = "You";
      line.actorLabel = "You";
      line.actorKind = "human";
      line.auditNote = note;
      invObj.pendingLines = Math.max(0, invObj.pendingLines - 1);
      if ((line.varianceExt || 0) > 0) invObj.atRisk = Math.max(0, invObj.atRisk - (line.varianceExt || 0));
      reRenderInvoiceBody(invObj); // open sections preserved
      if (filtersReady) applyFilter();
    }
    void refreshKpiPills(); // PEC-197
    toast(`Line marked reviewed (${invoiceNumber})`);
  });

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  const tolSel = document.getElementById("iv-tol") as HTMLSelectElement;
  const date1El = document.getElementById("iv-date1") as HTMLInputElement | null;
  const date2El = document.getElementById("iv-date2") as HTMLInputElement | null;
  const showAllBox = document.getElementById("iv-showall") as HTMLInputElement | null;
  const pendingBox = document.getElementById("iv-pending") as HTMLInputElement;
  const dueNowBox = document.getElementById("iv-duenow") as HTMLInputElement | null;
  // Default scope = the processing set (all open, unpaid, non-CM — every age; docs/63).
  // "Show all" escapes it: reveals paid / recent / credit-memo invoices and lifts the
  // date inputs' cap. "Due now" narrows to invoices whose payment is due (invoice_date+60d).
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
    const dueNowOnly = !!dueNowBox?.checked;
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
          const dueNow = iEl.dataset.duenow === "1";
          const tolOk = !tol ? true : tol === "noprice" ? noprice > 0 : worst >= parseFloat(tol);
          // Scope: default = the processing set (all open, non-CM, every age; docs/63);
          // "Show all" lifts it. The date range narrows within whichever scope is active.
          const scopeOk = showAll ? true : actionable;
          const dateOk = (!date1 || invDate >= date1) && (!date2 || invDate <= date2);
          const pendOk = !pendingOnly || pending > 0;
          const dueOk = !dueNowOnly || dueNow; // "Due now" = invoice_date + 60d ≤ today
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && tolOk && scopeOk && dateOk && pendOk && dueOk && qOk;
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
  [search, officeSel, tolSel, date1El, date2El, pendingBox, dueNowBox].forEach((el) => el?.addEventListener("input", applyFilter));
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
    else if (wantBranch && search) {
      // Branch not in the tree (e.g. an SRS/QXO branch before Phase 5 ingestion): scope
      // the search box to it so the page honestly shows the empty result instead of
      // silently rendering unfiltered.
      search.value = decodeURIComponent(wantBranch);
      applyFilter();
    }
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
  // v2 Process (docs/81 decision 9): pure status stamp — every Invoice Audit Pending
  // invoice flips to Invoice Audit Complete with a completion date. No export.
  const processBtn = document.getElementById("iv-process") as HTMLButtonElement | null;
  processBtn?.addEventListener("click", async () => {
    const count = parseInt(processBtn.dataset.count || "0", 10);
    if (!count) return;
    if (!window.confirm(`Stamp ${count} audited invoice(s) INVOICE AUDIT COMPLETE with today's date?\n\nThis records completion only — no files are exported and payment is unaffected.`)) return;
    processBtn.disabled = true;
    const { ok, data } = await postJson("/api/invoice-audit/process-stamp");
    if (!ok) { toast("Process failed: " + (data?.error_description || data?.error || "error")); processBtn.disabled = false; return; }
    toast(`Stamped ${data.stamped} invoice(s) Invoice Audit Complete`);
    window.setTimeout(() => window.location.reload(), 1400);
  });

  // v2 Manage (docs/81 §2): the Awaiting Payment pill is gone. Manage lists every
  // invoice in Paid-pending verification (60+ days past invoice date, swept server-side)
  // with a one-click Paid-Verified toggle. Invoice-level only — no line detail.
  const payBtn = document.getElementById("iv-payments");
  let payDirty = false;
  function closePay(overlay: HTMLElement) { overlay.remove(); if (payDirty) window.location.reload(); }
  async function renderPay(body: HTMLElement) {
    body.innerHTML = '<p class="iv-pay-empty">Loading…</p>';
    const res = await fetch("/api/invoice-audit/pending-verification", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const invoices: any[] = res?.invoices ?? [];
    const parts: string[] = [];
    parts.push('<p class="iv-msg-muted">Invoices exported for payment whose invoice date is 60+ days old. Confirm each one actually paid — one click marks it <b>Paid-Verified</b>.</p>');
    if (res?.swept) parts.push(`<p class="iv-msg-muted">${res.swept} invoice(s) newly moved to Paid-pending verification by the 60-day sweep.</p>`);
    if (!invoices.length) parts.push('<p class="iv-pay-empty">Nothing pending verification.</p>');
    for (const inv of invoices) {
      parts.push(
        `<div class="iv-pay-batch"><div class="iv-pay-row"><strong>${esc(inv.invoiceNumber)}</strong>` +
        `<span class="iv-msg-muted">${esc(inv.invoiceDate || "")} · ${esc(inv.vendor || "")} · ${fmtMoney(inv.totalDue)}${inv.fileName ? " · " + esc(inv.fileName) : ""}</span>` +
        `<span class="iv-spacer"></span>` +
        `<button class="is-paid" data-verify="${esc(inv.invoiceNumber)}">Mark Paid-Verified</button></div></div>`,
      );
    }
    body.innerHTML = parts.join("");
    body.querySelectorAll<HTMLButtonElement>("[data-verify]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const { ok, data } = await postJson("/api/invoice-audit/verify-paid", { invoiceNumber: btn.dataset.verify });
        if (!ok) { toast("Verify failed: " + (data?.error_description || data?.error || "error")); btn.disabled = false; return; }
        payDirty = true;
        const row = btn.closest(".iv-pay-batch");
        if (row) row.remove();
        void refreshKpiPills(); // PEC-197
        toast(`${data.invoiceNumber} marked Paid-Verified`);
        if (!body.querySelector("[data-verify]")) body.insertAdjacentHTML("beforeend", '<p class="iv-pay-empty">Nothing pending verification.</p>');
      }));
  }
  payBtn?.addEventListener("click", () => {
    payDirty = false;
    const overlay = document.createElement("div");
    overlay.className = "iv-modal";
    // Self-styled + attached inside `.iv` so the theme CSS variables resolve and
    // the modal is readable regardless of stylesheet scoping.
    overlay.style.cssText = "position:fixed;inset:0;z-index:120;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;background:rgba(11,17,25,.55);overflow:auto";
    overlay.innerHTML = `<div class="iv-modal-card" style="background:var(--panel,#fff);color:var(--ink,#1c2733);border:1px solid var(--line,#e3e8ef);max-width:780px;width:100%;max-height:85vh;overflow:auto;border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4)"><div class="iv-modal-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong>Payment Verification</strong><button class="iv-modal-close" aria-label="Close" style="cursor:pointer;background:transparent;border:1px solid var(--line,#e3e8ef);border-radius:8px;padding:2px 9px;font-size:18px;line-height:1;color:inherit">×</button></div><div class="iv-pay-body"></div></div>`;
    (root || document.body).appendChild(overlay);
    const panelBody = overlay.querySelector(".iv-pay-body") as HTMLElement;
    overlay.querySelector(".iv-modal-close")?.addEventListener("click", () => closePay(overlay));
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) closePay(overlay); });
    renderPay(panelBody);
  });

  // Deep-link support for outbound Slack/email links (manageDeepLink()): a URL
  // hash of #manage or #manage-<batchId> opens the Manage panel on load, so a
  // recipient who clicks a weekly-package link lands straight on the payments
  // panel (after WorkOS login if needed) instead of a JSON 401 from a raw API.
  function openManageFromHash() {
    // Legacy #manage-<batchId> links still open the panel; the batch id itself is ignored.
    const m = /^#manage(?:-(.+))?$/.exec(window.location.hash);
    if (!m || !payBtn) return;
    payBtn.click();
  }
  openManageFromHash();
  window.addEventListener("hashchange", openManageFromHash);

  /* ---- PEC-197/198 wiring ---- */
  // Due Now — Pay pill: the Filter button toggles the toolbar's Due-now scope.
  document.getElementById("iv-kpi-duenow")?.addEventListener("click", () => {
    if (!dueNowBox) return;
    dueNowBox.checked = !dueNowBox.checked;
    applyFilter();
  });
  // Gentle multi-user freshness: re-pull the pill numbers every 60s while visible.
  window.setInterval(() => { if (!document.hidden) void refreshKpiPills(); }, 60_000);
}
