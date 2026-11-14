#!/usr/bin/env python3
"""Build the CenterPoint mockups for three existing Command Center screens.

Each mockup starts from the real screen as rendered by the local dev server and
changes only what the CenterPoint merge would change. Nothing here is product code.

    python3 build.py <build_dir> <out_dir> <public_dir> <inter_files_dir>

build_dir holds inputs that are NOT committed, because the captures carry customer
names from the live AccuLynx board:
    dom/friday-wip.html, dom/cash-flow.html, dom/pipeline.html   rendered pages
    cpdata.json                                                   figures from mv_work_job_money
    funnel.json                                                   the stage chart's data

The script removes every AccuLynx job row, every script tag and the rep lists
before it writes anything, and replaces every CenterPoint company name with a
numbered alias, so the output holds no customer names.
Run with `python3 -I`.
"""
from __future__ import annotations

import copy
import json
import pathlib
import re
import shutil
import sys

import lxml.html as H

BUILD, OUT, PUBLIC, FONTS = (pathlib.Path(p) for p in sys.argv[1:5])
CP = json.loads((BUILD / "cpdata.json").read_text())
FUNNEL = json.loads((BUILD / "funnel.json").read_text())

GROUP_KEY = "commercial_service"
PAGES = {"/accounting/friday-wip": "friday-wip.html",
         "/accounting/cash-flow": "cash-flow.html",
         "/executive/pipeline": "pipeline.html",
         "/executive/cash-runway": "#"}

OPEN = CP["open_jobs"]

# Customer names never reach the output. Each company becomes "Commercial customer NN",
# numbered by its open balance, so one customer reads the same on every screen.
_ALIAS: dict = {}
for _j in OPEN:
    _real = _j["company_name"] or ""
    if _real not in _ALIAS:
        _ALIAS[_real] = f"Commercial customer {len(_ALIAS) + 1:02d}"
    _j["company_name"] = _ALIAS[_real]
REAL_NAMES = [n for n in _ALIAS if n]
CP_OPEN_TOTAL = sum(float(j["outstanding"]) for j in OPEN)
CP_OPEN_BILLED = sum(float(j["billed"]) for j in OPEN)
CP_OPEN_COLLECTED = sum(float(j["collected"]) for j in OPEN)
STAGE = {(s["book"], s["display_status"]): s for s in CP["stage"]}
RECON = CP["recon"]
RECON_ALL = sum(v for k, v in RECON.items() if k != "match")
RECON_OPEN = sum(1 for j in OPEN if j.get("recon_status") not in (None, "match"))


def money(v: float, dash_zero: bool = False) -> str:
    v = float(v or 0)
    if dash_zero and abs(v) < 0.5:
        return "—"
    s = f"${abs(v):,.0f}"
    return f"({s})" if v < -0.5 else s


def short_money(v: float) -> str:
    v = float(v or 0)
    if v >= 1_000_000:
        return f"${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"${v / 1_000:.0f}K"
    return f"${v:.0f}"


def parse_money(s: str) -> float:
    s = s.strip()
    neg = s.startswith("(") or s.startswith("-")
    n = re.sub(r"[^0-9.]", "", s)
    return (-1 if neg else 1) * float(n or 0)


def el(html: str):
    return H.fragment_fromstring(html)


def cls(e, name: str) -> list:
    return e.xpath(f".//*[contains(concat(' ', normalize-space(@class), ' '), ' {name} ')]")


def mark(e, note: str):
    e.set("data-mock-new", note)
    return e


