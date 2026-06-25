#!/usr/bin/env python3
"""
scripts/validate-agent.py
Canonical E2E validation script for any deployed Open Brain agent.
Usage: python validate-agent.py <agent-id>
Example: python validate-agent.py alex-rivers

Runs 15 tests, posts a validation report to #agent-deploy-validation,
posts an intro to #agent-profile-builder on first-time runs.
Exit code 0 = all tests pass (≥90%). Exit code 1 = validation failed.
"""
import argparse, json, ssl, subprocess, sys, time, uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import yaml
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    import googleapiclient.discovery
    import openpyxl
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
        "pyyaml", "google-auth", "google-auth-httplib2",
        "google-api-python-client", "openpyxl"], check=True)
    import yaml
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    import googleapiclient.discovery
    import openpyxl

REPO     = Path(__file__).parent.parent
PROFILES = REPO / "agents/profiles"
SSH_KEY  = Path("~/.ssh/a_roofers_open_brain_ed25519").expanduser()
CTX      = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode    = ssl.CERT_NONE

DEPLOY_CH  = "C0BD7L43PC2"
PROFILE_CH = "C0BD7L0M02W"

PASS, FAIL, WARN = "✅", "❌", "⚠️ "


def load_env():
    env = {}
    for line in (REPO / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip() and not k.strip().startswith("#"):
            env[k.strip()] = v.strip()
    return env


def ssh(cmd):
    r = subprocess.run(
        ["ssh", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no",
         "-o", "ConnectTimeout=8", "root@5.78.146.161", cmd],
        capture_output=True, text=True, timeout=25,
    )
    return r.stdout.strip(), r.returncode


def http(url, payload=None, headers=None):
    import urllib.request, urllib.error
    method = "POST" if payload is not None else "GET"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})}, method=method,
    )
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:
        return 0, {"_error": str(e)}


def slack_post(token, channel, text):
    _, d = http("https://slack.com/api/chat.postMessage",
                {"channel": channel, "text": text},
                {"Authorization": f"Bearer {token}"})
    return d.get("ok"), d.get("ts"), d.get("error")


