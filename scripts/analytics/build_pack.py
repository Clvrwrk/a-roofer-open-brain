#!/usr/bin/env python3
"""
/analytics five-surface pack builder (v3 — Variables + Inputs feeder + formula sheets).

Design: PE Design.md tokens (navy / green / accent / surfaces).
Buckets: docs/75 + PEC-100 locked dashboard buckets (provisional AccuLynx map).
Funnel money:
  - Funny money  = Leads (prob: >90d → 10%; ≤90d → sales discuss)
  - Planned money = Estimating / Prospects
  - Contract money = Approved+ path
  - Invoiced money = AccuLynx invoice totals
  - Critical AR = open invoice balances owed

Date doctrine (Chris 2026-07-29):
  - Accrual state date = date moved to Approved
  - WIP starts at first invoice generated date
  - WIP closes at date moved to Invoiced milestone
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]
OUT_ROOT = REPO / "outputs" / "analytics"
PAGE = 1000
PE_HOST = "rnhmvcpsvtqjlffpsayu"

# --- PE Design.md tokens (hex without #) ---
NAVY = "11133F"
NAVY_DEEP = "0A0C27"
ON_NAVY = "FFFFFF"
GREEN = "3B6B4C"
GREEN_SOFT = "D3E7DA"
ACCENT = "EAA221"
ACCENT_SOFT = "FBEDD2"
INFO = "0066CC"
INFO_SOFT = "C2E0FF"
INK = "111827"
MUTED = "4B5563"
SECONDARY_INK = "374151"
BORDER = "E5E7EB"
SURFACE_ALT = "F3F4F6"
SURFACE_INSET = "F9FAFB"
ERROR = "DC2626"
ERROR_SURF = "FEF2F2"
SUCCESS = "059669"
WARNING = "D97706"
WHITE = "FFFFFF"

# Locked dashboard buckets — docs/75 / PEC-100. Do not re-debate in meeting.
LOCKED_BUCKETS = [
    "Lead",
    "Estimating",
    "Contracted – awaiting deposit",
    "Approved – deposit invoiced",
    "Approved – deposit collected → WIP",
    "Approved – work complete → final sign-off",
    "Invoiced",
    "Closed",
    "Closed w/AR",
]

# Funnel money layers (Friday narrative)
FUNNEL_LAYERS = [
    "Funny money (Leads — risked)",
    "Planned money (Estimating)",
    "Contract money (Approved+)",
    "Invoiced money (AccuLynx invoices)",
    "Critical AR (open owed)",
]

# Lead/prospect probs: PROB_LEAD_EST / PROB_PROSPECT_* (Variables + financial_class)


def _load_env_file(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if not k:
            continue
        if override or k not in os.environ:
            os.environ[k] = v


def load_env() -> None:
    _load_env_file(Path.home() / ".config/cleverwork/master.env", override=False)
    _load_env_file(REPO / ".env", override=True)
    _load_env_file(REPO / "config" / ".env", override=True)


def require_env(*names: str) -> str:
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    raise SystemExit(f"Missing env: one of {names}")


def sb_headers(key: str) -> Dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Prefer": "count=exact",
    }


def sb_get_all(base: str, key: str, table: str, select: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    start = 0
    while True:
        params = {"select": select}
        qs = urllib.parse.urlencode(params, safe="(),.*:")
        url = f"{base.rstrip('/')}/rest/v1/{table}?{qs}"
        req = urllib.request.Request(
            url,
            headers={**sb_headers(key), "Range": f"{start}-{start + PAGE - 1}", "Range-Unit": "items"},
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            chunk = json.loads(resp.read().decode())
        if not isinstance(chunk, list):
            raise SystemExit(f"Unexpected {table}")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        start += PAGE
        if start > 200_000:
            break
    return rows


def num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def money(v: Any) -> float:
    return round(num(v), 2)


def parse_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    s = str(v)[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def iso(d: Optional[date]) -> str:
    return d.isoformat() if d else ""


def days_between(start: Optional[date], end: date) -> Optional[int]:
    if not start:
        return None
    return (end - start).days


def days_in_current_bucket(
    bucket: str,
    as_of: date,
    *,
    d_lead: Optional[date],
    d_prospect: Optional[date],
    d_approved: Optional[date],
    d_completed: Optional[date],
    d_inv_first: Optional[date],
    d_invoiced_ms: Optional[date],
    d_closed: Optional[date],
    days_in_ms: Optional[int],
) -> Optional[int]:
    """Days since entered current dashboard bucket (as-of − enter date)."""
    enter: Optional[date] = None
    if bucket == "Lead":
        enter = d_lead
    elif bucket == "Estimating":
        enter = d_prospect or d_lead
    elif bucket == "Contracted – awaiting deposit":
        enter = d_approved
    elif bucket == "Approved – deposit invoiced":
        enter = d_inv_first or d_approved
    elif bucket == "Approved – deposit collected → WIP":
        enter = d_inv_first or d_approved
    elif bucket == "Approved – work complete → final sign-off":
        enter = d_completed
    elif bucket == "Invoiced":
        enter = d_invoiced_ms or d_inv_first
    elif bucket in ("Closed", "Closed w/AR"):
        enter = d_closed
    d = days_between(enter, as_of)
    if d is not None:
        return max(0, d)
    return days_in_ms


def apply_cells_license() -> None:
    from aspose.cells import License

    path = os.environ.get("ASPOSE_CELLS_LICENSE_PATH") or str(
        Path.home() / ".config/cleverwork/licenses/Aspose.CellsProductFamily.lic"
    )
    if not Path(path).exists():
        raise SystemExit(f"Cells license not found: {path}")
    License().set_license(path)


# ---------------------------------------------------------------------------
# Design helpers (Aspose)
# ---------------------------------------------------------------------------

def _color(hex6: str):
    from aspose.pydrawing import Color

    h = hex6.lstrip("#")
    return Color.from_argb(255, int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def style_cell(
    cell,
    *,
    bold: bool = False,
    size: int = 11,
    font_color: str = INK,
    fill: Optional[str] = None,
    h_align: str = "left",
    number: Optional[str] = None,
    wrap: bool = False,
) -> None:
    from aspose.cells import BackgroundType, TextAlignmentType

    st = cell.get_style()
    st.font.name = "Calibri"
    st.font.size = size
    st.font.is_bold = bold
    st.font.color = _color(font_color)
    if fill:
        st.foreground_color = _color(fill)
        st.pattern = BackgroundType.SOLID
    align = {
        "left": TextAlignmentType.LEFT,
        "center": TextAlignmentType.CENTER,
        "right": TextAlignmentType.RIGHT,
    }.get(h_align, TextAlignmentType.LEFT)
    st.horizontal_alignment = align
    st.is_text_wrapped = wrap
    if number:
        st.custom = number
    cell.set_style(st)


def paint_range(ws, r1: int, c1: int, r2: int, c2: int, fill: str) -> None:
    from aspose.cells import BackgroundType, Range, StyleFlag

    # r1/c1 0-indexed inclusive
    rng = ws.cells.create_range(r1, c1, r2 - r1 + 1, c2 - c1 + 1)
    st = ws.workbook.create_style() if hasattr(ws, "workbook") else None
    # apply cell by cell for reliability
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            cell = ws.cells.get(r, c)
            s = cell.get_style()
            s.foreground_color = _color(fill)
            s.pattern = BackgroundType.SOLID
            cell.set_style(s)


def set_money(cell, value: float) -> None:
    cell.put_value(float(value) if value is not None else 0.0)
    style_cell(cell, number="$#,##0.00", h_align="right")


def set_int(cell, value: Any) -> None:
    if value is None or value == "":
        cell.put_value("")
        return
    cell.put_value(int(value))
    style_cell(cell, number="#,##0", h_align="right")


def set_pct(cell, value: Optional[float]) -> None:
    if value is None:
        cell.put_value("")
        return
    cell.put_value(float(value))
    style_cell(cell, number="0%", h_align="right")


def header_row(ws, row: int, headers: List[str], fill: str = NAVY) -> None:
    for c, h in enumerate(headers):
        cell = ws.cells.get(row, c)
        cell.put_value(h)
        style_cell(cell, bold=True, size=10, font_color=ON_NAVY, fill=fill, h_align="center", wrap=True)
    ws.cells.set_row_height(row, 28.0)


def autosize(ws, cols: int, max_w: float = 28.0) -> None:
    for c in range(cols):
        best = 10.0
        for r in range(min(ws.cells.max_data_row + 1, 80)):
            v = ws.cells.get(r, c).string_value or ""
            best = max(best, min(max_w, len(v) + 2))
        ws.cells.set_column_width(c, float(best))


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def fetch_data() -> Dict[str, Any]:
    base = require_env("SUPABASE_URL", "PUBLIC_SUPABASE_URL").rstrip("/")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
    if PE_HOST not in base:
        raise SystemExit(f"Refusing non-PE Supabase: {base}")

    print("loading crm_pipeline…")
    pipeline = sb_get_all(
        base,
        key,
        "crm_pipeline",
        "acculynx_job_id,job_name,client_name,client_job_number,current_milestone,"
        "primary_salesperson,contract_amount,primary_estimate_amount,balance_due,"
        "lead_date,approved_date,milestone_date,created_at,updated_at,"
        "days_in_lead,days_in_prospect,days_in_approved,days_in_completed,days_in_invoiced,"
        "insurance_company,insurance_claim_number,insurance_claim_filed,job_category,"
        "data_source,location_city,location_state,location_zip,market",
    )
    by_id: Dict[str, Dict[str, Any]] = {}
    for row in pipeline:
        jid = row.get("acculynx_job_id")
        if not jid:
            continue
        prev = by_id.get(jid)
        if prev is None or (prev.get("data_source") != "api_sync" and row.get("data_source") == "api_sync"):
            by_id[jid] = row
    pipeline = list(by_id.values())
    print(f"  jobs={len(pipeline)}")

    print("loading acculynx_jobs…")
    jobs = sb_get_all(base, key, "acculynx_jobs", "id,account_key,job_category_name")
    job_map = {j["id"]: j for j in jobs if j.get("id")}

    print("loading milestone history…")
    history = sb_get_all(
        base, key, "acculynx_job_milestone_history", "job_id,milestone_name,milestone_date"
    )
    # earliest date per job per milestone (Lead, Prospect, Approved, Completed, Invoiced, Closed)
    hist: Dict[str, Dict[str, date]] = defaultdict(dict)
    for h in history:
        jid = h.get("job_id")
        name = (h.get("milestone_name") or "").strip().title()
        d = parse_date(h.get("milestone_date"))
        if not jid or not name or not d:
            continue
        # normalize
        canon = {
            "Lead": "Lead",
            "Prospect": "Prospect",
            "Approved": "Approved",
            "Completed": "Completed",
            "Invoiced": "Invoiced",
            "Closed": "Closed",
            "Cancelled": "Cancelled",
        }.get(name, name)
        prev = hist[jid].get(canon)
        if prev is None or d < prev:
            hist[jid][canon] = d
    print(f"  history_rows={len(history)} jobs_with_hist={len(hist)}")

    print("loading job_financials (AR + approved value SoT)…")
    financials = sb_get_all(
        base,
        key,
        "acculynx_job_financials",
        "job_id,balance_due,approved_job_value,supplement_total,change_order_total,"
        "insurance_claim_total,upgrade_total,discount_total,worksheet_total",
    )
    fin_map: Dict[str, Dict[str, Any]] = {
        f["job_id"]: f for f in financials if f.get("job_id")
    }
    print(
        f"  financials={len(fin_map)} "
        f"ar>0={sum(1 for f in fin_map.values() if num(f.get('balance_due')) > 0)}"
    )

    print("loading invoices…")
    invoices = sb_get_all(
        base,
        key,
        "acculynx_invoices",
        "job_id,balance_due,total_price,invoice_date,due_date,created_date,"
        "current_invoice_state,invoice_number",
    )
    inv_ar_map: Dict[str, float] = defaultdict(float)
    inv_total_map: Dict[str, float] = defaultdict(float)
    inv_first: Dict[str, date] = {}
    inv_last: Dict[str, date] = {}
    inv_count: Dict[str, int] = defaultdict(int)
    for inv in invoices:
        jid = inv.get("job_id")
        if not jid:
            continue
        # skip void invoices for totals/AR if state known
        st = (inv.get("current_invoice_state") or "").lower()
        if st == "void":
            continue
        bal = num(inv.get("balance_due"))
        tot = num(inv.get("total_price"))
        inv_ar_map[jid] += bal
        inv_total_map[jid] += tot
        inv_count[jid] += 1
        d = parse_date(inv.get("invoice_date") or inv.get("created_date"))
        if d:
            if jid not in inv_first or d < inv_first[jid]:
                inv_first[jid] = d
            if jid not in inv_last or d > inv_last[jid]:
                inv_last[jid] = d
    print(
        f"  invoices={len(invoices)} jobs_inv_ar>0={sum(1 for v in inv_ar_map.values() if v > 0)} "
        f"sum_inv_ar={sum(inv_ar_map.values()):,.0f}"
    )

    print("loading register accounts…")
    try:
        registers = sb_get_all(
            base, key, "v_qbo_register_accounts", "account_name,register_kind,current_balance"
        )
    except Exception as e:
        print("  registers unavailable:", e)
        registers = []

    print("loading CoA AR…")
    qb_ar = None
    try:
        accts = sb_get_all(base, key, "qbo_accounts", "name,current_balance,account_type")
        for a in accts:
            if "accounts receivable" in (a.get("name") or "").lower():
                qb_ar = num(a.get("current_balance"))
                break
    except Exception as e:
        print("  qbo_accounts:", e)
        accts = []

    return {
        "pipeline": pipeline,
        "job_map": job_map,
        "hist": hist,
        "fin_map": fin_map,
        "inv_ar_map": inv_ar_map,
        "inv_total_map": inv_total_map,
        "inv_first": inv_first,
        "inv_last": inv_last,
        "inv_count": inv_count,
        "registers": registers,
        "qb_ar": qb_ar,
        "accounts": accts,
    }


def dashboard_bucket(
    milestone: str,
    open_ar: float,
    has_insurance: bool,
    *,
    has_invoice: bool,
) -> Tuple[str, str]:
    """
    Map AccuLynx milestone → locked dashboard bucket.
    Returns (bucket, map_note). Provisional until PEC-101 deposit fields.
    """
    m = (milestone or "").strip().lower()
    if m in ("unassigned_lead", "assigned_lead", "lead"):
        return "Lead", "AccuLynx Lead → Lead"
    if m == "prospect":
        return "Estimating", "Locked #1: AccuLynx Prospect = Estimating"
    if m == "closed":
        if open_ar > 0:
            return "Closed w/AR", "Locked #15: Closed only if $0 AR else Closed w/AR"
        return "Closed", "Locked #15"
    if m == "invoiced":
        # #4: exclusive — can sit in WIP-supplement while AccuLynx Invoiced
        if has_insurance and open_ar > 0:
            return (
                "Approved – deposit collected → WIP",
                "Provisional #4: insurance + open AR while AccuLynx Invoiced → WIP",
            )
        return "Invoiced", "AccuLynx Invoiced; revenue collected path"
    if m == "completed":
        return (
            "Approved – work complete → final sign-off",
            "AccuLynx Completed → work complete bucket",
        )
    if m == "approved":
        # Deposit invoice/posted fields missing (PEC-101). Provisional split:
        if has_invoice and open_ar > 0:
            return (
                "Approved – deposit invoiced",
                "Provisional: Approved + invoice + open AR (deposit fields TBD)",
            )
        if has_invoice and open_ar <= 0:
            return (
                "Approved – deposit collected → WIP",
                "Provisional: Approved + invoices paid → WIP (deposit-posted TBD)",
            )
        return (
            "Contracted – awaiting deposit",
            "Provisional: Approved, no invoice signal → awaiting deposit",
        )
    return "Estimating", f"Unknown milestone {milestone!r} → soft Estimating"


# Financial class labels (pure finance — not ops slang)
FIN_EXCLUDE = "— do not count"
FIN_LEAD_10 = "Future Revenue Unconfirmed (10%)"
FIN_PROSPECT_50 = "Future Revenue Unconfirmed (50%)"
FIN_PROSPECT_90 = "Future Revenue Confirmed (90%)"
FIN_PENDING_WIP = "Pending WIP"
FIN_REVENUE_REALIZED = "Revenue Realized"
FIN_BILLED_PENDING = "Billed — Pending Collection"
FIN_COMPLETED_AR = "Completed AR"
FIN_CRITICAL_AR = "Critical At Risk AR"


# Status labels for column S (meeting traffic light)
STATUS_PENDING = "Pending"
STATUS_INVOICED = "Invoiced"
STATUS_CRITICAL = "Critical AR"
STATUS_FULL = "Collected in Full"

# fills (hex without #)
FILL_PURPLE = "EDE9FE"   # pending
FILL_YELLOW = "FEF3C7"   # mid path "Invoiced" status
FILL_RED = "FEE2E2"      # critical AR
FILL_GREEN = "D1FAE5"    # collected in full
INK_PURPLE = "5B21B6"
INK_YELLOW = "92400E"
INK_RED = "991B1B"
INK_GREEN = "065F46"


def collection_status(bucket: str, *, contract: float, collected: float, outstanding_ar: float) -> str:
    """Column S traffic-light status from bucket + money."""
    if contract > 0 and collected + 0.005 >= contract:
        return STATUS_FULL
    if bucket in ("Lead", "Estimating"):
        return STATUS_PENDING
    if bucket in (
        "Contracted – awaiting deposit",
        "Approved – deposit invoiced",
        "Approved – deposit collected → WIP",
    ):
        return STATUS_INVOICED
    if bucket in (
        "Approved – work complete → final sign-off",
        "Invoiced",
        "Closed w/AR",
    ) and outstanding_ar > 0:
        return STATUS_CRITICAL
    if outstanding_ar > 0:
        return STATUS_CRITICAL
    return STATUS_PENDING


def style_status_cell(cell, status: str) -> None:
    fill_map = {
        STATUS_PENDING: (FILL_PURPLE, INK_PURPLE),
        STATUS_INVOICED: (FILL_YELLOW, INK_YELLOW),
        STATUS_CRITICAL: (FILL_RED, INK_RED),
        STATUS_FULL: (FILL_GREEN, INK_GREEN),
    }
    fill, ink = fill_map.get(status, (SURFACE_ALT, INK))
    style_cell(cell, bold=True, size=9, fill=fill, font_color=ink, h_align="center")


# Default probabilities (also on 00_Variables for stress-test)
PROB_LEAD_EST = 0.10
PROB_PROSPECT_EST = 0.50
PROB_PROSPECT_CONTRACT = 0.90


def financial_class(
    milestone: str,
    *,
    estimate: float,
    contract: float,
    has_invoice_date: bool,
    collected: float,
    outstanding_ar: float,
) -> Tuple[str, float, Optional[float], str]:
    """
    Pure financial funnel class from AccuLynx milestone + money signals.
    Returns (class_name, face_for_weighted_or_display, probability_or_None, note).
    """
    m = (milestone or "").strip().lower()
    est_ok = estimate > 0
    con_ok = contract > 0

    if m in ("unassigned_lead", "assigned_lead", "lead"):
        if not est_ok:
            return FIN_EXCLUDE, 0.0, None, "Lead · estimate null · do not count"
        return FIN_LEAD_10, estimate, PROB_LEAD_EST, "Lead · estimate not null · P=10%"

    if m == "prospect":
        if not est_ok and not con_ok:
            return FIN_EXCLUDE, 0.0, None, "Prospect · estimate null · contract null · do not count"
        if est_ok and not con_ok:
            return FIN_PROSPECT_50, estimate, PROB_PROSPECT_EST, "Prospect · estimate only · P=50%"
        # contract not null (estimate null or both) → confirmed 90% on contract
        return FIN_PROSPECT_90, contract, PROB_PROSPECT_CONTRACT, "Prospect · contract not null · P=90%"

    if m == "approved":
        if not has_invoice_date:
            return FIN_PENDING_WIP, contract, None, "Approved · no invoice date · Pending WIP"
        if abs(collected) > 0.005:
            return (
                FIN_REVENUE_REALIZED,
                contract,
                None,
                "Approved · invoiced · collected≠0 · Revenue Realized (Q=unrealized AR)",
            )
        return (
            FIN_BILLED_PENDING,
            contract,
            None,
            "Approved · invoiced · collected=$0 · billed pending collection",
        )

    if m == "completed":
        if outstanding_ar > 0:
            return FIN_COMPLETED_AR, outstanding_ar, None, "Completed · Outstanding AR (N)"
        return FIN_EXCLUDE, 0.0, None, "Completed · N=0 · do not count"

    if m == "invoiced":
        if outstanding_ar > 0:
            return FIN_CRITICAL_AR, outstanding_ar, None, "Invoiced · Outstanding AR (N) · Critical At Risk AR"
        return FIN_EXCLUDE, 0.0, None, "Invoiced · N=0 · do not count"

    if m == "closed":
        if outstanding_ar > 0:
            return FIN_CRITICAL_AR, outstanding_ar, None, "Closed w/AR · Critical At Risk AR"
        return FIN_EXCLUDE, 0.0, None, "Closed clean · do not count"

    return FIN_EXCLUDE, 0.0, None, f"Unmapped milestone {milestone!r}"


def build_rows(data: Dict[str, Any], as_of: date) -> Dict[str, Any]:
    EXCLUDE = {"cancelled", "dead", "unknown"}
    job_rows: List[Dict[str, Any]] = []
    bucket_agg: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"count": 0, "gross": 0.0, "risked": 0.0, "ar": 0.0, "invoiced": 0.0}
    )
    loc_agg: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"count": 0, "gross": 0.0, "ar": 0.0}
    )
    rep_agg: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"count": 0, "gross": 0.0, "ar": 0.0, "leads": 0, "lead_gross": 0.0}
    )

    for row in data["pipeline"]:
        milestone = (row.get("current_milestone") or "").strip().lower()
        if milestone in EXCLUDE:
            continue
        jid = row.get("acculynx_job_id") or ""
        aj = data["job_map"].get(jid, {})
        account = aj.get("account_key") or "unknown"
        fin = data["fin_map"].get(jid, {})
        # Contract SoT: job_financials.approved_job_value ≡ pipeline.contract_amount
        contract = num(fin.get("approved_job_value")) or num(row.get("contract_amount"))
        estimate = num(row.get("primary_estimate_amount"))
        # Outstanding AR SoT: job_financials.balance_due ≡ pipeline.balance_due
        outstanding_ar = num(fin.get("balance_due"))
        if jid not in data["fin_map"]:
            outstanding_ar = num(row.get("balance_due"))
        open_ar = outstanding_ar
        # Report rule: Closed with $0 AR excluded entirely (only Closed w/AR = Critical)
        if milestone == "closed" and outstanding_ar <= 0:
            continue
        billed = data["inv_total_map"].get(jid, 0.0)  # P
        remaining_bal = data["inv_ar_map"].get(jid, 0.0)  # Q remaining of billed
        collected = round(billed - remaining_bal, 2)  # R collected revenue
        has_invoice = jid in data["inv_first"] or billed > 0
        has_ins = bool(
            row.get("insurance_company")
            or row.get("insurance_claim_number")
            or row.get("insurance_claim_filed")
        )
        bucket, map_note = dashboard_bucket(milestone, open_ar, has_ins, has_invoice=has_invoice)

        dates = data["hist"].get(jid, {})
        d_lead = dates.get("Lead") or parse_date(row.get("lead_date"))
        d_prospect = dates.get("Prospect")
        d_approved = dates.get("Approved") or parse_date(row.get("approved_date"))
        d_completed = dates.get("Completed")
        d_invoiced_ms = dates.get("Invoiced")
        d_closed = dates.get("Closed")
        d_inv_first = data["inv_first"].get(jid)
        d_inv_last = data["inv_last"].get(jid)

        d_accrual = d_approved
        d_wip_start = d_inv_first
        d_wip_close = d_invoiced_ms

        # J = Estimated Revenue only when invoice date is null
        estimate_j = estimate if d_inv_first is None else 0.0

        fin_class, fin_face, fin_prob, fin_note = financial_class(
            milestone,
            estimate=estimate,
            contract=contract,
            has_invoice_date=d_inv_first is not None,
            collected=collected,
            outstanding_ar=outstanding_ar,
        )
        # Weighted future revenue (only when probability set)
        risked = round(fin_face * fin_prob, 2) if fin_prob is not None else 0.0
        gross = fin_face
        # Funnel layer = dashboard bucket (clearer ops/finance description)
        layer = bucket
        lead_prob = fin_prob
        lead_prob_note = fin_note

        days_lead = None
        if row.get("days_in_lead") is not None and milestone in (
            "unassigned_lead",
            "assigned_lead",
            "lead",
        ):
            try:
                days_lead = int(row.get("days_in_lead"))
            except (TypeError, ValueError):
                days_lead = days_between(d_lead, as_of)
        elif milestone in ("unassigned_lead", "assigned_lead", "lead"):
            days_lead = days_between(d_lead, as_of)

        # Days in current AccuLynx milestone (fallback)
        days_in_ms = None
        for field, ms in (
            ("days_in_lead", "lead"),
            ("days_in_prospect", "prospect"),
            ("days_in_approved", "approved"),
            ("days_in_completed", "completed"),
            ("days_in_invoiced", "invoiced"),
        ):
            if milestone in (ms, f"unassigned_{ms}", f"assigned_{ms}") or milestone == ms:
                if row.get(field) is not None:
                    try:
                        days_in_ms = int(row.get(field))
                    except (TypeError, ValueError):
                        pass

        days_in_bucket = days_in_current_bucket(
            bucket,
            as_of,
            d_lead=d_lead,
            d_prospect=d_prospect,
            d_approved=d_approved,
            d_completed=d_completed,
            d_inv_first=d_inv_first,
            d_invoiced_ms=d_invoiced_ms,
            d_closed=d_closed,
            days_in_ms=days_in_ms,
        )

        salesperson = row.get("primary_salesperson") or "(unassigned)"
        job = {
            "location": account,
            "job_num": row.get("client_job_number") or "",
            "client": row.get("client_name") or row.get("job_name") or "",
            "job_name": row.get("job_name") or "",
            "milestone": milestone,
            "bucket": bucket,
            "map_note": map_note,
            "funnel_layer": layer,
            "finance_class": fin_class,
            "fin_note": fin_note,
            "collection_status": collection_status(
                bucket,
                contract=contract,
                collected=collected,
                outstanding_ar=outstanding_ar,
            ),
            "salesperson": salesperson,
            "category": row.get("job_category") or aj.get("job_category_name") or "",
            "market": row.get("market") or "",
            "city": row.get("location_city") or "",
            "state": row.get("location_state") or "",
            "contract": contract,
            "estimate": estimate,
            "estimate_j": estimate_j,
            "gross": gross,
            "open_ar": open_ar,
            "outstanding_ar": outstanding_ar,
            "billed": billed,
            "remaining_balance": remaining_bal,
            "collected_revenue": collected,
            "invoice_count": data["inv_count"].get(jid, 0),
            "supplement_total": num(fin.get("supplement_total")),
            "change_order_total": num(fin.get("change_order_total")),
            "lead_prob": lead_prob,
            "lead_prob_note": lead_prob_note,
            "risked": risked,
            "days_lead": days_lead,
            "days_in_milestone": days_in_ms,
            "days_in_current_bucket": days_in_bucket,
            "d_lead": iso(d_lead),
            "d_prospect": iso(d_prospect),
            "d_approved": iso(d_approved),
            "d_completed": iso(d_completed),
            "d_invoice_generated": iso(d_inv_first),
            "d_invoice_last": iso(d_inv_last),
            "d_invoiced_milestone": iso(d_invoiced_ms),
            "d_closed": iso(d_closed),
            "d_accrual": iso(d_accrual),
            "d_wip_start": iso(d_wip_start),
            "d_wip_close": iso(d_wip_close),
            "has_insurance": "Y" if has_ins else "N",
            "insurance_co": row.get("insurance_company") or "",
            "job_id": jid,
            "acculynx_url": f"https://my.acculynx.com/jobs/{jid}" if jid else "",
        }
        job_rows.append(job)

        bucket_agg[bucket]["count"] += 1
        bucket_agg[bucket]["gross"] += gross
        bucket_agg[bucket]["risked"] += job["risked"]
        if bucket == "Lead":
            pass
        bucket_agg[bucket]["ar"] += open_ar
        bucket_agg[bucket]["invoiced"] += billed

        loc_agg[account]["count"] += 1
        loc_agg[account]["gross"] += gross
        loc_agg[account]["ar"] += open_ar

        rep_agg[salesperson]["count"] += 1
        rep_agg[salesperson]["gross"] += gross
        rep_agg[salesperson]["ar"] += open_ar
        if bucket == "Lead":
            rep_agg[salesperson]["leads"] += 1
            rep_agg[salesperson]["lead_gross"] += gross

    # sort collections by AR desc for worklist
    rank = {b: i for i, b in enumerate(LOCKED_BUCKETS)}
    job_rows.sort(key=lambda r: (rank.get(r["bucket"], 99), -r["open_ar"], r["location"], r["client"]))

    # Funnel rollups (financial class)
    def sum_class(name: str) -> float:
        return sum(j["gross"] for j in job_rows if j["funnel_layer"] == name)

    def sum_risked_class(name: str) -> float:
        return sum(j["risked"] for j in job_rows if j["funnel_layer"] == name)

    def count_class(name: str) -> int:
        return sum(1 for j in job_rows if j["funnel_layer"] == name)

    funnel = {
        "lead_10_face": sum_class(FIN_LEAD_10),
        "lead_10_risked": sum_risked_class(FIN_LEAD_10),
        "lead_10_n": count_class(FIN_LEAD_10),
        "prospect_50_face": sum_class(FIN_PROSPECT_50),
        "prospect_50_risked": sum_risked_class(FIN_PROSPECT_50),
        "prospect_50_n": count_class(FIN_PROSPECT_50),
        "prospect_90_face": sum_class(FIN_PROSPECT_90),
        "prospect_90_risked": sum_risked_class(FIN_PROSPECT_90),
        "prospect_90_n": count_class(FIN_PROSPECT_90),
        "pending_wip": sum_class(FIN_PENDING_WIP),
        "pending_wip_n": count_class(FIN_PENDING_WIP),
        "realized": sum_class(FIN_REVENUE_REALIZED),
        "realized_n": count_class(FIN_REVENUE_REALIZED),
        "billed_pending": sum_class(FIN_BILLED_PENDING),
        "completed_ar": sum_class(FIN_COMPLETED_AR),
        "critical_ar": sum(
            j["outstanding_ar"] for j in job_rows if j["funnel_layer"] == FIN_CRITICAL_AR
        ),
        "critical_ar_n": count_class(FIN_CRITICAL_AR),
        "exclude_n": count_class(FIN_EXCLUDE),
        "billed_p": sum(j["billed"] for j in job_rows),
        "remaining_q": sum(j["remaining_balance"] for j in job_rows),
        "collected_r": sum(j["collected_revenue"] for j in job_rows),
        "contract_l": sum(j["contract"] for j in job_rows),
        "job_ar_n": sum(j["outstanding_ar"] for j in job_rows),
        # legacy aliases
        "funny_gross": sum_class(FIN_LEAD_10),
        "funny_risked": sum_risked_class(FIN_LEAD_10),
        "funny_need_prob": 0,
        "funny_auto_10": count_class(FIN_LEAD_10),
        "funny_count": count_class(FIN_LEAD_10),
        "funny_with_value": count_class(FIN_LEAD_10),
        "planned": sum_class(FIN_PROSPECT_50) + sum_class(FIN_PROSPECT_90),
        "contract": sum_class(FIN_PENDING_WIP)
        + sum_class(FIN_REVENUE_REALIZED)
        + sum_class(FIN_BILLED_PENDING),
        "invoiced": sum(j["billed"] for j in job_rows),
    }

    return {
        "jobs": job_rows,
        "bucket_agg": bucket_agg,
        "loc_agg": loc_agg,
        "rep_agg": rep_agg,
        "funnel": funnel,
    }




# ---------------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------------


def write_excel(
    audience: str, as_of: str, data: Dict[str, Any], built: Dict[str, Any], out_dir: Path
) -> Path:
    """True workbook: 00_Variables + Inputs_Jobs feeder + formula calc sheets only."""
    from aspose.cells import Workbook

    apply_cells_license()
    wb = Workbook()
    jobs = built["jobs"]
    n = len(jobs)
    last = n + 1  # excel last data row (1-indexed header + n)

    # Column map Inputs_Jobs (0-based → letter)
    # A Location  B Job#  C Client  D JobName  E Milestone  F Bucket  G Funnel
    # H Salesperson  I Category
    # J Contract  K Estimate  L Gross  M DaysLead  N OpenAR  O Invoiced  P InvCount
    # Q DaysMs
    # R Lead  S Prospect  T Approved  U Completed  V InvGen  W InvLast  X InvMs  Y Closed
    # Z PayApplied  AA FinalPay  AB Ins  AC InsCo  AD MapNote  AE URL  AF JobID
    # AG Calc_Lead_Risked  AH Calc_Lead_Needs_P  AI Calc_Lead_Stale  AJ Calc_AR_Flag

    COL = {
        "bucket": "F",
        "funnel": "G",
        "gross": "L",
        "days_lead": "M",
        "ar": "N",
        "invoiced": "O",
        "risked": "AG",
        "needs_p": "AH",
        "stale": "AI",
    }


    # Column map Inputs_Jobs (Excel letters)
    # A-I dims | J Estimate | K ApprovedJobValue | L Contract Amount
    # N Outstanding AR | O Balance Remaining | P Invoiced Tot | Q Invoice AR
    # R Calc_Collected | S-Z dates | AA-AG dwell days (formulas) | AH-AK lead/AR flags
    # AL Job ID | AM URL | AN Map note | AO Ins | AP InsCo
    COL = {
        "bucket": "F",
        "funnel": "G",
        "contract": "L",
        "ar": "N",
        "balance_rem": "O",
        "invoiced": "P",
        "inv_ar": "Q",
        "job_id": "AL",
        "risked": "AH",
        "needs_p": "AI",
        "stale": "AJ",
        "days_lead": "AA",
        "days_prospect": "AB",
        "days_appr_pend": "AC",
        "days_wip": "AD",
        "days_supp": "AE",
        "days_final": "AF",
        "days_crit_ar": "AG",
    }

    # ------------------------------------------------------------------
    # 00_Variables — ONLY place for assumption constants (editable)
    # ------------------------------------------------------------------
    var = wb.worksheets[0]
    var.name = "00_Variables"
    for c in range(4):
        cell = var.cells.get(0, c)
        cell.put_value("" if c else "VARIABLES — edit values in column B only. All calc sheets read these cells.")
        style_cell(cell, bold=True, size=12, font_color=ON_NAVY, fill=NAVY)
    var.cells.merge(0, 0, 1, 4)
    header_row(var, 1, ["Key", "Value", "Unit / type", "Notes"], fill=NAVY)

    variables = [
        ("AsOf", as_of, "date", "Pack as-of date (used in open-segment day calcs)"),
        ("GeneratedUTC", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"), "datetime", "Build timestamp"),
        ("Company", "Pro Exteriors LLC", "text", "Entity"),
        ("Audience", audience, "text", "ar-wip | cpa | bank"),
        ("Lead_Stale_Days", 90, "days", "Optional dwell KPI only"),
        ("Prob_Lead_Estimate", 0.10, "percent", "Lead + estimate → Future Revenue Unconfirmed"),
        ("Prob_Prospect_Estimate", 0.50, "percent", "Prospect + estimate, no contract"),
        ("Prob_Prospect_Contract", 0.90, "percent", "Prospect + contract → Future Revenue Confirmed"),
        ("AR_Flag_Threshold", 25000, "USD", "Highlight Critical AR rows ≥ this"),
        ("QB_AR_Cash", money(data.get("qb_ar")), "USD", "CASH books CoA AR (QBO RO)"),
        ("Bank_Cash_Registers", money(sum(num(r.get("current_balance")) for r in data["registers"] if (r.get("register_kind") or "") == "bank")), "USD", "Sum bank registers at pull"),
        ("Linear", "PEC-100", "text", "Trunk issue"),
        ("Bucket_Law", "docs/75 + PEC-100", "text", "Do not re-debate buckets"),
        ("Accrual_Date_Def", "Date moved to Approved", "text", "Chris doctrine"),
        ("WIP_Start_Def", "Invoice sent → Completed = Days in WIP", "text", "Chris"),
        ("WIP_Close_Def", "Completed → Invoiced ms = Days in Supplement", "text", "Chris"),
        ("Final_Collections_Def", "Invoiced ms → Closed", "text", "Chris"),
        ("Critical_AR_Days_Def", "AR>0 in invoiced/closed; age from Invoiced ms else invoice sent", "text", "Chris"),
        ("Money_SoT", "J=est if no inv date; L=contract; N=job AR; O=L-R; P=billed; Q=remaining; R=collected", "text", "Chris lock"),
        ("Basis", "CASH (QBO) separate from OPS (AccuLynx)", "text", "Never mix unlabeled"),
        ("Inputs_LastRow", last, "row", "Last data row on Inputs_Jobs (auto)"),
    ]
    key_row = {}
    for i, (k, v, unit, notes) in enumerate(variables):
        r = 2 + i
        excel_row = r + 1
        key_row[k] = excel_row
        var.cells.get(r, 0).put_value(k)
        style_cell(var.cells.get(r, 0), bold=True, size=10, fill=SURFACE_ALT)
        cell = var.cells.get(r, 1)
        if k.startswith("Prob_"):
            cell.put_value(float(v))
            style_cell(cell, number="0%", bold=True, size=11, fill=ACCENT_SOFT)
        elif k == "AsOf":
            d = parse_date(v)
            if d:
                cell.put_value(datetime(d.year, d.month, d.day))
                style_cell(cell, number="YYYY-MM-DD", bold=True, size=11, fill=ACCENT_SOFT)
            else:
                cell.put_value(str(v))
                style_cell(cell, size=10, fill=ACCENT_SOFT)
        elif isinstance(v, float) and "USD" in unit:
            cell.put_value(float(v))
            style_cell(cell, number="$#,##0.00", bold=True, size=11, fill=ACCENT_SOFT)
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            cell.put_value(float(v))
            style_cell(cell, number="0", bold=True, size=11, fill=ACCENT_SOFT)
        else:
            cell.put_value(str(v))
            style_cell(cell, size=10, fill=ACCENT_SOFT)
        var.cells.get(r, 2).put_value(unit)
        var.cells.get(r, 3).put_value(notes)
        style_cell(var.cells.get(r, 2), size=9, font_color=MUTED)
        style_cell(var.cells.get(r, 3), size=9, wrap=True)

    def V(key: str) -> str:
        return f"'00_Variables'!$B${key_row[key]}"

    var.cells.get(22, 0).put_value("EDIT RULE")
    style_cell(var.cells.get(22, 0), bold=True, font_color=ON_NAVY, fill=NAVY)
    var.cells.get(22, 1).put_value(
        "Change amber Value cells only. Money SoT: L Contract, N Outstanding AR, O Balance Remaining = job_financials.balance_due."
    )
    style_cell(var.cells.get(22, 1), size=10, fill=ERROR_SURF, wrap=True)
    var.cells.merge(22, 1, 1, 3)
    for c, w in enumerate([26.0, 18.0, 14.0, 52.0]):
        var.cells.set_column_width(c, w)

    # ------------------------------------------------------------------
    # Inputs_Jobs — single feeder + calc formulas
    # ------------------------------------------------------------------

    inp = wb.worksheets.add("Inputs_Jobs")
    headers = [
        "Location",  # A 0
        "Job #",
        "Client",
        "Job name",
        "AccuLynx milestone",  # E 4
        "Dashboard bucket",  # F 5
        "Funnel layer (bucket)",  # G 6 = bucket
        "Salesperson",
        "Category",
        "Estimated Revenue $",  # J 9 — only if invoice date null
        "(K dropped)",  # K 10 unused
        "Contract Amount $",  # L 11
        "Invoice count",  # M 12
        "Outstanding AR $",  # N 13 job balance_due
        "Uncollected Contract $ (L−R)",  # O 14 formula =L-R; 0 → Collected in Full
        "Billed $",  # P 15
        "Remaining Balance $",  # Q 16 invoice remaining
        "Collected Revenue $",  # R 17 formula =P-Q
        "Collection status",  # S 18 Pending/Invoiced/Critical AR/Collected in Full
        "Date Lead",  # T 19
        "Date Prospect",  # U 20
        "Date Approved (Accrual)",  # V 21
        "Date Completed",  # W 22
        "Date Invoice Sent",  # X 23
        "Date Invoice Last",  # Y 24
        "Date Invoiced Milestone",  # Z 25
        "Date Closed",  # AA 26
        "Days_Lead",  # AB 27
        "Days_Prospect",  # AC 28
        "Days_Approved_Pending_Invoice",  # AD 29
        "Days_WIP",  # AE 30 X→W Completed
        "Days_Supplement",  # AF 31 W→Z Invoiced ms — wait dates shifted
        "Days_Final_Collections",
        "Days_Critical_AR",
        "Calc_Weighted_Revenue $",  # face × P%
        "Fin_Probability",  # 10/50/90 or blank
        "Calc_AR_Flag",
        "Job ID",
        "AccuLynx URL",
        "Class note",
        "Insurance Y/N",
        "Insurance co",
    ]
    header_row(inp, 0, headers, fill=NAVY)

    def put_date_cell(cell, iso_s: str) -> None:
        d = parse_date(iso_s)
        if not d:
            cell.put_value("")
            return
        cell.put_value(datetime(d.year, d.month, d.day))
        style_cell(cell, number="YYYY-MM-DD", size=9)

    asof_ref = V("AsOf")
    # Prob cells from Variables (keys may vary row — use V())
    # Prob_Lead_Estimate etc.

    for r, j in enumerate(jobs, start=1):
        er = r + 1
        # A-I
        for c, v in enumerate([
            j["location"], str(j["job_num"]), j["client"], j["job_name"],
            j["milestone"], j["bucket"], j["funnel_layer"], j["salesperson"], j["category"],
        ]):
            inp.cells.get(r, c).put_value(v if v is not None else "")
            style_cell(inp.cells.get(r, c), size=9)

        # J Estimated Revenue — only when no invoice date
        cell = inp.cells.get(r, 9)
        cell.put_value(float(j.get("estimate_j") or 0))
        style_cell(cell, number="$#,##0.00", size=9, h_align="right")
        # K dropped
        inp.cells.get(r, 10).put_value("")
        # L Contract
        cell = inp.cells.get(r, 11)
        cell.put_value(float(j["contract"] or 0))
        style_cell(cell, number="$#,##0.00", size=9, h_align="right")
        # M invoice count
        inp.cells.get(r, 12).put_value(float(j["invoice_count"] or 0))
        style_cell(inp.cells.get(r, 12), number="0", size=9)
        # N Outstanding AR
        cell = inp.cells.get(r, 13)
        cell.put_value(float(j["outstanding_ar"] or 0))
        style_cell(cell, number="$#,##0.00", size=9, h_align="right")
        # P Billed, Q Remaining (values) before O/R formulas
        cell = inp.cells.get(r, 15)
        cell.put_value(float(j["billed"] or 0))
        style_cell(cell, number="$#,##0.00", size=9)
        cell = inp.cells.get(r, 16)
        cell.put_value(float(j["remaining_balance"] or 0))
        style_cell(cell, number="$#,##0.00", size=9)
        # R Collected Revenue = P-Q
        inp.cells.get(r, 17).formula = f"=P{er}-Q{er}"
        style_cell(inp.cells.get(r, 17), number="$#,##0.00", size=9, fill=SURFACE_INSET)
        # O Uncollected Contract = L-R
        inp.cells.get(r, 14).formula = f"=IF(L{er}=\"\",\"\",L{er}-R{er})"
        style_cell(inp.cells.get(r, 14), number="$#,##0.00", size=9, fill=SURFACE_INSET)
        # S Collection status (traffic light)
        st = j.get("collection_status") or STATUS_PENDING
        inp.cells.get(r, 18).put_value(st)
        style_status_cell(inp.cells.get(r, 18), st)

        # Dates T-AA = 19-26
        put_date_cell(inp.cells.get(r, 19), j["d_lead"])
        put_date_cell(inp.cells.get(r, 20), j["d_prospect"])
        put_date_cell(inp.cells.get(r, 21), j["d_accrual"])
        put_date_cell(inp.cells.get(r, 22), j["d_completed"])
        put_date_cell(inp.cells.get(r, 23), j["d_wip_start"])
        put_date_cell(inp.cells.get(r, 24), j["d_invoice_last"])
        put_date_cell(inp.cells.get(r, 25), j["d_wip_close"])
        put_date_cell(inp.cells.get(r, 26), j["d_closed"])

        # Dwell AB-AH = 27-33  (T=19 Lead ... X=23 inv sent, W=22 completed, Z=25 invoiced ms, AA=26 closed)
        # Days_Lead: U-T or AsOf-T if Lead
        inp.cells.get(r, 27).formula = (
            f'=IF(T{er}="","" ,IF(U{er}<>"",U{er}-T{er},IF(OR(E{er}="lead",E{er}="unassigned_lead",E{er}="assigned_lead"),{asof_ref}-T{er},"")))'
        )
        inp.cells.get(r, 28).formula = (
            f'=IF(U{er}="","" ,IF(V{er}<>"",V{er}-U{er},IF(E{er}="prospect",{asof_ref}-U{er},"")))'
        )
        inp.cells.get(r, 29).formula = (
            f'=IF(V{er}="","" ,IF(X{er}<>"",X{er}-V{er},IF(E{er}="approved",{asof_ref}-V{er},"")))'
        )
        # Days_WIP: Invoice Sent X → Completed W
        inp.cells.get(r, 30).formula = f'=IF(OR(X{er}="",W{er}=""),"",W{er}-X{er})'
        # Days_Supplement: Completed W → Invoiced ms Z
        inp.cells.get(r, 31).formula = f'=IF(OR(W{er}="",Z{er}=""),"",Z{er}-W{er})'
        # Days_Final: Invoiced ms Z → Closed AA
        inp.cells.get(r, 32).formula = f'=IF(OR(Z{er}="",AA{er}=""),"",AA{er}-Z{er})'
        # Days_Critical_AR
        inp.cells.get(r, 33).formula = (
            f'=IF(AND(N{er}>0,OR(E{er}="invoiced",E{er}="closed",F{er}="Invoiced",F{er}="Closed",F{er}="Closed w/AR")),'
            f'IF(Z{er}<>"",{asof_ref}-Z{er},IF(X{er}<>"",{asof_ref}-X{er},"")),"")'
        )
        for c in range(27, 34):
            style_cell(inp.cells.get(r, c), number="0", size=9, fill=SURFACE_INSET)

        # Weighted revenue AI=34: risked from Python as value (also formula option from class)
        # Store probability AJ=35, weighted = face * prob when face in J or L
        prob = j.get("lead_prob")
        face = j.get("gross") or 0
        if prob is not None:
            inp.cells.get(r, 35).put_value(float(prob))
            style_cell(inp.cells.get(r, 35), number="0%", size=9)
            # Weighted uses J if lead/prospect estimate class else L
            if j["funnel_layer"] == FIN_LEAD_10 or j["funnel_layer"] == FIN_PROSPECT_50:
                inp.cells.get(r, 34).formula = f"=IF(J{er}=\"\",\"\",J{er}*AJ{er})"
            else:
                inp.cells.get(r, 34).formula = f"=IF(L{er}=\"\",\"\",L{er}*AJ{er})"
            style_cell(inp.cells.get(r, 34), number="$#,##0.00", size=9, fill=SURFACE_INSET)
        else:
            inp.cells.get(r, 35).put_value("")
            inp.cells.get(r, 34).put_value(0.0)
            style_cell(inp.cells.get(r, 34), number="$#,##0.00", size=9, fill=SURFACE_INSET)

        inp.cells.get(r, 36).formula = f'=IF(N{er}>={V("AR_Flag_Threshold")},1,0)'
        style_cell(inp.cells.get(r, 36), number="0", size=9, fill=SURFACE_INSET)

        inp.cells.get(r, 37).put_value(str(j["job_id"]))
        style_cell(inp.cells.get(r, 37), size=8)
        inp.cells.get(r, 38).put_value(j["acculynx_url"])
        style_cell(inp.cells.get(r, 38), size=8)
        inp.cells.get(r, 39).put_value((j.get("finance_class") or "") + " · " + (j.get("fin_note") or j.get("lead_prob_note") or ""))
        style_cell(inp.cells.get(r, 39), size=8)
        inp.cells.get(r, 40).put_value(j["has_insurance"])
        inp.cells.get(r, 41).put_value(j["insurance_co"])

    if n:
        inp.auto_filter.range = f"A1:AP{last}"
    inp.freeze_panes(1, 3, 1, 3)
    for c in range(len(headers)):
        inp.cells.set_column_width(c, 12.0)
    inp.cells.set_column_width(2, 20.0)
    inp.cells.set_column_width(6, 32.0)
    inp.cells.set_column_width(11, 14.0)
    inp.cells.set_row_height(0, 42.0)

    # ------------------------------------------------------------------
    # 01_Cover
    # ------------------------------------------------------------------
    cover = wb.worksheets.add("01_Cover")
    for c in range(6):
        cell = cover.cells.get(0, c)
        cell.put_value("" if c else "PRO EXTERIORS · FRIDAY AR/WIP · CALCULATION WORKBOOK")
        style_cell(cell, bold=True, size=16, font_color=ON_NAVY, fill=NAVY)
    cover.cells.merge(0, 0, 1, 6)
    cover.cells.set_row_height(0, 30.0)
    cover.cells.get(1, 0).put_value("Architecture")
    style_cell(cover.cells.get(1, 0), bold=True, font_color=ON_NAVY, fill=NAVY)
    cover.cells.get(1, 1).put_value(
        "00_Variables (assumptions) → Inputs_Jobs (one feeder) → all other sheets are FORMULAS only. Aspose.Cells licensed."
    )
    style_cell(cover.cells.get(1, 1), size=10, fill=ACCENT_SOFT, wrap=True)
    cover.cells.merge(1, 1, 1, 5)
    cover.cells.set_row_height(1, 32.0)

    meta = [
        (3, "As-of", f"={V('AsOf')}"),
        (4, "Generated UTC", f"={V('GeneratedUTC')}"),
        (5, "Company", f"={V('Company')}"),
        (6, "Basis", f"={V('Basis')}"),
        (7, "Bucket law", f"={V('Bucket_Law')}"),
        (8, "Linear", f"={V('Linear')}"),
        (9, "Open jobs", f"=COUNTA(Inputs_Jobs!$A$2:$A${last})"),
        (10, "Critical AR (formula)", f"=SUM(Inputs_Jobs!$N$2:$N${last})"),
        (11, "QB AR (variable)", f"={V('QB_AR_Cash')}"),
        (12, "Gap Ops−QB", "=B11-B12"),
    ]
    for r, lab, form in meta:
        cover.cells.get(r, 0).put_value(lab)
        style_cell(cover.cells.get(r, 0), bold=True, size=10, fill=SURFACE_ALT)
        if form.startswith("="):
            cover.cells.get(r, 1).formula = form
        else:
            cover.cells.get(r, 1).put_value(form)
        if "AR" in lab or "Gap" in lab:
            style_cell(cover.cells.get(r, 1), number="$#,##0.00", bold=True, size=11)
        else:
            style_cell(cover.cells.get(r, 1), size=10)

    cover.cells.get(14, 0).put_value("SIGN-OFF")
    style_cell(cover.cells.get(14, 0), bold=True, font_color=ON_NAVY, fill=NAVY)
    for i, who in enumerate(["Chris", "Ops/Lucinda", "Sales (lead P%)", "CPA recon"]):
        cover.cells.get(15 + i, 0).put_value(who)
        cover.cells.get(15 + i, 1).put_value("")
        style_cell(cover.cells.get(15 + i, 0), size=10, fill=SURFACE_ALT)
    cover.cells.get(20, 0).put_value(
        "MEETING PATH: 02_Exec_Dashboard → 07_Critical_AR → 08_Future_Revenue → 03_Funnel_Money. Edit 00_Variables to stress-test lead %."
    )
    style_cell(cover.cells.get(20, 0), size=10, bold=True, fill=INFO_SOFT, wrap=True)
    cover.cells.merge(20, 0, 1, 6)
    for c in range(6):
        cover.cells.set_column_width(c, 16.0)
    cover.cells.set_column_width(0, 22.0)
    cover.cells.set_column_width(1, 42.0)

    # ------------------------------------------------------------------
    # 02_Exec_Dashboard — 100% formulas for KPI numbers
    # ------------------------------------------------------------------
    dash = wb.worksheets.add("02_Exec_Dashboard")
    for c in range(8):
        cell = dash.cells.get(0, c)
        cell.put_value("" if c else "EXEC DASHBOARD — all KPI values are Excel formulas over Inputs_Jobs + 00_Variables")
        style_cell(cell, bold=True, size=14, font_color=ON_NAVY, fill=NAVY)
    dash.cells.merge(0, 0, 1, 8)
    dash.cells.set_row_height(0, 28.0)

    dash.cells.get(1, 0).put_value("Metric")
    dash.cells.get(1, 1).put_value("Value")
    dash.cells.get(1, 2).put_value("Formula logic")
    dash.cells.get(1, 3).put_value("Basis")
    header_row(dash, 1, ["Metric", "Value", "Formula logic", "Basis"], fill=NAVY)

    # KPI rows — pure formulas
    kpis = [
        ("Open jobs (excl clean Closed)", f"=COUNTA(Inputs_Jobs!$A$2:$A${last})", "Feeder rows", "OPS"),
        ("Jobs with AR N>0", f'=COUNTIF(Inputs_Jobs!$N$2:$N${last},">0")', "Open AR population", "OPS"),
        ("Contract Σ L", f"=SUM(Inputs_Jobs!$L$2:$L${last})", "Contract amount", "OPS"),
        ("Outstanding AR Σ N", f"=SUM(Inputs_Jobs!$N$2:$N${last})", "Job balance_due", "OPS"),
        ("Billed Σ P", f"=SUM(Inputs_Jobs!$P$2:$P${last})", "Billed", "OPS"),
        ("Remaining Balance Σ Q", f"=SUM(Inputs_Jobs!$Q$2:$Q${last})", "Invoice remaining", "OPS"),
        ("Collected Revenue Σ R", f"=SUM(Inputs_Jobs!$R$2:$R${last})", "P−Q", "OPS"),
        ("Uncollected Contract Σ O", f"=SUM(Inputs_Jobs!$O$2:$O${last})", "L−R", "OPS"),
        ("Status Collected in Full count", f'=COUNTIF(Inputs_Jobs!$S$2:$S${last},"Collected in Full")', "R≥L", "OPS"),
        # Bucket funnel AR
        ("Lead · AR N", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Lead",Inputs_Jobs!$N$2:$N${last})', "Bucket Lead", "FUNNEL"),
        ("Estimating · AR N", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Estimating",Inputs_Jobs!$N$2:$N${last})', "Bucket Estimating", "FUNNEL"),
        ("Contracted – awaiting deposit · AR", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Contracted – awaiting deposit",Inputs_Jobs!$N$2:$N${last})', "Bucket", "FUNNEL"),
        ("Approved – deposit invoiced · AR", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Approved – deposit invoiced",Inputs_Jobs!$N$2:$N${last})', "Bucket", "FUNNEL"),
        ("Approved – deposit collected → WIP · AR", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Approved – deposit collected → WIP",Inputs_Jobs!$N$2:$N${last})', "Bucket", "FUNNEL"),
        ("Approved – work complete · AR", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Approved – work complete → final sign-off",Inputs_Jobs!$N$2:$N${last})', "Bucket", "FUNNEL"),
        ("Invoiced · AR N", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Invoiced",Inputs_Jobs!$N$2:$N${last})', "Bucket", "FUNNEL"),
        ("Closed w/AR · Critical", f'=SUMIF(Inputs_Jobs!$G$2:$G${last},"Closed w/AR",Inputs_Jobs!$N$2:$N${last})', "Only closed still in report", "FUNNEL"),
        ("Closed (clean) count", f'=COUNTIF(Inputs_Jobs!$G$2:$G${last},"Closed")', "Should be 0 — excluded", "CHECK"),
        # Weighted future revenue (finance tags still in Class note / Future sheet)
        ("Future rev weighted Σ AI", f"=SUM(Inputs_Jobs!$AI$2:$AI${last})", "10/50/90 weighted", "OPS"),
        ("QB A/R CoA $", f"={V('QB_AR_Cash')}", "Variables", "CASH"),
        ("AR gap N − QB $", f"=B6-{V('QB_AR_Cash')}", "Job AR − QB (B6=Outstanding AR)", "RECON"),
        ("Bank cash $", f"={V('Bank_Cash_Registers')}", "Variables", "CASH"),
        ("AVG Days Lead", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AB$2:$AB${last},">=0"),"")', "AB", "OPS"),
        ("AVG Days Prospect", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AC$2:$AC${last},">=0"),"")', "AC", "OPS"),
        ("AVG Days Approved→Invoice", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AD$2:$AD${last},">=0"),"")', "AD", "OPS"),
        ("AVG Days WIP", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AE$2:$AE${last},">=0"),"")', "AE", "OPS"),
        ("AVG Days Supplement", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AF$2:$AF${last},">=0"),"")', "AF", "OPS"),
        ("AVG Days Final Collections", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AG$2:$AG${last},">=0"),"")', "AG", "OPS"),
        ("AVG Days Critical AR", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AH$2:$AH${last},">=0"),"")', "AH", "OPS"),
    ]

    for i, (metric, formula, logic, basis) in enumerate(kpis):
        r = 2 + i
        dash.cells.get(r, 0).put_value(metric)
        style_cell(dash.cells.get(r, 0), bold=True, size=10, fill=SURFACE_ALT if i % 2 == 0 else WHITE)
        dash.cells.get(r, 1).formula = formula
        is_money = "$" in metric or "gap" in metric.lower()
        is_pct = "prob over stale" in metric.lower()
        if is_pct:
            style_cell(dash.cells.get(r, 1), number="0%", bold=True, size=12, font_color=NAVY)
        elif is_money:
            style_cell(dash.cells.get(r, 1), number="$#,##0.00", bold=True, size=12, font_color=ERROR if "gap" in metric.lower() or "Critical" in metric else NAVY)
        else:
            style_cell(dash.cells.get(r, 1), number="#,##0", bold=True, size=12)
        dash.cells.get(r, 2).put_value(logic)
        style_cell(dash.cells.get(r, 2), size=9, font_color=MUTED)
        dash.cells.get(r, 3).put_value(basis)
        style_cell(dash.cells.get(r, 3), size=9)


    so_r = 2 + len(kpis) + 1
    dash.cells.get(so_r, 0).put_value("SO WHAT — money SoT + dwell (live formulas above)")
    style_cell(dash.cells.get(so_r, 0), bold=True, font_color=ON_NAVY, fill=NAVY)
    dash.cells.merge(so_r, 0, 1, 4)
    tips = [
        "1. Funnel layer G = Dashboard bucket. Closed $0 AR excluded. 05/06 = open AR jobs only nested by location/rep.",
        "2. Closed w/AR only closed jobs in report. 05 Location + 06 Salesperson nest jobs with N>0 + Bucket.",
        "3. Future revenue: Lead 10% · Prospect est 50% · Prospect contract 90%. Pending WIP / Revenue Realized / Critical AR.",
        "4. Payments: no AccuLynx payment table in mirror — Collected≈P−Q on invoices. QBO payments exist but not job-keyed yet.",
        "5. Stress-test: edit Prob_Lead_Estimate / Prob_Prospect_* on Variables (rebuild applies class rules).",
    ]
    for i, t in enumerate(tips):
        dash.cells.get(so_r + 1 + i, 0).put_value(t)
        style_cell(dash.cells.get(so_r + 1 + i, 0), size=10, fill=SURFACE_INSET if i % 2 == 0 else WHITE)
        dash.cells.merge(so_r + 1 + i, 0, 1, 4)

    for c, w in enumerate([34.0, 16.0, 48.0, 12.0]):
        dash.cells.set_column_width(c, w)

    # ------------------------------------------------------------------
    # 03_Funnel_Money — formula
    # ------------------------------------------------------------------



    def write_nested_ar_jobs(
        ws,
        *,
        title: str,
        group_key: str,
        group_label: str,
        groups_order: List[str],
        jobs_src: List[Dict[str, Any]],
        only_ar: bool = True,
    ) -> None:
        """Location/bucket/rep header bands + job rows (N>0) with SUMIF money from Inputs."""
        for c in range(13):
            cell = ws.cells.get(0, c)
            cell.put_value("" if c else title)
            style_cell(cell, bold=True, size=12, font_color=ON_NAVY, fill=NAVY)
        ws.cells.merge(0, 0, 1, 12)
        header_row(
            ws,
            1,
            [
                f"{group_label} / Job #",
                "Client",
                "Bucket (funnel)",
                "Days in current bucket",
                "Location",
                "Salesperson",
                "Contract L $",
                "Outstanding AR N $",
                "Billed P $",
                "Remaining Q $",
                "Collected R $",
                "Status S",
                "URL",
            ],
            fill=NAVY,
        )
        pool = [j for j in jobs_src if (not only_ar) or (j.get("outstanding_ar") or 0) > 0]
        by: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for j in pool:
            by[j.get(group_key) or "(blank)"].append(j)
        # order
        ordered = [g for g in groups_order if g in by]
        ordered += sorted([g for g in by if g not in ordered], key=lambda x: -sum(jj["outstanding_ar"] for jj in by[x]))
        row_i = 2
        for gname in ordered:
            jobs_here = sorted(by[gname], key=lambda x: -x["outstanding_ar"])
            if not jobs_here:
                continue
            ar_sum = sum(j["outstanding_ar"] for j in jobs_here)
            c_sum = sum(j["contract"] for j in jobs_here)
            ws.cells.get(row_i, 0).put_value(f"▸ {gname}")
            style_cell(ws.cells.get(row_i, 0), bold=True, size=11, font_color=ON_NAVY, fill=NAVY)
            for c in range(1, 13):
                style_cell(ws.cells.get(row_i, c), fill=NAVY, font_color=ON_NAVY)
            ws.cells.get(row_i, 1).put_value(f"{len(jobs_here)} jobs")
            style_cell(ws.cells.get(row_i, 1), bold=True, size=10, font_color=ON_NAVY, fill=NAVY)
            ws.cells.get(row_i, 6).put_value(float(c_sum))
            style_cell(ws.cells.get(row_i, 6), number="$#,##0.00", bold=True, font_color=ON_NAVY, fill=NAVY)
            ws.cells.get(row_i, 7).put_value(float(ar_sum))
            style_cell(ws.cells.get(row_i, 7), number="$#,##0.00", bold=True, font_color=ON_NAVY, fill=NAVY)
            row_i += 1
            for j in jobs_here:
                jid = str(j["job_id"]).replace('"', '""')
                ws.cells.get(row_i, 0).put_value(str(j.get("job_num") or "") or "(no #)")
                ws.cells.get(row_i, 1).put_value(j["client"])
                ws.cells.get(row_i, 2).put_value(j["bucket"])
                style_cell(ws.cells.get(row_i, 2), size=9, bold=True)
                dib = j.get("days_in_current_bucket")
                if dib is not None:
                    ws.cells.get(row_i, 3).put_value(int(dib))
                    style_cell(ws.cells.get(row_i, 3), number="0", size=9, h_align="right")
                else:
                    ws.cells.get(row_i, 3).put_value("")
                ws.cells.get(row_i, 4).put_value(j["location"])
                ws.cells.get(row_i, 5).put_value(j["salesperson"])
                for col, letter in [(6, "L"), (7, "N"), (8, "P"), (9, "Q"), (10, "R")]:
                    ws.cells.get(row_i, col).formula = (
                        f'=IFERROR(SUMIF(Inputs_Jobs!$AL$2:$AL${last},"{jid}",Inputs_Jobs!${letter}$2:${letter}${last}),0)'
                    )
                    style_cell(ws.cells.get(row_i, col), number="$#,##0.00", size=9)
                st = j.get("collection_status") or ""
                ws.cells.get(row_i, 11).put_value(st)
                style_status_cell(ws.cells.get(row_i, 11), st)
                ws.cells.get(row_i, 12).put_value(j["acculynx_url"])
                style_cell(ws.cells.get(row_i, 12), size=8)
                row_i += 1
        ws.cells.get(row_i, 0).put_value("TOTAL (open AR)")
        style_cell(ws.cells.get(row_i, 0), bold=True, fill=ERROR_SURF)
        ws.cells.get(row_i, 7).formula = f'=SUMIF(Inputs_Jobs!$N$2:$N${last},">0",Inputs_Jobs!$N$2:$N${last})'
        style_cell(ws.cells.get(row_i, 7), number="$#,##0.00", bold=True, fill=ERROR_SURF, font_color=ERROR)
        ws.freeze_panes(2, 0, 2, 0)
        for c, w in enumerate([16.0, 20.0, 26.0, 10.0, 12.0, 14.0, 12.0, 14.0, 11.0, 11.0, 11.0, 12.0, 24.0]):
            ws.cells.set_column_width(c, float(w))


    fun = wb.worksheets.add("03_Funnel_Money")
    write_nested_ar_jobs(
        fun,
        title="03 FUNNEL BY BUCKET — nested open-AR jobs (N>0) under each bucket · same pattern as 05/06",
        group_key="bucket",
        group_label="Bucket",
        groups_order=list(LOCKED_BUCKETS),
        jobs_src=jobs,
        only_ar=True,
    )

    # ------------------------------------------------------------------
    # 04_Buckets_Locked — counts/sums FORMULA; meaning text static
    # ------------------------------------------------------------------

    bkt = wb.worksheets.add("04_Buckets_Locked")
    write_nested_ar_jobs(
        bkt,
        title="04 BUCKETS LOCKED — docs/75 names · nested open-AR jobs only · Closed $0 AR excluded from Inputs",
        group_key="bucket",
        group_label="Locked bucket",
        groups_order=list(LOCKED_BUCKETS),
        jobs_src=jobs,
        only_ar=True,
    )
    # footnote
    # (nesting already complete)


    # 05 / 06 — nested open-AR jobs (shared writer includes Days in current bucket)
    loc = wb.worksheets.add("05_By_Location")
    write_nested_ar_jobs(
        loc,
        title="05 BY LOCATION — open AR (N>0) · nested jobs · Bucket · Days in current bucket",
        group_key="location",
        group_label="Location",
        groups_order=[],
        jobs_src=jobs,
        only_ar=True,
    )

    rep = wb.worksheets.add("06_By_Salesperson")
    write_nested_ar_jobs(
        rep,
        title="06 BY SALESPERSON — open AR (N>0) · nested jobs · Bucket · Days in current bucket",
        group_key="salesperson",
        group_label="Salesperson",
        groups_order=[],
        jobs_src=jobs,
        only_ar=True,
    )

    # 07_Critical_AR — feeder filter view: values for identity, AR is value
    # from feeder (not re-summed wrong). Sort by AR in Python for meeting
    # order; AR column is still the same fact (could be VLOOKUP — keep value
    # from feeder as it's the same grain as Inputs). Rank = formula.
    # Actually for purity: only Job ID as key + VLOOKUP formulas.
    # Speed: write Job ID + use SUMIF for AR by job id.
    # ------------------------------------------------------------------

    # 07_Critical_AR — ONLY bucket Invoiced or Closed w/AR with N > 0
    ars = wb.worksheets.add("07_Critical_AR")
    for c in range(12):
        cell = ars.cells.get(0, c)
        cell.put_value(
            ""
            if c
            else "07 CRITICAL AR — Bucket = Invoiced OR Closed w/AR · Outstanding AR (N) > $0 ONLY"
        )
        style_cell(cell, bold=True, size=12, font_color=ON_NAVY, fill=ERROR)
    ars.cells.merge(0, 0, 1, 11)
    ars.cells.get(1, 0).put_value(
        "Not a general AR list (see 05/06). Dates = YYYY-MM-DD. Empty if no jobs currently in Invoiced/Closed w/AR with balance."
    )
    style_cell(ars.cells.get(1, 0), size=9, fill=ACCENT_SOFT, wrap=True)
    ars.cells.merge(1, 0, 1, 11)
    header_row(
        ars,
        2,
        [
            "Rank",
            "Job ID",
            "Outstanding AR N $",
            "Bucket",
            "Location",
            "Job #",
            "Client",
            "Salesperson",
            "Billed P $",
            "Remaining Q $",
            "Date Invoice Sent",
            "Date Invoiced Milestone",
            "Date Closed",
            "Status S",
            "URL",
        ],
        fill=ERROR,
    )
    crit = [
        j
        for j in jobs
        if j.get("bucket") in ("Invoiced", "Closed w/AR") and (j.get("outstanding_ar") or 0) > 0
    ]
    crit.sort(key=lambda j: -j["outstanding_ar"])
    for i, j in enumerate(crit, start=3):
        er = i + 1
        jid = str(j["job_id"]).replace('"', '""')
        ars.cells.get(i, 0).formula = f"=ROW()-3"
        style_cell(ars.cells.get(i, 0), number="0")
        ars.cells.get(i, 1).put_value(j["job_id"])
        ars.cells.get(i, 2).formula = (
            f'=IFERROR(SUMIF(Inputs_Jobs!$AL$2:$AL${last},"{jid}",Inputs_Jobs!$N$2:$N${last}),0)'
        )
        style_cell(ars.cells.get(i, 2), number="$#,##0.00", bold=True, font_color=ERROR)
        ars.cells.get(i, 3).put_value(j["bucket"])
        style_cell(ars.cells.get(i, 3), bold=True, size=9)
        ars.cells.get(i, 4).put_value(j["location"])
        ars.cells.get(i, 5).put_value(str(j.get("job_num") or ""))
        ars.cells.get(i, 6).put_value(j["client"])
        ars.cells.get(i, 7).put_value(j["salesperson"])
        ars.cells.get(i, 8).formula = (
            f'=IFERROR(SUMIF(Inputs_Jobs!$AL$2:$AL${last},"{jid}",Inputs_Jobs!$P$2:$P${last}),0)'
        )
        ars.cells.get(i, 9).formula = (
            f'=IFERROR(SUMIF(Inputs_Jobs!$AL$2:$AL${last},"{jid}",Inputs_Jobs!$Q$2:$Q${last}),0)'
        )
        style_cell(ars.cells.get(i, 8), number="$#,##0.00")
        style_cell(ars.cells.get(i, 9), number="$#,##0.00")
        # Dates as real dates
        for col, key in [(10, "d_wip_start"), (11, "d_wip_close"), (12, "d_closed")]:
            d = parse_date(j.get(key))
            if d:
                ars.cells.get(i, col).put_value(datetime(d.year, d.month, d.day))
                style_cell(ars.cells.get(i, col), number="YYYY-MM-DD", size=9)
            else:
                ars.cells.get(i, col).put_value("")
        st = j.get("collection_status") or ""
        ars.cells.get(i, 13).put_value(st)
        style_status_cell(ars.cells.get(i, 13), st)
        ars.cells.get(i, 14).put_value(j["acculynx_url"])
        style_cell(ars.cells.get(i, 14), size=8)
    if crit:
        excel_last = 3 + len(crit)
        ars.auto_filter.range = f"A3:O{excel_last}"
        tot = len(crit) + 3
        ars.cells.get(tot, 1).put_value("TOTAL Critical AR")
        style_cell(ars.cells.get(tot, 1), bold=True, fill=ERROR_SURF)
        ars.cells.get(tot, 2).formula = f"=SUM(C4:C{excel_last})"
        style_cell(ars.cells.get(tot, 2), bold=True, number="$#,##0.00", fill=ERROR_SURF, font_color=ERROR)
    else:
        ars.cells.get(3, 1).put_value(
            "No jobs currently in Bucket Invoiced or Closed w/AR with Outstanding AR > $0."
        )
        style_cell(ars.cells.get(3, 1), size=10, fill=SURFACE_INSET)
        ars.cells.merge(3, 1, 1, 8)
    ars.freeze_panes(3, 0, 3, 0)
    for c, w in enumerate([6.0, 14.0, 14.0, 22.0, 12.0, 10.0, 20.0, 14.0, 11.0, 11.0, 12.0, 14.0, 12.0, 12.0, 24.0]):
        ars.cells.set_column_width(c, float(w))

    # 08_Future_Revenue — weighted pipeline (10/50/90)
    lead = wb.worksheets.add("08_Future_Revenue")
    for c in range(10):
        cell = lead.cells.get(0, c)
        cell.put_value(
            ""
            if c
            else "FUTURE REVENUE — Lead 10% / Prospect est 50% / Prospect contract 90%. Job ID + formulas."
        )
        style_cell(cell, bold=True, size=11, font_color=NAVY, fill=ACCENT)
    lead.cells.merge(0, 0, 1, 10)
    header_row(
        lead,
        1,
        [
            "Job ID",
            "Financial class",
            "Probability",
            "Estimated Rev J",
            "Contract L",
            "Weighted $",
            "Location",
            "Client",
            "Salesperson",
            "Class note",
            "URL",
        ],
        fill=NAVY,
    )
    fut = [
        j
        for j in jobs
        if j.get("finance_class")
        in (FIN_LEAD_10, FIN_PROSPECT_50, FIN_PROSPECT_90)
    ]
    fut.sort(key=lambda j: (-(j.get("risked") or 0), j["client"]))
    for i, j in enumerate(fut, start=2):
        er = i + 1
        lead.cells.get(i, 0).put_value(j["job_id"])
        lead.cells.get(i, 1).put_value(j.get("finance_class") or "")
        lead.cells.get(i, 2).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$AJ$2:$AJ${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
        style_cell(lead.cells.get(i, 2), number="0%")
        lead.cells.get(i, 3).formula = (
            f'=SUMIF(Inputs_Jobs!$AL$2:$AL${last},A{er},Inputs_Jobs!$J$2:$J${last})'
        )
        style_cell(lead.cells.get(i, 3), number="$#,##0.00")
        lead.cells.get(i, 4).formula = (
            f'=SUMIF(Inputs_Jobs!$AL$2:$AL${last},A{er},Inputs_Jobs!$L$2:$L${last})'
        )
        style_cell(lead.cells.get(i, 4), number="$#,##0.00")
        lead.cells.get(i, 5).formula = (
            f'=SUMIF(Inputs_Jobs!$AL$2:$AL${last},A{er},Inputs_Jobs!$AI$2:$AI${last})'
        )
        style_cell(lead.cells.get(i, 5), number="$#,##0.00", bold=True)
        lead.cells.get(i, 6).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$A$2:$A${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
        lead.cells.get(i, 7).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$C$2:$C${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
        lead.cells.get(i, 8).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$H$2:$H${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
        lead.cells.get(i, 9).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$AN$2:$AN${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
        lead.cells.get(i, 10).formula = (
            f'=IFERROR(INDEX(Inputs_Jobs!$AM$2:$AM${last},MATCH(A{er},Inputs_Jobs!$AL$2:$AL${last},0)),"")'
        )
    if fut:
        excel_last = 2 + len(fut)
        lead.auto_filter.range = f"A2:K{excel_last}"
        tot = len(fut) + 2
        lead.cells.get(tot, 0).put_value("TOTAL weighted")
        lead.cells.get(tot, 5).formula = f"=SUM(F3:F{excel_last})"
        style_cell(lead.cells.get(tot, 5), bold=True, number="$#,##0.00", fill=ACCENT_SOFT)
    lead.freeze_panes(2, 0, 2, 0)
    for c, w in enumerate([14.0, 32.0, 10.0, 12.0, 12.0, 12.0, 12.0, 20.0, 14.0, 28.0, 22.0]):
        lead.cells.set_column_width(c, w)

    # ------------------------------------------------------------------
    # 09_Cash_Debt — account list values; total formula
    # ------------------------------------------------------------------
    cash = wb.worksheets.add("09_Cash_Debt")
    cash.cells.get(0, 0).put_value("CASH & DEBT — register lines are facts; total is formula. Bank total also on Variables.")
    style_cell(cash.cells.get(0, 0), bold=True, size=11, font_color=ON_NAVY, fill=NAVY)
    cash.cells.merge(0, 0, 1, 3)
    header_row(cash, 1, ["Kind", "Account", "Balance $"], fill=NAVY)
    row = 2
    for reg in sorted(data["registers"], key=lambda r: (r.get("register_kind") or "", r.get("account_name") or "")):
        cash.cells.get(row, 0).put_value(reg.get("register_kind") or "")
        cash.cells.get(row, 1).put_value(reg.get("account_name") or "")
        cash.cells.get(row, 2).put_value(money(reg.get("current_balance")))
        style_cell(cash.cells.get(row, 2), number="$#,##0.00")
        row += 1
    if row > 2:
        cash.cells.get(row, 0).put_value("TOTAL")
        style_cell(cash.cells.get(row, 0), bold=True, fill=SURFACE_ALT)
        cash.cells.get(row, 2).formula = f"=SUM(C3:C{row})"
        style_cell(cash.cells.get(row, 2), bold=True, number="$#,##0.00", fill=SURFACE_ALT)
        cash.cells.get(row + 2, 0).put_value("Variables Bank_Cash_Registers (should match bank kinds)")
        cash.cells.get(row + 2, 1).formula = f"={V('Bank_Cash_Registers')}"
        style_cell(cash.cells.get(row + 2, 1), number="$#,##0.00", bold=True)
    autosize(cash, 3, 40)

    # ------------------------------------------------------------------
    # 10_Recon_Bridge — formulas
    # ------------------------------------------------------------------
    recon = wb.worksheets.add("10_Recon_Bridge")
    recon.cells.get(0, 0).put_value("AR RECON BRIDGE — formulas only for amounts")
    style_cell(recon.cells.get(0, 0), bold=True, size=12, font_color=ON_NAVY, fill=NAVY)
    recon.cells.merge(0, 0, 1, 3)
    header_row(recon, 2, ["Line", "Amount $", "Notes"], fill=NAVY)
    recon.cells.get(3, 0).put_value("A. QB A/R (CoA) — Variables")
    recon.cells.get(3, 1).formula = f"={V('QB_AR_Cash')}"
    style_cell(recon.cells.get(3, 1), number="$#,##0.00", bold=True)
    recon.cells.get(3, 2).put_value("CASH books")
    recon.cells.get(4, 0).put_value("B. AccuLynx open AR — Inputs sum")
    recon.cells.get(4, 1).formula = f"=SUM(Inputs_Jobs!$N$2:$N${last})"
    style_cell(recon.cells.get(4, 1), number="$#,##0.00", bold=True)
    recon.cells.get(4, 2).put_value("OPS")
    recon.cells.get(5, 0).put_value("C. Gap (B − A)")
    recon.cells.get(5, 1).formula = "=B5-B4"
    style_cell(recon.cells.get(5, 1), number="$#,##0.00", bold=True, font_color=ERROR)
    recon.cells.get(5, 2).put_value("Label before bank send")
    recon.cells.get(7, 0).put_value("Bank options: (1) QB AR only (2) QB+ops appendix labeled (3) hold send")
    style_cell(recon.cells.get(7, 0), size=10, fill=ACCENT_SOFT)
    recon.cells.merge(7, 0, 1, 3)
    autosize(recon, 3, 50)

    # ------------------------------------------------------------------
    # 11_Friday_Agenda — schedule static; live numbers via formula refs
    # ------------------------------------------------------------------

    # 11_Friday_Meeting — AR cashflow board (next 3 weeks) + dwell KPIs + editable dates
    ag = wb.worksheets.add("11_Friday_Meeting")
    for c in range(14):
        cell = ag.cells.get(0, c)
        cell.put_value(
            ""
            if c
            else f"FRIDAY AR MEETING · {as_of} · Set expected cash dates · Review hit/miss next week · 3-week cash map"
        )
        style_cell(cell, bold=True, size=14, font_color=ON_NAVY, fill=NAVY)
    ag.cells.merge(0, 0, 1, 13)
    ag.cells.set_row_height(0, 28.0)

    # KPI cards row 2-4
    ag.cells.get(2, 0).put_value("DWELL KPI CARDS (formula averages from Inputs)")
    style_cell(ag.cells.get(2, 0), bold=True, size=11, font_color=ON_NAVY, fill=ACCENT)
    ag.cells.merge(2, 0, 1, 13)

    kpi_defs = [
        ("DAYS IN LEAD", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AB$2:$AB${last},">=0"),"")'),
        ("DAYS IN PROSPECT", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AC$2:$AC${last},">=0"),"")'),
        ("DAYS IN APPROVED (no inv)", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AD$2:$AD${last},">=0"),"")'),
        ("DAYS IN WIP (inv→completed)", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AE$2:$AE${last},">=0"),"")'),
        ("DAYS IN SUPPLEMENT (comp→inv)", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AF$2:$AF${last},">=0"),"")'),
        ("DAYS IN FINAL INVOICING (inv→closed)", f'=IFERROR(AVERAGEIF(Inputs_Jobs!$AG$2:$AG${last},">=0"),"")'),
        ("OPEN AR JOBS", f'=COUNTIF(Inputs_Jobs!$N$2:$N${last},">0")'),
        ("OUTSTANDING AR $", f"=SUM(Inputs_Jobs!$N$2:$N${last})"),
    ]
    for i, (lab, form) in enumerate(kpi_defs):
        c0 = (i % 4) * 3
        r0 = 3 + (i // 4) * 3
        ag.cells.get(r0, c0).put_value(lab)
        style_cell(ag.cells.get(r0, c0), bold=True, size=8, font_color=MUTED, fill=SURFACE_ALT)
        ag.cells.merge(r0, c0, 1, 2)
        ag.cells.get(r0 + 1, c0).formula = form
        is_money = "$" in lab
        style_cell(
            ag.cells.get(r0 + 1, c0),
            bold=True,
            size=16,
            font_color=NAVY,
            fill=SURFACE_INSET,
            number="$#,##0" if is_money else "0.0",
        )
        ag.cells.merge(r0 + 1, c0, 1, 2)
        ag.cells.set_row_height(r0 + 1, 26.0)

    # Instructions
    ag.cells.get(9, 0).put_value(
        "MEETING USE: (1) Review every open-AR job below by location. (2) Enter Expected Invoice/Cash date "
        "(prospect→invoiced / cash to bank). (3) Enter Expected Paid-in-Full date for remaining balance. "
        "(4) Next Friday: mark Hit/Miss vs collected. Purple=Pending · Yellow=Invoiced path · Red=Critical AR · Green=Collected in Full."
    )
    style_cell(ag.cells.get(9, 0), size=9, wrap=True, fill=INFO_SOFT)
    ag.cells.merge(9, 0, 1, 13)
    ag.cells.set_row_height(9, 40.0)

    # 3-week cash map headers
    ag.cells.get(11, 0).put_value("3-WEEK ANTICIPATED CASH MAP (sums of N where Expected Paid-In-Full falls in week — fill dates first)")
    style_cell(ag.cells.get(11, 0), bold=True, size=10, font_color=ON_NAVY, fill=NAVY)
    ag.cells.merge(11, 0, 1, 6)
    # Week buckets as labels; SUMIFS once dates filled on this sheet column Expected Paid (col L = index 11)
    from datetime import timedelta
    as_of_d = date.fromisoformat(as_of)
    week_starts = [as_of_d, as_of_d + timedelta(days=7), as_of_d + timedelta(days=14)]
    for i, ws_d in enumerate(week_starts):
        we = ws_d + timedelta(days=6)
        ag.cells.get(12, i * 2).put_value(f"Week {i+1}: {ws_d.isoformat()} → {we.isoformat()}")
        style_cell(ag.cells.get(12, i * 2), bold=True, size=9, fill=ACCENT_SOFT)
        ag.cells.merge(12, i * 2, 1, 2)
        # Note: cash map totals filled manually or via SUMIF on Expected Paid column after user enters dates
        ag.cells.get(13, i * 2).put_value("(sum Expected Paid-In-Full AR in week — after dates entered)")
        style_cell(ag.cells.get(13, i * 2), size=8, font_color=MUTED)

    # Worklist header
    hdr_row = 15
    ag.cells.get(hdr_row, 0).put_value("ALL OPEN AR JOBS — nested by location · FILL yellow date columns · Hit/Miss reviewed next Friday")
    style_cell(ag.cells.get(hdr_row, 0), bold=True, size=11, font_color=ON_NAVY, fill=ACCENT)
    ag.cells.merge(hdr_row, 0, 1, 13)

    headers_f = [
        "Location / Job #",
        "Client",
        "Bucket",
        "Salesperson",
        "Outstanding AR N $",
        "Status S",
        "Expected Invoice/Cash date (FILL)",
        "Expected Paid-in-Full date (FILL)",
        "Prior Expected Paid (last week)",
        "Hit / Miss (next review)",
        "Collected since last? (FILL)",
        "Notes (FILL)",
        "Job ID",
        "URL",
    ]
    header_row(ag, hdr_row + 1, headers_f, fill=NAVY)

    ar_jobs_f = sorted(
        [j for j in jobs if (j.get("outstanding_ar") or 0) > 0],
        key=lambda j: (j["location"], -j["outstanding_ar"]),
    )
    by_loc_f: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for j in ar_jobs_f:
        by_loc_f[j["location"]].append(j)

    row_i = hdr_row + 2
    data_start_excel = row_i + 1
    for loc_name in sorted(by_loc_f.keys(), key=lambda x: -sum(j["outstanding_ar"] for j in by_loc_f[x])):
        jobs_here = by_loc_f[loc_name]
        # location header
        ag.cells.get(row_i, 0).put_value(f"▸ {loc_name}")
        style_cell(ag.cells.get(row_i, 0), bold=True, size=11, font_color=ON_NAVY, fill=NAVY)
        for c in range(1, 14):
            style_cell(ag.cells.get(row_i, c), fill=NAVY)
        ag.cells.get(row_i, 1).put_value(f"{len(jobs_here)} AR jobs")
        style_cell(ag.cells.get(row_i, 1), bold=True, font_color=ON_NAVY, fill=NAVY)
        ag.cells.get(row_i, 4).put_value(float(sum(j["outstanding_ar"] for j in jobs_here)))
        style_cell(ag.cells.get(row_i, 4), number="$#,##0.00", bold=True, font_color=ON_NAVY, fill=NAVY)
        row_i += 1
        for j in jobs_here:
            jid = str(j["job_id"]).replace('"', '""')
            er = row_i + 1
            ag.cells.get(row_i, 0).put_value(str(j.get("job_num") or "") or "(no #)")
            ag.cells.get(row_i, 1).put_value(j["client"])
            ag.cells.get(row_i, 2).put_value(j["bucket"])
            style_cell(ag.cells.get(row_i, 2), size=9, bold=True)
            ag.cells.get(row_i, 3).put_value(j["salesperson"])
            ag.cells.get(row_i, 4).formula = (
                f'=IFERROR(SUMIF(Inputs_Jobs!$AL$2:$AL${last},"{jid}",Inputs_Jobs!$N$2:$N${last}),0)'
            )
            style_cell(ag.cells.get(row_i, 4), number="$#,##0.00", bold=True, size=9)
            st = j.get("collection_status") or ""
            ag.cells.get(row_i, 5).put_value(st)
            style_status_cell(ag.cells.get(row_i, 5), st)
            # FILL dates — amber
            for c in (6, 7):
                ag.cells.get(row_i, c).put_value("")
                style_cell(ag.cells.get(row_i, c), size=9, fill=ACCENT_SOFT, number="YYYY-MM-DD")
            # Prior expected — fill next week from archive / blank
            ag.cells.get(row_i, 8).put_value("")
            style_cell(ag.cells.get(row_i, 8), size=9, fill=SURFACE_ALT, number="YYYY-MM-DD")
            # Hit/Miss formula: if prior expected filled and collected note Y → Hit else if prior < as_of and no collect → Miss
            ag.cells.get(row_i, 9).formula = (
                f'=IF(I{er}="","",'
                f'IF(AND(K{er}="Y",I{er}<>""),"HIT",'
                f'IF(AND(I{er}<>"",I{er}<\'00_Variables\'!$B$3,OR(K{er}="",K{er}="N")),"MISS","")))'
            )
            style_cell(ag.cells.get(row_i, 9), bold=True, size=9, h_align="center")
            ag.cells.get(row_i, 10).put_value("")  # Y/N collected
            style_cell(ag.cells.get(row_i, 10), size=9, fill=ACCENT_SOFT, h_align="center")
            ag.cells.get(row_i, 11).put_value("")
            style_cell(ag.cells.get(row_i, 11), size=9, fill=SURFACE_INSET)
            ag.cells.get(row_i, 12).put_value(j["job_id"])
            style_cell(ag.cells.get(row_i, 12), size=7)
            ag.cells.get(row_i, 13).put_value(j["acculynx_url"])
            style_cell(ag.cells.get(row_i, 13), size=7)
            row_i += 1

    ag.cells.get(row_i, 0).put_value("TOTAL open AR")
    style_cell(ag.cells.get(row_i, 0), bold=True, fill=ERROR_SURF)
    ag.cells.get(row_i, 4).formula = f'=SUMIF(Inputs_Jobs!$N$2:$N${last},">0",Inputs_Jobs!$N$2:$N${last})'
    style_cell(ag.cells.get(row_i, 4), number="$#,##0.00", bold=True, fill=ERROR_SURF, font_color=ERROR)

    # Week cash SUMIF notes below
    row_i += 2
    ag.cells.get(row_i, 0).put_value(
        "CASH MAP TIP: Filter/sort by Expected Paid-in-Full (col H). Sum AR (col E) for dates in next 7/14/21 days for bank forecast. "
        "Next meeting: copy col H → Prior Expected (col I), clear H, re-set dates, mark Hit/Miss."
    )
    style_cell(ag.cells.get(row_i, 0), size=9, wrap=True, fill=SURFACE_INSET)
    ag.cells.merge(row_i, 0, 1, 13)
    ag.cells.set_row_height(row_i, 36.0)

    ag.freeze_panes(hdr_row + 2, 0, hdr_row + 2, 0)
    for c, w in enumerate([14.0, 18.0, 24.0, 12.0, 12.0, 11.0, 14.0, 14.0, 12.0, 10.0, 12.0, 16.0, 12.0, 20.0]):
        ag.cells.set_column_width(c, float(w))

    # Reorder sheets: Variables, Cover, Dashboard, Funnel, Buckets, ...
    # Aspose: move_to
    order = [
        "00_Variables",
        "01_Cover",
        "02_Exec_Dashboard",
        "03_Funnel_Money",
        "04_Buckets_Locked",
        "05_By_Location",
        "06_By_Salesperson",
        "07_Critical_AR",
        "08_Future_Revenue",
        "09_Cash_Debt",
        "10_Recon_Bridge",
        "11_Friday_Meeting",
        "Inputs_Jobs",
    ]
    for idx, name in enumerate(order):
        for i in range(len(wb.worksheets)):
            if wb.worksheets[i].name == name:
                wb.worksheets[i].move_to(idx)
                break

    wb.calculate_formula()

    # Quality gate: count formulas on dashboard
    dash_ws = wb.worksheets.get("02_Exec_Dashboard")
    fcount = 0
    for r in range(2, 40):
        if dash_ws.cells.get(r, 1).formula:
            fcount += 1
    print(f"quality: dashboard KPI formulas={fcount}")
    if fcount < 18:
        raise SystemExit(f"FAIL quality gate: only {fcount} dashboard formulas")

    out_path = out_dir / f"{audience}-{as_of}.xlsx"
    wb.save(str(out_path))
    print("wrote excel", out_path, "sheets", [ws.name for ws in wb.worksheets])
    return out_path


def write_pdf(
    audience: str,
    as_of: str,
    built: Dict[str, Any],
    data: Dict[str, Any],
    excel_name: str,
    out_dir: Path,
) -> Optional[Path]:
    try:
        from aspose.pdf import Document, HtmlFragment
    except Exception as e:
        print("PDF skip:", e)
        return None

    f = built["funnel"]
    qb_ar = money(data.get("qb_ar"))
    gap = f["critical_ar"] - num(data.get("qb_ar"))
    banks = [r for r in data["registers"] if (r.get("register_kind") or "") == "bank"]
    bank_total = sum(num(r.get("current_balance")) for r in banks)

    bucket_rows = ""
    for name in LOCKED_BUCKETS:
        a = built["bucket_agg"].get(name) or {"count": 0, "gross": 0.0, "ar": 0.0}
        if not a["count"]:
            continue
        bucket_rows += (
            f"<tr><td>{name}</td><td style='text-align:right'>{int(a['count'])}</td>"
            f"<td style='text-align:right'>${a['gross']:,.0f}</td>"
            f"<td style='text-align:right'>${a['ar']:,.0f}</td></tr>"
        )

    html = f"""
    <html><head><meta charset="utf-8"/></head>
    <body style="font-family: Calibri, Arial, sans-serif; color:#111827; margin:28px;">
    <div style="background:#11133f;color:#fff;padding:18px 22px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#eaa221;font-weight:700;">Pro Exteriors LLC</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">Friday AR / WIP Executive Brief</div>
      <div style="font-size:12px;opacity:.9;margin-top:6px;">As-of {as_of} · /analytics v2 · PEC-100 · Design.md</div>
    </div>

    <h2 style="color:#11133f;border-bottom:2px solid #eaa221;padding-bottom:4px;">Funnel money (meeting language)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <tr style="background:#11133f;color:#fff;"><th align="left">Layer</th><th align="right">Face / Gross</th><th align="right">Risked / Meeting</th></tr>
      <tr style="background:#fbedd2;"><td><b>Funny money (Leads)</b></td><td align="right">${f['funny_gross']:,.0f}</td><td align="right">${f['funny_risked']:,.0f}</td></tr>
      <tr><td>Planned money (Estimating)</td><td align="right">${f['planned']:,.0f}</td><td align="right">${f['planned']:,.0f}</td></tr>
      <tr style="background:#d3e7da;"><td><b>Contract money (Approved+)</b></td><td align="right">${f['contract']:,.0f}</td><td align="right">${f['contract']:,.0f}</td></tr>
      <tr><td>Invoiced money</td><td align="right">${f['invoiced']:,.0f}</td><td align="right">${f['invoiced']:,.0f}</td></tr>
      <tr style="background:#fef2f2;"><td><b>Critical AR (owed)</b></td><td align="right">${f['critical_ar']:,.0f}</td><td align="right">${f['critical_ar']:,.0f}</td></tr>
    </table>
    <p style="font-size:11px;color:#4b5563;"><b>Lead rule:</b> age &gt;90 days → 10% auto. ≤90 days → sales assigns close % ({f['funny_need_prob']} jobs). Risked funny excludes unassigned ≤90d.</p>

    <h2 style="color:#11133f;border-bottom:2px solid #eaa221;padding-bottom:4px;">Cash & recon</h2>
    <ul style="font-size:13px;">
      <li>Bank cash (registers): <b>${bank_total:,.0f}</b></li>
      <li>QB A/R CoA: <b>${qb_ar:,.0f}</b></li>
      <li>Ops open AR: <b>${f['critical_ar']:,.0f}</b></li>
      <li>Gap (Ops − QB): <b>${gap:,.0f}</b> — label before bank send</li>
    </ul>

    <h2 style="color:#11133f;border-bottom:2px solid #eaa221;padding-bottom:4px;">Locked buckets (docs/75 · PEC-100)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr style="background:#11133f;color:#fff;"><th align="left">Bucket</th><th align="right">Jobs</th><th align="right">Gross</th><th align="right">AR</th></tr>
      {bucket_rows}
    </table>
    <p style="font-size:11px;color:#4b5563;">Do not re-debate bucket names. Deposit fields provisional until PEC-101.</p>

    <h2 style="color:#11133f;border-bottom:2px solid #eaa221;padding-bottom:4px;">Date doctrine</h2>
    <ul style="font-size:12px;">
      <li><b>Accrual state date</b> = date moved to <b>Approved</b></li>
      <li><b>WIP start</b> = date first invoice generated</li>
      <li><b>WIP close</b> = date moved to <b>Invoiced</b> milestone</li>
      <li>Payment applied / final payment dates: <b>not in mirror yet</b> (blank in workbook)</li>
    </ul>

    <h2 style="color:#11133f;border-bottom:2px solid #eaa221;padding-bottom:4px;">How to use the workbook</h2>
    <ol style="font-size:12px;">
      <li><b>01_Exec_Dashboard</b> — KPIs + so-what</li>
      <li><b>07_Critical_AR</b> — collections worklist</li>
      <li><b>08_Future_Revenue</b> — assign lead close %</li>
      <li><b>03_Funnel_Money</b> — funny / planned / contract language</li>
      <li><b>02_Buckets_Locked</b> — only if staging fights</li>
      <li><b>Inputs_Jobs</b> — full date spine (filter/sort)</li>
    </ol>
    <p style="font-size:11px;color:#6b7280;">File: {excel_name} · PDF may show Aspose.PDF evaluation watermark until PDF license purchased.</p>
    </body></html>
    """
    doc = Document()
    page = doc.pages.add()
    page.page_info.margin.left = 40
    page.page_info.margin.right = 40
    page.page_info.margin.top = 36
    page.page_info.margin.bottom = 36
    page.paragraphs.add(HtmlFragment(html))
    out = out_dir / f"{audience}-{as_of}-brief.pdf"
    doc.save(str(out))
    print("wrote pdf", out, out.stat().st_size)
    return out


def write_brain_md(
    audience: str,
    as_of: str,
    excel: Path,
    pdf: Optional[Path],
    built: Dict[str, Any],
    data: Dict[str, Any],
    out_dir: Path,
) -> Path:
    f = built["funnel"]
    gap = f["critical_ar"] - num(data.get("qb_ar"))
    md = f"""---