ANNOTATION = """
<style id="mock-annotation">
  /* Mockup-only review aid. Not part of the design; not for the build. */
  body.mock-notes [data-mock-new] { outline: 2px dashed #b45309; outline-offset: 2px; }
  body.mock-notes tr[data-mock-new] > td:first-child { box-shadow: inset 3px 0 0 #b45309; }
  .mock-legend { position: fixed; right: 16px; bottom: 16px; z-index: 99999; display: flex; gap: 8px;
    align-items: center; padding: 8px 12px; border-radius: 8px; border: 1px solid #b45309;
    background: #fffbeb; color: #1f2937; font: 600 13px/1.3 Inter, system-ui, sans-serif; }
  .mock-legend button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid #1f2937;
    background: #fff; color: #1f2937; cursor: pointer; }
  .mock-legend a { color: #1d4ed8; text-decoration: underline; }
  .mock-omitted { padding: 14px 16px; font-style: italic; opacity: .75; text-align: left; }
  @media (max-width: 760px) { .mock-legend { left: 8px; right: 8px; bottom: 8px; flex-wrap: wrap; } }
</style>
"""

LEGEND = """
<div class="mock-legend" role="note">
  <span>Mockup · <span id="mock-count"></span> changes outlined</span>
  <button type="button" id="mock-toggle" aria-pressed="true">Hide outlines</button>
  <a href="index.html">All screens</a>
</div>
<script>
  (function () {
    var b = document.getElementById('mock-toggle');
    document.getElementById('mock-count').textContent = document.querySelectorAll('[data-mock-new]').length;
    b.addEventListener('click', function () {
      var on = document.body.classList.toggle('mock-notes');
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'Hide outlines' : 'Show outlines';
    });
  })();
</script>
"""


def load(name: str):
    return H.fromstring((BUILD / "dom" / f"{name}.html").read_text())


def clean(doc):
    """Make the capture a static, self-contained page with no customer data."""
    for e in doc.xpath("//script | //astro-dev-toolbar | //vite-error-overlay | //link[@rel='modulepreload']"):
        e.getparent().remove(e)
    for s in doc.xpath("//style"):
        if s.text:
            s.text = s.text.replace("/node_modules/@fontsource/inter/files/", "assets/fonts/")
    for img in doc.xpath("//img[starts-with(@src, '/')]"):
        name = img.get("src").split("/")[-1].split("?")[0]
        img.set("src", f"assets/{name}")
    for link in doc.xpath("//link[starts-with(@href, '/')]"):
        link.getparent().remove(link)
    for a in doc.xpath("//a[starts-with(@href, '/')]"):
        a.set("href", PAGES.get(a.get("href").split("?")[0], "#"))
    # Rep lists are staff names tied to sales figures. The filter stays; its options go.
    for sel in doc.xpath("//select[@id='fw-rep' or @name='rep']"):
        for o in sel.xpath("./option")[1:]:
            sel.remove(o)
    # Any attribute that carries a serialized data payload goes too.
    for e in doc.xpath("//*[@data-chart-data]"):
        del e.attrib["data-chart-data"]
    return doc


def finish(doc, name: str):
    body = doc.xpath("//body")[0]
    body.set("class", ((body.get("class") or "") + " mock-notes").strip())
    doc.xpath("//head")[0].append(H.fragment_fromstring(ANNOTATION.strip()))
    for frag in H.fragments_fromstring(LEGEND.strip()):
        body.append(frag)
    html = H.tostring(doc, encoding="unicode", doctype="<!DOCTYPE html>")
    assert "data-chart-data" not in html
    leaked = [n for n in REAL_NAMES if n in html]
    assert not leaked, f"{len(leaked)} customer names in {name}"
    (OUT / name).write_text(html)
    print(f"wrote {name}: {len(html):,} bytes, {html.count('data-mock-new')} marked changes")


# ── Friday WIP/AR ────────────────────────────────────────────────────────────────

def days_chip(days: int) -> str:
    hue = max(0, round(120 * (1 - min(days, 365) / 365)))
    return (f'<span class="fw-days-chip" style="background:hsl({hue} 72% 38%);color:#fff" '
            f'title="Days since the oldest unpaid invoice">{days}d</span>')