def run_validation(agent_id: str, profile: dict, env: dict, verbose: bool = True) -> dict:
    results = {}
    started_at = datetime.now(timezone.utc).isoformat()

    email       = profile["google_workspace"]["email"]
    image_id    = profile["kasm"].get("image_id", "2c589484-3521-41fc-bec6-ac785ae87dd7")
    profile_dir = f"/mnt/kasm_profiles/{email}/{image_id}/.hermes"
    cc_url      = profile["platform"]["command_center_url"]
    service_id  = profile["command_center"]["service_agent_id"]
    bot_token_key = f"SLACK_BOT_TOKEN_{agent_id.replace('-','_').upper()}"
    bot_token   = env.get(bot_token_key, env.get("SLACK_BOT_TOKEN", ""))

    # Find service token for this agent
    all_tokens = env.get("AGENT_SERVICE_TOKENS", "")
    svc_token  = next((p.split(":",1)[1] for p in all_tokens.split(",")
                       if p.strip().startswith(f"{service_id}:")), "")

    def test(name, fn):
        try:
            ok, detail = fn()
        except Exception as e:
            ok, detail = False, str(e)[:120]
        results[name] = {"pass": ok, "detail": detail}
        if verbose:
            print(f"  {'✅' if ok else '❌'} {name}: {detail}")
        return ok

    # 1. Kasm user
    def t_kasm_user():
        out, _ = ssh(f"docker exec kasm_db psql -U kasmapp -d kasm -c \"SELECT username FROM users WHERE username='{email}';\"")
        ok = email.split("@")[0] in out
        return ok, f"found in Kasm DB" if ok else "NOT in Kasm DB"

    # 2. Profile files
    def t_profile_files():
        out, _ = ssh(f"ls {profile_dir}/.env {profile_dir}/SOUL.md {profile_dir}/config.yaml 2>/dev/null | wc -l")
        count = out.strip()
        ok = count == "3"
        return ok, f"all 3 files present" if ok else f"{count}/3 files present"

    # 3. Hermes running
    def t_hermes():
        name_part = email.split("@")[0].replace(".", "").replace("-", "")
        cmd = (
            f"CONTAINER=$(docker ps -q --filter 'name={name_part}' | head -1); "
            f"[ -z \"$CONTAINER\" ] && CONTAINER=$(docker ps -q --filter 'ancestor=openbrain-hermes-chrome:1.18.0-20260606' | head -1); "
            f"[ -n \"$CONTAINER\" ] && docker exec $CONTAINER /usr/local/bin/hermes --version 2>/dev/null || echo 'no container'"
        )
        out, _ = ssh(cmd)
        ok = "Hermes" in out or "hermes" in out.lower()
        return ok, out.split("\n")[0][:60] if ok else "no container running (launch Kasm desktop first)"

    # 4. Gmail API
    def t_gmail():
        sa_file = next(Path("~/Downloads").expanduser().glob("custom-frame-*.json"), None)
        if not sa_file:
            return False, "SA key not found in ~/Downloads"
        creds = service_account.Credentials.from_service_account_file(
            str(sa_file),
            scopes=profile["google_workspace"]["gmail_scopes"],
            subject=email,
        )
        creds.refresh(Request())
        gmail = googleapiclient.discovery.build("gmail","v1",credentials=creds,cache_discovery=False)
        labels = gmail.users().labels().list(userId="me").execute().get("labels",[])
        return len(labels) > 0, f"{len(labels)} labels accessible"

    # 5. Drive API
    def t_drive():
        sa_file = next(Path("~/Downloads").expanduser().glob("custom-frame-*.json"), None)
        drive_scopes = profile["google_workspace"].get("drive_scopes", [])
        if not drive_scopes:
            return True, "skipped (no drive scopes in profile)"
        creds = service_account.Credentials.from_service_account_file(
            str(sa_file), scopes=drive_scopes, subject=email)
        creds.refresh(Request())
        drive = googleapiclient.discovery.build("drive","v3",credentials=creds,cache_discovery=False)
        drive.files().list(pageSize=1).execute()
        return True, "Drive API accessible"

    # 6. Slack auth
    def t_slack_auth():
        if not bot_token or len(bot_token) < 50:
            return False, f"bot token missing or short (key={bot_token_key} len={len(bot_token)})"
        _, d = http("https://slack.com/api/auth.test", {}, {"Authorization": f"Bearer {bot_token}"})
        ok = d.get("ok", False)
        return ok, f"user={d.get('user')} team={d.get('team')}" if ok else d.get("error","")

    # 7. Slack can post
    def t_slack_post():
        if not bot_token or len(bot_token) < 50:
            return False, "bot token missing"
        channels = profile["slack"].get("channels", [])
        if not channels:
            return False, "no channels in profile"
        ch_id = channels[0].get("id") or channels[0].get("id_env_key","")
        if not ch_id or len(ch_id) < 5:
            return False, f"channel ID not resolved: {channels[0].get('name')}"
        ok, ts, err = slack_post(bot_token, ch_id, f"🔬 {profile['identity']['display_name']} validation ping — {started_at}")
        return ok, f"ts={ts}" if ok else str(err)

    # 8. CC session
    def t_cc_session():
        if not svc_token:
            return False, f"no service token for {service_id}"
        status, data = http(f"{cc_url}/api/agent/session", None, {"Authorization": f"Bearer {svc_token}"})
        ok = status == 200
        return ok, f"actor={data.get('actor',{}).get('id')} depts={data.get('actor',{}).get('departmentAccess')}" if ok else f"HTTP {status}"

    # 9. CC work queue
    def t_cc_queue():
        if not svc_token:
            return False, f"no service token for {service_id}"
        status, data = http(f"{cc_url}/api/agent/work-queue", None, {"Authorization": f"Bearer {svc_token}"})
        ok = status == 200
        return ok, f"{data.get('count','?')} items" if ok else f"HTTP {status}"

    # 10. CC intake
    def t_cc_intake():
        if not svc_token:
            return False, "no service token"
        aliases = profile["google_workspace"].get("email_aliases", [])
        alias = aliases[0] if aliases else email
        routing = profile["google_workspace"].get("email_alias_routing", {})
        route_info = routing.get(alias, {})
        channels = profile["slack"].get("channels", [{}])
        ch_id = channels[0].get("id","") if channels else ""
        payload = {
            "messageId": f"validate-{agent_id}-{uuid.uuid4().hex[:8]}",
            "alias": alias,
            "classification": route_info.get("classification", "invoice"),
            "subject": f"{profile['identity']['display_name']} E2E Validation Test",
            "from": "admin@cc.proexteriorsus.net",
            "receivedAt": started_at,
            "attachments": ["validation-test.pdf"],
            "gmailLabels": ["INBOX"],
            "slackChannelId": ch_id,
            "slackThreadTs": "",
        }
        status, data = http(f"{cc_url}/api/agent/intake", payload, {"Authorization": f"Bearer {svc_token}"})
        ok = status == 200 and data.get("status") == "accepted"
        wi = data.get("workItem", {})
        return ok, f"work_key={wi.get('work_key','?')[:45]}" if ok else f"HTTP {status} {data.get('error','')}"

    # 11. ABC auth
    def t_abc_auth():
        if not profile["integrations"].get("abc_supply"):
            return True, "skipped (not in profile)"
        import urllib.parse, urllib.request as ur
        auth_base = env.get("ABC_SUPPLY_AUTH_BASE_URL") or "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357"
        body = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": env.get("ABC_SUPPLY_CLIENT_ID",""),
            "client_secret": env.get("ABC_SUPPLY_CLIENT_SECRET",""),
            "scope": "product.read",
        }).encode()
        req = ur.Request(auth_base + "/v1/token", data=body, method="POST")
        req.add_header("Content-Type","application/x-www-form-urlencoded")
        with ur.urlopen(req, context=CTX, timeout=15) as resp:
            token = json.loads(resp.read()).get("access_token","")
        return bool(token), f"token len={len(token)}"

    # 12. ABC catalog
    def t_abc_catalog():
        if not profile["integrations"].get("abc_supply"):
            return True, "skipped (not in profile)"
        import urllib.parse, urllib.request as ur
        auth_base = env.get("ABC_SUPPLY_AUTH_BASE_URL") or "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357"
        api_base  = env.get("ABC_SUPPLY_API_BASE_URL") or "https://partners.abcsupply.com"
        body = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": env.get("ABC_SUPPLY_CLIENT_ID",""),
            "client_secret": env.get("ABC_SUPPLY_CLIENT_SECRET",""),
            "scope": "product.read",
        }).encode()
        req = ur.Request(auth_base + "/v1/token", data=body, method="POST")
        req.add_header("Content-Type","application/x-www-form-urlencoded")
        with ur.urlopen(req, context=CTX, timeout=15) as resp:
            tok = json.loads(resp.read()).get("access_token","")
        req2 = ur.Request(f"{api_base}/api/product/v1/items?pageNumber=1&itemsPerPage=2",
                          headers={"Authorization": f"Bearer {tok}"})
        with ur.urlopen(req2, context=CTX, timeout=15) as resp:
            data = json.loads(resp.read())
        # totalCount is NOT in the response — check for items array
        items = data.get("items", [])
        return len(items) > 0, f"{len(items)} items returned (catalog accessible)"

    # 13. AgentMail
    def t_agentmail():
        am_key = env.get("AGENTMAIL_API_KEY","")
        import urllib.request as ur
        req = ur.Request("https://api.agentmail.to/v0/inboxes",
                         headers={"Authorization": f"Bearer {am_key}"})
        with ur.urlopen(req, context=CTX, timeout=10) as resp:
            data = json.loads(resp.read())
        inboxes = data.get("inboxes", data if isinstance(data,list) else [])
        return len(inboxes) > 0, f"{len(inboxes)} inboxes accessible"

    # 14. Guardrail: no approval.decide
    def t_guardrail():
        if not svc_token:
            return False, "no service token"
        _, data = http(f"{cc_url}/api/agent/session", None, {"Authorization": f"Bearer {svc_token}"})
        perms = data.get("actor",{}).get("permissions",[])
        no_approve = "approval.decide" not in perms
        return no_approve, "approval.decide correctly absent" if no_approve else "❌ GUARDRAIL VIOLATION: approval.decide found"

    # 15. Kasm password hash present
    def t_kasm_pw():
        out, _ = ssh(f"docker exec kasm_db psql -U kasmapp -d kasm -c \"SELECT pw_hash FROM users WHERE username='{email}';\"")
        ok = len(out) > 30 and "row" in out.lower()
        return ok, "password hash in Kasm DB"

    test("1. Kasm user exists",       t_kasm_user)
    test("2. Kasm profile files",      t_profile_files)
    test("3. Hermes in container",     t_hermes)
    test("4. Gmail API",               t_gmail)
    test("5. Drive API",               t_drive)
    test("6. Slack bot auth",          t_slack_auth)
    test("7. Slack can post",          t_slack_post)
    test("8. CC session",              t_cc_session)
    test("9. CC work queue",           t_cc_queue)
    test("10. CC intake endpoint",     t_cc_intake)
    test("11. ABC Supply auth",        t_abc_auth)
    test("12. ABC catalog",            t_abc_catalog)
    test("13. AgentMail",              t_agentmail)
    test("14. Guardrail no-approve",   t_guardrail)
    test("15. Kasm password synced",   t_kasm_pw)

    passed  = sum(1 for v in results.values() if v["pass"])
    total   = len(results)
    pct     = int(passed / total * 100)
    done_at = datetime.now(timezone.utc).isoformat()

    return {
        "agent_id": agent_id, "agent_name": profile["identity"]["display_name"],
        "started_at": started_at, "completed_at": done_at,
        "passed": passed, "total": total, "percent": pct,
        "results": results,
        "bot_token": bot_token,
    }


