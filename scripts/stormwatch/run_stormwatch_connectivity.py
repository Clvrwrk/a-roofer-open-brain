#!/usr/bin/env python3
"""Stormwatch Search -> Enrich -> Gate -> Map -> Sync runner."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

ZOOMINFO_BASE_URL = "https://api.zoominfo.com/gtm"
GHL_BASE_URL = "https://services.leadconnectorhq.com"
RICHARDSON_OFFICE_ID = "bd3016cc-4b21-4fd0-be65-31aa18b9fdbd"
RICHARDSON_OFFICE_NAME = "Richardson, TX"
MAPPING_VERSION = "v2_full_contract"

INTENT = "commercial roof"
ENRICH_OUTPUT_FIELDS = [
    "id", "firstName", "lastName", "jobTitle", "managementLevel",
    "email", "emailAlt", "phone", "directPhoneAlt", "mobilePhone", "mobilePhoneAlt",
    "companyId", "companyName", "companyWebsite",
    "companyStreet", "companyCity", "companyState", "companyZipCode", "companyCountry",
]
CONTRACT_ROWS = [
    ("zoominfo_contact_id", "zoominfo.id", "stormwatch_zoominfo_contacts.zoominfo_contact_id", "contact", "zi_contact_id", True, "text"),
    ("zoominfo_company_id", "zoominfo.companyId", "stormwatch_zoominfo_contacts.zoominfo_company_id", "contact", "zi_company_id", True, "text"),
    ("zoominfo_company_name", "zoominfo.companyName", "stormwatch_zoominfo_contacts.company_name", "contact", "zi_company_name", True, "text"),
    ("zoominfo_job_title", "zoominfo.jobTitle", "stormwatch_zoominfo_contacts.job_title", "contact", "zi_job_title", True, "text"),
    ("zoominfo_management_level", "zoominfo.managementLevel", "stormwatch_zoominfo_contacts.management_level", "contact", "zi_management_level", False, "text"),
    ("zoominfo_primary_email", "zoominfo.email/emailAlt", "stormwatch_zoominfo_contacts.primary_email", "contact", "zi_primary_email", True, "email"),
    ("zoominfo_primary_phone", "zoominfo.phone/directPhoneAlt/mobilePhone/mobilePhoneAlt", "stormwatch_zoominfo_contacts.primary_phone", "contact", "zi_primary_phone", True, "phone"),
    ("zoominfo_office_address", "zoominfo.companyStreet+companyCity+companyState+companyZipCode", "stormwatch_zoominfo_contacts.office_address", "contact", "zi_office_address", True, "text"),
    ("stormwatch_office_display_name", "stormwatch.office_display_name", "stormwatch_zoominfo_contacts.office_display_name", "contact", "stormwatch_office_display_name", True, "text"),
    ("stormwatch_priority_tier", "stormwatch.priority_tier", "stormwatch_zoominfo_contacts.priority_tier", "contact", "stormwatch_priority_tier", True, "text"),
    ("stormwatch_lead_score_total", "stormwatch.lead_score_total", "stormwatch_zoominfo_contacts.lead_score_total", "contact", "stormwatch_lead_score_total", True, "number"),
    ("stormwatch_why_now", "stormwatch.why_now", "stormwatch_zoominfo_contacts.why_now", "contact", "stormwatch_why_now", False, "text"),
    ("stormwatch_first_touch_channel", "stormwatch.first_touch_channel", "stormwatch_zoominfo_contacts.first_touch_channel", "contact", "stormwatch_first_touch_channel", True, "text"),
    ("stormwatch_first_touch_cta", "stormwatch.first_touch_cta", "stormwatch_zoominfo_contacts.first_touch_cta", "contact", "stormwatch_first_touch_cta", True, "text"),
    ("stormwatch_visit_task_summary", "stormwatch.first_visit_task_summary", "stormwatch_zoominfo_contacts.first_visit_task_summary", "contact", "stormwatch_visit_task_summary", False, "text"),
    ("stormwatch_property_summary", "stormwatch.property_section", "stormwatch_zoominfo_contacts.property_section", "contact", "stormwatch_property_summary", False, "text"),
    ("stormwatch_checklist_status", "stormwatch.lead_checklist", "stormwatch_zoominfo_contacts.lead_checklist", "contact", "stormwatch_checklist_status", True, "text"),
    ("stormwatch_company_office_phone", "stormwatch.company_office_phone", "stormwatch_zoominfo_contacts.company_office_phone", "contact", "stormwatch_company_office_phone", False, "phone"),
    ("stormwatch_company_office_email", "stormwatch.company_office_email", "stormwatch_zoominfo_contacts.company_office_email", "contact", "stormwatch_company_office_email", False, "email"),
    ("stormwatch_company_website", "zoominfo.companyWebsite", "stormwatch_zoominfo_contacts.company_website", "contact", "stormwatch_company_website", False, "text"),
    ("stormwatch_office_website", "zoominfo.officeWebsite", "stormwatch_zoominfo_contacts.office_website", "contact", "stormwatch_office_website", False, "text"),
    ("supabase_contact_row_id", "supabase.id", "stormwatch_ghl_sync.supabase_contact_row_id", "contact", "supabase_contact_row_id", True, "uuid"),
]
CUSTOM_FIELDS = [
    "zi_contact_id", "zi_company_id", "zi_company_name", "zi_job_title", "zi_management_level",
    "zi_office_address", "zi_primary_email", "zi_primary_phone", "supabase_contact_row_id",
    "stormwatch_role_bucket", "stormwatch_run_id", "stormwatch_office_display_name",
    "stormwatch_priority_tier", "stormwatch_lead_score_total", "stormwatch_why_now",
    "stormwatch_first_touch_channel", "stormwatch_first_touch_cta", "stormwatch_visit_task_summary", "stormwatch_property_summary",
    "stormwatch_checklist_status", "stormwatch_company_office_phone", "stormwatch_company_office_email",
    "stormwatch_company_website", "stormwatch_office_website",
]


@dataclass
class Config:
    zi_bearer_token: str
    supabase_url: str
    supabase_service_role_key: str
    target_state: str
    signal_score_min: int
    signal_score_max: int
    intent_pages: int
    max_companies: int
    max_contacts_per_role: int
    push_ghl: bool
    dry_run: bool
    ghl_api_key: Optional[str]
    ghl_location_id: Optional[str]
    ghl_pipeline_id: Optional[str]
    ghl_pipeline_stage_id: Optional[str]
    replay_run_id: Optional[str]
    company_seed_file: Optional[str]
    storm_event_id: Optional[str]
    trigger_source: Optional[str]
    triggered_at: Optional[str]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def http_json(method: str, url: str, headers: Dict[str, str], body: Optional[Dict[str, Any]] = None) -> Tuple[int, Dict[str, Any]]:
    data: Optional[bytes] = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, (json.loads(raw) if raw else {})
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def make_config(args: argparse.Namespace) -> Config:
    zi_bearer_token = env_first("ZI_BEARER_TOKEN", "ZOOMINFO_BEARER_TOKEN")
    if not zi_bearer_token:
        raise RuntimeError("Missing required env var: ZI_BEARER_TOKEN (or ZOOMINFO_BEARER_TOKEN)")
    cfg = Config(
        zi_bearer_token=zi_bearer_token,
        supabase_url=require_env("SUPABASE_URL").rstrip("/"),
        supabase_service_role_key=require_env("SUPABASE_SERVICE_ROLE_KEY"),
        target_state=args.target_state,
        signal_score_min=args.signal_score_min,
        signal_score_max=args.signal_score_max,
        intent_pages=args.intent_pages,
        max_companies=args.max_companies,
        max_contacts_per_role=args.max_contacts_per_role,
        push_ghl=args.push_ghl,
        dry_run=args.dry_run,
        ghl_api_key=env_first("GHL_API_KEY", "GHL_PIT_KEY", "GHL_CW_SUB_ACCOUNT_PIT"),
        ghl_location_id=os.getenv("GHL_LOCATION_ID"),
        ghl_pipeline_id=os.getenv("GHL_PIPELINE_ID"),
        ghl_pipeline_stage_id=os.getenv("GHL_PIPELINE_STAGE_ID"),
        replay_run_id=(args.replay_run_id or "").strip() or None,
        company_seed_file=(args.company_seed_file or "").strip() or None,
        storm_event_id=(args.storm_event_id or "").strip() or None,
        trigger_source=(args.trigger_source or "").strip() or None,
        triggered_at=(args.triggered_at or "").strip() or None,
    )
    if cfg.push_ghl:
        missing = [k for k, v in {
            "GHL_API_KEY": cfg.ghl_api_key,
            "GHL_LOCATION_ID": cfg.ghl_location_id,
            "GHL_PIPELINE_ID": cfg.ghl_pipeline_id,
            "GHL_PIPELINE_STAGE_ID": cfg.ghl_pipeline_stage_id,
        }.items() if not (v or "").strip()]
        if missing:
            raise RuntimeError("GHL push requested but missing: " + ", ".join(missing))
    return cfg


def zi_headers(cfg: Config) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {cfg.zi_bearer_token}",
        "accept": "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
        # ZoomInfo can reject default urllib signatures via Cloudflare 1010.
        "user-agent": "stormwatch-connector/1.0 (+https://proexteriorsus.com)",
    }


def sb_headers(cfg: Config, prefer: Optional[str] = None) -> Dict[str, str]:
    headers = {"apikey": cfg.supabase_service_role_key, "Authorization": f"Bearer {cfg.supabase_service_role_key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    return headers


def sb_insert(cfg: Config, table: str, payload: Any, return_rows: bool = True) -> List[Dict[str, Any]]:
    if cfg.dry_run:
        return []
    prefer = "return=representation" if return_rows else None
    code, body = http_json("POST", f"{cfg.supabase_url}/rest/v1/{table}", sb_headers(cfg, prefer), payload)
    if code not in (200, 201):
        raise RuntimeError(f"Supabase insert failed on {table} ({code}): {body}")
    return body if isinstance(body, list) else ([body] if body else [])


def sb_upsert(cfg: Config, table: str, rows: List[Dict[str, Any]], on_conflict: str) -> List[Dict[str, Any]]:
    if not rows or cfg.dry_run:
        return []
    params = urllib.parse.urlencode({"on_conflict": on_conflict})
    code, body = http_json("POST", f"{cfg.supabase_url}/rest/v1/{table}?{params}", sb_headers(cfg, "resolution=merge-duplicates,return=representation"), rows)
    if code not in (200, 201):
        raise RuntimeError(f"Supabase upsert failed on {table} ({code}): {body}")
    return body if isinstance(body, list) else []


def sb_update_run(cfg: Config, run_id: str, patch: Dict[str, Any]) -> None:
    if cfg.dry_run:
        return
    query = urllib.parse.urlencode({"id": f"eq.{run_id}"})
    code, body = http_json("PATCH", f"{cfg.supabase_url}/rest/v1/stormwatch_zoominfo_runs?{query}", sb_headers(cfg), patch)
    if code not in (200, 204):
        raise RuntimeError(f"Run update failed ({code}): {body}")


def sb_select(cfg: Config, table: str, filters: Dict[str, str], select_cols: str) -> List[Dict[str, Any]]:
    params = dict(filters)
    params["select"] = select_cols
    query = urllib.parse.urlencode(params)
    code, body = http_json("GET", f"{cfg.supabase_url}/rest/v1/{table}?{query}", sb_headers(cfg))
    if code != 200:
        raise RuntimeError(f"Supabase select failed on {table} ({code}): {body}")
    return body if isinstance(body, list) else []


def sb_patch_by_id(cfg: Config, table: str, row_id: str, patch: Dict[str, Any]) -> None:
    if cfg.dry_run:
        return
    query = urllib.parse.urlencode({"id": f"eq.{row_id}"})
    code, body = http_json("PATCH", f"{cfg.supabase_url}/rest/v1/{table}?{query}", sb_headers(cfg), patch)
    if code not in (200, 204):
        raise RuntimeError(f"Supabase patch failed on {table} ({code}): {body}")


def role_fit_score(title: str, bucket: str) -> float:
    t = (title or "").lower()
    if bucket == "approver":
        return 95.0 if re.search(r"\b(owner|ceo|president|cfo|vp|director|chief)\b", t) else 70.0
    return 85.0 if re.search(r"\b(manager|facility|property|operations|maintenance)\b", t) else 60.0


def normalize_whitespace(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(str(value).strip().split())
    return cleaned or None


def website_domain(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip().lower()
    raw = re.sub(r"^https?://", "", raw)
    raw = raw.split("/")[0]
    raw = raw.split("?")[0]
    raw = raw.replace("www.", "")
    return raw or None


def build_office_key(street: Optional[str], city: Optional[str], state: Optional[str], zip_code: Optional[str]) -> str:
    base = normalize_whitespace(street) or normalize_whitespace(city) or "office"
    suffix = normalize_whitespace(state) or normalize_whitespace(zip_code) or ""
    return f"{base} {suffix}".strip().lower()


def build_office_display_name(company_name: str, street: Optional[str], city: Optional[str], state: Optional[str]) -> str:
    place = normalize_whitespace(street) or " ".join([x for x in [normalize_whitespace(city), normalize_whitespace(state)] if x]) or "office"
    return f"{company_name}-{place}"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def priority_tier(total_score: int) -> str:
    if total_score >= 80:
        return "P1"
    if total_score >= 60:
        return "P2"
    return "P3"


def build_checklist(contact: Dict[str, Any], office: Dict[str, Optional[str]], company_signal: int) -> Dict[str, Any]:
    has_sms_ready = bool(contact.get("primary_phone"))
    checklist_items = [
        {"key": "icp_fit_verified", "done": bool(contact.get("job_title")), "note": "Role title present"},
        {"key": "why_now_captured", "done": bool(company_signal >= 70), "note": "Intent signal >= 70"},
        {"key": "authority_mapped", "done": bool(contact.get("management_level")), "note": "Management level mapped"},
        {"key": "routing_confirmed", "done": bool(office.get("office_state")), "note": "Office state available"},
        {"key": "engagement_strategy_set", "done": has_sms_ready, "note": "Phone available for immediate outreach"},
    ]
    return {
        "version": "v1_sdr_rapid_brief",
        "items": checklist_items,
        "completed_count": sum(1 for item in checklist_items if item["done"]),
        "total_count": len(checklist_items),
    }


def build_property_section(company: Dict[str, Any], office: Dict[str, Optional[str]], role_bucket: str) -> Dict[str, Any]:
    return {
        "source": "zoominfo_enriched_company_office",
        "property_name": normalize_whitespace(company.get("company_name")),
        "property_street": office.get("office_street"),
        "property_city": office.get("office_city"),
        "property_state": office.get("office_state"),
        "property_zip": office.get("office_zip"),
        "property_country": office.get("office_country"),
        "property_roof_type": None,
        "property_square_footage": None,
        "management_company": normalize_whitespace(company.get("company_name")),
        "management_phone": company.get("company_office_phone"),
        "management_email": company.get("company_office_email"),
        "role_bucket": role_bucket,
    }


def build_lead_scores(contact: Dict[str, Any], company_signal: int, checklist: Dict[str, Any]) -> Dict[str, Any]:
    title = str(contact.get("job_title") or "")
    fit = min(35, safe_int(round(role_fit_score(title, str(contact.get("role_bucket") or "champion")) * 0.35)))
    intent = max(0, min(30, safe_int(round(company_signal * 0.3))))
    readiness = 0
    readiness += 5 if contact.get("primary_email") else 0
    readiness += 5 if contact.get("primary_phone") else 0
    readiness += 5 if contact.get("management_level") else 0
    readiness += 5 if contact.get("office_address") else 0
    routing = 10 if contact.get("office_state") else 5
    completeness = 5 if checklist.get("completed_count", 0) >= 4 else 3
    risk_penalty = 0
    if not contact.get("primary_phone"):
        risk_penalty += 10
    if not contact.get("primary_email"):
        risk_penalty += 10
    total = fit + intent + readiness + routing + completeness - risk_penalty
    total = max(0, min(100, total))
    return {
        "total": total,
        "fit": fit,
        "intent": intent,
        "readiness": readiness,
        "routing": routing,
        "completeness": completeness,
        "risk_penalty": risk_penalty,
        "tier": priority_tier(total),
    }


def choose_first_touch_channel(contact: Dict[str, Any]) -> str:
    if contact.get("primary_phone"):
        return "phone"
    if contact.get("primary_email"):
        return "email"
    return "sms"


def build_summary_note(contact: Dict[str, Any], company: Dict[str, Any], scores: Dict[str, Any], checklist: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    channel = choose_first_touch_channel(contact)
    cta = "Book 15-minute discovery call and confirm property scope."
    why_now = (
        f"Intent signal {company.get('signal_score')} and {contact.get('role_bucket')} contact "
        f"{contact.get('full_name')} at {company.get('company_name')}."
    )
    lines = [
        "Stormwatch First Brief",
        f"Priority: {scores['tier']} (Total {scores['total']}/100)",
        f"Company Office: {contact.get('office_display_name')}",
        f"Role: {contact.get('role_bucket')} | Title: {contact.get('job_title')}",
        f"Why now: {why_now}",
        f"Contact path: {channel.upper()} first, fallback EMAIL/SMS as needed.",
        f"CTA: {cta}",
        f"Checklist: {checklist.get('completed_count')}/{checklist.get('total_count')} complete.",
    ]
    return "\n".join(lines), {
        "priority_tier": scores["tier"],
        "total_score": scores["total"],
        "first_touch_channel": channel,
        "first_touch_cta": cta,
        "why_now": why_now,
    }


def build_first_visit_task(contact: Dict[str, Any], summary_payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    office_display = contact.get("office_display_name") or contact.get("company_name")
    summary = f"Visit {office_display} within storm window; ask for roof access and maintenance history."
    payload = {
        "task_type": "in_person_visit",
        "priority": summary_payload.get("priority_tier") or contact.get("priority_tier"),
        "title": f"Stormwatch Field Visit - {office_display}",
        "description": summary,
        "recommended_within_minutes": 10,
        "owner_role": "AE",
        "contact_name": contact.get("full_name"),
        "company_name": contact.get("company_name"),
        "office_display_name": office_display,
        "channel_sequence": [summary_payload.get("first_touch_channel") or "phone", "email", "sms", "in_person_visit"],
    }
    return summary, payload


def ensure_contract(cfg: Config) -> None:
    rows = []
    for key, src, dst, obj, ghl, reqd, dtype in CONTRACT_ROWS:
        rows.append({
            "mapping_key": key, "source_system": "zoominfo", "source_field_path": src,
            "supabase_target_path": dst, "ghl_object": obj, "ghl_field_name": ghl,
            "required": reqd, "data_type": dtype, "mapping_version": MAPPING_VERSION,
        })
    sb_upsert(cfg, "stormwatch_field_contract", rows, "mapping_key")


def load_company_seed_rows(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        rows = data.get("companies") or data.get("items") or []
    elif isinstance(data, list):
        rows = data
    else:
        rows = []
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = normalize_whitespace(row.get("canonical_company_name") or row.get("company_name") or row.get("name"))
        if not name:
            continue
        synthetic_company_id = str(row.get("zoominfo_company_id") or row.get("company_id") or "").strip()
        if not synthetic_company_id:
            synthetic_company_id = f"seed::{name.lower().replace(' ', '_')}"
        out.append(
            {
                "run_id": row.get("run_id"),
                "office_id": row.get("office_id") or RICHARDSON_OFFICE_ID,
                "zoominfo_company_id": synthetic_company_id,
                "company_name": name,
                "website": row.get("company_website") or row.get("website"),
                "company_website": row.get("company_website") or row.get("website"),
                "office_website": row.get("office_website") or row.get("company_website") or row.get("website"),
                "company_office_phone": row.get("company_office_phone") or row.get("office_phone"),
                "city": row.get("office_city") or row.get("city"),
                "state": row.get("office_state") or row.get("state"),
                "country": row.get("office_country") or row.get("country") or "United States",
                "intent_topic": row.get("intent_topic") or "storm_alert",
                "signal_score": safe_int(row.get("signal_score"), 75),
                "audience_strength": row.get("audience_strength"),
                "source_payload": row,
            }
        )
    dedup: Dict[str, Dict[str, Any]] = {}
    for row in out:
        key = f"{row['company_name'].lower()}::{(row.get('state') or '').lower()}::{(row.get('city') or '').lower()}"
        if key not in dedup:
            dedup[key] = row
    return list(dedup.values())


def fetch_topics(cfg: Config) -> List[str]:
    code, body = http_json("GET", f"{ZOOMINFO_BASE_URL}/data/v1/lookup/intent-topics?page%5Bnumber%5D=1&page%5Bsize%5D=200", zi_headers(cfg))
    if code != 200:
        raise RuntimeError(f"Topic lookup failed ({code}): {body}")
    return [str((r.get("attributes", {}) or {}).get("name")) for r in body.get("data", []) if (r.get("attributes", {}) or {}).get("name")]


def search_companies(cfg: Config, topics: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for page in range(1, cfg.intent_pages + 1):
        params = urllib.parse.urlencode({"page[number]": page, "page[size]": 100})
        payload = {"data": {"type": "IntentSearch", "attributes": {"topics": topics[:10], "state": cfg.target_state, "country": "United States", "signalScoreMin": cfg.signal_score_min, "signalScoreMax": cfg.signal_score_max}}}
        code, body = http_json("POST", f"{ZOOMINFO_BASE_URL}/data/v1/intent/search?{params}", zi_headers(cfg), payload)
        if code != 200:
            raise RuntimeError(f"Intent search failed ({code}): {body}")
        out.extend(body.get("data", []))
        total = int(((body.get("meta") or {}).get("page") or {}).get("total", page))
        if page >= total:
            break
    return out


def search_contacts(cfg: Config, company_name: str, bucket: str) -> List[Dict[str, Any]]:
    attrs: Dict[str, Any] = {"companyName": company_name, "state": cfg.target_state, "country": "United States", "requiredFields": "email,phone,directPhone,mobilePhone"}
    if bucket == "approver":
        attrs.update({"managementLevel": "C Level Exec,VP Level Exec,Director", "department": "Finance,Operations"})
    else:
        attrs["jobTitle"] = "Property Manager OR Facilities Manager OR Regional Operations Manager OR Maintenance Manager"
    params = urllib.parse.urlencode({"page[number]": 1, "page[size]": cfg.max_contacts_per_role})
    code, body = http_json("POST", f"{ZOOMINFO_BASE_URL}/data/v1/contacts/search?{params}", zi_headers(cfg), {"data": {"type": "ContactSearch", "attributes": attrs}})
    return body.get("data", []) if code == 200 else []


def enrich_contact(cfg: Config, contact_id: str) -> Optional[Dict[str, Any]]:
    person_id: Any = int(contact_id) if re.fullmatch(r"-?\d+", contact_id) else contact_id
    payload = {"data": {"type": "ContactEnrich", "attributes": {"matchPersonInput": [{"personId": person_id}], "outputFields": ENRICH_OUTPUT_FIELDS}}}
    code, body = http_json("POST", f"{ZOOMINFO_BASE_URL}/data/v1/contacts/enrich", zi_headers(cfg), payload)
    if code != 200:
        return None
    for row in body.get("data", []):
        if row.get("type") == "Contact":
            return row
    return None


def extract_fields(enriched: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Dict[str, Optional[str]]]:
    a = enriched.get("attributes", {}) or {}
    email = a.get("email") or ((a.get("emailAlt") or [None])[0] if isinstance(a.get("emailAlt"), list) else None)
    phone = a.get("phone") or a.get("mobilePhone")
    if not phone and isinstance(a.get("directPhoneAlt"), list) and a["directPhoneAlt"]:
        phone = a["directPhoneAlt"][0]
    street = a.get("companyStreet")
    city = a.get("companyCity")
    state = a.get("companyState")
    zip_code = a.get("companyZipCode")
    country = a.get("companyCountry")
    address = " ".join([str(x).strip() for x in [street, city, state, zip_code] if x]).strip() or None
    return (str(email).strip() if email else None, str(phone).strip() if phone else None, {
        "office_street": str(street).strip() if street else None,
        "office_city": str(city).strip() if city else None,
        "office_state": str(state).strip() if state else None,
        "office_zip": str(zip_code).strip() if zip_code else None,
        "office_country": str(country).strip() if country else None,
        "office_address": address,
    })


def ghl_headers(cfg: Config) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {cfg.ghl_api_key}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
        "Accept": "application/json",
        # Prevent Cloudflare 1010 blocks against default urllib signatures.
        "User-Agent": "stormwatch-connector/1.0 (+https://proexteriorsus.com)",
    }


def ensure_ghl_custom_fields(cfg: Config) -> Dict[str, str]:
    if not cfg.push_ghl:
        return {}
    existing: Dict[str, str] = {}
    list_url = f"{GHL_BASE_URL}/locations/{cfg.ghl_location_id}/customFields"
    code, body = http_json("GET", list_url, ghl_headers(cfg))
    if code == 200:
        fields = body.get("customFields") or body.get("data") or []
        for row in fields:
            name = str(row.get("name", "")).strip().lower()
            field_id = row.get("id")
            if name and field_id:
                existing[name] = str(field_id)

    persisted_rows: List[Dict[str, Any]] = []
    for field_name in CUSTOM_FIELDS:
        key = field_name.lower()
        if key not in existing and not cfg.dry_run:
            create_payload = {
                "name": field_name,
                "dataType": "TEXT",
                "model": "contact",
                "placeholder": field_name,
            }
            c_code, c_body = http_json("POST", list_url, ghl_headers(cfg), create_payload)
            if c_code in (200, 201):
                created = c_body.get("customField") or c_body.get("data") or c_body
                if isinstance(created, dict) and created.get("id"):
                    existing[key] = str(created["id"])
        if key in existing:
            persisted_rows.append(
                {
                    "ghl_location_id": cfg.ghl_location_id,
                    "object_key": "contact",
                    "field_name": field_name,
                    "field_id": existing[key],
                    "field_key": field_name,
                    "required": field_name in {"zi_contact_id", "zi_company_id", "zi_primary_email", "zi_primary_phone", "supabase_contact_row_id"},
                    "mapping_version": MAPPING_VERSION,
                }
            )

    sb_upsert(cfg, "stormwatch_ghl_custom_fields", persisted_rows, "ghl_location_id,object_key,field_name")
    field_contract_rows = sb_select(cfg, "stormwatch_field_contract", {"mapping_version": f"eq.{MAPPING_VERSION}"}, "id,mapping_key")
    field_contract_by_key = {str(row.get("mapping_key")): str(row.get("id")) for row in field_contract_rows if row.get("mapping_key") and row.get("id")}
    for mapping_key, _src, _dst, _obj, ghl_key, _reqd, _dtype in CONTRACT_ROWS:
        ghl_field_id = existing.get(ghl_key.lower())
        row_id = field_contract_by_key.get(mapping_key)
        if ghl_field_id and row_id:
            sb_patch_by_id(cfg, "stormwatch_field_contract", row_id, {"ghl_field_id": ghl_field_id, "updated_at": now_iso()})
    return existing


def ghl_upsert_contact(cfg: Config, contact: Dict[str, Any], custom_field_ids: Dict[str, str], existing_contact_id: Optional[str] = None) -> Tuple[Optional[str], Dict[str, Any], int]:
    if not cfg.push_ghl:
        return None, {"detail": "GHL push disabled"}, 200
    custom_fields_payload = []
    custom_values = {
        "zi_contact_id": contact["zoominfo_contact_id"],
        "zi_company_id": contact["zoominfo_company_id"],
        "zi_company_name": contact.get("company_name"),
        "zi_job_title": contact.get("job_title"),
        "zi_management_level": contact.get("management_level"),
        "zi_office_address": contact.get("office_address"),
        "zi_primary_email": contact.get("primary_email"),
        "zi_primary_phone": contact.get("primary_phone"),
        "supabase_contact_row_id": contact.get("supabase_contact_row_id"),
        "stormwatch_role_bucket": contact.get("role_bucket"),
        "stormwatch_run_id": contact.get("run_id"),
        "stormwatch_office_display_name": contact.get("office_display_name"),
        "stormwatch_priority_tier": contact.get("priority_tier"),
        "stormwatch_lead_score_total": contact.get("lead_score_total"),
        "stormwatch_why_now": contact.get("why_now"),
        "stormwatch_first_touch_channel": contact.get("first_touch_channel"),
        "stormwatch_first_touch_cta": contact.get("first_touch_cta"),
        "stormwatch_visit_task_summary": contact.get("first_visit_task_summary"),
        "stormwatch_property_summary": json.dumps(contact.get("property_section") or {}),
        "stormwatch_checklist_status": json.dumps(contact.get("lead_checklist") or {}),
        "stormwatch_company_office_phone": contact.get("company_office_phone"),
        "stormwatch_company_office_email": contact.get("company_office_email"),
        "stormwatch_company_website": contact.get("company_website"),
        "stormwatch_office_website": contact.get("office_website"),
    }
    for field_name, value in custom_values.items():
        field_id = custom_field_ids.get(field_name.lower())
        if field_id and value is not None:
            custom_fields_payload.append({"id": field_id, "value": str(value)})

    payload = {
        "locationId": cfg.ghl_location_id,
        "firstName": contact.get("first_name"),
        "lastName": contact.get("last_name"),
        "name": contact.get("full_name"),
        "companyName": contact.get("company_name"),
        "email": contact.get("primary_email"),
        "phone": contact.get("primary_phone"),
        "address1": contact.get("office_street"),
        "city": contact.get("office_city"),
        "state": contact.get("office_state"),
        "postalCode": contact.get("office_zip"),
        "country": contact.get("office_country"),
        "source": "Stormwatch ZoomInfo",
        "tags": ["stormwatch", "zoominfo", "commercial-roofing"],
        "customFields": custom_fields_payload,
    }
    # Avoid accidental null-overwrites and improve compatibility across endpoints.
    payload = {k: v for k, v in payload.items() if v is not None}
    code = 0
    body: Dict[str, Any] = {}
    if existing_contact_id:
        put_payload = dict(payload)
        put_payload.pop("locationId", None)
        code, body = http_json("PUT", f"{GHL_BASE_URL}/contacts/{existing_contact_id}", ghl_headers(cfg), put_payload)
    if code not in (200, 201):
        code, body = http_json("POST", f"{GHL_BASE_URL}/contacts/upsert", ghl_headers(cfg), payload)
    if code not in (200, 201):
        code, body = http_json("POST", f"{GHL_BASE_URL}/contacts/", ghl_headers(cfg), payload)
    ghl_contact = (body.get("contact") if isinstance(body, dict) else None) or {}
    if code not in (200, 201):
        return None, body, code
    return (ghl_contact.get("id") or existing_contact_id), body, code


def ghl_create_opportunity(
    cfg: Config,
    ghl_contact_id: str,
    company_name: str,
    role_bucket: str,
    office_display_name: Optional[str] = None,
    priority_tier_value: Optional[str] = None,
    lead_score_total: Optional[int] = None,
) -> Tuple[Optional[str], Dict[str, Any], int]:
    if not cfg.push_ghl:
        return None, {"detail": "GHL push disabled"}, 200
    score_suffix = ""
    if priority_tier_value and (lead_score_total is not None):
        score_suffix = f" | {priority_tier_value}:{lead_score_total}"
    elif priority_tier_value:
        score_suffix = f" | {priority_tier_value}"
    payload = {
        "pipelineId": cfg.ghl_pipeline_id,
        "pipelineStageId": cfg.ghl_pipeline_stage_id,
        "locationId": cfg.ghl_location_id,
        "contactId": ghl_contact_id,
        "name": f"{(office_display_name or company_name)} - Stormwatch {role_bucket.title()}{score_suffix}",
        "status": "open",
    }
    code, body = http_json("POST", f"{GHL_BASE_URL}/opportunities/", ghl_headers(cfg), payload)
    opp = (body.get("opportunity") if isinstance(body, dict) else None) or {}
    return opp.get("id"), body, code


def ghl_update_opportunity_name(
    cfg: Config,
    opportunity_id: str,
    company_name: str,
    role_bucket: str,
    office_display_name: Optional[str] = None,
    priority_tier_value: Optional[str] = None,
    lead_score_total: Optional[int] = None,
) -> Tuple[bool, Dict[str, Any], int]:
    if not cfg.push_ghl:
        return True, {"detail": "GHL push disabled"}, 200
    score_suffix = ""
    if priority_tier_value and (lead_score_total is not None):
        score_suffix = f" | {priority_tier_value}:{lead_score_total}"
    elif priority_tier_value:
        score_suffix = f" | {priority_tier_value}"
    payload = {"name": f"{(office_display_name or company_name)} - Stormwatch {role_bucket.title()}{score_suffix}", "status": "open"}
    code, body = http_json("PUT", f"{GHL_BASE_URL}/opportunities/{opportunity_id}", ghl_headers(cfg), payload)
    return code in (200, 201), body, code


def ghl_create_first_note(cfg: Config, ghl_contact_id: str, note_markdown: str) -> Tuple[bool, Dict[str, Any], int]:
    if not cfg.push_ghl:
        return True, {"detail": "GHL push disabled"}, 200
    payload = {"body": note_markdown}
    code, body = http_json("POST", f"{GHL_BASE_URL}/contacts/{ghl_contact_id}/notes", ghl_headers(cfg), payload)
    if code in (200, 201):
        return True, body, code
    # Older surfaces sometimes use /contacts/{id}/notes/
    code2, body2 = http_json("POST", f"{GHL_BASE_URL}/contacts/{ghl_contact_id}/notes/", ghl_headers(cfg), payload)
    if code2 in (200, 201):
        return True, body2, code2
    return False, {"primary": body, "fallback": body2}, code2


def persist_company_office(cfg: Config, company_row: Dict[str, Any], office_display_name: str, office_key: str, office: Dict[str, Optional[str]], office_email: Optional[str]) -> None:
    office_payload = {
        "office_id": RICHARDSON_OFFICE_ID,
        "zoominfo_company_id": company_row.get("zoominfo_company_id"),
        "company_name": company_row.get("company_name"),
        "office_key": office_key,
        "office_display_name": office_display_name,
        "office_street": office.get("office_street"),
        "office_city": office.get("office_city"),
        "office_state": office.get("office_state"),
        "office_zip": office.get("office_zip"),
        "office_country": office.get("office_country"),
        "office_phone": company_row.get("company_office_phone"),
        "office_email": office_email,
        "company_website": company_row.get("company_website"),
        "office_website": company_row.get("office_website"),
        "source_payload": company_row.get("source_payload"),
        "updated_at": now_iso(),
    }
    sb_upsert(cfg, "stormwatch_company_offices", [office_payload], "office_id,company_name,office_key")


def replay_run_to_ghl(cfg: Config, run_id: str, custom_field_ids: Dict[str, str]) -> None:
    contacts = sb_select(
        cfg,
        "stormwatch_zoominfo_contacts",
        {
            "run_id": f"eq.{run_id}",
            "mandatory_email_ok": "eq.true",
            "mandatory_phone_ok": "eq.true",
            "mandatory_office_address_ok": "eq.true",
            "order": "created_at.asc",
        },
        "id,run_id,office_id,zoominfo_contact_id,zoominfo_company_id,company_name,first_name,last_name,full_name,job_title,management_level,role_bucket,primary_email,primary_phone,office_street,office_city,office_state,office_zip,office_country,office_address,office_display_name,company_office_phone,company_office_email,company_website,office_website,lead_score_total,priority_tier,why_now,first_touch_channel,first_touch_cta,first_visit_task_summary,first_visit_task_payload,property_section,lead_checklist,first_summary_note_md,first_summary_note_payload",
    )
    sync_existing = sb_select(
        cfg,
        "stormwatch_ghl_sync",
        {"run_id": f"eq.{run_id}"},
        "zoominfo_contact_id,ghl_contact_id,ghl_opportunity_id",
    )
    by_zid = {str(r.get("zoominfo_contact_id")): r for r in sync_existing}

    synced = 0
    failed = 0
    sync_rows: List[Dict[str, Any]] = []
    contact_backfill_rows: List[Dict[str, Any]] = []
    for contact in contacts:
        zid = str(contact.get("zoominfo_contact_id") or "")
        office = {
            "office_street": contact.get("office_street"),
            "office_city": contact.get("office_city"),
            "office_state": contact.get("office_state"),
            "office_zip": contact.get("office_zip"),
            "office_country": contact.get("office_country"),
            "office_address": contact.get("office_address"),
        }
        if not contact.get("office_display_name"):
            contact["office_display_name"] = build_office_display_name(
                str(contact.get("company_name") or ""),
                office.get("office_street"),
                office.get("office_city"),
                office.get("office_state"),
            )
        if not contact.get("company_office_email"):
            domain = website_domain(contact.get("company_website"))
            contact["company_office_email"] = f"info@{domain}" if domain else None
        checklist = contact.get("lead_checklist") or build_checklist(contact, office, 70)
        scores = build_lead_scores(contact, 70, checklist)
        summary_md = contact.get("first_summary_note_md")
        summary_payload = contact.get("first_summary_note_payload")
        if not summary_md or not isinstance(summary_payload, dict):
            summary_md, summary_payload = build_summary_note(contact, contact, scores, checklist)
        visit_summary = contact.get("first_visit_task_summary")
        visit_payload = contact.get("first_visit_task_payload")
        if not visit_summary or not isinstance(visit_payload, dict):
            visit_summary, visit_payload = build_first_visit_task(contact, summary_payload)
        property_section = contact.get("property_section") or build_property_section(
            {
                "company_name": contact.get("company_name"),
                "company_office_phone": contact.get("company_office_phone"),
                "company_office_email": contact.get("company_office_email"),
                "signal_score": 70,
            },
            office,
            str(contact.get("role_bucket") or "champion"),
        )
        contact["lead_checklist"] = checklist
        contact["property_section"] = property_section
        contact["lead_score_total"] = scores["total"]
        contact["priority_tier"] = scores["tier"]
        contact["why_now"] = summary_payload.get("why_now")
        contact["first_touch_channel"] = summary_payload.get("first_touch_channel")
        contact["first_touch_cta"] = summary_payload.get("first_touch_cta")
        contact["first_summary_note_md"] = summary_md
        contact["first_summary_note_payload"] = summary_payload
        contact["first_visit_task_summary"] = visit_summary
        contact["first_visit_task_payload"] = visit_payload
        contact_backfill_rows.append(
            {
                "id": contact.get("id"),
                "office_display_name": contact.get("office_display_name"),
                "office_key": build_office_key(
                    office.get("office_street"),
                    office.get("office_city"),
                    office.get("office_state"),
                    office.get("office_zip"),
                ),
                "company_office_phone": contact.get("company_office_phone"),
                "company_office_email": contact.get("company_office_email"),
                "company_website": contact.get("company_website"),
                "office_website": contact.get("office_website"),
                "property_section": property_section,
                "lead_score_total": scores["total"],
                "lead_score_fit": scores["fit"],
                "lead_score_intent": scores["intent"],
                "lead_score_readiness": scores["readiness"],
                "lead_score_routing": scores["routing"],
                "lead_score_completeness": scores["completeness"],
                "lead_score_risk_penalty": scores["risk_penalty"],
                "priority_tier": scores["tier"],
                "lead_score_reason": f"fit={scores['fit']}, intent={scores['intent']}, readiness={scores['readiness']}, routing={scores['routing']}, completeness={scores['completeness']}, risk={scores['risk_penalty']}",
                "why_now": summary_payload.get("why_now"),
                "lead_checklist": checklist,
                "lead_checklist_version": checklist.get("version", "v1_sdr_rapid_brief"),
                "first_summary_note_md": summary_md,
                "first_summary_note_payload": summary_payload,
                "first_summary_note_generated_at": now_iso(),
                "first_touch_channel": summary_payload.get("first_touch_channel"),
                "first_touch_cta": summary_payload.get("first_touch_cta"),
                "first_visit_task_summary": visit_summary,
                "first_visit_task_payload": visit_payload,
                "first_visit_task_generated_at": now_iso(),
            }
        )
        prior = by_zid.get(zid, {})
        existing_contact_id = prior.get("ghl_contact_id")
        existing_opp_id = prior.get("ghl_opportunity_id")

        ghl_contact_id, contact_resp, contact_code = ghl_upsert_contact(cfg, contact, custom_field_ids, existing_contact_id=existing_contact_id)
        sync_row = {
            "run_id": run_id,
            "office_id": contact.get("office_id") or RICHARDSON_OFFICE_ID,
            "zoominfo_contact_id": zid,
            "zoominfo_company_id": contact.get("zoominfo_company_id"),
            "supabase_contact_row_id": contact.get("id"),
            "ghl_location_id": cfg.ghl_location_id,
            "mapping_version": MAPPING_VERSION,
            "office_display_name": contact.get("office_display_name"),
            "lead_score_total": contact.get("lead_score_total"),
            "priority_tier": contact.get("priority_tier"),
            "ghl_custom_field_payload": {"custom_fields": custom_field_ids},
            "package_payload": {
                "property_section": contact.get("property_section"),
                "lead_checklist": contact.get("lead_checklist"),
                "summary_note_payload": contact.get("first_summary_note_payload"),
                "first_visit_task_payload": contact.get("first_visit_task_payload"),
            },
            "request_payload": {"replay": True, "contact": contact.get("full_name")},
            "response_payload": {"contact": contact_resp},
            "identity_payload": {
                "zoominfo_contact_id": zid,
                "zoominfo_company_id": contact.get("zoominfo_company_id"),
                "supabase_contact_row_id": contact.get("id"),
                "ghl_contact_id": ghl_contact_id,
                "ghl_opportunity_id": existing_opp_id,
            },
        }
        if not ghl_contact_id:
            failed += 1
            sync_row.update({"sync_status": "contact_failed", "sync_error": f"contact upsert failed ({contact_code})"})
            sync_rows.append(sync_row)
            continue

        opp_id = existing_opp_id
        opp_resp: Dict[str, Any] = {}
        opp_code = 200
        if not opp_id:
            opp_id, opp_resp, opp_code = ghl_create_opportunity(
                cfg,
                ghl_contact_id,
                str(contact.get("company_name") or ""),
                str(contact.get("role_bucket") or "champion"),
                str(contact.get("office_display_name") or "") or None,
                str(contact.get("priority_tier") or "") or None,
                safe_int(contact.get("lead_score_total"), 0),
            )
        else:
            _ok, opp_resp, opp_code = ghl_update_opportunity_name(
                cfg,
                str(opp_id),
                str(contact.get("company_name") or ""),
                str(contact.get("role_bucket") or "champion"),
                str(contact.get("office_display_name") or "") or None,
                str(contact.get("priority_tier") or "") or None,
                safe_int(contact.get("lead_score_total"), 0),
            )
        note_ok, note_resp, note_code = ghl_create_first_note(cfg, ghl_contact_id, str(contact.get("first_summary_note_md") or ""))

        if opp_id:
            synced += 1
            sync_row.update(
                {
                    "ghl_contact_id": ghl_contact_id,
                    "ghl_opportunity_id": opp_id,
                    "opportunity_name": f"{contact.get('office_display_name') or contact.get('company_name')} - Stormwatch {str(contact.get('role_bucket') or '').title()}",
                    "pipeline_id": cfg.ghl_pipeline_id,
                    "pipeline_stage_id": cfg.ghl_pipeline_stage_id,
                    "sync_status": "synced",
                    "sync_error": None,
                    "first_summary_note_status": "synced" if note_ok else "failed",
                    "first_summary_note_synced_at": now_iso() if note_ok else None,
                    "first_visit_task_status": "recommended",
                    "first_visit_task_payload": contact.get("first_visit_task_payload"),
                    "synced_at": now_iso(),
                    "response_payload": {"contact": contact_resp, "opportunity": opp_resp, "first_summary_note": {"ok": note_ok, "code": note_code, "body": note_resp}},
                    "identity_payload": {
                        "zoominfo_contact_id": zid,
                        "zoominfo_company_id": contact.get("zoominfo_company_id"),
                        "supabase_contact_row_id": contact.get("id"),
                        "ghl_contact_id": ghl_contact_id,
                        "ghl_opportunity_id": opp_id,
                    },
                }
            )
        else:
            failed += 1
            sync_row.update(
                {
                    "ghl_contact_id": ghl_contact_id,
                    "sync_status": "opportunity_failed",
                    "sync_error": f"opportunity create failed ({opp_code})",
                    "first_summary_note_status": "synced" if note_ok else "failed",
                    "first_summary_note_synced_at": now_iso() if note_ok else None,
                    "response_payload": {"contact": contact_resp, "opportunity": opp_resp, "first_summary_note": {"ok": note_ok, "code": note_code, "body": note_resp}},
                }
            )
        sync_rows.append(sync_row)

    if sync_rows:
        sb_upsert(cfg, "stormwatch_ghl_sync", sync_rows, "run_id,zoominfo_contact_id")
    if contact_backfill_rows:
        for patch_row in contact_backfill_rows:
            row_id = str(patch_row.pop("id"))
            sb_patch_by_id(cfg, "stormwatch_zoominfo_contacts", row_id, patch_row)
    print(json.dumps({"run_id": run_id, "mode": "replay", "contacts": len(contacts), "synced": synced, "failed": failed}, indent=2))


def load_custom_field_ids(cfg: Config) -> Dict[str, str]:
    rows = sb_select(
        cfg,
        "stormwatch_ghl_custom_fields",
        {
            "ghl_location_id": f"eq.{cfg.ghl_location_id}",
            "object_key": "eq.contact",
        },
        "field_name,field_id",
    )
    out: Dict[str, str] = {}
    for row in rows:
        field_name = str(row.get("field_name") or "").strip().lower()
        field_id = str(row.get("field_id") or "").strip()
        if field_name and field_id:
            out[field_name] = field_id
    return out


def run(cfg: Config) -> None:
    if cfg.replay_run_id:
        if not cfg.push_ghl:
            raise RuntimeError("--replay-run-id requires --push-ghl")
        ghl_custom_field_ids = load_custom_field_ids(cfg)
        if not ghl_custom_field_ids:
            raise RuntimeError("No GHL custom field IDs found in stormwatch_ghl_custom_fields for this location.")
        replay_run_to_ghl(cfg, cfg.replay_run_id, ghl_custom_field_ids)
        return

    topics = fetch_topics(cfg)
    fanout = [t for t in topics if re.search(r"construction|roof|facility|property", t.lower())][:10] or topics[:10]
    ensure_contract(cfg)
    ghl_custom_field_ids = ensure_ghl_custom_fields(cfg)
    run_row = {
        "office_id": RICHARDSON_OFFICE_ID,
        "office_name": RICHARDSON_OFFICE_NAME,
        "target_state": cfg.target_state,
        "base_intent": INTENT,
        "fanout_topics": fanout,
        "zoominfo_query_payload": {"intent_pages": cfg.intent_pages, "company_seed_file": cfg.company_seed_file},
        "status": "running",
        "notes": "Search->Enrich->Gate run",
        "storm_event_id": cfg.storm_event_id,
        "trigger_source": cfg.trigger_source,
        "triggered_at": cfg.triggered_at,
        "sla_status": "running" if cfg.storm_event_id else None,
    }
    run_id = "dry-run"
    if not cfg.dry_run:
        run_id = sb_insert(cfg, "stormwatch_zoominfo_runs", run_row, return_rows=True)[0]["id"]
    print(f"[{now_iso()}] run_id={run_id}")

    searched = 0
    enriched = 0
    rejected = 0
    synced = 0
    failed = 0
    company_rows: List[Dict[str, Any]] = []
    contact_rows: List[Dict[str, Any]] = []
    reject_rows: List[Dict[str, Any]] = []
    sync_rows: List[Dict[str, Any]] = []

    try:
        if cfg.company_seed_file:
            seeded = load_company_seed_rows(cfg.company_seed_file)
            for row in seeded[: cfg.max_companies]:
                row["run_id"] = run_id
                company_rows.append(row)
        else:
            for row in search_companies(cfg, fanout):
                attrs = row.get("attributes", {}) or {}
                company = attrs.get("company", {}) or {}
                company_id = str(company.get("id", "")).strip()
                company_name = str(company.get("name", "")).strip()
                if not company_id or not company_name:
                    continue
                company_rows.append(
                    {
                        "run_id": run_id,
                        "office_id": RICHARDSON_OFFICE_ID,
                        "zoominfo_company_id": company_id,
                        "company_name": company_name,
                        "website": company.get("website"),
                        "company_website": company.get("website"),
                        "office_website": company.get("website"),
                        "company_office_phone": company.get("phone"),
                        "city": company.get("city"),
                        "state": company.get("state"),
                        "country": company.get("country"),
                        "intent_topic": attrs.get("topic"),
                        "signal_score": attrs.get("signalScore"),
                        "audience_strength": attrs.get("audienceStrength"),
                        "source_payload": row,
                    }
                )
                if len(company_rows) >= cfg.max_companies:
                    break

        if company_rows:
            company_insert_rows = []
            for row in company_rows:
                company_insert_rows.append(
                    {
                        "run_id": row.get("run_id"),
                        "office_id": row.get("office_id"),
                        "zoominfo_company_id": row.get("zoominfo_company_id"),
                        "company_name": row.get("company_name"),
                        "website": row.get("website"),
                        "city": row.get("city"),
                        "state": row.get("state"),
                        "country": row.get("country"),
                        "intent_topic": row.get("intent_topic"),
                        "signal_score": row.get("signal_score"),
                        "audience_strength": row.get("audience_strength"),
                        "source_payload": row.get("source_payload"),
                    }
                )
            sb_insert(cfg, "stormwatch_zoominfo_companies", company_insert_rows, return_rows=False)

        for c in company_rows:
            for bucket in ("approver", "champion"):
                for raw in search_contacts(cfg, c["company_name"], bucket):
                    searched += 1
                    zid = str(raw.get("id", "")).strip()
                    if not zid:
                        continue
                    enr = enrich_contact(cfg, zid)
                    if not enr:
                        rejected += 1
                        reject_rows.append({"run_id": run_id, "office_id": RICHARDSON_OFFICE_ID, "zoominfo_contact_id": zid, "zoominfo_company_id": c["zoominfo_company_id"], "company_name": c["company_name"], "role_bucket": bucket, "rejection_reason": "enrich_no_match", "source_payload": raw, "enriched_payload": None})
                        continue
                    enriched += 1
                    email, phone, office = extract_fields(enr)
                    reasons: List[str] = []
                    if not phone:
                        reasons.append("missing_phone")
                    if not email:
                        reasons.append("missing_email")
                    if not office.get("office_address"):
                        reasons.append("missing_office_address")
                    if reasons:
                        rejected += 1
                        reject_rows.append({"run_id": run_id, "office_id": RICHARDSON_OFFICE_ID, "zoominfo_contact_id": zid, "zoominfo_company_id": c["zoominfo_company_id"], "company_name": c["company_name"], "role_bucket": bucket, "rejection_reason": ",".join(reasons), "source_payload": raw, "enriched_payload": enr})
                        continue
                    a = enr.get("attributes", {}) or {}
                    company_signal = safe_int(c.get("signal_score"), 0)
                    office_display_name = build_office_display_name(c["company_name"], office["office_street"], office["office_city"], office["office_state"])
                    office_key = build_office_key(office["office_street"], office["office_city"], office["office_state"], office["office_zip"])
                    domain = website_domain(c.get("company_website"))
                    office_email = (f"info@{domain}" if domain else None)
                    base_contact = {
                        "run_id": run_id,
                        "office_id": RICHARDSON_OFFICE_ID,
                        "zoominfo_company_id": c["zoominfo_company_id"],
                        "zoominfo_contact_id": zid,
                        "company_name": c["company_name"],
                        "first_name": a.get("firstName"),
                        "last_name": a.get("lastName"),
                        "full_name": f"{a.get('firstName','')} {a.get('lastName','')}".strip() or None,
                        "job_title": a.get("jobTitle"),
                        "management_level": a.get("managementLevel"),
                        "department": None,
                        "role_bucket": bucket,
                        "fit_score": role_fit_score(str(a.get("jobTitle") or ""), bucket),
                        "has_email": bool(email),
                        "has_direct_phone": bool(phone),
                        "has_mobile_phone": bool(a.get("mobilePhone")),
                        "source_payload": raw,
                        "enriched_payload": enr,
                        "primary_email": email,
                        "primary_phone": phone,
                        "office_street": office["office_street"],
                        "office_city": office["office_city"],
                        "office_state": office["office_state"],
                        "office_zip": office["office_zip"],
                        "office_country": office["office_country"],
                        "office_address": office["office_address"],
                        "office_display_name": office_display_name,
                        "office_key": office_key,
                        "company_office_phone": c.get("company_office_phone"),
                        "company_office_email": office_email,
                        "company_website": c.get("company_website"),
                        "office_website": c.get("office_website"),
                        "mandatory_email_ok": True,
                        "mandatory_phone_ok": True,
                        "mandatory_office_address_ok": True,
                        "exclusion_reason": None,
                        "mapping_version": MAPPING_VERSION,
                    }
                    checklist = build_checklist(base_contact, office, company_signal)
                    scores = build_lead_scores(base_contact, company_signal, checklist)
                    summary_md, summary_payload = build_summary_note(base_contact, c, scores, checklist)
                    visit_summary, visit_payload = build_first_visit_task(base_contact, summary_payload)
                    property_section = build_property_section(c, office, bucket)
                    row_contact = {
                        **base_contact,
                        "property_section": property_section,
                        "property_name": c["company_name"],
                        "property_street": office["office_street"],
                        "property_city": office["office_city"],
                        "property_state": office["office_state"],
                        "property_zip": office["office_zip"],
                        "property_country": office["office_country"],
                        "property_square_footage": None,
                        "property_roof_type": None,
                        "property_management_company": c["company_name"],
                        "property_management_email": office_email,
                        "property_management_phone": c.get("company_office_phone"),
                        "lead_score_total": scores["total"],
                        "lead_score_fit": scores["fit"],
                        "lead_score_intent": scores["intent"],
                        "lead_score_readiness": scores["readiness"],
                        "lead_score_routing": scores["routing"],
                        "lead_score_completeness": scores["completeness"],
                        "lead_score_risk_penalty": scores["risk_penalty"],
                        "priority_tier": scores["tier"],
                        "lead_score_reason": f"fit={scores['fit']}, intent={scores['intent']}, readiness={scores['readiness']}, routing={scores['routing']}, completeness={scores['completeness']}, risk={scores['risk_penalty']}",
                        "why_now": summary_payload["why_now"],
                        "lead_checklist": checklist,
                        "lead_checklist_version": checklist["version"],
                        "first_summary_note_md": summary_md,
                        "first_summary_note_payload": summary_payload,
                        "first_summary_note_generated_at": now_iso(),
                        "first_touch_channel": summary_payload["first_touch_channel"],
                        "first_touch_cta": summary_payload["first_touch_cta"],
                        "first_visit_task_summary": visit_summary,
                        "first_visit_task_payload": visit_payload,
                        "first_visit_task_generated_at": now_iso(),
                    }
                    persist_company_office(cfg, c, office_display_name, office_key, office, office_email)
                    inserted = sb_insert(cfg, "stormwatch_zoominfo_contacts", row_contact, return_rows=True)
                    supabase_id = inserted[0]["id"] if inserted else None
                    row_contact["supabase_contact_row_id"] = supabase_id
                    contact_rows.append(row_contact)
                    sync_row = {
                        "run_id": run_id,
                        "office_id": RICHARDSON_OFFICE_ID,
                        "zoominfo_contact_id": zid,
                        "zoominfo_company_id": c["zoominfo_company_id"],
                        "supabase_contact_row_id": supabase_id,
                        "ghl_location_id": cfg.ghl_location_id,
                        "mapping_version": MAPPING_VERSION,
                        "office_display_name": row_contact.get("office_display_name"),
                        "lead_score_total": row_contact.get("lead_score_total"),
                        "priority_tier": row_contact.get("priority_tier"),
                        "package_payload": {
                            "property_section": row_contact.get("property_section"),
                            "lead_checklist": row_contact.get("lead_checklist"),
                            "summary_note_payload": row_contact.get("first_summary_note_payload"),
                            "first_visit_task_payload": row_contact.get("first_visit_task_payload"),
                        },
                        "sync_status": "pending_ghl",
                    }
                    if cfg.push_ghl:
                        ghl_contact_id, contact_resp, contact_code = ghl_upsert_contact(cfg, row_contact, ghl_custom_field_ids)
                        if ghl_contact_id:
                            ghl_opp_id, opp_resp, opp_code = ghl_create_opportunity(
                                cfg,
                                ghl_contact_id,
                                c["company_name"],
                                bucket,
                                row_contact.get("office_display_name"),
                                row_contact.get("priority_tier"),
                                safe_int(row_contact.get("lead_score_total"), 0),
                            )
                            note_ok, note_resp, note_code = ghl_create_first_note(cfg, ghl_contact_id, row_contact.get("first_summary_note_md") or "")
                            sync_row.update({
                                "ghl_contact_id": ghl_contact_id,
                                "ghl_opportunity_id": ghl_opp_id,
                                "opportunity_name": f"{row_contact.get('office_display_name') or c['company_name']} - Stormwatch {bucket.title()}",
                                "pipeline_id": cfg.ghl_pipeline_id,
                                "pipeline_stage_id": cfg.ghl_pipeline_stage_id,
                                "sync_status": "synced" if ghl_opp_id else "opportunity_failed",
                                "sync_error": None if ghl_opp_id else f"opportunity create failed ({opp_code})",
                                "first_summary_note_status": "synced" if note_ok else "failed",
                                "first_summary_note_synced_at": now_iso() if note_ok else None,
                                "first_visit_task_status": "recommended",
                                "first_visit_task_payload": row_contact.get("first_visit_task_payload"),
                                "ghl_custom_field_payload": {"custom_fields": ghl_custom_field_ids},
                                "identity_payload": {
                                    "zoominfo_contact_id": zid,
                                    "zoominfo_company_id": c["zoominfo_company_id"],
                                    "supabase_contact_row_id": supabase_id,
                                    "ghl_contact_id": ghl_contact_id,
                                    "ghl_opportunity_id": ghl_opp_id,
                                },
                                "request_payload": {"contact": row_contact["full_name"], "role_bucket": bucket, "office_display_name": row_contact.get("office_display_name")},
                                "response_payload": {"contact": contact_resp, "opportunity": opp_resp, "first_summary_note": {"ok": note_ok, "code": note_code, "body": note_resp}},
                                "synced_at": now_iso() if ghl_opp_id else None,
                            })
                            if ghl_opp_id:
                                synced += 1
                            else:
                                failed += 1
                        else:
                            sync_row.update({
                                "sync_status": "contact_failed",
                                "sync_error": f"contact upsert failed ({contact_code})",
                                "request_payload": {"contact": row_contact["full_name"], "role_bucket": bucket},
                                "response_payload": contact_resp,
                                "ghl_custom_field_payload": {"custom_fields": ghl_custom_field_ids},
                                "identity_payload": {
                                    "zoominfo_contact_id": zid,
                                    "zoominfo_company_id": c["zoominfo_company_id"],
                                    "supabase_contact_row_id": supabase_id,
                                },
                            })
                            failed += 1
                    else:
                        sync_row.update({
                            "sync_status": "pending_ghl_credentials",
                            "sync_error": "GHL sync skipped; run without --push-ghl.",
                        })
                    sync_rows.append(sync_row)

        if reject_rows:
            sb_insert(cfg, "stormwatch_zoominfo_rejections", reject_rows, return_rows=False)
        if sync_rows:
            sb_upsert(cfg, "stormwatch_ghl_sync", sync_rows, "run_id,zoominfo_contact_id")

        if (not cfg.push_ghl) and sync_rows:
            failed = len(sync_rows)

        finished_at = now_iso()
        elapsed_seconds = None
        sla_status = None
        if cfg.storm_event_id and cfg.triggered_at:
            try:
                start = datetime.fromisoformat(cfg.triggered_at.replace("Z", "+00:00"))
                end = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))
                elapsed_seconds = int((end - start).total_seconds())
                sla_status = "met_10min" if elapsed_seconds <= 600 else "missed_10min"
            except ValueError:
                elapsed_seconds = None
        sb_update_run(
            cfg,
            run_id,
            {
                "records_company_count": len(company_rows),
                "records_contact_count": len(contact_rows),
                "status": "completed",
                "finished_at": finished_at,
                "ae_ready_at": finished_at if cfg.storm_event_id else None,
                "elapsed_seconds": elapsed_seconds,
                "sla_status": sla_status,
                "notes": f"searched={searched}; enriched={enriched}; rejected={rejected}; synced={synced}; failed={failed}; mapping={MAPPING_VERSION}",
            },
        )
        print(json.dumps({"run_id": run_id, "searched": searched, "enriched": enriched, "rejected": rejected, "synced": synced, "failed": failed, "mapping_version": MAPPING_VERSION}, indent=2))
    except Exception as exc:
        sb_update_run(cfg, run_id, {"status": "failed", "finished_at": now_iso(), "notes": f"failed: {exc}"})
        raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Stormwatch ZoomInfo full-field contract runner")
    parser.add_argument("--target-state", default="TX")
    parser.add_argument("--signal-score-min", type=int, default=70)
    parser.add_argument("--signal-score-max", type=int, default=100)
    parser.add_argument("--intent-pages", type=int, default=1)
    parser.add_argument("--max-companies", type=int, default=100)
    parser.add_argument("--max-contacts-per-role", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--push-ghl", action="store_true")
    parser.add_argument("--replay-run-id", default=None)
    parser.add_argument("--company-seed-file", default=None)
    parser.add_argument("--storm-event-id", default=None)
    parser.add_argument("--trigger-source", default=None)
    parser.add_argument("--triggered-at", default=None)
    return parser


def main() -> int:
    try:
        run(make_config(build_parser().parse_args()))
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
