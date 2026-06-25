#!/usr/bin/env python3
"""Storm Alert orchestrator: HailRecon -> property research -> company resolution -> ZoomInfo/GHL."""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

WORKSPACE_ROOT = Path("/Users/chussey/Documents/a-roofers-open-brain")
CONNECTIVITY_SCRIPT = WORKSPACE_ROOT / "scripts" / "stormwatch" / "run_stormwatch_connectivity.py"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


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
    except (urllib.error.URLError, TimeoutError) as exc:
        return 599, {"error": str(exc)}


def sb_headers(service_role_key: str, prefer: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def sb_insert(base_url: str, service_role_key: str, table: str, payload: Any, return_rows: bool = True) -> List[Dict[str, Any]]:
    prefer = "return=representation" if return_rows else None
    code, body = http_json("POST", f"{base_url}/rest/v1/{table}", sb_headers(service_role_key, prefer), payload)
    if code not in (200, 201):
        raise RuntimeError(f"Supabase insert failed on {table} ({code}): {body}")
    return body if isinstance(body, list) else ([body] if body else [])


def sb_upsert(base_url: str, service_role_key: str, table: str, rows: List[Dict[str, Any]], on_conflict: str) -> None:
    if not rows:
        return
    params = urllib.parse.urlencode({"on_conflict": on_conflict})
    code, body = http_json(
        "POST",
        f"{base_url}/rest/v1/{table}?{params}",
        sb_headers(service_role_key, "resolution=merge-duplicates,return=minimal"),
        rows,
    )
    if code not in (200, 201):
        raise RuntimeError(f"Supabase upsert failed on {table} ({code}): {body}")


def sb_patch(base_url: str, service_role_key: str, table: str, filters: Dict[str, str], patch: Dict[str, Any]) -> None:
    query = urllib.parse.urlencode(filters)
    code, body = http_json("PATCH", f"{base_url}/rest/v1/{table}?{query}", sb_headers(service_role_key), patch)
    if code not in (200, 204):
        raise RuntimeError(f"Supabase patch failed on {table} ({code}): {body}")


def normalize_whitespace(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(str(value).strip().split())
    return cleaned or None


def canonical_domain(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip().lower()
    raw = raw.replace("https://", "").replace("http://", "")
    raw = raw.split("/")[0].split("?")[0]
    raw = raw.replace("www.", "")
    return raw or None


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rad = math.pi / 180.0
    dlat = (lat2 - lat1) * rad
    dlon = (lon2 - lon1) * rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlon / 2) ** 2
    )
    return 3958.7613 * 2 * math.asin(min(1.0, math.sqrt(a)))


def parse_event(event_path: str) -> Dict[str, Any]:
    with open(event_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    center = payload.get("center") or payload.get("storm_center") or {}
    lat = payload.get("lat") or center.get("lat")
    lng = payload.get("lng") or center.get("lng")
    if lat is None or lng is None:
        raise RuntimeError("Storm event payload must include lat/lng or center.lat/center.lng")
    radius = payload.get("radius_miles") or payload.get("radiusMiles") or 50
    return {
        "external_event_id": payload.get("event_id") or payload.get("id"),
        "storm_name": payload.get("storm_name") or payload.get("name"),
        "storm_started_at": payload.get("storm_started_at"),
        "alert_received_at": payload.get("alert_received_at") or now_iso(),
        "storm_center_lat": float(lat),
        "storm_center_lng": float(lng),
        "radius_miles": float(radius),
        "target_state": payload.get("target_state"),
        "payload": payload,
    }


def load_property_seed(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        return data.get("properties") or data.get("items") or []
    if isinstance(data, list):
        return data
    return []


def collect_properties_from_apify(center_lat: float, center_lng: float, radius_miles: float) -> List[Dict[str, Any]]:
    apify_key = env_first("APIFY_KEY", "APIFY_API_KEY")
    if not apify_key:
        return []
    actor_id = os.getenv("APIFY_LOOPNET_ACTOR", "crawlerbros~loopnet-scraper")
    # Best-effort generic actor invocation; response schema depends on actor.
    input_payload = {
        "centerLat": center_lat,
        "centerLng": center_lng,
        "radiusMiles": radius_miles,
    }
    query = urllib.parse.urlencode({"token": apify_key})
    code, body = http_json(
        "POST",
        f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items?{query}",
        {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "stormwatch-connector/1.0"},
        input_payload,
    )
    if code != 200:
        return []
    items = body if isinstance(body, list) else body.get("items") or []
    out: List[Dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            out.append(item)
    return out


def collect_properties_from_reonomy(center_lat: float, center_lng: float, radius_miles: float) -> List[Dict[str, Any]]:
    reonomy_url = os.getenv("REONOMY_API_URL", "").strip()
    reonomy_key = os.getenv("REONOMY_API_KEY", "").strip()
    if not reonomy_url or not reonomy_key:
        return []
    payload = {"lat": center_lat, "lng": center_lng, "radius_miles": radius_miles}
    code, body = http_json(
        "POST",
        reonomy_url,
        {"Authorization": f"Bearer {reonomy_key}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "stormwatch-connector/1.0"},
        payload,
    )
    if code != 200:
        return []
    rows = body.get("properties") or body.get("items") or body.get("data") or []
    return [row for row in rows if isinstance(row, dict)]


def normalize_property_row(source: str, row: Dict[str, Any], center_lat: float, center_lng: float, radius_miles: float) -> Optional[Dict[str, Any]]:
    lat = row.get("property_lat") or row.get("lat") or row.get("latitude")
    lng = row.get("property_lng") or row.get("lng") or row.get("longitude")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = None
        lng_f = None
    distance = None
    if lat_f is not None and lng_f is not None:
        distance = haversine_miles(center_lat, center_lng, lat_f, lng_f)
        if distance > radius_miles:
            return None
    property_name = normalize_whitespace(row.get("property_name") or row.get("building_name") or row.get("name"))
    street = normalize_whitespace(row.get("property_street") or row.get("street") or row.get("address"))
    city = normalize_whitespace(row.get("property_city") or row.get("city"))
    state = normalize_whitespace(row.get("property_state") or row.get("state"))
    zip_code = normalize_whitespace(row.get("property_zip") or row.get("zip") or row.get("postal_code"))
    country = normalize_whitespace(row.get("property_country") or row.get("country") or "United States")
    owner = normalize_whitespace(row.get("building_owner_company") or row.get("owner_company") or row.get("owner"))
    manager = normalize_whitespace(row.get("management_company") or row.get("manager_company") or row.get("property_manager"))
    maintenance = normalize_whitespace(row.get("maintenance_company") or row.get("maintenance_provider"))
    if not any([owner, manager, maintenance]):
        return None
    return {
        "source_system": source,
        "external_property_id": str(row.get("external_property_id") or row.get("id") or ""),
        "property_name": property_name,
        "property_street": street,
        "property_city": city,
        "property_state": state,
        "property_zip": zip_code,
        "property_country": country,
        "property_lat": lat_f,
        "property_lng": lng_f,
        "distance_miles": distance,
        "building_owner_company": owner,
        "building_owner_email": normalize_whitespace(row.get("building_owner_email") or row.get("owner_email")),
        "building_owner_phone": normalize_whitespace(row.get("building_owner_phone") or row.get("owner_phone")),
        "management_company": manager,
        "management_email": normalize_whitespace(row.get("management_email") or row.get("manager_email")),
        "management_phone": normalize_whitespace(row.get("management_phone") or row.get("manager_phone")),
        "maintenance_company": maintenance,
        "maintenance_email": normalize_whitespace(row.get("maintenance_email")),
        "maintenance_phone": normalize_whitespace(row.get("maintenance_phone")),
        "company_website": normalize_whitespace(row.get("company_website") or row.get("website")),
        "confidence": row.get("confidence"),
        "payload": row,
    }


def resolve_company_candidates(property_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    buckets: Dict[str, Dict[str, Any]] = {}
    for row in property_rows:
        role_sources = [
            ("owner", row.get("building_owner_company")),
            ("manager", row.get("management_company")),
            ("maintenance", row.get("maintenance_company")),
        ]
        for role, company_name in role_sources:
            if not company_name:
                continue
            domain = canonical_domain(row.get("company_website"))
            key = f"{company_name.lower()}::{role}"
            if key not in buckets:
                buckets[key] = {
                    "canonical_company_name": company_name,
                    "canonical_domain": domain,
                    "company_role": role,
                    "confidence": row.get("confidence") or 70,
                    "source_systems": [row.get("source_system")],
                    "source_records": [row.get("payload")],
                    "company_website": row.get("company_website"),
                    "office_city": row.get("property_city"),
                    "office_state": row.get("property_state"),
                    "office_country": row.get("property_country"),
                    "office_phone": row.get(f"{role}_phone") or row.get("management_phone") or row.get("building_owner_phone"),
                    "office_email": row.get(f"{role}_email") or row.get("management_email") or row.get("building_owner_email"),
                    "signal_score": 80 if role in {"owner", "manager"} else 72,
                }
            else:
                existing = buckets[key]
                existing["confidence"] = max(float(existing.get("confidence") or 0), float(row.get("confidence") or 0))
                if row.get("source_system") and row.get("source_system") not in existing["source_systems"]:
                    existing["source_systems"].append(row.get("source_system"))
                existing["source_records"].append(row.get("payload"))
    return list(buckets.values())


def create_stage(base_url: str, service_role_key: str, stage_row: Dict[str, Any]) -> str:
    rows = sb_insert(base_url, service_role_key, "stormwatch_storm_event_runs", stage_row, return_rows=True)
    return str(rows[0]["id"])


def finish_stage(base_url: str, service_role_key: str, stage_id: str, status: str, detail: Dict[str, Any]) -> None:
    finished_at = now_iso()
    started = datetime.fromisoformat(detail.pop("_started_at"))
    ended = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))
    elapsed = int((ended - started).total_seconds())
    sb_patch(
        base_url,
        service_role_key,
        "stormwatch_storm_event_runs",
        {"id": f"eq.{stage_id}"},
        {
            "stage_status": status,
            "stage_finished_at": finished_at,
            "elapsed_seconds": elapsed,
            "detail": detail,
        },
    )


def run_connectivity(
    storm_event_id: str,
    trigger_source: str,
    triggered_at: str,
    company_seed_file: str,
    push_ghl: bool,
) -> str:
    cmd = [
        os.getenv("PYTHON", "python3"),
        str(CONNECTIVITY_SCRIPT),
        "--company-seed-file",
        company_seed_file,
        "--storm-event-id",
        storm_event_id,
        "--trigger-source",
        trigger_source,
        "--triggered-at",
        triggered_at,
        "--max-companies",
        "250",
        "--max-contacts-per-role",
        "2",
    ]
    if push_ghl:
        cmd.append("--push-ghl")
    proc = subprocess.run(
        cmd,
        cwd=str(WORKSPACE_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Connectivity runner failed: {proc.stderr or proc.stdout}")
    run_id = ""
    for line in proc.stdout.splitlines():
        stripped = line.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                data = json.loads(stripped)
                if data.get("run_id"):
                    run_id = str(data["run_id"])
            except json.JSONDecodeError:
                continue
    if not run_id:
        marker = "run_id="
        for line in proc.stdout.splitlines():
            if marker in line:
                run_id = line.split(marker, 1)[1].strip()
                break
    if not run_id:
        raise RuntimeError(f"Could not parse run_id from connectivity output: {proc.stdout}")
    return run_id


def main() -> int:
    parser = argparse.ArgumentParser(description="Storm Alert orchestration pipeline")
    parser.add_argument("--event-file", required=True, help="Path to HailRecon event JSON payload")
    parser.add_argument("--property-seed-file", default=None, help="Optional local property seed JSON")
    parser.add_argument("--push-ghl", action="store_true")
    args = parser.parse_args()

    supabase_url = require_env("SUPABASE_URL").rstrip("/")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    event = parse_event(args.event_file)
    storm_event = {
        "office_id": os.getenv("STORMWATCH_OFFICE_ID", "bd3016cc-4b21-4fd0-be65-31aa18b9fdbd"),
        "trigger_source": "hailrecon",
        "external_event_id": event.get("external_event_id"),
        "storm_name": event.get("storm_name"),
        "storm_started_at": event.get("storm_started_at"),
        "alert_received_at": event.get("alert_received_at"),
        "storm_center_lat": event.get("storm_center_lat"),
        "storm_center_lng": event.get("storm_center_lng"),
        "radius_miles": event.get("radius_miles", 50),
        "target_state": event.get("target_state"),
        "payload": event.get("payload"),
        "status": "running",
    }
    event_row = sb_insert(supabase_url, service_role_key, "stormwatch_storm_events", storm_event, return_rows=True)[0]
    storm_event_id = str(event_row["id"])
    triggered_at = str(storm_event.get("alert_received_at") or now_iso())

    # Stage 1: property ingest
    s1_start = datetime.now(timezone.utc)
    s1_id = create_stage(
        supabase_url,
        service_role_key,
        {
            "storm_event_id": storm_event_id,
            "office_id": storm_event["office_id"],
            "stage": "property_discovery",
            "stage_status": "running",
            "detail": {"radius_miles": storm_event["radius_miles"]},
        },
    )
    property_rows: List[Dict[str, Any]] = []
    if args.property_seed_file:
        for row in load_property_seed(args.property_seed_file):
            normalized = normalize_property_row(
                "seed",
                row,
                float(storm_event["storm_center_lat"]),
                float(storm_event["storm_center_lng"]),
                float(storm_event["radius_miles"]),
            )
            if normalized:
                property_rows.append(normalized)
    for row in collect_properties_from_apify(
        float(storm_event["storm_center_lat"]),
        float(storm_event["storm_center_lng"]),
        float(storm_event["radius_miles"]),
    ):
        normalized = normalize_property_row(
            "apify",
            row,
            float(storm_event["storm_center_lat"]),
            float(storm_event["storm_center_lng"]),
            float(storm_event["radius_miles"]),
        )
        if normalized:
            property_rows.append(normalized)
    for row in collect_properties_from_reonomy(
        float(storm_event["storm_center_lat"]),
        float(storm_event["storm_center_lng"]),
        float(storm_event["radius_miles"]),
    ):
        normalized = normalize_property_row(
            "reonomy",
            row,
            float(storm_event["storm_center_lat"]),
            float(storm_event["storm_center_lng"]),
            float(storm_event["radius_miles"]),
        )
        if normalized:
            property_rows.append(normalized)
    to_insert = []
    for row in property_rows:
        to_insert.append({"storm_event_id": storm_event_id, "office_id": storm_event["office_id"], **row})
    if to_insert:
        sb_insert(supabase_url, service_role_key, "stormwatch_property_research", to_insert, return_rows=False)
    finish_stage(
        supabase_url,
        service_role_key,
        s1_id,
        "completed",
        {"_started_at": s1_start.isoformat(), "property_count": len(property_rows)},
    )

    # Stage 2: company resolution
    s2_start = datetime.now(timezone.utc)
    s2_id = create_stage(
        supabase_url,
        service_role_key,
        {
            "storm_event_id": storm_event_id,
            "office_id": storm_event["office_id"],
            "stage": "company_resolution",
            "stage_status": "running",
            "detail": {},
        },
    )
    candidates = resolve_company_candidates(property_rows)
    company_rows = []
    for candidate in candidates:
        company_rows.append(
            {
                "storm_event_id": storm_event_id,
                "office_id": storm_event["office_id"],
                "canonical_company_name": candidate["canonical_company_name"],
                "canonical_domain": candidate.get("canonical_domain"),
                "company_role": candidate["company_role"],
                "confidence": candidate.get("confidence"),
                "source_systems": candidate.get("source_systems") or [],
                "source_records": candidate.get("source_records") or [],
            }
        )
    if company_rows:
        sb_upsert(
            supabase_url,
            service_role_key,
            "stormwatch_company_resolution",
            company_rows,
            "storm_event_id,canonical_company_name,company_role",
        )
    finish_stage(
        supabase_url,
        service_role_key,
        s2_id,
        "completed",
        {"_started_at": s2_start.isoformat(), "company_candidate_count": len(candidates)},
    )

    # Stage 3: connectivity pipeline
    s3_start = datetime.now(timezone.utc)
    s3_id = create_stage(
        supabase_url,
        service_role_key,
        {
            "storm_event_id": storm_event_id,
            "office_id": storm_event["office_id"],
            "stage": "zoominfo_enrichment_and_ghl_sync",
            "stage_status": "running",
            "detail": {},
        },
    )
    seed_companies = []
    for candidate in candidates:
        seed_companies.append(
            {
                "canonical_company_name": candidate["canonical_company_name"],
                "company_name": candidate["canonical_company_name"],
                "company_website": candidate.get("company_website"),
                "office_website": candidate.get("company_website"),
                "office_city": candidate.get("office_city"),
                "office_state": candidate.get("office_state"),
                "office_country": candidate.get("office_country"),
                "office_phone": candidate.get("office_phone"),
                "office_email": candidate.get("office_email"),
                "signal_score": candidate.get("signal_score"),
                "intent_topic": "storm_alert",
                "source_systems": candidate.get("source_systems"),
            }
        )
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tmp:
        json.dump({"companies": seed_companies}, tmp)
        tmp_path = tmp.name
    stormwatch_run_id = run_connectivity(
        storm_event_id=storm_event_id,
        trigger_source="hailrecon",
        triggered_at=triggered_at,
        company_seed_file=tmp_path,
        push_ghl=args.push_ghl,
    )
    finish_stage(
        supabase_url,
        service_role_key,
        s3_id,
        "completed",
        {"_started_at": s3_start.isoformat(), "stormwatch_run_id": stormwatch_run_id, "seed_company_count": len(seed_companies)},
    )

    # Stage 4: property object mapping hardening
    s4_start = datetime.now(timezone.utc)
    s4_id = create_stage(
        supabase_url,
        service_role_key,
        {
            "storm_event_id": storm_event_id,
            "office_id": storm_event["office_id"],
            "stage": "property_object_mapping",
            "stage_status": "running",
            "detail": {},
        },
    )
    map_cmd = [os.getenv("PYTHON", "python3"), str(WORKSPACE_ROOT / "scripts" / "stormwatch" / "sync_stormwatch_property_object.py"), "--run-id", stormwatch_run_id]
    map_proc = subprocess.run(map_cmd, cwd=str(WORKSPACE_ROOT), capture_output=True, text=True, check=False)
    if map_proc.returncode != 0:
        raise RuntimeError(f"Property mapping failed: {map_proc.stderr or map_proc.stdout}")
    finish_stage(
        supabase_url,
        service_role_key,
        s4_id,
        "completed",
        {"_started_at": s4_start.isoformat(), "mapping_output": map_proc.stdout.strip()},
    )

    ae_ready_at = now_iso()
    elapsed_seconds = int(
        (
            datetime.fromisoformat(ae_ready_at.replace("Z", "+00:00"))
            - datetime.fromisoformat(triggered_at.replace("Z", "+00:00"))
        ).total_seconds()
    )
    sla_status = "met_10min" if elapsed_seconds <= 600 else "missed_10min"
    sb_patch(
        supabase_url,
        service_role_key,
        "stormwatch_storm_events",
        {"id": f"eq.{storm_event_id}"},
        {"status": "ae_ready", "updated_at": now_iso()},
    )
    sb_patch(
        supabase_url,
        service_role_key,
        "stormwatch_zoominfo_runs",
        {"id": f"eq.{stormwatch_run_id}"},
        {"ae_ready_at": ae_ready_at, "elapsed_seconds": elapsed_seconds, "sla_status": sla_status},
    )

    print(
        json.dumps(
            {
                "storm_event_id": storm_event_id,
                "stormwatch_run_id": stormwatch_run_id,
                "property_count": len(property_rows),
                "company_candidate_count": len(candidates),
                "elapsed_seconds": elapsed_seconds,
                "sla_status": sla_status,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
