#!/usr/bin/env python3
"""build-onboarding-pdf.py — render the onboarding worksheet from the single
source of truth (onboarding/intake-schema.yaml) into:
  • a clean PDF worksheet (blank template)
  • a pre-filled PDF (prefill values, "Prepared for: <client>")
  • a markdown worksheet (docs/onboarding/01-onboarding-worksheet.md)

The SAME schema later drives the Open Brain as a Service web wizard. Build once.

Usage:
  python3 scripts/build-onboarding-pdf.py
Requires: pyyaml, reportlab. Install with:
  python3 -m pip install -r onboarding/requirements.txt
"""
import os, sys, yaml
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable, KeepTogether)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(ROOT, "onboarding", "intake-schema.yaml")
OUTDIR = os.path.join(ROOT, "onboarding", "out")
MD_OUT = os.path.join(ROOT, "docs", "onboarding", "01-onboarding-worksheet.md")
os.makedirs(OUTDIR, exist_ok=True)

INK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#cfd4da")
HEADBG = colors.HexColor("#f3f4f6")
AVAIL = letter[0] - 1.5 * inch  # ~468pt usable width

S = getSampleStyleSheet()
title_st = ParagraphStyle("t", parent=S["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=INK, spaceAfter=2)
sub_st = ParagraphStyle("sub", fontName="Helvetica", fontSize=10.5, textColor=GREY, spaceAfter=2)
h_st = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, textColor=INK, spaceBefore=14, spaceAfter=2)
intro_st = ParagraphStyle("i", fontName="Helvetica-Oblique", fontSize=9, textColor=GREY, spaceAfter=6, leading=12)
lbl_st = ParagraphStyle("l", fontName="Helvetica-Bold", fontSize=9.5, textColor=INK, leading=12)
help_st = ParagraphStyle("hp", fontName="Helvetica", fontSize=8, textColor=GREY, leading=10, spaceBefore=1)
opt_st = ParagraphStyle("o", fontName="Helvetica", fontSize=9, textColor=INK, leading=11)
val_st = ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.HexColor("#0b5cad"), leading=12)
cell_st = ParagraphStyle("c", fontName="Helvetica-Bold", fontSize=7.5, textColor=colors.white, leading=9)


def cbox(checked=False):
    t = Table([["X" if checked else ""]], colWidths=11, rowHeights=11)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, INK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def fill_line(value=""):
    t = Table([[Paragraph(value or "", val_st)]], colWidths=[AVAIL], rowHeights=[16])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def option_rows(options, checked=None, allow_other=False):
    checked = checked or []
    rows = []
    for o in options:
        rows.append([cbox(o in checked), Paragraph(o, opt_st)])
    if allow_other:
        rows.append([cbox(False), Paragraph("Other: " + "_" * 40, opt_st)])
    t = Table(rows, colWidths=[16, AVAIL - 16])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("LEFTPADDING", (1, 0), (1, -1), 6),
    ]))
    return t


def data_table(columns, seed_rows=None, blank_rows=4):
    header = [Paragraph(c["label"], cell_st) for c in columns]
    data = [header]
    seed_rows = seed_rows or []
    for sr in seed_rows:
        data.append([Paragraph(str(sr.get(c["id"], "")), opt_st) for c in columns])
    for _ in range(blank_rows):
        data.append(["" for _ in columns])
    cw = [AVAIL / len(columns)] * len(columns)
    t = Table(data, colWidths=cw, rowHeights=[18] + [22] * (len(data) - 1))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 4), ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
    ]))
    return t


def field_flowables(f, filled):
    out = [Paragraph(f["label"] + ("" if f.get("required") else "  (optional)"), lbl_st)]
    ft = f["type"]
    prefill = f.get("prefill") if filled else None
    if ft in ("text", "tel", "url", "email", "number", "date"):
        out.append(fill_line(prefill))
    elif ft == "longtext":
        for _ in range(3):
            out.append(fill_line(""))
    elif ft == "select":
        checked = [prefill] if prefill else []
        out.append(option_rows(f["options"], checked))
    elif ft == "multiselect":
        checked = (f.get("default") or []) if filled else []
        out.append(option_rows(f["options"] if "options" in f else [], checked, allow_other=f.get("free_entry", False)))
        if "options" not in f:  # free-entry multiselect (e.g. service area)
            for _ in range(2):
                out.append(fill_line(", ".join(checked) if checked else ""))
    elif ft == "boolean":
        out.append(option_rows(["Yes", "No"]))
    elif ft in ("table", "credential"):
        out.append(data_table(f["columns"], f.get("seed_rows"),
                              blank_rows=2 if f.get("seed_rows") else 4))
    elif ft == "signature":
        out.append(fill_line(""))
    if f.get("help"):
        out.append(Paragraph(f["help"], help_st))
    out.append(Spacer(1, 5))
    return out


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(0.75 * inch, 0.5 * inch, "Cleverwork  •  Open Brain  •  Confidential")
    canvas.drawRightString(letter[0] - 0.75 * inch, 0.5 * inch, "Page %d" % doc.page)
    canvas.restoreState()