def friday_row(j: dict, hidden: bool) -> str:
    name = (j["company_name"] or "").replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    differs = j.get("recon_status") not in (None, "match")
    note = " · QuickBooks differs" if differs else ""
    kpi = "totalBalance billedAr criticalArTier1 arBalance billedArNoDate" + (" qboMismatch" if differs else "")
    out = float(j["outstanding"])
    return f"""<tr data-job="centerpoint:{j['number']}" data-rep="" data-kpi="{kpi}" data-population="ar" data-location="{GROUP_KEY}" data-attention="{'qbo_mismatch' if differs else ''}" data-billed-ar="{out:.2f}"{' hidden=""' if hidden else ''}>
 <td><a href="#" title="Opens this job in CenterPoint">{j['number']}</a></td>
 <td class="fw-client"><span title="{name}">{name}</span></td>
 <td class="fw-bucket" title="CenterPoint: {j['display_status']}{note}"><strong>{j['display_status']}</strong></td>
 <td class="fw-rep" title="CenterPoint jobs carry no rep yet">—</td>
 <td class="fw-days">{days_chip(int(j['days_open'] or 0))}</td>
 <td class="fw-action fw-action-collect" title="COLLECT">COLLECT</td>
 <td class="fw-num" data-col="money" title="CenterPoint ticket price">{money(j['price'], dash_zero=True)}</td>
 <td class="fw-num" data-col="money" data-more="" title="Σ non-draft CenterPoint invoices">{money(j['billed'])}</td>
 <td class="fw-num" data-col="money" data-more="" title="Payments received in CenterPoint">{money(j['collected'])}</td>
 <td class="fw-num" data-col="money" data-more="" title="Cost on the CenterPoint invoice, not QuickBooks bills">{money(j['invoice_cost'], dash_zero=True)}</td>
 <td class="fw-num" data-col="money" data-more="" title="No budget exists for a CenterPoint ticket">—</td>
 <td class="fw-num" data-col="money">{money(out)}</td>
 <td data-col="cash" data-more=""><input class="fw-edit fw-date" type="date" data-field="expected_invoice_cash_date" value=""></td>
 <td data-col="cash"><input class="fw-edit fw-money-edit" type="text" inputmode="numeric" autocomplete="off" data-field="expected_cash_amount" value="" placeholder="$"></td>
 <td data-col="cash" data-more=""><input class="fw-edit fw-date" type="date" data-field="expected_paid_full_date" value=""></td>
 <td class="fw-num fw-balance-pay" data-col="cash" title="Balance Due {money(out)} − To Collect $0">{money(out)}</td>
 <td data-col="cash" data-more=""><input class="fw-edit fw-notes" type="text" maxlength="1000" data-field="notes" value="" placeholder="…"></td>
</tr>"""