def post_validation_report(result: dict, env: dict, is_first_run: bool = False):
    bot_token = result["bot_token"]
    if not bot_token or len(bot_token) < 50:
        print(f"⚠️  No valid bot token — skipping Slack post")
        return

    passed, total, pct = result["passed"], result["total"], result["percent"]
    name = result["agent_name"]
    agent_id = result["agent_id"]

    status_lines = "\n".join(
        f"{'✅' if v['pass'] else '❌'} {k}: {v['detail']}"
        for k, v in result["results"].items()
    )

    overall = "✅ PASSED" if pct >= 90 else f"⚠️  PARTIAL ({pct}%)" if pct >= 70 else "❌ FAILED"

    report = f"""*{name} — Deployment Validation Report* {overall}
Agent ID: `{agent_id}` | Score: *{passed}/{total} ({pct}%)*
Completed: {result['completed_at'][:19]}Z

{status_lines}

{'✅ Fully operational and ready.' if pct == 100 else f'⚠️  {total-passed} test(s) failing — review before approving fleet deployment.' if pct < 100 else ''}"""

    ok, ts, err = slack_post(bot_token, DEPLOY_CH, report)
    if ok:
        print(f"\n✅ Validation report posted to #agent-deploy-validation (ts={ts})")
    else:
        print(f"\n❌ Failed to post report: {err}")

    # First-time run: also post intro to #agent-profile-builder
    if is_first_run and pct >= 90:
        from pathlib import Path
        intro_path = Path(f"/tmp/{agent_id}-intro-posted")
        if not intro_path.exists():
            profile_data = yaml.safe_load((REPO / "agents/profiles" / f"{agent_id}.yaml").read_text())
            intro = f"""*Meet {name}* — New Open Brain Agent Online 🚀

*Role:* {profile_data['identity']['role']} | `{agent_id}`
*Maps to:* {', '.join(profile_data['command_center']['maps_to'])}
*Departments:* {', '.join(profile_data['command_center']['departments'])}
*Description:* {profile_data['identity']['persona_description']}

*Validation:* {passed}/{total} ({pct}%) ✅
*Deployed:* {result['completed_at'][:10]}"""

            ok2, ts2, err2 = slack_post(bot_token, PROFILE_CH, intro)
            if ok2:
                print(f"✅ Introduction posted to #agent-profile-builder (ts={ts2})")
                intro_path.touch()


