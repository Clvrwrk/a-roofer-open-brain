# Slack attachment ingestion validation — Roofing-Ops

Date: 2026-06-29
Status: Slack → Supabase byte-preservation matrix passed for PDF, PNG, SVG, XLSX, DOCX, MP3, and MP4 using Alex's bot token

## Goal

Validate the smallest reliable pipeline before feeding files to Hermes:

```text
Slack attachment shared with Alex bot visibility
→ Alex bot token locates the Slack file
→ files.info returns private download URL
→ bot token downloads raw bytes
→ bytes upload to Supabase Storage
→ signed URL reads the exact same bytes back
```

This deliberately does **not** depend on Hermes yet. The first acceptance gate is Slack → Supabase durability.

## Proven PDF test

Target Slack file:

- Filename: `f5fedd19db43b0ca2912cbfcf0c6b24d.pdf`
- Slack file ID: `F0BDS34N78T`
- Channel found: `C0BCUF29G1H` (`#accounting-vendor-intake`)
- Alex bot user ID from `auth.test`: `U0BD1GN3K27`
- Workspace/team: `T0B8QEGPVQW`

Result:

```json
{"step":"slack_auth","ok":true,"botUserId":"U0BD1GN3K27","team":"T0B8QEGPVQW","target":"f5fedd19db43b0ca2912cbfcf0c6b24d.pdf"}
{"step":"slack_download","ok":true,"fileId":"F0BDS34N78T","name":"f5fedd19db43b0ca2912cbfcf0c6b24d.pdf","mimetype":"application/pdf","filetype":"pdf","bytes":561408,"sha256":"644c24d420664777"}
{"step":"supabase_upload","ok":true,"bucket":"slack-attachments","path":"alex-smoke/C0BCUF29G1H/F0BDS34N78T-644c24d42066-f5fedd19db43b0ca2912cbfcf0c6b24d.pdf","bytes":561408}
{"step":"signed_url_verify","ok":true,"http":200,"bytes":561408,"sha256":"644c24d420664777"}
```

Verified invariant:

- Slack download byte count: `561408`
- Supabase signed URL byte count: `561408`
- SHA-256 prefix from Slack download: `644c24d420664777`
- SHA-256 prefix from Supabase signed URL readback: `644c24d420664777`

Therefore the PDF was moved from Slack to Supabase and read back intact.

## Multi-type attachment matrix

Chris then sent additional attachments through Alex. Validation used Alex's bot token and the same hard gate:

```text
Slack files.list / files.info
→ download Slack private URL with Alex token
→ upload raw bytes to Supabase Storage bucket slack-attachments
→ create signed URL
→ fetch signed URL
→ compare byte count and SHA-256
```

Run command:

```bash
PATH="/opt/homebrew/bin:$PATH" node /tmp/slack_to_supabase_alex_batch.mjs
```

Important observation: `conversations.history` over the three approved human-facing channels returned zero candidates for these fresh files, but `files.list` with Alex's token found all six. This means the ingestion watchdog should use both paths:

1. message events / channel history when channel context is available;
2. `files.list` as a reconciliation fallback for files visible to the agent token but not surfaced in recent channel history.

Results:

| Type | Slack file ID | Filename | MIME | Bytes | SHA-256 prefix | Supabase path | Status |
|---|---|---|---|---:|---|---|---|
| PNG | `F0BE1LP2V42` | `Commercial Lead Gengeration - Workflow.png` | `image/png` | 1,684,277 | `459b8099d3a84536` | `slack-attachments/alex-matrix/png/unknown/F0BE1LP2V42-459b8099d3a8-Commercial_Lead_Gengeration_-_Workflow.png` | PASS |
| XLSX | `F0BEVV40TKJ` | `Frequently Ordered Wichita.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | 45,208 | `79511a8318ce40f3` | `slack-attachments/alex-matrix/xlsx/unknown/F0BEVV40TKJ-79511a8318ce-Frequently_Ordered_Wichita.xlsx` | PASS |
| SVG | `F0BDVAWH4R1` | `Favicon 500x500 lgt.svg` | `image/svg+xml` | 2,532,821 | `fd8a3dd44dcf810e` | `slack-attachments/alex-matrix/svg/unknown/F0BDVAWH4R1-fd8a3dd44dcf-Favicon_500x500_lgt.svg` | PASS |
| DOCX | `F0BDL78CT1D` | `ai-article-3_26_2026-54424.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | 42,950 | `5a6284cabe9331de` | `slack-attachments/alex-matrix/docx/unknown/F0BDL78CT1D-5a6284cabe93-ai-article-3_26_2026-54424.docx` | PASS |
| MP3 | `F0BDZJ9AC78` | `WildHusseyAM_mixdown.mp3` | `audio/mpeg` | 1,012,211 | `656df2a500390fbe` | `slack-attachments/alex-matrix/mp3/unknown/F0BDZJ9AC78-656df2a50039-WildHusseyAM_mixdown.mp3` | PASS |
| MP4 | `F0BEW02GTHN` | `project_94314890_11132025_2255.mp4` | `video/mp4` | 29,762,937 | `1fd7fd195d72a15f` | `slack-attachments/alex-matrix/mp4/unknown/F0BEW02GTHN-1fd7fd195d72-project_94314890_11132025_2255.mp4` | PASS |

