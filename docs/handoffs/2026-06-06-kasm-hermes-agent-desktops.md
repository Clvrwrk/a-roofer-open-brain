# Handoff - Kasm Hermes Agent Desktops

**Project:** Pro Exteriors Open Brain / agent desktop runtime  
**Repo:** `/Users/chussey/Documents/a-roofers-open-brain`  
**Date:** 2026-06-06 PDT / 2026-06-07 UTC  
**Server:** Hetzner `pe-ob-agents`  
**Public desktop URL:** `https://desktops.proexteriorsus.net`  
**Reason:** User requested a baked custom Kasm image and a detailed close-out handoff.

---

## Outcome

Future Kasm Chrome sessions are now configured to launch from a custom Hermes-ready image instead of the stock Chrome image.

The registered Kasm image row is:

| Field | Value |
| --- | --- |
| Kasm image ID | `2c589484-3521-41fc-bec6-ac785ae87dd7` |
| Image tag | `openbrain-hermes-chrome:1.18.0-20260606` |
| Friendly name | `Chrome + Hermes` |
| Enabled | `true` |
| Docker image ID | `d4771f9c90fb` |
| Docker image size shown by `docker images` | `9.77GB` |

I intentionally updated the existing Kasm Chrome image row instead of creating a separate image row. Kasm persistent profiles are keyed by image ID, so preserving `2c589484-3521-41fc-bec6-ac785ae87dd7` keeps the existing agent profile paths intact.

## What Was Baked Into The Image

Custom image tag:

```text
openbrain-hermes-chrome:1.18.0-20260606
```

Base image:

```text
kasmweb/chrome:1.18.0
```

Baked runtime:

- Hermes Agent `v0.16.0`.
- `agent-browser` `0.26.0`.
- `ripgrep` `13.0.0`.
- Node.js `v22.22.3`, installed by the Hermes installer.
- Python `3.11.15`, installed by the Hermes installer.
- Existing system Google Chrome from the Kasm image.
- A default Hermes template at `/opt/openbrain/hermes-template`.
- A default profile copy at `/home/kasm-default-profile/.hermes`.
- `/etc/profile.d/openbrain-hermes.sh`, which adds Hermes, browser tools, and user-local bins to PATH and seeds `~/.hermes` for new Kasm users if missing.

Not baked:

- No OpenRouter key.
- No Slack, WorkOS, Supabase, AgentMail, Orgo, or other secret.
- No per-agent persona as a universal default beyond Hermes' generated starter files.

Each named agent still needs their own persistent `~/.hermes/.env` and `~/.hermes/SOUL.md` in their Kasm profile.

## Verification

Clean image smoke test passed from a fresh container:

```text
HERMES_PATH=/usr/local/bin/hermes
Hermes Agent v0.16.0 (2026.6.5) - upstream 210f4e70
Project: /usr/local/lib/hermes-agent
Python: 3.11.15
OpenAI SDK: 2.24.0
Up to date
AGENT_BROWSER_PATH=/usr/local/lib/hermes-agent/node_modules/.bin/agent-browser
agent-browser 0.26.0
RG_PATH=/usr/bin/rg
ripgrep 13.0.0
Google Chrome 141.0.7390.107
CONFIG_SNIPPET
  default: "anthropic/claude-opus-4.6"
  provider: openrouter
  base_url: "https://openrouter.ai/api/v1"
```

Chrome printed harmless first-run preference warnings during the container smoke because the clean test container had no Chrome profile yet.

Kasm prune durability test passed:

```text
IMAGE_AFTER_PRUNE
openbrain-hermes-chrome:1.18.0-20260606 d4771f9c90fb 9.77GB

INSPECT_AFTER_PRUNE
sha256:d4771f9c90fbb14154232e679a7480595b15c0349522e5dc4fe081db5c2b5f33
```

Kasm DB row confirmation:

```text
2c589484-3521-41fc-bec6-ac785ae87dd7|openbrain-hermes-chrome:1.18.0-20260606|Chrome + Hermes|t
```

## Important Discovery

Kasm agent image pruning is set to aggressive mode and runs about every 30 seconds.

Before the Kasm DB row was updated, custom images were successfully created and then quickly removed by Kasm as "not needed." This affected both the custom Hermes image and a tiny throwaway control image.

Representative Kasm agent log:

```text
Searching for images to prune with mode: (Aggressive)
Docker image id (...) with tags (['openbrain-hermes-chrome:1.18.0-20260606']): is not needed.
Successfully pruned unneeded Docker image id (...)
```

Resolution: register the target image tag in Kasm before or immediately around the final bake. After the DB row pointed to the custom tag, Kasm stopped pruning it.

## Remote Files And Backups

Remote build directory:

