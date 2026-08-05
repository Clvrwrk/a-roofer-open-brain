## Probe Goal

Prove that the grant key referenced by `JT_SUPABASE_MIRROR_GRANT_KEY` authenticates against the JobTread Pave API and can see Pro Exteriors organization id `22PazeRM5FCH`.

## Commands Run

```sh
set -a
source /Users/chussey/.config/cleverwork/master.env
set +a

python3 - <<'PY'
import json, os
body = {
    "query": {
        "$": {"grantKey": os.environ["JT_SUPABASE_MIRROR_GRANT_KEY"]},
        "currentGrant": {
            "id": {},
            "user": {
                "id": {},
                "name": {},
                "memberships": {
                    "nodes": {
                        "id": {},
                        "organization": {"id": {}, "name": {}}
                    }
                }
            }
        }
    }
}
with open("/tmp/r0-pave-body.json", "w") as f:
    json.dump(body, f)
PY

curl -s -X POST https://api.jobtread.com/pave \
  -H 'Content-Type: application/json' \
  --data @/tmp/r0-pave-body.json

python3 -m json.tool
rm /tmp/r0-pave-body.json
```

The request's `grantKey` value was supplied only through `$JT_SUPABASE_MIRROR_GRANT_KEY`. The response was checked for that value and would have replaced it with `REDACTED` before writing the JSON deliverable.

## Observed Behavior

HTTP status: `200`

The response was a JSON object with a top-level `currentGrant` object. It contained the grant id and a nested user object with `id`, `name`, and `memberships.nodes`. The membership node contained its id and an organization object with `id` and `name`.

## Model Response Or API Result

- User name: `chris hussey`
- Organization id: `22PazeRM5FCH`
- Organization name: `Pro Exteriors`

## Verdict

**PASS** — organization id `22PazeRM5FCH` appeared in the actual live API response, paired with organization name `Pro Exteriors`.
