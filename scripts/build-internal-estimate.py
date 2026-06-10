#!/usr/bin/env python3
"""build-internal-estimate.py — internal Ops-review estimate (requested 2026-06-10).

The proposal (build-proposal-pdf.py) is the client document; THIS is the
matching internal estimate for the Ops Manager: line-item heavy, broken
down by Material / Labor / Fees, with a full margin analysis across the
Good/Better/Best options and an observed-labor-rate comparison from the
labor_rates table.

Usage:
  python3 scripts/build-internal-estimate.py --input bundle.json --out estimate.pdf

Bundle shape: { address, date, run_short, measurements{...},
  options:[{tier, template_name, shingle_line, lines:[{desc,item,req,rounded,uom,unit_cost,line_cost,source,needs_human,note}],
            components:[{component,amount,basis,source}], total_cost, total_price, gm_pct, unresolved}],
  labor_compare:{placeholder_per_sq, observed:[{task,rate,uom,qty,amount}], observed_total, note},
  margin_thresholds:{target,floor} }
"""

import argparse, json
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, PageBreak)

NAVY = colors.HexColor('#1b2a41'); ACCENT = colors.HexColor('#c8102e')
GREY = colors.HexColor('#5b6770'); LIGHT = colors.HexColor('#f2f4f7')
WARN = colors.HexColor('#fdf0e6')

base = getSampleStyleSheet()
S = {
 'title': ParagraphStyle('t', parent=base['Title'], fontName='Helvetica-Bold', fontSize=16, textColor=NAVY, alignment=0, spaceAfter=2),
 'meta': ParagraphStyle('m', parent=base['Normal'], fontSize=8.5, textColor=GREY),
 'h2': ParagraphStyle('h2', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=4),
 'cell': ParagraphStyle('c', parent=base['Normal'], fontSize=7.5, leading=9.5),
 'cellb': ParagraphStyle('cb', parent=base['Normal'], fontSize=7.5, leading=9.5, fontName='Helvetica-Bold'),
 'fine': ParagraphStyle('f', parent=base['Normal'], fontSize=7, leading=9, textColor=GREY),
}
M = lambda v: '—' if v is None else f"${v:,.2f}"