Batch summary:

```json
{"step":"summary","ok":true,"byExt":{"png":true,"xlsx":true,"svg":true,"docx":true,"mp3":true,"mp4":true},"total":6,"passed":6}
```

## Working script pattern

The throwaway validation script lives outside the repo during testing:

```bash
PATH="/opt/homebrew/bin:$PATH" node /tmp/slack_to_supabase_alex_smoke.mjs f5fedd19db43b0ca2912cbfcf0c6b24d.pdf
```

Why `PATH="/opt/homebrew/bin:$PATH"` matters on Chris's Mac:

- `/usr/local/bin/node` is Node 20.17.0.
- `@supabase/supabase-js` requires native WebSocket support in this path unless `ws` is installed/provided.
- `/opt/homebrew/bin/node` is Node 22.22.2 and works.

## Failures/learnings from this validation

### 1. Production deploy was not enough proof

Earlier we deployed a local-file-path fix, but Alex still failed because the actual requirement is stronger:

```text
Slack file must become durable object storage evidence before agent reasoning.
```

Do not treat “the agent prompt contains a filename” or “the Slack event fired” as success.

### 2. Validate Slack → Supabase before Hermes

Hermes should be downstream. The first hard gate is:

1. Slack token can see the message/file.
2. Slack token can call `files.info`.
3. Slack token can download `url_private_download` or `url_private`.
4. Supabase can store the raw bytes.
5. A signed URL readback matches byte count and hash.

Only after all five pass should we wire the file to Hermes.

### 3. Use the agent bot token being tested

This test intentionally used Alex's Slack bot token, not a shared/admin token, so it proves Alex's own Slack visibility path can access the file.

### 4. Supabase bucket creation pitfall

Passing `fileSizeLimit: "100MB"` to `createBucket` failed with:

```text
Bucket create failed: The object exceeded the maximum allowed size
```

Creating the private bucket without `fileSizeLimit` worked:

```js
await supabase.storage.createBucket("slack-attachments", { public: false })
```

### 5. Node version pitfall

Running with Node 20 failed before upload:

```text
Node.js 20 detected without native WebSocket support.
Suggested solution: For Node.js < 22, install "ws" package and provide it via the transport option
```

Use Node 22 for local validation or explicitly install/provide `ws`.

### 6. Channel history is not enough

For the multi-type test, Alex's token could access every file through `files.list` and `files.info`, but recent `conversations.history` scans over the approved operational channels returned zero candidates. Do not build the ingestion proof around channel history alone. The durable ingestion job should reconcile via `files.list` using the exact agent token and then backfill channel/message context when Slack exposes it.

## Next validation matrix

Test each type with the same acceptance gate: Slack download bytes == Supabase signed URL readback bytes and SHA-256.

| Type | Example extension | Status |
|---|---:|---|
| PDF | `.pdf` | PASS for `f5fedd19db43b0ca2912cbfcf0c6b24d.pdf` |
| Image | `.png` / `.jpg` | PASS for PNG |
| SVG | `.svg` | PASS |
| Spreadsheet | `.xlsx` / `.csv` | PASS for XLSX |
| Word doc | `.docx` | PASS |
| Audio / voice memo | `.mp3` / `.m4a` | PASS for MP3 |
| Video | `.mp4` | PASS |

## Future production shape