def build_friday(columns_open: bool, name: str):
    doc = clean(load("friday-wip"))
    main = doc.xpath("//main")[0]
    groups = main.xpath(".//details[contains(@class,'fw-group')]")
    ncols = 17

    for g in groups:
        g.attrib.pop("open", None)
        tb = g.xpath(".//tbody")[0]
        for r in list(tb):
            tb.remove(r)
        tb.append(el(f'<tr><td class="mock-omitted" colspan="{ncols}">AccuLynx jobs are unchanged and are left out of this mockup.</td></tr>'))
        for b in cls(g, "fw-showmore"):
            b.getparent().remove(b)

    # The new group, in the board's own markup.
    new = copy.deepcopy(groups[0])
    new.set("open", "")
    mark(new, "New office group fed by CenterPoint")
    cls(new, "fw-group-name")[0].text = f"▾ {GROUP_KEY}"
    cls(new, "fw-group-count")[0].text = f"{len(OPEN)} jobs · CenterPoint"
    cls(new, "fw-group-money")[0].text = (
        f"billed {money(CP_OPEN_TOTAL)} · unbilled $0 · total {money(CP_OPEN_TOTAL)}")
    # The office margin control estimates expenses left on a budget. A CenterPoint
    # ticket has no budget, so the control does not appear on this group.
    for gm in cls(new, "fw-gm"):
        gm.getparent().remove(gm)
    tb = new.xpath(".//tbody")[0]
    for r in list(tb):
        tb.remove(r)
    for i, j in enumerate(OPEN):
        tb.append(el(friday_row(j, hidden=i >= 10)))
    wrap = cls(new, "fw-tablewrap")[0]
    more = el(f'<button type="button" class="fw-showmore">Show all {len(OPEN)} jobs  ▾  ({len(OPEN) - 10} more)</button>')
    wrap.addnext(more)

    # Money trees sort by money (ds N-08): place the group by its total.
    def total(g):
        return parse_money(cls(g, "fw-group-money")[0].text_content().split("total")[-1])
    placed = False
    for g in groups:
        if total(g) < CP_OPEN_TOTAL:
            g.addprevious(new)
            placed = True
            break
    if not placed:
        groups[-1].addnext(new)

    # Office filter: the new group is one more office.
    office = main.xpath(".//select[@id='fw-office']")[0]
    office.append(mark(el(f'<option value="{GROUP_KEY}">{GROUP_KEY}</option>'), "New office filter value"))

    # KPIs that the new receivables move.
    kpis = {k.get("data-kpi"): k for k in cls(main, "fw-kpis")[0]}

    def bump(key, add, sub_extra, jobs_from=None):
        k = kpis[key]
        v = cls(k, "fw-kpi-val")[0]
        v.text = money(parse_money(v.text) + add)
        s = cls(k, "fw-kpi-sub")[0]
        base = s.text_content().strip()
        if jobs_from:
            n = int(re.search(r"(\d+) jobs", base).group(1)) + jobs_from
            base = re.sub(r"\d+ jobs", f"{n} jobs", base)
        s.text = f"{base} · {sub_extra}"
        mark(k, "Total now includes CenterPoint receivables")

    inc = f"incl. {money(CP_OPEN_TOTAL)} commercial service"
    bump("billedAr", CP_OPEN_TOTAL, inc)
    bump("totalBalance", CP_OPEN_TOTAL, inc, jobs_from=len(OPEN))
    bump("criticalArTier1", CP_OPEN_TOTAL, inc)

    warn = el(
        '<button type="button" class="fw-kpi fw-kpi-warn" data-kpi="qboMismatch" aria-pressed="false">'
        '<span class="fw-kpi-lab">CenterPoint ≠ QuickBooks</span>'
        f'<span class="fw-kpi-val">{RECON_OPEN}</span>'
        f'<span class="fw-kpi-sub">open jobs where the two disagree · {RECON_ALL} job numbers in all</span></button>')
    kpis["contradiction"].addnext(mark(warn, "New work-queue pill: jobs where CenterPoint and QuickBooks disagree"))

    # Cash map: undated grows, dated share falls.
    weeks = {w.get("data-kpi"): w for w in cls(main, "fw-cashmap-cells")[0] if w.get("data-kpi")}
    dated = sum(parse_money(cls(weeks[k], "fw-week-val")[0].text) for k in ("week1", "week2", "week3", "beyond"))
    und = cls(weeks["billedArNoDate"], "fw-week-val")[0]
    und_new = parse_money(und.text) + CP_OPEN_TOTAL
    und.text = money(und_new)
    mark(weeks["billedArNoDate"], "Undated now includes every CenterPoint receivable until the meeting dates it")
    share = cls(main, "fw-week-static")[0]
    cls(share, "fw-week-val")[0].text = f"{round(100 * dated / (dated + und_new))}%"
    mark(share, "Dated share recalculated")

    foot = cls(main, "fw-foot")[0]
    foot.append(mark(el(
        f'<span> CenterPoint pull daily 19:45 CT, projected hourly: the {GROUP_KEY} group lists commercial '
        'and service jobs with an unpaid invoice. Its Rep and Est Exp Outstanding columns are blank until '
        'CenterPoint supplies them.</span>'), "Feed note for the new source"))

    # CenterPoint job numbers are 10 characters (CP-25-1449); the Job # column is
    # 72px today and clips them. The column grows to 96px on every group (ds T-08).
    doc.xpath("//head")[0].append(H.fragment_fromstring(
        '<style id="mock-change-jobcol">'
        '.fw .fw-table thead tr:not(.fw-grouprow) th:nth-child(1), .fw .fw-table tbody td:nth-child(1)'
        '{ width: 96px; min-width: 96px; max-width: 96px; }'
        '.fw .fw-table thead tr:not(.fw-grouprow) th:nth-child(2), .fw .fw-table tbody td:nth-child(2)'
        '{ left: 96px; }</style>'))
    for th in new.xpath(".//thead/tr[not(contains(@class,'fw-grouprow'))]/th[1]"):
        mark(th, "Job # column widens from 72px to 96px so CenterPoint numbers fit")

    if columns_open:
        fw = cls(doc, "fw")[0] if "fw" not in (main.get("class") or "").split() else main
        fw.set("data-money", "open")
        fw.set("data-cash", "open")
        for th in doc.xpath("//th[@data-colgroup-toggle]"):
            th.set("aria-expanded", "true")
            th.set("colspan", "6" if th.get("data-colgroup-toggle") == "money" else "5")
            for c in cls(th, "fw-gh-chev"):
                c.text = "▾"
    finish(doc, name)


