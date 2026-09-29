"""Geocode properties and unlinked AccuLynx jobs with Google (docs/115).

Usage:
  python3 scripts/geocode-properties.py [--properties] [--review-jobs] [--limit N] [--dry-run]

  --properties   properties with no point yet (run `SELECT set_property_geom_from_jobs();` first:
                 a property with an AccuLynx job pin gets that point for free)
  --review-jobs  open acculynx_job_property_review rows that have a street, to tell a real
                 address (resubmit for enrichment) from bad data (fix in AccuLynx)

Every answer is kept in public.geocode_result, then `apply_geocode_results()` writes them to
properties and the review queue. Resumable: a target already geocoded with the same query is
skipped. Uses GOOGLE_MAPS_SERVER_KEY (the key scripts/geocode-vendor-branches.mjs uses); keys
are read from env / repo .env / the main checkout's .env and never printed.
Parcel-only labels ("Parcel R-...") are skipped: they would geocode to a city centroid.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARGS = sys.argv[1:]
LIMIT = int(ARGS[ARGS.index("--limit") + 1]) if "--limit" in ARGS else None
DRY = "--dry-run" in ARGS

def load_env():
    env = {}
    files = [ROOT / ".env"]
    try:
        common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if common:
            files.append((ROOT / common).resolve().parent / ".env")
    except OSError:
        pass
    for f in files:
        if f.is_file():
            for line in f.read_text().splitlines():
                m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
                if m:
                    env.setdefault(m[1], m[2].strip().strip("'\""))
            break
    get = lambda k: os.environ.get(k) or env.get(k)
    url, key, gkey = get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), get("GOOGLE_MAPS_SERVER_KEY")
    if not url or not key or not gkey:
        sys.exit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GOOGLE_MAPS_SERVER_KEY")
    return url, key, gkey

URL, KEY, GKEY = load_env()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def rest(path, body=None, method="GET", prefer=None):
    headers = dict(H)
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        t = r.read().decode()
        return json.loads(t) if t else None

def all_rows(path):
    out = []
    for off in range(0, 10**7, 1000):  # PostgREST truncates silently at 1,000 — always page
        page = rest(f"{path}{'&' if '?' in path else '?'}limit=1000&offset={off}")
        out += page
        if len(page) < 1000:
            return out

def geocode(query):
    q = urllib.parse.urlencode({"address": query, "key": GKEY, "region": "us"})
    for attempt in range(5):
        with urllib.request.urlopen(f"https://maps.googleapis.com/maps/api/geocode/json?{q}", timeout=30) as r:
            d = json.load(r)
        st = d.get("status")
        if st == "OVER_QUERY_LIMIT":
            time.sleep(2 ** attempt)
            continue
        if st == "REQUEST_DENIED":
            raise SystemExit(f"Google REQUEST_DENIED: {d.get('error_message', '')[:120]}")
        if st != "OK" or not d.get("results"):
            return {"status": st or "ERROR"}
        g = d["results"][0]
        comp = {t: c["long_name"] for c in g.get("address_components", []) for t in c.get("types", [])}
        return {"status": "OK", "location_type": g["geometry"].get("location_type"),
                "partial_match": bool(g.get("partial_match")), "formatted_address": g.get("formatted_address"),
                "latitude": g["geometry"]["location"]["lat"], "longitude": g["geometry"]["location"]["lng"],
                "place_id": g.get("place_id"), "county_name": comp.get("administrative_area_level_2"),
                "postal_code": comp.get("postal_code")}
    return {"status": "OVER_QUERY_LIMIT"}

def main():
    targets = []
    done = {(r["target_kind"], r["target_id"], r["query"]) for r in all_rows("geocode_result?select=target_kind,target_id,query")}
    if "--properties" in ARGS:
        for p in all_rows("properties?select=id,address_full&geom=is.null&status=eq.active&order=id"):
            q = (p["address_full"] or "").strip()
            if q and not q.startswith("Parcel ") and ("property", p["id"], q) not in done:
                targets.append(("property", p["id"], q))
    if "--review-jobs" in ARGS:
        for r in all_rows("acculynx_job_property_review?select=job_id,submitted_address,reason&status=eq.open&reason=neq.no_street&order=job_id"):
            q = (r["submitted_address"] or "").strip()
            if q and ("acculynx_job", r["job_id"], q) not in done:
                targets.append(("acculynx_job", r["job_id"], q))
    if LIMIT:
        targets = targets[:LIMIT]
    print(json.dumps({"to_geocode": len(targets), "dry_run": DRY}))
    if DRY or not targets:
        return

    cols = ["status", "location_type", "partial_match", "formatted_address", "latitude", "longitude",
            "place_id", "county_name", "postal_code"]

    def work(t):
        kind, tid, q = t
        g = geocode(q)
        # PostgREST bulk upserts need every row to carry the same keys
        return {"target_kind": kind, "target_id": tid, "query": q, "provider": "google", **{c: g.get(c) for c in cols}}

    buf, n, stats = [], 0, {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for res in pool.map(work, targets):
            buf.append(res)
            stats[res["status"]] = stats.get(res["status"], 0) + 1
            n += 1
            if len(buf) >= 250:
                rest("geocode_result?on_conflict=target_kind,target_id,query", buf, "POST",
                     "resolution=merge-duplicates,return=minimal")
                buf = []
                print(f"  {n}/{len(targets)} {stats}", flush=True)
    if buf:
        rest("geocode_result?on_conflict=target_kind,target_id,query", buf, "POST",
             "resolution=merge-duplicates,return=minimal")
    applied = rest("rpc/apply_geocode_results", {}, "POST")
    print(json.dumps({"geocoded": n, "by_status": stats, "applied": applied}))

if __name__ == "__main__":
    main()