```text
/root/open-brain-bootstrap/kasm-hermes-image/
```

Primary bake script:

```text
/root/open-brain-bootstrap/kasm-hermes-image/commit-kasm-hermes-image.sh
```

Valid Kasm image table backups from before the successful DB update:

```text
/root/open-brain-bootstrap/kasm-hermes-image/backups/kasm-images-before-hermes-chrome-20260607T044643Z.sql
/root/open-brain-bootstrap/kasm-hermes-image/backups/kasm-chrome-image-before-hermes-20260607T044643Z.json
```

There is also an earlier `20260607T044618Z` backup attempt from a failed shell-quoting run. Treat the `044643Z` pair as the known-good backup pair.

## Existing Alex Desktop State

Alex Rivers has a currently working live Kasm session that was repaired manually before the custom image bake.

Known live session/container details:

| Item | Value |
| --- | --- |
| Session ID | `65067013-f1e3-4198-8f03-f85750b96f50` |
| Container | `alex.riversc_65067013` |
| Current running image | `kasmweb/chrome:1.18.0` |
| Persistent home root | `/mnt/kasm_profiles/alex.rivers@cc.proexteriorsus.net/2c589484-3521-41fc-bec6-ac785ae87dd7` |

Alex's current session is still running on the old stock Chrome image because it was already alive before the Kasm row was switched. That is fine. Alex already has Hermes manually installed into the persistent profile, including an agent-specific `.hermes/.env` and `SOUL.md`.

When Alex starts a new Chrome workspace session later, Kasm should use the baked `Chrome + Hermes` image while retaining the same persistent profile path.

## Prior Kasm Fixes In This Session

The desktop host had also been repaired earlier in the session:

- Public HTTPS for Kasm works at `https://desktops.proexteriorsus.net`.
- Kasm internal manager/agent communication was restored on `8443`.
- Agent host-token mismatch was corrected.
- `/agent/api/v1/hello/` returned HTTP 200 after the fix.
- Alex's Kasm Chrome desktop loaded successfully after these repairs.

## Rollback

Use the backup files above if a precise restore is needed.

Fast rollback to stock Chrome image name:

```bash
ssh -i /Users/chussey/.ssh/a_roofers_open_brain_ed25519 root@5.78.146.161
docker exec -i kasm_db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
update images
set name = 'kasmweb/chrome:1.18.0',
    friendly_name = 'Chrome'
where image_id = '2c589484-3521-41fc-bec6-ac785ae87dd7';
SQL
```

If the stock image has been pruned after Alex's old session ends, Kasm should be able to pull `kasmweb/chrome:1.18.0` again when needed.

## Remaining Work

1. Launch a brand-new Kasm Chrome session from the UI and confirm it uses `Chrome + Hermes`.
2. For Lena Brooks and Rowan Vale, create or verify persistent `~/.hermes/.env` files with their OpenRouter key and `chmod 600`.
3. For Lena Brooks and Rowan Vale, create role-specific `~/.hermes/SOUL.md` files.
4. Repeat for Maya Chen and Casey Morgan once their Google Workspace accounts are ready.
5. Decide whether every named agent should share the same default model or whether Accounting/Ops/Research need cheaper defaults with escalation to the premium model.
6. Build a small admin checklist in the Command Center for "agent desktop ready" status:
   - Google login complete.
   - Hermes installed or inherited from image.
   - Provider key present.
   - Persona present.
   - Browser tool smoke passed.
   - Command Center access verified.
7. Revisit the requested pretty URLs like `/alex.rivers`. Current Kasm sessions still use hash-session URLs such as `/#/session/...`; the clean per-agent path routing has not been implemented.

## Known Warnings / Risks

- The Docker host is running Docker `29.5.3`; image creation through BuildKit produced confusing image-store behavior until Kasm pruning was identified as the main cause of disappearing tags.
- Kasm aggressive pruning will remove any local custom image that is not registered in the Kasm image table.
- The old stock Chrome image is no longer the configured Kasm Chrome image and may be pruned once no live containers use it.
- Clean Docker smoke passed, but a brand-new Kasm UI session from the custom image has not yet been launched in the browser during this close-out.
- The custom image has runtime tools only. Agent credentials and agent personas remain per-profile responsibilities.
- Alex's current live session uses the old image but is already manually functional. Do not delete or restart it unless Chris is ready for that session to be interrupted.

## Next-Session Prompt

Use this prompt to continue:

```text
Read docs/handoffs/2026-06-06-kasm-hermes-agent-desktops.md. Verify that Kasm launches a new Chrome + Hermes session from openbrain-hermes-chrome:1.18.0-20260606, then onboard Lena Brooks and Rowan Vale by adding per-agent Hermes .env and SOUL.md files in their persistent Kasm profiles without printing secrets.
```