# ── 13-week cash flow ────────────────────────────────────────────────────────────

def build_cash_flow():
    doc = clean(load("cash-flow"))
    main = doc.xpath("//main")[0]

    def row(label):
        for tr in main.xpath(".//tr"):
            if tr[0].text_content().strip().startswith(label):
                return tr
        raise KeyError(label)

    def nums(tr):
        return [parse_money(td.text_content()) for td in tr[1:]]

    def write(tr, vals, fmt=money, note=None):
        for td, v in zip(tr[1:], vals):
            td.text = fmt(v)
            c = [x for x in (td.get("class") or "").split() if x != "cfx-neg"]
            if isinstance(v, (int, float)) and v < -0.5:
                c.append("cfx-neg")
            td.set("class", " ".join(c))
        if note:
            mark(tr, note)

    kpis = {cls(k, "cfx-kpi-lab")[0].text_content().strip().lower(): k for k in cls(main, "cfx-kpi")}
    ar = kpis["ar dated by value"]
    sub = cls(ar, "cfx-kpi-sub")[0].text_content()
    undated_total = parse_money(re.search(r"\$[\d,]+", sub).group(0))
    undated_jobs = int(re.search(r"across (\d+) jobs", sub).group(1))
    spend = parse_money(re.search(r"\(\$([\d,]+)/wk\)", main.text_content()).group(1))
    cash_today = parse_money(cls(kpis["cash today"], "cfx-kpi-val")[0].text)

    pool = row("Undated pool")
    p = nums(pool)
    ratio = CP_OPEN_TOTAL / undated_total
    c = [round(x * ratio) for x in p]
    cum = [sum(c[: i + 1]) for i in range(len(c))]

    write(pool, [a + b for a, b in zip(p, c)], note="Undated pool now includes CenterPoint receivables")
    sub_row = copy.deepcopy(pool)
    sub_row[0].text = "↳ of which commercial service (CenterPoint)"
    write(sub_row, c)
    pool.addnext(mark(sub_row, "New line: the CenterPoint share of the undated pool"))

    for label in ("Total receipts", "Net cash flow"):
        r = row(label)
        write(r, [a + b for a, b in zip(nums(r), c)], note="Recalculated")
    end_row, beg_row = row("Ending cash"), row("Beginning cash")
    ending = [a + b for a, b in zip(nums(end_row), cum)]
    net = nums(row("Net cash flow"))
    write(end_row, ending, note="Recalculated")
    write(beg_row, [a + b for a, b in zip(nums(beg_row), [0] + cum[:-1])], note="Recalculated")
    woh = row("Weeks of cash on hand")
    write(woh, [e / spend for e in ending], fmt=lambda v: f"{v:.1f}", note="Recalculated")

    heads = [th.text_content().strip() for th in main.xpath(".//tr[starts-with(normalize-space(.), 'Week beginning') or starts-with(normalize-space(.), 'WEEK BEGINNING')]")[0][1:]]
    for cell, e, n in zip(cls(main, "cfx-week"), ending, net):
        cls(cell, "cfx-week-val")[0].text = money(e)
        cls(cell, "cfx-week-sub")[0].text = f"net {money(n)}"
    mark(cls(main, "cfx-cashmap")[0], "Every week's ending cash recalculated")

    k = kpis["ending cash, week 13"]
    cls(k, "cfx-kpi-val")[0].text = money(ending[-1])
    cls(k, "cfx-kpi-sub")[0].text = f"net {money(ending[-1] - cash_today)} over the quarter"
    mark(k, "Recalculated")
    k = kpis["13-week low vs floor"]
    low = min(range(len(ending)), key=lambda i: ending[i])
    old_sub = cls(k, "cfx-kpi-sub")[0].text_content()
    cls(k, "cfx-kpi-val")[0].text = money(ending[low])
    cls(k, "cfx-kpi-sub")[0].text = re.sub(r"wk of [\d/]+", f"wk of {heads[low]}", old_sub)
    mark(k, "Recalculated")
    dated = sum(nums(row("Dated AR")))
    new_und = undated_total + CP_OPEN_TOTAL
    cls(ar, "cfx-kpi-val")[0].text = f"{round(100 * dated / (dated + new_und))}%"
    cls(ar, "cfx-kpi-sub")[0].text = (
        f"{money(new_und)} undated across {undated_jobs + len(OPEN)} jobs · "
        f"{money(CP_OPEN_TOTAL)} of it commercial service")
    mark(ar, "Undated receivables now include CenterPoint")

    # The undated list names AccuLynx customers. Those rows go; the CenterPoint
    # receivables that would join the list are shown, largest first.
    und = [g for g in main.xpath(".//div[contains(concat(' ', normalize-space(@class), ' '), ' cfx-group ')]")
           if cls(g, "cfx-group-name") and cls(g, "cfx-group-name")[0].text_content().strip().startswith("Undated AR")][0]
    tb = und.xpath(".//tbody")[0]
    template = copy.deepcopy(tb[0])
    ncol = len(template)
    for r in list(tb):
        tb.remove(r)
    tb.append(el(f'<tr><td class="mock-omitted" colspan="{ncol}">{undated_jobs} AccuLynx jobs are unchanged and are left out of this mockup.</td></tr>'))
    for j in OPEN[:10]:
        r = copy.deepcopy(template)
        for td in r:
            for child in list(td):
                td.remove(child)
            td.attrib.pop("title", None)
        r[0].text, r[1].text, r[2].text, r[-1].text = j["number"], j["company_name"], GROUP_KEY, money(j["outstanding"])
        tb.append(mark(r, "CenterPoint receivable with no expected date"))
    cls(und, "cfx-group-count")[0].text = f"{undated_jobs + len(OPEN)} jobs"
    cls(und, "cfx-group-money")[0].text = money(new_und)
    mark(cls(und, "cfx-group-head")[0], "Count and total now include CenterPoint")
    for b in cls(und, "cfx-showmore"):
        b.text = f"Show all {undated_jobs + len(OPEN)} …"
    # Edit stamps name staff.
    for w in cls(main, "cfx-who"):
        w.text = ""
        for child in list(w):
            w.remove(child)
    finish(doc, "cash-flow.html")


