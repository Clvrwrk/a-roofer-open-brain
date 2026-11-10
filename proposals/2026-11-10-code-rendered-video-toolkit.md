# A3: Code-rendered video toolkit (ShotCraft pilot, two reference libraries)

Proposed by: Chris (drafted by Claude Code)
Date: 2026-11-10
Status: pending
Affected clients: none. Marketing-content workflow only; not part of any client brain.
A3 file: proposals/2026-11-10-code-rendered-video-toolkit.md
Gate: [docs/54](../docs/54-third-party-agent-tool-gate-2026-06-25.md) (hard rule 12)

---

## 1. The problem (not yet measured)

- **Task today:** producing short product and promo videos for marketing. Done by hand in an editor, or through hosted generators (HyperFrames, Higgsfield, Descript) whose output cannot be edited as code or kept in a repo.
- **Frequency, time per video, error rate, cost:** **not measured.** No atom or log gives these numbers, so none are stated here. Chris to supply: videos per month, hours per video, and the loaded rate.
- **Total monthly human cost:** cannot be computed until the three numbers above exist.

## 2. Root cause (brief)

1. Video takes human time because each one is laid out, timed and scored by hand.
2. It is not automated because the hosted tools return a finished file, not an editable source.
3. Model-written video code only became good enough in late 2026.
4. It has not been a priority because the roofing brain and Command Center came first.
5. Why now: Chris reviewed eleven candidate repos on 2026-11-09 and four were worth a closer look.

## 3. Proposed solution

Three verdicts, using the docs/54 vocabulary. Nothing is enabled in this repo's `.claude/settings.json`.

| Source | Reviewed at | Proposed verdict | Allowed use |
| --- | --- | --- | --- |
| `Vincentwei1021/video-shotcraft` | plugin v1.0.0, HEAD of 2026-11-09 | `conditional_pilot` | One pilot video in a disposable checkout, under the controls in section 6. |
| `lemomo-ai/lemo-opuscar` | HEAD of 2026-11-10 | `reference_only` | Read the `STYLE.md` style prompts and copy them by hand. Do not install the plugin or run `setup.sh`. |
| `patch-gg/pixelfx` | v0.3.1 | `reference_only` | Read or copy individual effect files (MIT, keep the notice). Do not install the plugin. |

Out of scope for this gate: `three.js`, `react-three-rapier`, `react-postprocessing` and `librosa` are ordinary MIT or ISC libraries. Add them per project through normal dependency review if a video needs them. Not adopted: `mcp-for-blender` (`reject`: a local MCP server, hard rule 3), `ClaudeAnimationBase`, and the two prompt galleries.

- **Which agent receives this:** none. It is a developer and marketing workflow, not a roofing agent skill.
- **Trust tier of output:** not applicable. No atoms are written.

## 4. Gate checklist (what the review found)

**video-shotcraft**
- [x] Licence: Apache-2.0. One main author (43 commits) plus four minor contributors. No versioned releases, only media tags.
- [x] Contents: one skill at the repo root, no hooks, no MCP server. `SKILL.md` is written in Chinese.
- [ ] **Remotion licence.** It renders with Remotion 4.0.484 (pinned). Remotion is free only for individuals, non-profits and for-profit organizations of up to 3 employees; larger companies need a paid Company License. Chris to confirm which entity runs it.
- [ ] **Egress, sound effects.** `assets/scripts/sfx-source.py` downloads clips from freesound.org. Each clip has its own licence, some non-commercial. Every clip used needs its licence checked.
- [ ] **External send.** `publish/upload_post.py` posts videos to social platforms through the Upload-Post API. This conflicts with the zero-external-sends rule. Control: never set `UPLOAD_POST_API_KEY`.
- [ ] **Self-promotion.** `SKILL.md` tells the agent to show the author's social accounts and to invite a showcase submission on GitHub. Control: ignore; nothing is submitted.
- [ ] Installs: `npm install` in `template/` (exact versions, lockfile present). `npx remotion` runs the pinned local copy.
- [ ] SkillSpector `--no-llm` scan: not run.
- [ ] Line-by-line read of `SKILL.md`, `references/` and the Python scripts: not done. Only the manifest, the file list and keyword matches were read.

**lemo-opuscar**
- [x] Licence: MIT. Contents: one skill plus `setup.sh`. No hooks, no MCP server.
- [ ] **Installer fails gate item 4.** `setup.sh` clones the library to `~/lemo-opuscar` and hard-resets it to upstream `main` on every run, so the code changes without review. It then runs an unpinned `npm install`, downloads a headless Chromium, and installs unpinned Python packages. The voice tier adds `edge-tts`, which sends script text to Microsoft's online service. The default path also breaks the storage law (internal disk).

**pixelfx**
- [x] Licence: MIT, with third-party notices. The gallery font is excluded from the licence.
- [ ] **Skill fails gate item 4.** It offers to publish effects publicly to patch.gg and to install a CLI with `curl | sh`. One contributor, ten days old, no tagged release.

## 5. The math

| Item | Value |
| --- | --- |
| Total monthly cost, current state (X) | not measured |
| Monthly operating cost, new state (Y) | model tokens plus review time; Remotion Company License if required (price not checked) |
| One-time build cost (Z) | pilot only: about half a day to run the gate items and one video |
| **ROI multiplier: X / (Y + Z/12)** | **cannot be computed yet** |

**Exempt from 10x gate?** No. The pilot exists to produce the numbers. Full adoption needs the multiplier at 10 or above.

## 6. Risks and pilot controls

- **What breaks if it misbehaves:** a video ships with an unlicensed sound, or something is posted publicly. Neither touches the brain, Supabase or the Command Center.
- **Controls for the ShotCraft pilot:**
  - Clone at a pinned commit into `/Volumes/M1 Application SSD/Archives/home-builds/video-shotcraft-pilot-build`, symlinked from `~/video-shotcraft-pilot-build`. Never inside this repo.
  - No plugin install and no marketplace entry; the agent reads the skill from the checkout.
  - No publish key in the environment. No client data, secrets or `.env` in the folder.
  - Finish the unchecked items in section 4 before the first render.
- **Rollback:** delete the pilot folder and the symlink. Nothing else changes.
- **New consent flags or standards checks:** none.

## 7. Alternative considered

- **Leave it as is:** keep using HyperFrames, Higgsfield and Descript. Reasonable if video volume is low; revisit if editable source or brand consistency becomes the pain.
- **Defer:** until Chris has the monthly video count and hours, since without them the 10x gate cannot be passed.

## 8. Decision

- [ ] **Approve** the ShotCraft pilot and the two reference-only verdicts; pilot by: YYYY-MM-DD
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: YYYY-MM-DD, condition: measured video volume and hours

Approver: Chris
Approved / decided on:

On approval, add the three verdicts to the decision table in docs/54.

## 9. Post-build tracking (after the pilot)

- Hours for the pilot video, against the usual hours:
- Licence result (Remotion, each Freesound clip):
- Actual ROI multiplier:
- Promote ShotCraft from `conditional_pilot` to `allow`: Yes / No