def build_pdf(schema, path, filled=False, prepared_for=None):
    doc = SimpleDocTemplate(path, pagesize=letter,
                            leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                            topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                            title=schema["meta"]["title"])
    story = [Paragraph(schema["meta"]["title"], title_st),
             Paragraph(schema["meta"]["subtitle"], sub_st),
             Spacer(1, 6),
             HRFlowable(width="100%", thickness=1, color=INK), Spacer(1, 6)]
    meta_rows = [
        [Paragraph("<b>Prepared for:</b> " + (prepared_for or "_" * 34), opt_st),
         Paragraph("<b>Date:</b> " + "_" * 18, opt_st)],
        [Paragraph("<b>Account manager:</b> " + "_" * 26, opt_st),
         Paragraph("<b>Est. time:</b> " + schema["meta"]["est_time"], opt_st)],
    ]
    mt = Table(meta_rows, colWidths=[AVAIL * 0.6, AVAIL * 0.4])
    mt.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [mt, Spacer(1, 4),
              Paragraph("This worksheet captures everything needed to provision your isolated Open Brain. "
                        "We never collect passwords or API keys here — Section 5 records access only. "
                        "Each answer maps to a setting in your configuration.", intro_st)]
    for sec in schema["sections"]:
        block = [Paragraph(sec["title"], h_st),
                 HRFlowable(width="100%", thickness=0.5, color=LINE)]
        if sec.get("intro"):
            block.append(Paragraph(sec["intro"], intro_st))
        story.append(KeepTogether(block))
        for f in sec["fields"]:
            story += field_flowables(f, filled)
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return path


def build_md(schema, path):
    L = ["# " + schema["meta"]["title"], "", "> " + schema["meta"]["subtitle"] +
         "  •  ~" + schema["meta"]["est_time"], "",
         "Generated from `onboarding/intake-schema.yaml` (the single source of truth that also "
         "drives the Open Brain as a Service web wizard). Do not edit by hand — edit the schema and re-run "
         "`scripts/build-onboarding-pdf.py`.", "",
         "_We never collect passwords or API keys here — Section 5 records access only._", ""]
    for sec in schema["sections"]:
        L += ["## " + sec["title"], ""]
        if sec.get("intro"):
            L += ["_" + sec["intro"] + "_", ""]
        for f in sec["fields"]:
            req = "" if f.get("required") else " _(optional)_"
            L.append("- **" + f["label"] + "**" + req)
            if f["type"] in ("select", "multiselect") and f.get("options"):
                L.append("  - " + "  ".join("☐ " + o for o in f["options"]))
            elif f["type"] == "boolean":
                L.append("  - ☐ Yes   ☐ No")
            elif f["type"] in ("table", "credential"):
                cols = " | ".join(c["label"] for c in f["columns"])
                L.append("  - | " + cols + " |")
                L.append("  - | " + " | ".join("---" for _ in f["columns"]) + " |")
            else:
                L.append("  - `____________________`")
            if f.get("help"):
                L.append("  - _" + f["help"] + "_")
        L.append("")
    open(path, "w", encoding="utf-8").write("\n".join(L))
    return path


def main():
    schema = yaml.safe_load(open(SCHEMA, encoding="utf-8"))
    blank = build_pdf(schema, os.path.join(OUTDIR, "open-brain-pre-onboarding-worksheet.pdf"))
    filled = build_pdf(schema, os.path.join(OUTDIR, "pro-exteriors-pre-onboarding-worksheet.pdf"),
                       filled=True, prepared_for="Pro Exteriors")
    md = build_md(schema, MD_OUT)
    print("Wrote:")
    for p in (blank, filled, md):
        print("  ", os.path.relpath(p, ROOT))


if __name__ == "__main__":
    main()
