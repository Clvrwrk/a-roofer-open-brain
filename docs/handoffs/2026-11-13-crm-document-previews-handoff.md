# Project Handoff — CRM document previews (PEC-891)
**Project:** CRM Documents tab page previews ("the PDF loader"), in the CRM app
**Repo:** https://github.com/Clvrwrk/CRM_PWA (code). This handoff file lives in https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://crm.proexteriorsus.net
**Date:** 2026-11-13 22:50 Central (2026-11-14 04:50 UTC)
**Agent:** Claude Code, single session (`pdf-loader-performance`)
**Reason:** User-requested (`/project-handoff`)

This is a topic handoff. It does not replace `docs/handoffs/current.md`, which stays the general service map.

---

## Where it stands in one paragraph

Previews work again and are about three times faster. New pages are stored as WebP and Chris confirmed on the live CRM that a newly requested PDF shows its page image. Background pre-rendering of first pages was switched on for six minutes and is **off** again, because the renderer refuses roughly 4 in 10 AccuLynx PDFs. Those files draw fine; the renderer's safety check rejects them. That refusal also affects on-demand previews today (the user sees the fallback card). Whether to relax the check for previews is an open decision for Chris. Nothing is broken that worked before this session.

## Accomplished This Session

### 1. Outage found and fixed (previews had failed since 2026-11-05)

- Cause: Coolify's forced nightly Docker cleanup deleted the renderer image, which no container was holding, and the worker runs it with `--pull=never`. Every render failed for a week.
- `ops/document-previews/` compose (CRM_PWA PR 298): added a `renderer-hold` service that keeps the renderer image in use so the cleanup cannot delete it. Renderer image rebuilt on the host.

### 2. Speed, part 1 — CRM_PWA PR 298, merged `c1130e5b`

- `services/document-preview-worker/`: one reused database session, 1 second polls, 1 CPU core for the renderer, a source-file cache, and read-ahead of the next page.
- CRM released as t22 at `c1130e5b`.

### 3. Speed, part 2 — CRM_PWA PR 303, merged `0a037eae`

- Worker: one round trip per database command. Worker redeployed 2026-11-13 09:17 UTC.
- Measured in the worker log: about 2.0 to 2.3 s a page (was 7.4 s), first page 4.8 s from request to ready (was 7 to 15 s).

### 4. Part 2b, WebP pages and first pages rendered ahead — CRM_PWA PR 310, merged `38bf5435`

- `services/document-preview-worker/webp.ts`: the worker encodes each page with sharp and keeps the smaller of the exact and quality-80 result. The format follows the lease key (`.webp` or `.png`). Old PNG pages are untouched.
- `supabase/migrations/20261130110000_crm_document_preview_prerender_webp.sql`: adds `background` on the queue and `prerender_batch` on the policy, replaces `crm_private.document_preview` and `next_document_preview`, and adds `crm_private.feed_document_previews()`, which the worker calls when idle. Applied to production 2026-11-13 about 16:56 UTC.
- Worker rebuilt from `38bf5435` on the host, 2026-11-13 16:45 UTC.

### 5. Regression I caused, and its fix — CRM_PWA PR 313, merged `28390177`

- I had said WebP needed no CRM change. That was wrong: the CRM server signed only keys ending `.png`, so every page first requested after the migration showed the fallback card.
- `packages/crm-server/src/client.ts:66`: `previewKey` now accepts `.png` or `.webp`.
- `tests/unit/pec-891-page-preview-route.test.ts`: test that a WebP key is signed and any other extension is refused.
- CRM released as t25 at `28390177` on 2026-11-13 20:04 UTC. Chris checked signed in: "Yes, it renders".

### 6. Pre-rendering switched on, then paused