The production runtime should persist every Slack attachment into Supabase first, then pass durable references downstream:

```json
{
  "slackFileId": "F...",
  "name": "file.pdf",
  "mimetype": "application/pdf",
  "size": 561408,
  "sha256": "...",
  "storageBucket": "slack-attachments",
  "storagePath": "team/channel/date/fileId-hash-file.pdf",
  "signedUrl": "short-lived signed URL for agent fetch/readback",
  "downloadStatus": "downloaded",
  "storageStatus": "uploaded"
}
```

Hermes should not be asked to infer from a bare filename. It should receive a durable Supabase reference and/or local path plus hash/size evidence.

## Alex-side review round trip

After Slack → Supabase storage was proven, we tested the next leg:

```text
Supabase-stored attachment references
→ signed URLs in a review packet
→ Alex Rivers Hermes runtime on agent host
→ structured file classification against Alex's SOP
→ report persisted back to Supabase Storage
→ report posted to Slack as Alex
```

Execution path:

```text
HERMES_HOME=/opt/openbrain/hermes-homes/alex
cwd=/opt/openbrain/a-roofers-open-brain
hermes chat -q "$(cat /tmp/alex_review_prompt.txt)" -t file,web,terminal,vision,video --provider openrouter --model anthropic/claude-sonnet-4-5 --quiet
```

Alex produced a 7-file classification report. The report was persisted and verified:

```json
{"ok":true,"supabase":{"bucket":"slack-attachments","path":"alex-reviews/2026-06-30T02-30-50-930Z-alex-file-classification-62f9d8c0e695.md","bytes":7124,"sha256":"62f9d8c0e695f3dc","verifyBytes":7124},"slack":{"channel":"C0BCUF29G1H","ts":"1782786652.323999"}}
```

Alex's classification summary:

| File | Alex SOP relevance | Recommended filename | Next action |
|---|---|---|---|
| PDF invoices | in_lane | `abc-invoices-multi-april-2026.pdf` | Load into invoice-audit queue; UOM-normalized agreement comparison |
| PNG workflow | out_of_lane | `commercial-lead-gen-workflow-diagram.png` | Route Sales/Ops Conductor |
| XLSX catalog | in_lane | `abc-frequently-ordered-wichita-catalog.xlsx` | Import/cross-check catalog reference |
| SVG favicon | out_of_lane | `pro-exteriors-favicon-500x500-light.svg` | Route Marketing/branding |
| DOCX article | out_of_lane | `handyman-services-mckinnney-article-2026-03-26.docx` | Route Marketing/content |
| MP3 audio | out_of_lane | `wild-hussey-am-mixdown.mp3` | Route Marketing/media or archive as unknown-media |
| MP4 video | unknown | `project-94314890-2025-11-13.mp4` | Ops Conductor triage; video inspection needed |

Important learning: the review result itself should be treated as a first-class artifact. Persist the agent's answer to Supabase with byte/hash verification before/while posting to Slack so later workflow stages do not depend only on chat history.

## Media capability smoke test — audio/video

Chris raised the critical voice-memo case: if an MP3/voice memo says “review invoice X for pricing issues,” Alex must receive a transcript before he can perform pricing/SKU/UOM reasoning. We tested current Alex-host capability instead of assuming.

Host capability check:

```text
ffmpeg=/usr/bin/ffmpeg
ffprobe=/usr/bin/ffprobe
python3=Python 3.12.3
pip=missing
GPU=none
PyPI reachability=200 OK
Hermes vision tool=enabled
Hermes video tool=disabled in Alex profile tool list
Python STT/media libs missing: whisper, faster_whisper, openai, moviepy, cv2, PIL, pydub
Alex env STT keys found: none (OPENROUTER_API_KEY exists; no OpenAI/Groq/Mistral/Whisper key found)
```

Concrete media extraction smoke:

```text
MP3 input: /tmp/alex-media-smoke/input.mp3
- bytes: 1,012,211
- duration: 62.4s
- codec: mp3
- extracted normalized WAV: /tmp/alex-media-smoke/mp3_audio.wav (2,001,292 bytes)

MP4 input: /tmp/alex-media-smoke/input.mp4
- bytes: 29,762,937
- duration: 22.0s
- video: h264, 720p, 30fps, 661 frames
- audio: AAC 44.1kHz stereo
- extracted audio: /tmp/alex-media-smoke/video_audio.wav (705,918 bytes)
- sampled every 100 frames: frame_0001.jpg … frame_0007.jpg
```

