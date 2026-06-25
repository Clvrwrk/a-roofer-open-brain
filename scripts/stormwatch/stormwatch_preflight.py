#!/usr/bin/env python3
"""Stormwatch preflight checks for live storm-event runs."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Tuple


def env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def http_json(method: str, url: str, headers: Dict[str, str], body: Any = None) -> Tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, (json.loads(raw) if raw else {})
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}
    except Exception as exc:  # pragma: no cover
        return 599, {"error": str(exc)}


def sb_headers(service_role_key: str) -> Dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def sb_select(base_url: str, service_role_key: str, table: str, params: Dict[str, str], select_cols: str) -> Tuple[int, Any]:
    q = dict(params)
    q["select"] = select_cols
    query = urllib.parse.urlencode(q)
    return http_json("GET", f"{base_url}/rest/v1/{table}?{query}", sb_headers(service_role_key))


def ghl_headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "stormwatch-connector/1.0 (+https://proexteriorsus.com)",
    }


def check_required_env() -> Dict[str, Any]:
    checks = []
    required = [
        ("SUPABASE_URL", bool(os.getenv("SUPABASE_URL", "").strip())),
        ("SUPABASE_SERVICE_ROLE_KEY", bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())),
        ("ZI_BEARER_TOKEN|ZOOMINFO_BEARER_TOKEN", bool(env_first("ZI_BEARER_TOKEN", "ZOOMINFO_BEARER_TOKEN"))),
        ("GHL_API_KEY|GHL_PIT_KEY|GHL_CW_SUB_ACCOUNT_PIT", bool(env_first("GHL_API_KEY", "GHL_PIT_KEY", "GHL_CW_SUB_ACCOUNT_PIT"))),
        ("GHL_LOCATION_ID", bool(os.getenv("GHL_LOCATION_ID", "").strip())),
    ]
    for name, ok in required:
        checks.append({"name": name, "ok": ok})
    return {"name": "required_env", "ok": all(item["ok"] for item in checks), "checks": checks}


def check_schema(base_url: str, service_role_key: str) -> Dict[str, Any]:
    required_table_cols = {
        "stormwatch_zoominfo_runs": ["storm_event_id", "triggered_at", "ae_ready_at", "elapsed_seconds", "sla_status"],
        "stormwatch_storm_events": ["external_event_id", "alert_received_at", "radius_miles", "status"],
        "stormwatch_storm_event_runs": ["storm_event_id", "stage", "stage_status", "elapsed_seconds"],
        "stormwatch_property_research": ["storm_event_id", "source_system", "property_street", "payload"],
        "stormwatch_company_resolution": ["storm_event_id", "canonical_company_name", "company_role", "source_records"],
        "stormwatch_zoominfo_contacts": ["first_visit_task_summary", "first_visit_task_payload"],
        "stormwatch_ghl_sync": ["first_visit_task_status", "first_visit_task_payload", "opportunity_mapping_method"],
    }
    table_results = []
    ok_all = True
    for table, cols in required_table_cols.items():
        code, body = sb_select(base_url, service_role_key, table, {}, "*")
        if code not in (200, 206):
            table_results.append({"table": table, "ok": False, "error": body})
            ok_all = False
            continue
        # Use a lightweight column probe via HEAD-like minimal call.
        probe_code, probe = sb_select(base_url, service_role_key, table, {"limit": "1"}, ",".join(cols))
        table_ok = probe_code in (200, 206)
        table_results.append({"table": table, "ok": table_ok, "columns": cols, "probe_code": probe_code})
        if not table_ok:
            ok_all = False
    return {"name": "schema_contract", "ok": ok_all, "checks": table_results}


def check_event_id_uniqueness(base_url: str, service_role_key: str, office_id: str, event_id: str) -> Dict[str, Any]:
    code, body = sb_select(
        base_url,
        service_role_key,
        "stormwatch_storm_events",
        {
            "office_id": f"eq.{office_id}",
            "trigger_source": "eq.hailrecon",
            "external_event_id": f"eq.{event_id}",
        },
        "id,external_event_id",
    )
    if code != 200:
        return {"name": "event_id_uniqueness", "ok": False, "error": body}
    existing = body if isinstance(body, list) else []
    return {
        "name": "event_id_uniqueness",
        "ok": len(existing) == 0,
        "existing_count": len(existing),
        "event_id": event_id,
    }


def check_ghl_associations(api_key: str, location_id: str) -> Dict[str, Any]:
    q = urllib.parse.urlencode({"locationId": location_id, "limit": 200, "skip": 0})
    code, body = http_json("GET", f"https://services.leadconnectorhq.com/associations/?{q}", ghl_headers(api_key))
    if code != 200:
        return {"name": "ghl_associations", "ok": False, "error": body}
    associations = body.get("associations") or []
    has_business_contact = False
    has_business_opp = False
    has_opp_business = False
    for assoc in associations:
        first = str(assoc.get("firstObjectKey") or "")
        second = str(assoc.get("secondObjectKey") or "")
        if first == "business" and second == "contact":
            has_business_contact = True
        if first == "business" and second == "opportunity":
            has_business_opp = True
        if first == "opportunity" and second == "business":
            has_opp_business = True
    return {
        "name": "ghl_associations",
        "ok": has_business_contact,
        "has_business_contact": has_business_contact,
        "has_business_to_opportunity": has_business_opp,
        "has_opportunity_to_business": has_opp_business,
        "association_count": len(associations),
    }


def check_rejection_trend(base_url: str, service_role_key: str) -> Dict[str, Any]:
    code, body = sb_select(
        base_url,
        service_role_key,
        "stormwatch_zoominfo_rejections",
        {"order": "created_at.desc", "limit": "200"},
        "run_id,rejection_reason",
    )
    if code != 200:
        return {"name": "recent_rejections", "ok": False, "error": body}
    rows = body if isinstance(body, list) else []
    counts: Dict[str, int] = {}
    for row in rows:
        reason = str(row.get("rejection_reason") or "unknown")
        counts[reason] = counts.get(reason, 0) + 1
    dominant = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:3]
    return {"name": "recent_rejections", "ok": True, "total_rows": len(rows), "top_reasons": dominant}


def main() -> int:
    parser = argparse.ArgumentParser(description="Stormwatch preflight checks")
    parser.add_argument("--event-id", required=True, help="Planned storm external_event_id")
    parser.add_argument("--office-id", default="bd3016cc-4b21-4fd0-be65-31aa18b9fdbd")
    args = parser.parse_args()

    env_check = check_required_env()
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    ghl_api_key = env_first("GHL_API_KEY", "GHL_PIT_KEY", "GHL_CW_SUB_ACCOUNT_PIT")
    ghl_location_id = os.getenv("GHL_LOCATION_ID", "").strip()

    checks = [env_check]
    if env_check["ok"]:
        checks.append(check_schema(base_url, service_role_key))
        checks.append(check_event_id_uniqueness(base_url, service_role_key, args.office_id, args.event_id))
        checks.append(check_rejection_trend(base_url, service_role_key))
        checks.append(check_ghl_associations(ghl_api_key, ghl_location_id))

    ok = all(item.get("ok") for item in checks)
    output = {
        "ok": ok,
        "event_id": args.event_id,
        "office_id": args.office_id,
        "checks": checks,
        "next_action": "safe_to_run_live_push" if ok else "fix_failed_checks_before_live_push",
    }
    print(json.dumps(output, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