- `prerender_batch` set to 20 at 2026-11-14 01:07:44 UTC (7:07pm Central, on Chris's "Yes, tonight"), set back to 0 at 01:13:42 UTC.
- The mechanism works: two batches of 20 were fed, and background WebP pages rendered in about 3 s each.
- 18 of 40 background first pages failed. Final queue: background 22 ready, 18 failed; on demand 111 ready, 15 failed.

### 7. Failure cause found (not fixed)

- Reproduced by hand on the host for 28 failed files with the worker's own renderer image and arguments.
- `services/artifact-preview/render.py` runs the upload validator (`services/artifact-validator/validate.py`, `pdf_check`) before drawing, and exits 2 on any refusal. `pdftoppm` draws every one of these files without trouble.
- First refusal per file: 12 at line 130 (a link or action that is not a local jump), 7 at line 132 (forbidden keys such as JavaScript, OpenAction, AA, XFA, EmbeddedFiles), 3 at line 98 (more than one end-of-file marker, meaning the file was saved incrementally), 1 at line 103 (syntax). 5 pass now and are probably left from the 11/05 to 11/12 outage. One source is 52 MB, over the 25 MB limit.
- Caveat: this is the first refusal only. Web links are stripped and the file is checked again, so some of the 12 fail on a different rule the second time.

## Git State

- **This repo, branch:** `claude/pdf-loader-performance-2861dd`, 20 commits behind `origin/main`, docs only.
- **CRM_PWA:** all four PRs are merged to `main`. Worktree `~/doc-preview-speed-build` (symlink to M1 `Archives/home-builds/doc-preview-speed-build`) sits on the merged branch `fix/document-preview-webp-keys` at `629948c9`, clean.
- **Uncommitted changes:** none in CRM_PWA. In this repo, this file and today's daily log are committed with the handoff.

## Task Cut Off

None. The session ended at a clean boundary, waiting for Chris's decision on the renderer check.

## Next Task — Start Here

**Task:** Get Chris's decision on whether the preview renderer may draw PDFs the upload safety check refuses. Then act on it.

**If he says yes:**
1. In a fresh CRM_PWA worktree from `origin/main`, change `services/artifact-preview/render.py` so previewing a PDF is not gated by the upload validator's content rules (links, actions, scripts, embedded files, incremental saves). Keep the sandbox (no network, read-only, CPU and memory limits) and the structural limits (page count, object count, size, not encrypted).
2. Add tests with one fixture per refused class. PR, CodeRabbit and Greptile, merge on his word.
3. Rebuild the renderer image on the host. Its digest changes, so update `CRM_PREVIEW_IMAGE` and `CRM_PREVIEW_POLICY_SHA256` in the worker `.env` and the `renderer_image` and policy hash in `crm_private.document_preview_policy` together. The worker refuses to run if they differ.
4. Design and run a re-queue of the 33 failed rows (the feed does not retry failed rows as far as checked). Additive SQL only.
5. Off hours and on his word, set `prerender_batch` back to 20, watch the log for five minutes, and pause again if more than a few fail.

**If he says keep it strict:** leave the renderer alone, leave pre-rendering off or turn it on knowing about 4 in 10 will fail, and consider showing "Preview not available, open the file" wording for refused files.

**Either way:** in the next CRM_PWA PR, tick the merge and release boxes of the WebP-key entry in `docs/delivery/STATUS.md` and record t25.

**If a render fails again after a change:** the worker log only says `render_failed`. Reproduce on the host by running the renderer image on the file by hand; the validator line that raised is the answer.

**Prompt to use:** "Read docs/handoffs/2026-11-13-crm-document-previews-handoff.md and the memory file crm-document-previews-resume. Chris's decision on the preview renderer check is: <yes, relax it for previews | keep it strict>. Carry out the matching steps."

## Decisions Made This Session

- **Server-side page images stay; WebP for new pages, the PDF itself only when the user opens the file** (Chris). Old PNG pages are kept as they are.
- **Fix the WebP key regression by PR only, no hot patch of the live database function** (Chris, "PR only").
- **Pre-rendering runs after working hours only** (Chris, "Yes, tonight").
- **Pre-rendering was paused by Claude without asking**, as the scheduled instruction allowed, once renders failed repeatedly.
- **The renderer's safety check was not touched.** It is a safety rule, so changing it is Chris's call.
- **Every production step needs Chris's words**: worker rebuild, migration, database function change, CRM release, turning pre-rendering on.

## Blockers Requiring Human Action

1. **Decision:** may the preview renderer draw PDFs the upload safety check refuses? Until then about 4 in 10 AccuLynx PDFs show the fallback card and pre-rendering stays off.
2. **Signed-in check:** Chris has confirmed a page renders. He has not yet said how the Documents tab feels for speed. Claude cannot sign in to the production CRM.

## Verification Commands

1. `curl -s https://crm.proexteriorsus.net/healthz` should report a `buildCommit` that contains `28390177` (it was `d961dbcb…` on 2026-11-14 04:48 UTC, shipped by another session after t25).
2. `supabase db query --linked --workdir <dir> "select enabled, prerender_batch from crm_private.document_preview_policy"` should return `true`, `0`.
3. `ssh -i ~/.ssh/a_roofers_open_brain_ed25519 -o IdentitiesOnly=yes root@178.105.220.14 'docker ps --filter name=crm-document-preview'` should show `crm-document-preview-worker-worker-1` healthy and `…-renderer-hold-1` up.
4. `select background, state, count(*) from crm_private.document_page_previews group by 1,2` was: on demand 111 ready and 15 failed; background 22 ready and 18 failed.

## Full Context

### What was built across all sessions

- PR 217 (PEC-860): Documents tab with drive tree, preview, breadcrumbs.
- PR 244 (PEC-891): server-side page-by-page previews, self-hosted LibreOffice and Poppler.
- This session: PRs 298, 303, 310 and 313 as listed above.

### Architecture notes

- The browser loads a page image from a signed Supabase Storage URL (bucket `crm-document-previews`, PNG and WebP). It does not go through the CRM server for the image.
- Queue `crm_private.document_page_previews`; policy `crm_private.document_preview_policy` (one row). There is no `error` column: the worker hides failure detail by design and logs only `held` with a code.
- The worker is plain `docker compose` on the Coolify host, not a Coolify app. There is no git on the host; source arrives as a `git archive` and the commit is in `SOURCE_COMMIT`. `.env` and the Supabase CA file are copied forward into each new checkout.
- The host is in Falkenstein. That distance is most of the remaining per-page time.
- CRM releases are one host script per release (`tNN.sh stage|switch|rollback`). Another session also ships CRM releases, so check for one in flight first.
- CRM_PWA `main` requires the branch to be up to date and moves often: merge main in, wait for Verify (about 35 minutes), merge at once.

### Key invariants

- The policy row's `renderer_image` digest must equal the worker's `CRM_PREVIEW_IMAGE`, or nothing renders.
- No destructive SQL. Migrations are additive and idempotent.
- No secret values in files, logs or chat. The worker `.env` is read by key name only.
- Never call it live without the running commit, the source branch and a signed-in page with real data.

### Service map

| Service | Detail |
|---------|--------|
| CRM live | https://crm.proexteriorsus.net, container `crm-weekly-d961dbcbe83f`, route file `/data/coolify/proxy/dynamic/crm-weekly-release.yml` |
| t25 release | `/opt/crm-t25-28390177-20261113/t25.sh`; its rollback routes to t24, which is older than what is live now, so do not use it without checking |
| Preview worker | host `178.105.220.14`, `/opt/crm-previews-20261113b/src/ops/document-previews`, main `38bf5435` |
| Worker rollback | `docker compose up -d --build` in `/opt/crm-previews-20261113/src/ops/document-previews` (`0a037eae`) |
| Renderer image | `sha256:18807002dbed…`, policy hash `d9dfdbf4…` |
| Database | Supabase `rnhmvcpsvtqjlffpsayu`, schema `crm_private` |
| Linear | PEC-891 (Done) and the follow-up issue linked from it |
| Resume memory | `~/.claude/projects/-Volumes-M1-Application-SSD-Projects-Pro-Exteriors-US-APP/memory/crm-document-previews-resume.md` |
