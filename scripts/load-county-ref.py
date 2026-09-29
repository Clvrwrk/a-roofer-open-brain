"""Load the Census county FIPS list into public.county_ref (migration 305, docs/116).

Usage:  python3 scripts/load-county-ref.py path/to/national_county2020.txt

Source file: https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt
(public domain; pipe-delimited STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT).
Idempotent upsert on county_fips. Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY like the
other scripts (env, repo .env, or the main checkout's .env); values are never printed.
"""
import csv, json, os, re, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

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
    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return url, key

def county_key(name):
    # Mirrors public.county_key() (mig 306): upper, strip punctuation, SAINT->ST, drop the county-equivalent suffix.
    s = re.sub(r"[^A-Za-z0-9 ]", "", name or "").upper()
    s = re.sub(r"(^|\s)SAINTE?(\s)", r"\1ST\2", s)
    s = re.sub(r"\s+(COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY)$", "", s)
    return re.sub(r"\s+", " ", s).strip()

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    url, key = load_env()
    rows = []
    with open(sys.argv[1], newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh, delimiter="|"):
            rows.append({"county_fips": r["STATEFP"] + r["COUNTYFP"], "state_abbrev": r["STATE"],
                         "state_fips": r["STATEFP"], "county_name": r["COUNTYNAME"],
                         "county_key": county_key(r["COUNTYNAME"])})
    seen = {}
    for r in rows:
        k = (r["state_abbrev"], r["county_key"])
        if k in seen:
            sys.exit(f"county_key collision {k}: {seen[k]} vs {r['county_fips']}")
        seen[k] = r["county_fips"]
    for i in range(0, len(rows), 1000):
        req = urllib.request.Request(
            f"{url}/rest/v1/county_ref?on_conflict=county_fips", data=json.dumps(rows[i:i + 1000]).encode(),
            method="POST", headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                    "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            assert resp.status in (200, 201, 204), resp.status
    print(f"county_ref upserted: {len(rows)}")

if __name__ == "__main__":
    main()