Alex/Hermes vision smoke result:

```text
Frames visible: yes.
- Frame 0001: deteriorating chimney, gray cement render, white rain cowl, flat roof.
- Frame 0004: damaged roofing surface/asphalt shingle with dark stains; finger pointing at material.
- Frame 0007: worker, fallen terracotta chimney pot, flat roof, autumn tree background.

Metadata readable: yes.
Audio transcript available: no.
Blocker: no local Whisper/faster-whisper/API STT tool configured.
```

Conclusion:

- Alex can download audio/video from Supabase, extract WAV audio, read ffprobe metadata, and inspect sampled video frames through vision.
- Alex cannot yet transcribe MP3/voice memos or MP4 audio locally.
- Therefore a voice memo that mentions a specific invoice/pricing issue is currently **not actionable for Alex** unless an upstream transcription step produces text.

Required durable media pipeline:

```text
Slack audio/video
→ Supabase raw object
→ ffprobe metadata JSON
→ extract WAV audio with ffmpeg
→ transcribe WAV with timestamps (local Whisper/faster-whisper or external STT API)
→ sample video frames every N frames / N seconds
→ upload transcript + frames + metadata to Supabase
→ agent packet includes transcript timestamps, frame URLs, raw object, hashes, byte counts
→ Alex evaluates transcript + frames against pricing/catalog SOP
→ Alex report persisted to Supabase and posted to Slack
```

Minimum next build for voice memo support:

```text
install/configure STT for Alex runtime
then validate: MP3 voice memo → transcript text → Alex identifies invoice/pricing request from transcript
```

## Full-trip timing test — Slack upload to Slack reply

We measured a synthetic full trip after adding `files:write` to Alex's bot token:

```text
Supabase source object
→ Slack upload as Alex
→ Slack completeUploadExternal
→ files.info
→ Slack private download
→ Supabase re-upload
→ media processing
→ Slack threaded reply as Alex
→ timing JSON persisted to Supabase
```

### Slack scope and membership learnings

- Alex originally had `files:read` but not `files:write`; `files.getUploadURLExternal` failed with `missing_scope needed=files:write`.
- The app-level token screen cannot grant `files:write`; it must be added under Slack App → OAuth & Permissions → Bot Token Scopes, then reinstall.
- After `files:write`, `files.getUploadURLExternal` passed for Alex.
- `files.completeUploadExternal` then failed with `not_in_channel` until Alex was joined to the test channel.

### Audio full-trip result

Latest successful audio run:

```json
{
  "kind": "audio",
  "total_ms": 3533,
  "from_slack_complete_to_reply_ms": 1893,
  "slack_reply_ts": "1782791222.704689",
  "result_path": "slack-attachments/timing-tests/audio/audio-2026-06-30T03-46-59-217Z/result-4be270166b14.json",
  "pipeline_timings_ms": {
    "supabase_source_download": 414,
    "files_info": 185,
    "slack_private_download": 619,
    "supabase_reupload": 265
  },
  "processing": {
    "audio_normalize_ms": 86,
    "deepgram_ms": 477,
    "transcript_chars": 763
  }
}
```

Key audio learnings:

- Deepgram rejected the original MP3 bytes once with `failed to process audio: corrupt or unsupported data` even though ffmpeg could read it.
- Normalizing audio first is safer: `ffmpeg → 16kHz mono WAV → Deepgram`.
- Voice memo path can be very fast: ~3.5s total, ~1.9s from Slack file completion to reply for a ~62s MP3.

### Video full-trip result

Successful video run:

```json
{
  "kind": "video",
  "total_ms": 17049,
  "from_slack_complete_to_reply_ms": 11606,
  "slack_reply_ts": "1782791307.265199",
  "result_path": "slack-attachments/timing-tests/video/video-2026-06-30T03-48-10-259Z/result-30c1d3f563d3.json",
  "pipeline_timings_ms": {
    "supabase_source_download": 1663,
    "files_info": 216,
    "slack_private_download": 6331,
    "supabase_reupload": 3150
  },
  "processing": {
    "ffprobe_ms": 81,
    "audio_extract_ms": 40,
    "deepgram_ms": 629,
    "frame_extract_ms": 679,
    "transcript_chars": 189,
    "video_duration": "22.036667",
    "video_codec": "h264",
    "frames": "661",
    "fps": "30/1",
    "audio_codec": "aac"
  }
}
```

