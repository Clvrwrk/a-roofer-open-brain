# Orgo QA desktop + page-by-page site walker — docs/94 (PEC-220)

The runner Chris asked for: a real browser that walks every page of
`cc.proexteriorsus.net` daily and documents speed, hangs, broken click-throughs
and surface-level vulnerabilities. Complements the Layer 2 sweep (docs/92),
which covers the static tree and `/api` but **cannot** reach the WorkOS-gated
HTML dashboards.

## Provisioned 2026-08-19

| | |
|---|---|
| Workspace | `pro-exteriors-open-brain` — `ea96d7b0-7933-464b-92bf-80826b475fa0` |
| Computer | `pe-site-qa` — `725ce9d6-2bf7-4f4e-baac-f63b1390c117` |
| Instance | `073ff51e` · console https://www.orgo.ai/desktops/073ff51e |
| Spec | linux, 2 cpu, 4 GB, 1280x720 |
| Toolchain | node 18.19.1, python 3.12.3, google-chrome-stable, xdotool, scrot |

API key: 1Password `CW_Master/ORGO_API_KEY_MASTER`. Base `https://www.orgo.ai/api`.
**Never commit the VNC password** returned by the create call.

> The desktop's VNC password is returned in the `POST /computers` response body.
> Treat that response as a secret; do not paste it into docs, tickets or chat.

## ✅ Correction: Maya's desktop is HEALTHY (was wrongly reported down)

An earlier version of this doc claimed Maya's Orgo desktop no longer existed and
that her runtime had been down. **That was wrong.** Corrected 2026-08-19:

```
GET /api/computers/20ee4678 -> 200
  id 37b262e0-a915-47e6-8c3b-f180a32ab6fe · name "Maya Chen"
  project PE-open-brain · status running · created 2026-07-26

on the box:  up 16 days
  maya-slack-listener  RUNNING  pid 30617, uptime 9 days  (shipped Aug 10)
  hermes-gateway       RUNNING  uptime 16 days
  websockify           RUNNING  uptime 16 days
```

The Slack listener has been up since **Aug 10**, matching the release directory
mtime — so `orgo-ship-maya-listener.sh` was evidently completed then, and the
"pending since 08-11" note in memory is stale too.

**Two traps produced the false alarm, both worth remembering:**

1. **`context/MEMORY.md` held stale ids** (`f914c60c…` / `c681e86d`). They 404
   correctly. The live ids are `37b262e0-…` / instance `20ee4678`.
2. **`GET /api/workspaces` returns `count: 0` while desktops exist.** Maya's lives
   under project `PE-open-brain`, which that endpoint does not list. It is **not an
   inventory endpoint** and must never be used as one. There is also no
   `GET /api/computers` list (405) — the only reliable probe is
   `GET /api/computers/{id}` against a correctly-recorded id.

The real lesson is narrower than the one first drawn: the *record* had rotted, not
the infrastructure. A liveness check keyed on recorded ids belongs in the docs/92
sweep — it would have surfaced the stale id immediately instead of a false outage.

**Note:** `pe-site-qa` was created in a new project `pro-exteriors-open-brain`
while the established one is `PE-open-brain`. Consolidating them is open work.

## The walker

`scripts/orgo-site-walker.mjs`, run on the desktop. Per page it records:

| Dimension | What it catches |
|---|---|
| speed | navigation time, DOMContentLoaded/load, flags > `WALK_SLOW_MS` (4s) |
| hangs | navigation past `WALK_HANG_MS` (15s), or network that never settles |
| correctness | HTTP status, console errors, failed subresource requests |
| click-through | every same-origin link is fetched and a ≥400 result reported |
| vulnerability | missing security headers, mixed content, and secrets (JWT / `sk_live_` / slack token / `service_role` / private key) rendered into the DOM |

Surface-level only — it is **not** a penetration test. It flags cheap, high-signal
issues; a real security review is its own exercise (`/security-review`).

### The auth model, and why it matters

The walker uses a **persistent Chrome profile** (`/opt/pe-qa/chrome-profile`).
A human signs in to WorkOS **once** on the desktop; the session persists and every
later run walks the real app. If a walk lands on the sign-in page the run **stops
immediately** and reports `session expired` — deliberately, so an expired session
can never masquerade as "every page is broken".

## Why not WorkOS Agent Auth

Agent auth cannot issue this agent an identity today. Verified live:

```
POST /agent/auth   -> 501 not_implemented
POST /oauth2/token -> 501 not_implemented
```

`src/lib/agent-auth.ts` is 142 lines of **discovery only** — metadata documents
plus a `notImplementedAgentAuthResponse()` helper. Standing it up means building
the five things the endpoint names: service signing keys, a token store, a
trusted-issuer list, replay protection, and the WorkOS human-ownership bridge.
That is a security-critical project guarding a financial application, not a
provisioning step, and it should not be rushed. The persistent-session model above
is the honest interim.

When it is built, `verified_email` registration (with an AgentMail address) is the
method that fits — `/auth.md` advertises `anonymous`, `identity_assertion` with
`id-jag`, and `identity_assertion` with `verified_email`.

## Remaining steps

1. **Finish deps** — `/opt/pe-qa-setup.sh` runs detached on the desktop
   (apt exceeds Orgo's ~590s per-call limit, so it must be backgrounded).
   Confirm with `ls /opt/pe-qa/.setup-done`.
2. **One-time human sign-in** — open https://www.orgo.ai/desktops/073ff51e,
   launch Chrome with `--user-data-dir=/opt/pe-qa/chrome-profile`, sign in to
   WorkOS at `cc.proexteriorsus.net`. This is the step an agent must not do.
3. **Schedule daily** — same systemd pattern as docs/92, or drive it from the
   Hetzner host via the Orgo bash API on the 06:00 CT timer.