type: AnalyticsPack
audience: {audience}
as_of: {as_of}
generated: {datetime.now(timezone.utc).isoformat()}
engine: aspose-cells-26.6
design: Design.md PE tokens
linear: PEC-100
version: 2
---

# /analytics Friday pack v2 — {as_of}

## Paths

| Surface | Path |
|---------|------|
| Excel | `{excel}` |
| PDF brief | `{pdf or "(failed)"}` |
| Google Sheet | pending upload twin |
| CC HTML | pointer `/executive/cashflow-wip` |
| Brain | `docs/analytics/{audience}-{as_of}.md` |

## Funnel money (meeting language)

| Layer | Gross / face | Risked / meeting |
|-------|-------------:|-----------------:|
| Funny money (Leads) | ${f['funny_gross']:,.2f} | ${f['funny_risked']:,.2f} |
| Planned (Estimating) | ${f['planned']:,.2f} | ${f['planned']:,.2f} |
| Contract (Approved+) | ${f['contract']:,.2f} | ${f['contract']:,.2f} |
| Invoiced money | ${f['invoiced']:,.2f} | ${f['invoiced']:,.2f} |
| Critical AR | ${f['critical_ar']:,.2f} | ${f['critical_ar']:,.2f} |

- Lead >90d auto **10%** · {f['funny_auto_10']} jobs
- Lead ≤90d need sales P(close): **{f['funny_need_prob']}** jobs