Video transcript excerpt:

```text
Is gonna last another This this right here needs termination bar on it because it's it's already coming away. That needs to be terminated on both of these chimneys. There's a couple issues.
```

Key video learnings:

- Slack accepted/uploaded the MP4 before the private download URL was consistently ready.
- Immediate private download sometimes returned HTML or a 19-byte `Error serving file.` body.
- Production downloader must detect this and retry until bytes are available.
- Slack private download (~6.3s) and Supabase re-upload (~3.1s) dominated the successful MP4 run; actual media processing was fast (~1.4s for ffprobe/audio extract/Deepgram/frame extraction).

### xAI/Grok Vision model learning

The originally attempted xAI vision model `grok-2-vision-1212` failed with `Model not found`. Listing available xAI models showed `grok-4.3` and related Grok 4 models. A direct frame test with `grok-4.3` succeeded in ~6.7s and produced a useful roofing frame description.

Use `grok-4.3` for the xAI/Grok Vision adapter unless model availability changes.

## Commercial tool recommendations

For a commercial Roofing-Ops environment, use a provider-adapter design rather than hard-coding one vendor. Store every raw file and every derived artifact in Supabase first, with hashes and byte counts.

Recommended default stack:

1. **Speech-to-text primary: Deepgram Nova tier**
   - Best fit for production voice memos and video audio where we need fast, timestamped transcripts.
   - Use for MP3/M4A/MP4 audio extraction → transcript with word/segment timestamps.
   - Keep local faster-whisper as a later privacy/cost fallback, not the first production dependency.

2. **Speech-to-text enrichment/fallback: AssemblyAI**
   - Good when we want an out-of-the-box enriched transcript: summaries, chapters, entities, speaker labels, content moderation-style fields.
   - Use as a fallback or for “long meeting/audio” workflows, not necessarily every 30-second voice memo.

3. **Speech-to-text simple fallback: OpenAI speech-to-text / Whisper family**
   - Good developer ergonomics and broad ecosystem support.
   - Use as fallback if Deepgram fails or if we already standardize on OpenAI for other media tasks.

4. **Enterprise cloud fallback: Google Speech-to-Text / Azure Speech / Amazon Transcribe**
   - Best when a customer requires same-cloud vendor alignment, enterprise contracts, region controls, or compliance paperwork.
   - More configuration overhead; not the fastest path for this current Alex workflow.

5. **General image/frame understanding: OpenAI vision or Gemini vision**
   - Use on sampled video frames and uploaded images for semantic descriptions.
   - Store sampled frames in Supabase and pass frame timestamps + signed URLs to the vision provider.

6. **xAI Grok vision: optional general-vision adapter**
   - xAI offers image-understanding through its API, useful as another general frame/image analysis provider.
   - Do not make it the primary document/OCR engine until it proves better on our invoice/catalog fixtures; use as a comparative adapter.

7. **Document OCR/extraction: Google Document AI or Azure Document Intelligence for production invoices/forms**
   - For structured invoices, price sheets, forms, and scanned PDFs, use a document-specialized tool rather than only a general vision LLM.
   - AWS Textract is a viable AWS-aligned option.
   - Locally, use PyMuPDF for text PDFs and DOCX/XLSX native parsers for office documents; reserve heavy OCR models like marker-pdf for local/offline special cases.

Decision rule:

```text
Audio/voice memo → Deepgram primary transcript → Supabase transcript JSON/text
Video → ffmpeg audio + Deepgram transcript; ffmpeg frames every N seconds/frames + vision summaries
PDF/image invoice → Document AI/Azure/Textract OCR + vision fallback for visual anomalies
DOCX/XLSX → native parsers first; no OCR unless embedded scans/images
```

Commercial controls to require before broad rollout:

- signed DPA / SOC 2 posture review;
- no-training/data-retention settings where available;
- region controls if customer data requires them;
- PII/secrets redaction on transcripts before posting to Slack;
- raw + derived artifact retention policy in Supabase;
- provider result stored with `provider`, `model`, `created_at`, `source_sha256`, `confidence`, and error metadata.
