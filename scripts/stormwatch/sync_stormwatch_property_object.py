#!/usr/bin/env python3
"""Map Stormwatch contacts/opportunities to GHL business object records."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

GHL_BASE_URL = "https://services.leadconnectorhq.com"
BUSINESS_OBJECT_KEY = "business"
BUSINESS_CONTACT_ASSOC_ID = "BUSINESSES_CONTACTS_ASSOCIATION"


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


def sb_headers(service_role_key: str, prefer: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def sb_select(base_url: str, service_role_key: str, table: str, filters: Dict[str, str], select_cols: str) -> List[Dict[str, Any]]:
    params = dict(filters)
    params["select"] = select_cols
    query = urllib.parse.urlencode(params)
    code, body = http_json("GET", f"{base_url}/rest/v1/{table}?{query}", sb_headers(service_role_key))
    if code != 200:
        raise RuntimeError(f"Supabase select failed on {table} ({code}): {body}")
    return body if isinstance(body, list) else []


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


def sb_patch_sync_row(base_url: str, service_role_key: str, run_id: str, zoominfo_contact_id: str, patch: Dict[str, Any]) -> None:
    query = urllib.parse.urlencode({"run_id": f"eq.{run_id}", "zoominfo_contact_id": f"eq.{zoominfo_contact_id}"})
    code, body = http_json("PATCH", f"{base_url}/rest/v1/stormwatch_ghl_sync?{query}", sb_headers(service_role_key), patch)
    if code not in (200, 204):
        raise RuntimeError(f"Supabase patch failed on stormwatch_ghl_sync ({code}): {body}")


def ghl_headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "stormwatch-connector/1.0 (+https://proexteriorsus.com)",
    }


def ghl_list_associations(api_key: str, location_id: str) -> List[Dict[str, Any]]:
    q = urllib.parse.urlencode({"locationId": location_id, "limit": 200, "skip": 0})
    code, body = http_json("GET", f"{GHL_BASE_URL}/associations/?{q}", ghl_headers(api_key))
    if code != 200:
        return []
    return body.get("associations") or []


def resolve_association_ids(api_key: str, location_id: str) -> Tuple[str, Optional[str], Optional[str]]:
    associations = ghl_list_associations(api_key, location_id)
    contact_assoc = BUSINESS_CONTACT_ASSOC_ID
    business_to_opp = None
    opp_to_business = None
    for assoc in associations:
        first = str(assoc.get("firstObjectKey") or "")
        second = str(assoc.get("secondObjectKey") or "")
        assoc_id = str(assoc.get("id") or "")
        if first == "business" and second == "contact":
            contact_assoc = assoc_id
        if first == "business" and second == "opportunity":
            business_to_opp = assoc_id
        if first == "opportunity" and second == "business":
            opp_to_business = assoc_id
    return contact_assoc, business_to_opp, opp_to_business


def ghl_search_business(api_key: str, location_id: str, query: str) -> Optional[Dict[str, Any]]:
    payload = {"locationId": location_id, "page": 1, "pageLimit": 100, "query": query, "searchAfter": []}
    code, body = http_json("POST", f"{GHL_BASE_URL}/objects/{BUSINESS_OBJECT_KEY}/records/search", ghl_headers(api_key), payload)
    if code not in (200, 201):
        return None
    records = body.get("records") or []
    normalized = query.strip().lower()
    for record in records:
        props = record.get("properties") or {}
        if str(props.get("name") or props.get("business.name") or "").strip().lower() == normalized:
            return record
    return None


def ghl_create_business(api_key: str, location_id: str, contact_row: Dict[str, Any]) -> Dict[str, Any]:
    properties = {
        "name": contact_row.get("office_display_name"),
        "phone": contact_row.get("company_office_phone"),
        "email": contact_row.get("company_office_email"),
        "website": contact_row.get("office_website") or contact_row.get("company_website"),
        "address": contact_row.get("office_street"),
        "city": contact_row.get("office_city"),
        "state": contact_row.get("office_state"),
        "postalcode": contact_row.get("office_zip"),
        "country": "US" if (str(contact_row.get("office_country") or "").lower().startswith("united states")) else None,
        "description": (
            f"Stormwatch property object for {contact_row.get('company_name')} "
            f"(priority {contact_row.get('priority_tier')} score {contact_row.get('lead_score_total')})."
        ),
    }
    properties = {k: v for k, v in properties.items() if v is not None}
    payload = {"locationId": location_id, "properties": properties}
    code, body = http_json("POST", f"{GHL_BASE_URL}/objects/{BUSINESS_OBJECT_KEY}/records", ghl_headers(api_key), payload)
    if code not in (200, 201):
        raise RuntimeError(f"GHL business create failed ({code}): {body}")
    record = body.get("record") or body.get("data") or body
    if not isinstance(record, dict) or not record.get("id"):
        raise RuntimeError(f"GHL business create returned no id: {body}")
    return record


def ghl_associate_records(
    api_key: str,
    location_id: str,
    association_id: str,
    first_record_id: str,
    second_record_id: str,
) -> Tuple[bool, Dict[str, Any], int]:
    payload = {
        "locationId": location_id,
        "associationId": association_id,
        "firstRecordId": first_record_id,
        "secondRecordId": second_record_id,
    }
    code, body = http_json("POST", f"{GHL_BASE_URL}/associations/relations", ghl_headers(api_key), payload)
    if code in (200, 201):
        return True, body, code
    # Many cases are idempotent already-exists conflicts; treat as success when relation exists.
    rel_code, rel_body = http_json(
        "GET",
        f"{GHL_BASE_URL}/associations/relations/{first_record_id}?{urllib.parse.urlencode({'locationId': location_id, 'limit': 100})}",
        ghl_headers(api_key),
    )
    if rel_code == 200:
        relations = rel_body.get("relations") or []
        for relation in relations:
            if str(relation.get("firstRecordId")) == str(first_record_id) and str(relation.get("secondRecordId")) == str(second_record_id):
                return True, {"created": body, "verified": relation}, code
    return False, body, code


def load_target_rows(base_url: str, service_role_key: str, run_id: str) -> List[Dict[str, Any]]:
    rows = sb_select(
        base_url,
        service_role_key,
        "stormwatch_zoominfo_contacts",
        {
            "run_id": f"eq.{run_id}",
            "mandatory_email_ok": "eq.true",
            "mandatory_phone_ok": "eq.true",
            "mandatory_office_address_ok": "eq.true",
        },
        "id,run_id,office_id,zoominfo_contact_id,company_name,office_display_name,office_street,office_city,office_state,office_zip,office_country,company_office_phone,company_office_email,company_website,office_website,priority_tier,lead_score_total",
    )
    sync_rows = sb_select(
        base_url,
        service_role_key,
        "stormwatch_ghl_sync",
        {"run_id": f"eq.{run_id}"},
        "zoominfo_contact_id,ghl_contact_id,ghl_opportunity_id",
    )
    sync_by_zid = {str(row.get("zoominfo_contact_id")): row for row in sync_rows}
    out: List[Dict[str, Any]] = []
    for row in rows:
        zid = str(row.get("zoominfo_contact_id") or "")
        sync = sync_by_zid.get(zid, {})
        if not sync.get("ghl_contact_id"):
            continue
        row["ghl_contact_id"] = sync.get("ghl_contact_id")
        row["ghl_opportunity_id"] = sync.get("ghl_opportunity_id")
        out.append(row)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Map Stormwatch records to GHL business property object")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    supabase_url = require_env("SUPABASE_URL").rstrip("/")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    ghl_api_key = env_first("GHL_API_KEY", "GHL_PIT_KEY", "GHL_CW_SUB_ACCOUNT_PIT")
    ghl_location_id = require_env("GHL_LOCATION_ID")
    if not ghl_api_key:
        raise RuntimeError("Missing GHL API key env (GHL_API_KEY or GHL_PIT_KEY or GHL_CW_SUB_ACCOUNT_PIT)")

    rows = load_target_rows(supabase_url, service_role_key, args.run_id)
    if not rows:
        print(json.dumps({"run_id": args.run_id, "mapped": 0, "detail": "No eligible rows"}, indent=2))
        return 0

    mapped = 0
    failed = 0
    map_rows: List[Dict[str, Any]] = []
    sync_updates: List[Dict[str, Any]] = []
    cache: Dict[str, str] = {}
    contact_assoc_id, business_to_opp_assoc_id, opp_to_business_assoc_id = resolve_association_ids(ghl_api_key, ghl_location_id)

    for row in rows:
        office_display_name = str(row.get("office_display_name") or "").strip()
        if not office_display_name:
            failed += 1
            continue

        business_record_id = cache.get(office_display_name)
        if not business_record_id:
            found = ghl_search_business(ghl_api_key, ghl_location_id, office_display_name)
            if found and found.get("id"):
                business_record_id = str(found["id"])
            else:
                created = ghl_create_business(ghl_api_key, ghl_location_id, row)
                business_record_id = str(created["id"])
            cache[office_display_name] = business_record_id

        ok, assoc_resp, assoc_code = ghl_associate_records(
            ghl_api_key,
            ghl_location_id,
            contact_assoc_id,
            business_record_id,
            str(row.get("ghl_contact_id")),
        )
        status = "mapped" if ok else "failed"
        opportunity_mapping_method = "via_contact_association"
        opportunity_assoc_payload: Dict[str, Any] = {}
        opportunity_id = str(row.get("ghl_opportunity_id") or "")
        if opportunity_id:
            if business_to_opp_assoc_id:
                o_ok, o_resp, o_code = ghl_associate_records(
                    ghl_api_key,
                    ghl_location_id,
                    business_to_opp_assoc_id,
                    business_record_id,
                    opportunity_id,
                )
                opportunity_mapping_method = "direct_business_to_opportunity" if o_ok else "via_contact_association"
                opportunity_assoc_payload = {"direct_assoc_direction": "business_to_opportunity", "ok": o_ok, "code": o_code, "response": o_resp}
            elif opp_to_business_assoc_id:
                o_ok, o_resp, o_code = ghl_associate_records(
                    ghl_api_key,
                    ghl_location_id,
                    opp_to_business_assoc_id,
                    opportunity_id,
                    business_record_id,
                )
                opportunity_mapping_method = "direct_opportunity_to_business" if o_ok else "via_contact_association"
                opportunity_assoc_payload = {"direct_assoc_direction": "opportunity_to_business", "ok": o_ok, "code": o_code, "response": o_resp}
        if ok:
            mapped += 1
        else:
            failed += 1

        map_rows.append(
            {
                "run_id": row.get("run_id"),
                "office_id": row.get("office_id"),
                "zoominfo_contact_id": row.get("zoominfo_contact_id"),
                "ghl_contact_id": row.get("ghl_contact_id"),
                "ghl_opportunity_id": row.get("ghl_opportunity_id"),
                "business_object_key": BUSINESS_OBJECT_KEY,
                "business_record_id": business_record_id,
                "office_display_name": office_display_name,
                "association_id": contact_assoc_id,
                "contact_association_status": status,
                "opportunity_mapping_method": opportunity_mapping_method,
                "updated_at": now_iso(),
                "source_payload": {
                    "association_response_code": assoc_code,
                    "association_response": assoc_resp,
                    "opportunity_association": opportunity_assoc_payload,
                    "association_catalog": {
                        "contact_assoc_id": contact_assoc_id,
                        "business_to_opp_assoc_id": business_to_opp_assoc_id,
                        "opp_to_business_assoc_id": opp_to_business_assoc_id,
                    },
                },
            }
        )
        sync_updates.append(
            {
                "run_id": row.get("run_id"),
                "zoominfo_contact_id": row.get("zoominfo_contact_id"),
                "business_object_key": BUSINESS_OBJECT_KEY,
                "business_record_id": business_record_id,
                "contact_business_association_status": status,
                "opportunity_mapping_method": opportunity_mapping_method,
            }
        )

    sb_upsert(supabase_url, service_role_key, "stormwatch_ghl_property_object_map", map_rows, "run_id,zoominfo_contact_id,business_record_id")
    for row in sync_updates:
        run_id = str(row.pop("run_id"))
        zid = str(row.pop("zoominfo_contact_id"))
        sb_patch_sync_row(supabase_url, service_role_key, run_id, zid, row)

    print(json.dumps({"run_id": args.run_id, "mapped": mapped, "failed": failed, "unique_business_records": len(cache)}, indent=2))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