def main():
    parser = argparse.ArgumentParser(description="Validate a deployed Open Brain agent")
    parser.add_argument("agent_id")
    parser.add_argument("--first-run", action="store_true", help="Post intro to #agent-profile-builder")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-test output")
    args = parser.parse_args()

    profile_path = PROFILES / f"{args.agent_id}.yaml"
    if not profile_path.exists():
        print(f"❌ Profile not found: {profile_path}")
        sys.exit(1)

    profile = yaml.safe_load(profile_path.read_text())
    env     = load_env()

    print(f"╔══ validate-agent: {args.agent_id} ══{'═'*(38-len(args.agent_id))}")
    print(f"║  {profile['identity']['display_name']} | {profile['identity']['role']}")
    print(f"╚{'═'*55}\n")

    result = run_validation(args.agent_id, profile, env, verbose=not args.quiet)
    pct    = result["percent"]

    print(f"\n{'═'*55}")
    print(f"Result: {result['passed']}/{result['total']} ({pct}%)")

    post_validation_report(result, env, is_first_run=args.first_run)

    # Save results
    out_path = Path(f"/tmp/{args.agent_id}-validation.json")
    out_path.write_text(json.dumps(result, indent=2))
    print(f"Results saved: {out_path}")

    sys.exit(0 if pct >= 90 else 1)


if __name__ == "__main__":
    main()
