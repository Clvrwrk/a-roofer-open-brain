# Orgo QA desktop + page-by-page site walker — docs/94 (PEC-220)

The runner Chris asked for: a real browser that walks every page of
`cc.proexteriorsus.net` daily and documents speed, hangs, broken click-throughs
and surface-level vulnerabilities. Complements the Layer 2 sweep (docs/92),
which covers the static tree and `/api` but **cannot** reach the WorkOS-gated
HTML dashboards.

## Provisioned 2026-08-19 (rebuilt into the correct project)

| | |
|---|---|
| Project | **`PE-open-brain`** — `8cf44774-2b46-4089-8bfe-4deb1b078e46` (the established one, where Maya lives) |
| Computer | **`PE Site QA`** — `3480fa38-35c6-4b86-a5fe-f62d0fb8f028` |
| Instance | `dac62bd2` · console https://www.orgo.ai/desktops/dac62bd2 |
| Spec | linux, 2 cpu, 4 GB |
| Toolchain | node 18.19.1, google-chrome-stable, xdotool, scrot |
| Working dir | **`/home/orgo/pe-qa`** — per Orgo guidance, keep anything large off the ~8 GB system disk |
| Credentials | 1Password `CW_Master/ORGO_PE_SITE_QA` (computer id, instance, console url, VNC password) |

**API base is `https://www.orgo.ai/api`** (not `/api/v1` — the v1 paths 404).
Key: 1Password `CW_Master/ORGO_API_KEY_MASTER`.
**Never commit the VNC password**; it is stored in 1Password only.

### A first attempt was built in the wrong project

`pe-site-qa` was initially created in a **new** project `pro-exteriors-open-brain`
because `GET /api/workspaces` returned zero at the time. It does not — it returns
three, including the pre-existing `PE-open-brain`. A desktop in an API-created
project the dashboard does not know about is **not reachable from the console UI**,
which is why its URL 404'd. The misplaced desktop has been deleted; the empty
project remains because `DELETE /api/projects/{id}` is **405 — not supported** (it
can be removed from the dashboard by hand).

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
2. **`GET /api/workspaces` returned `count: 0` when it should have returned 3.**
   It later returned all three projects including `PE-open-brain`. Whatever caused
   the empty read — transient or auth-related — a single empty list is **not**
   evidence that nothing exists. There is also no `GET /api/computers` list (405),
   so the reliable probe is `GET /api/computers/{id}` against a recorded id, and
   `GET /api/projects` for inventory.

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

The walker uses a **persistent Chrome profile** (`/home/orgo/pe-qa/chrome-profile`).
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

1. **Deps** — `/home/orgo/pe-qa-setup.sh` runs detached (apt exceeds Orgo's ~590s
   per-call limit). Confirm with `ls /home/orgo/pe-qa/.setup-done`.
2. **One-time human sign-in** — open https://www.orgo.ai/desktops/dac62bd2, launch
   Chrome with `--user-data-dir=/home/orgo/pe-qa/chrome-profile`, sign in to WorkOS
   at `cc.proexteriorsus.net`. An agent must not do this step.
3. **Point the walker at the new paths** — `WALK_PROFILE=/home/orgo/pe-qa/chrome-profile`,
   `WALK_OUT=/home/orgo/pe-qa/reports`.
4. **Schedule daily** — drive it from the Hetzner host via the Orgo bash API on the
   06:00 CT timer, alongside the docs/92 sweep.