# ── Executive pipeline ───────────────────────────────────────────────────────────

def stage_sum(keys, field):
    return sum(float(STAGE[k][field] or 0) for k in keys if k in STAGE)


def funnel_svg(rows) -> str:
    w, h, left, top, bar, gap = 502, 220, 110, 12, 22, 14
    mx = max(r["collected"] + r["arOutstanding"] for r in rows) or 1
    scale = (w - left - 16) / mx
    parts = [f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Pipeline value by stage, collected against receivables outstanding" xmlns="http://www.w3.org/2000/svg" style="font: 600 11px Inter, system-ui, sans-serif">']
    for i, r in enumerate(rows):
        y = top + i * (bar + gap)
        cw, aw = r["collected"] * scale, r["arOutstanding"] * scale
        parts.append(f'<text x="{left - 8}" y="{y + 15}" text-anchor="end" fill="currentColor">{r["milestone"]}</text>')
        parts.append(f'<rect x="{left}" y="{y}" width="{cw:.1f}" height="{bar}" fill="var(--color-primary, #14213d)"></rect>')
        parts.append(f'<rect x="{left + cw:.1f}" y="{y}" width="{aw:.1f}" height="{bar}" fill="var(--color-error, #b91c1c)"></rect>')
        if cw > 44:
            parts.append(f'<text x="{left + cw / 2:.1f}" y="{y + 15}" text-anchor="middle" fill="#fff">{short_money(r["collected"])}</text>')
        if aw > 44:
            parts.append(f'<text x="{left + cw + aw / 2:.1f}" y="{y + 15}" text-anchor="middle" fill="#fff">{short_money(r["arOutstanding"])}</text>')
        if r.get("cp"):
            parts.append(f'<text x="{left + cw + aw + 6:.1f}" y="{y + 15}" fill="currentColor">+{short_money(r["cp"])} commercial service</text>')
    parts.append("</svg>")
    return "".join(parts)


def build_pipeline():
    doc = clean(load("pipeline"))
    main = doc.xpath("//main")[0]

    sales_lead = [("sales", "New Lead")]
    sales_prospect = [("sales", "Quoted"), ("sales", "Pending")]
    approved = [("sales", "Sold"), ("service", "Ticket Created"), ("service", "Scheduled"),
                ("service", "In Progress"), ("service", "Completed")]
    invoiced = [("service", "Invoiced")]
    closed = [("service", "Closed Out")]
    dead = [("sales", "Dead")]
    n = lambda keys: int(stage_sum(keys, "n"))
    all_n = n(sales_lead + sales_prospect + approved + invoiced + closed + dead)
    close_rate = round(100 * n(approved + invoiced + closed) / all_n)
    billed = stage_sum(invoiced + closed, "billed")
    cost = stage_sum(invoiced + closed, "cost")
    with_cost = n(invoiced + closed)
    costed = int(stage_sum(invoiced + closed, "with_cost"))
    margin = round(100 * (billed - cost) / billed)

    sel = main.xpath(".//select[@name='location']")[0]
    sel.append(mark(el(f'<option value="{GROUP_KEY}">{GROUP_KEY}</option>'), "New location filter value"))

    status = main.xpath(".//*[@data-status-text]")[0]
    status.text = status.text_content().strip() + " · CenterPoint pulled daily"
    mark(status.getparent(), "Freshness names the second source")

    kpis = {k.get("data-kpi"): k for k in main.xpath(".//*[@data-kpi]")}

    def bump(key, add, split=True, count=False):
        k = kpis[key]
        v = cls(k, "epl-kpi-val")[0]
        total = parse_money(v.text) + add
        v.text = str(int(total)) if count else money(total)
        if split:
            com = k.xpath(".//*[contains(@data-kpi-split, 'commercial')]")[0]
            com.text = str(int(parse_money(com.text) + add)) if count else short_money(_unshort(com.text) + add)
        mark(k, "Now includes CenterPoint")

    bump("pipeline-value", stage_sum(sales_prospect, "price"))
    bump("new-leads", int(stage_sum(sales_lead, "created_mtd")), count=True)
    bump("ar-outstanding", CP_OPEN_TOTAL, split=False)

    t7 = main.xpath(".//*[@data-t7-val='totalOutstandingAr']")
    if t7:
        t7[0].text = money(parse_money(t7[0].text) + CP_OPEN_TOTAL)
        mark(t7[0].getparent(), "Now includes CenterPoint receivables")
    t7 = main.xpath(".//*[@data-t7-val='totalMoniesCollectedThisWeek']")
    if t7:
        t7[0].text = money(parse_money(t7[0].text) + float(CP["collected_7d"]))
        mark(t7[0].getparent(), "Now includes CenterPoint payments in the last 7 days")

    rows = [dict(r) for r in FUNNEL]
    for r in rows:
        if r["milestone"] == "invoiced":
            r["cp"] = CP_OPEN_BILLED
            r["collected"] += CP_OPEN_COLLECTED
            r["arOutstanding"] += CP_OPEN_TOTAL
    for canvas in main.xpath(".//canvas"):
        wrap = canvas.getparent()
        if canvas.get("id") == "pipeline-funnel-chart":
            new = H.fragment_fromstring(funnel_svg(rows))
            wrap.replace(canvas, new)
            mark(wrap, "Invoiced bar gains the open CenterPoint invoices")
        else:
            wrap.replace(canvas, el('<p class="mock-omitted">Rep leaderboard is unchanged and is left out of this mockup. CenterPoint jobs carry no rep yet, so they add nothing here.</p>'))

    src = main.xpath(".//details[@data-account-key='multi_family_commercial']")[0]
    new = copy.deepcopy(src)
    new.set("data-account-key", GROUP_KEY)
    cls(new, "epl-location-name-text")[0].text = GROUP_KEY
    q = {x.get("data-queue"): x for x in cls(new, "epl-queue")}

    def setq(key, strong, label):
        q[key].xpath("./strong")[0].text = strong
        q[key].xpath("./span")[0].text = label

    setq("leads", str(n(sales_lead)), "Leads")
    setq("prospects", short_money(stage_sum(sales_prospect, "price")), f"Prospects ({n(sales_prospect)})")
    setq("approved", short_money(stage_sum(approved, "price")), f"Approved ({n(approved)})")
    setq("invoiced", short_money(stage_sum(invoiced, "billed")), f"Invoiced ({n(invoiced)})")
    setq("closed", short_money(stage_sum(closed, "billed")), f"Closed ({n(closed)})")
    mini = cls(new, "epl-mini")[0].xpath("./div")
    mini[0].xpath("./strong")[0].text = f"{close_rate}%"
    mini[1].xpath("./strong")[0].text = f"{margin}%"
    mini[1].xpath("./span")[0].text = f"Margin · {costed}/{with_cost}"
    mini[2].xpath("./strong")[0].text = money(CP_OPEN_TOTAL)
    bar = cls(new, "epl-bar")[0]
    bar.set("title", f"{margin}% margin")
    cls(new, "epl-bar-fill")[0].set("style", f"width:{margin}%")
    for w in new.xpath(".//*[@data-jobs-wrap]"):
        w.set("data-account-key", GROUP_KEY)
    src.addnext(mark(new, "New location row fed by CenterPoint"))
    finish(doc, "pipeline.html")


def _unshort(s: str) -> float:
    s = s.strip().replace("$", "")
    mult = 1
    if s.endswith("M"):
        mult, s = 1_000_000, s[:-1]
    elif s.endswith("K"):
        mult, s = 1_000, s[:-1]
    return float(s or 0) * mult


def assets():
    a = OUT / "assets"
    (a / "fonts").mkdir(parents=True, exist_ok=True)
    for f in PUBLIC.glob("pro-exteriors-logo*.svg"):
        shutil.copy(f, a / f.name)
    for f in FONTS.glob("inter-latin-*-normal.woff2"):
        shutil.copy(f, a / "fonts" / f.name)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    assets()
    build_friday(False, "friday-wip.html")
    build_friday(True, "friday-wip-columns-open.html")
    build_cash_flow()
    build_pipeline()