def footer(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica-Bold', 8); canvas.setFillColor(ACCENT)
    canvas.drawString(0.6 * inch, 0.42 * inch, 'INTERNAL — Ops review only. Contains costs and margins. Never send to client.')
    canvas.setFont('Helvetica', 8); canvas.setFillColor(GREY)
    canvas.drawRightString(10.4 * inch, 0.42 * inch, f'Page {doc.page}')
    canvas.restoreState()


def build(b, out):
    doc = BaseDocTemplate(out, pagesize=landscape(letter), leftMargin=0.6 * inch,
                          rightMargin=0.6 * inch, topMargin=0.55 * inch, bottomMargin=0.65 * inch,
                          title=f"Internal Estimate — {b['address']}")
    doc.addPageTemplates([PageTemplate(id='all',
        frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)], onPage=footer)])
    st = []
    st.append(Paragraph(f"Internal Estimate — {b['address']}", S['title']))
    m = b['measurements']
    st.append(Paragraph(f"Run {b['run_short']} • {b['date']} • {m['squares']} sq ({m['predominant_pitch']}), "
                        f"waste-adj {m['waste_adjusted_squares']} sq, low-slope {m.get('low_slope_area_sqft', 0):.0f} sqft, "
                        f"{int(m['facet_count'])} facets, eaves {m['eaves_lf']} lf, hips+ridges {m.get('hips_lf', 0) + m.get('ridges_lf', 0):.0f} lf, "
                        f"valleys {m['valleys_lf']} lf", S['meta']))
    st.append(Spacer(1, 6))

    # ── Margin analysis across GBB ──
    st.append(Paragraph('Margin Analysis — Good / Better / Best', S['h2']))
    hdr = ['', *[f"{o['tier']} — {o['shingle_line']}" for o in b['options']]]
    def row(label, fn, bold=False):
        style = S['cellb'] if bold else S['cell']
        return [Paragraph(f'<b>{label}</b>', S['cell']), *[Paragraph(fn(o), style) for o in b['options']]]
    comp_amt = lambda o, c: next((x['amount'] for x in o['components'] if x['component'] == c), 0)
    fees = lambda o: sum(comp_amt(o, c) for c in ['permit', 'disposal', 'delivery', 'sales_commission', 'payment_fees', 'supplement_admin', 'contingency'])
    grid = [[Paragraph('', S['cell']), *[Paragraph(h, S['cellb']) for h in hdr[1:]]],
            row('Materials', lambda o: M(comp_amt(o, 'materials'))),
            row('Labor (placeholder model)', lambda o: M(comp_amt(o, 'labor'))),
            row('Fees & allowances', lambda o: M(fees(o))),
            row('Total cost', lambda o: M(o['total_cost']), bold=True),
            row('Sell price', lambda o: M(o['total_price']), bold=True),
            row('Gross margin $', lambda o: M(o['total_price'] - o['total_cost'])),
            row('Gross margin %', lambda o: f"{o['gm_pct']:.1f}%  (target {b['margin_thresholds']['target']:.0f}%, floor {b['margin_thresholds']['floor']:.0f}%)"),
            row('Unresolved lines', lambda o: str(o['unresolved']))]
    t = Table(grid, colWidths=[1.7 * inch] + [2.9 * inch] * len(b['options']))
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d8dce1')),
                           ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
                           ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
    st.append(t)

    # ── Labor: placeholder vs observed rates ──
    lc = b['labor_compare']
    st.append(Paragraph('Labor — placeholder model vs observed Wichita rates (proposed, pending Ops approval)', S['h2']))
    lt = [[Paragraph(x, S['cellb']) for x in ['Task (observed rate basis)', 'Rate', 'Qty', 'Amount']]]
    for o in lc['observed']:
        lt.append([Paragraph(o['task'], S['cell']), Paragraph(f"${o['rate']:.2f}/{o['uom']}", S['cell']),
                   Paragraph(f"{o['qty']:g}", S['cell']), Paragraph(M(o['amount']), S['cell'])])
    lt.append([Paragraph('<b>Observed-rate labor total</b>', S['cell']), '', '', Paragraph(f"<b>{M(lc['observed_total'])}</b>", S['cell'])])
    lt.append([Paragraph('<b>Engine placeholder labor</b>', S['cell']), Paragraph(f"${lc['placeholder_per_sq']:.0f}/sq flat", S['cell']), '', Paragraph(f"<b>{M(lc['placeholder_total'])}</b>", S['cell'])])
    lt.append([Paragraph(f"<b>Delta (margin upside if observed rates approved)</b>", S['cell']), '', '', Paragraph(f"<b>{M(lc['placeholder_total'] - lc['observed_total'])}</b>", S['cell'])])
    t = Table(lt, colWidths=[4.6 * inch, 1.5 * inch, 1 * inch, 1.6 * inch])
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d8dce1')),
                           ('BACKGROUND', (0, 0), (-1, 0), NAVY),
                           ('BACKGROUND', (0, -1), (-1, -1), WARN), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
    st.append(t)
    st.append(Paragraph(lc['note'], S['fine']))
    st.append(PageBreak())

    # ── Per-option line detail ──
    for o in b['options']:
        st.append(Paragraph(f"{o['tier']} — {o['template_name']} ({o['shingle_line']}) — material line detail", S['h2']))
        g = [[Paragraph(x, S['cellb']) for x in ['#', 'Line item', 'ABC item', 'Req qty', 'Rounded', 'UOM', 'Unit cost', 'Line cost', 'Price source', 'Flags']]]
        warn_rows = []
        for i, l in enumerate(o['lines'], 1):
            if l['needs_human']: warn_rows.append(len(g))
            g.append([Paragraph(str(i), S['cell']), Paragraph(l['desc'], S['cell']),
                      Paragraph(l['item'] or '—', S['cell']),
                      Paragraph('—' if l['req'] is None else f"{l['req']:g}", S['cell']),
                      Paragraph(f"{l['rounded']:g}", S['cell']), Paragraph(l['uom'] or '—', S['cell']),
                      Paragraph(M(l['unit_cost']), S['cell']), Paragraph(M(l['line_cost']), S['cell']),
                      Paragraph(l['source'] or 'NO PRICE', S['cell']),
                      Paragraph(('NEEDS HUMAN — ' if l['needs_human'] else '') + (l['note'] or ''), S['cell'])])
        g.append([Paragraph('', S['cell']), Paragraph('<b>Materials subtotal</b>', S['cell']), '', '', '', '', '',
                  Paragraph(f"<b>{M(comp_amt(o, 'materials'))}</b>", S['cell']), '', ''])
        t = Table(g, colWidths=[0.25 * inch, 2.2 * inch, 0.85 * inch, 0.6 * inch, 0.6 * inch, 0.45 * inch, 0.7 * inch, 0.75 * inch, 1.35 * inch, 2.45 * inch], repeatRows=1)
        style = [('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#d8dce1')), ('BACKGROUND', (0, 0), (-1, 0), NAVY),
                 ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]
        for r in warn_rows: style.append(('BACKGROUND', (0, r), (-1, r), WARN))
        t.setStyle(TableStyle(style))
        st.append(t)
        # components
        cg = [[Paragraph(x, S['cellb']) for x in ['Cost component', 'Amount', 'Basis', 'Source']]]
        for c in o['components']:
            cg.append([Paragraph(c['component'], S['cell']), Paragraph(M(c['amount']), S['cell']),
                       Paragraph(c['basis'], S['cell']), Paragraph(c['source'], S['cell'])])
        t = Table(cg, colWidths=[1.4 * inch, 0.9 * inch, 5.4 * inch, 1.5 * inch], repeatRows=1)
        t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#d8dce1')),
                               ('BACKGROUND', (0, 0), (-1, 0), GREY), ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
        st.append(Spacer(1, 4)); st.append(t); st.append(PageBreak())

    doc.build(st)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--input', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    with open(a.input) as f: b = json.load(f)
    # make comp_amt available in build scope
    global comp_amt
    comp_amt = lambda o, c: next((x['amount'] for x in o['components'] if x['component'] == c), 0)
    build(b, a.out); print(f'wrote {a.out}')