## Recon

- QB A/R: **${money(data.get('qb_ar')):,.2f}**
- Gap Ops−QB: **${gap:,.2f}**

## Date doctrine (locked this session)

| Event | Source |
|-------|--------|
| Lead entered | milestone history Lead / lead_date |
| Prospect | history Prospect |
| **Accrual state** | **date → Approved** |
| **WIP start** | **first invoice generated** |
| **WIP close** | **date → Invoiced milestone** |
| Closed | history Closed |
| Payment applied / final payment | **GAP** — not in AccuLynx mirror |

## Buckets

Locked list: docs/75 + PEC-100. Provisional AccuLynx map until PEC-101 deposit fields.

## Generator

`scripts/analytics/build_pack.py` · skill `/analytics`
"""
    brain = REPO / "docs" / "analytics" / f"{audience}-{as_of}.md"
    brain.parent.mkdir(parents=True, exist_ok=True)
    brain.write_text(md)
    (out_dir / f"{audience}-{as_of}.md").write_text(md)
    print("wrote brain", brain)
    return brain


def write_cc_pointer(audience: str, as_of: str, out_dir: Path) -> Path:
    p = out_dir / f"CC-POINTER-{audience}.md"
    p.write_text(
        f"""# CC Executive HTML pointer — {audience}

**Target:** https://cc.proexteriorsus.net/executive/cashflow-wip  
**Design:** Design.md + `/executive/pipeline` language (PEC-104)  
**As-of pack:** {as_of}  
**Data spine:** same Inputs_Jobs / funnel layers as Excel  

Until route ships, Friday uses this Excel + PDF pack.
"""
    )
    return p


def write_sheet_note(out_dir: Path, excel: Path) -> Path:
    p = out_dir / "GOOGLE-SHEET-v1.1.md"
    p.write_text(
        f"""# Google Sheet twin

Upload `{excel.name}` → Open with Sheets. Keep formulas; do not values-only paste.
"""
    )
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audience", choices=["ar-wip", "cpa", "bank"], default="ar-wip")
    ap.add_argument("--as-of", default=date.today().isoformat())
    args = ap.parse_args()

    load_env()
    out_dir = OUT_ROOT / args.audience / args.as_of
    out_dir.mkdir(parents=True, exist_ok=True)

    data = fetch_data()
    as_of_d = date.fromisoformat(args.as_of)
    built = build_rows(data, as_of_d)
    print(f"open_jobs={len(built['jobs'])}")
    print("funnel", json.dumps(built["funnel"], indent=2))

    excel = write_excel(args.audience, args.as_of, data, built, out_dir)
    pdf = write_pdf(args.audience, args.as_of, built, data, excel.name, out_dir)
    brain = write_brain_md(args.audience, args.as_of, excel, pdf, built, data, out_dir)
    write_cc_pointer(args.audience, args.as_of, out_dir)
    write_sheet_note(out_dir, excel)

    manifest = {
        "audience": args.audience,
        "as_of": args.as_of,
        "version": 2,
        "excel": str(excel),
        "pdf": str(pdf) if pdf else None,
        "brain": str(brain),
        "jobs": len(built["jobs"]),
        "funnel": built["funnel"],
        "qb_ar": data.get("qb_ar"),
        "date_doctrine": {
            "accrual": "Approved milestone",
            "wip_start": "first invoice generated",
            "wip_close": "Invoiced milestone",
            "payment_applied": "GAP",
        },
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
