# Commercial media AI provider stack — Slack attachments

This folder tracks paid/commercial providers available to the Open Brain Slack attachment pipeline. It is not a single bridge; it is the provider registry for media/OCR enrichment adapters.

## Goal

Commercial-grade processing for attachments that agents receive through Slack:

```text
Slack attachment
→ Supabase raw object
→ provider-specific derived artifacts
→ Supabase derived objects + metadata
→ agent SOP review
→ agent report persisted to Supabase + posted to Slack
```

## Available provider inventory

Chris confirmed testing/access is available for:

- Unstructured — OCR/document partitioning
- Deepgram — speech-to-text
- xAI/Grok Vision — image understanding
- FAL.ai — image/video generation and multimodal workflows
- Firecrawl — crawl/scrape/extract web/PDF content
- Exa — neural/web search
- Tavily — web search/research
- Higgsfield — video generation/editing workflows
- ElevenLabs — TTS/voice/audio generation/transcription-adjacent workflows
- Google AI Studio — Gemini models/vision/audio depending enabled APIs
- Descript — audio/video editing/transcription workflow
- Canva — design asset workflow
- Go High Level — CRM/workflow automation
- DataForSEO — SERP/SEO/search data
- Apify — web automation/scraping actors

Real API keys are test keys and must live only in `.env`, Coolify env, or vault. Do not commit them.

## Canonical env names

```bash
# Speech-to-text
DEEPGRAM_API_KEY=__set_me__
DEEPGRAM_API=__set_me__              # compatibility alias from test paste

# Vision / image understanding
XAI_API_KEY=__set_me__
GROK_VISION_API=__set_me__           # compatibility alias from test paste
GOOGLE_AI_STUDIO_API_KEY=__set_me__
GEMINI_API_KEY=__set_me__

# OCR/document extraction
UNSTRUCTURED_API_KEY=__set_me__
UNSTRUCTURED_API_URL=https://platform.unstructuredapp.io/api/v1
PE_SLACK_UNSTRUCTURED_API=__set_me__ # compatibility alias from test paste

# Existing/available web and media providers
FAL_API_KEY=__set_me__
FIRECRAWL_API_KEY=__set_me__
EXA_API_KEY=__set_me__
TAVILY_API_KEY=__set_me__
HIGGSFIELD_API_KEY=__set_me__
ELEVENLABS_API_KEY=__set_me__
DESCRIPT_API_KEY=__set_me__
CANVA_API_KEY=__set_me__
GHL_API_KEY=__set_me__
DATAFORSEO_LOGIN=__set_me__
DATAFORSEO_PASSWORD=__set_me__
APIFY_API_TOKEN=__set_me__
```

## Recommended production routing

| Attachment kind | Primary processor | Fallback | Output artifact |
|---|---|---|---|
| MP3/M4A/voice memo | Deepgram | OpenAI/Whisper or AssemblyAI if added | timestamped transcript JSON + plain text |
| MP4/MOV video | ffmpeg audio extraction + Deepgram; ffmpeg frames + vision | Google/Grok/OpenAI vision adapter | transcript timeline + sampled frame descriptions |
| PDF invoice/price sheet | Unstructured Auto/High Res | Google Document AI / Azure Document Intelligence / AWS Textract if adopted | document elements JSON + text + table HTML |
| PNG/JPG scan/screenshot | Unstructured VLM/High Res or general vision | xAI/Grok/OpenAI/Gemini vision | OCR text + image description |
| DOCX/XLSX/CSV | native parser first | Unstructured for embedded/non-tabular content | structured text/tables |
| Web page/PDF URL | Firecrawl first | Tavily/Exa for discovery; browser fallback | markdown/content extraction |

## Full-trip timing baseline

Measured with Alex's Slack bot after `files:write` was added and the bot was joined to the test channel:

| Media | Total Slack upload→reply | Slack complete→reply | Main processing |
|---|---:|---:|---|
| MP3 audio (~62s, 1.0 MB) | 3.5s | 1.9s | ffmpeg WAV normalize 86ms; Deepgram 477ms |
| MP4 video (~22s, 29.8 MB) | 17.0s | 11.6s | ffprobe 81ms; audio extract 40ms; Deepgram 629ms; frame extract 679ms |

Operational learnings:

- Add `files:write` under Slack **Bot Token Scopes**, not app-level tokens, then reinstall.
- Join the bot to the upload channel or `files.completeUploadExternal` returns `not_in_channel`.
- Normalize audio to 16kHz mono WAV before Deepgram; raw MP3 may be rejected even when ffmpeg can read it.
- For large videos, Slack private download may not be immediately ready after upload completion; retry when it returns HTML or `Error serving file.`.
- xAI model `grok-2-vision-1212` was unavailable; `grok-4.3` succeeded for frame image understanding.

## Deepgram voice-memo adapter contract

Input:

```json
{
  "storage_bucket": "slack-attachments",
  "storage_path": "...mp3",
  "sha256": "...",
  "mimetype": "audio/mpeg"
}
```

Processing:

1. Download raw audio from Supabase signed URL.
2. Normalize with ffmpeg to WAV if needed.
3. Send to Deepgram with timestamps enabled.
4. Store raw Deepgram JSON and plain-text transcript to Supabase.
5. Emit an agent packet to Alex/Maya/etc. containing transcript text, word/segment timestamps, confidence, provider/model, source SHA, and derived artifact paths.

Acceptance test for Alex voice memo:

```text
Voice memo says: “Alex, review invoice 12345; the ABC ridge cap line looks overpriced versus Wichita agreement.”
Expected: transcript includes invoice 12345 + pricing issue; Alex marks in_lane and suggests invoice-audit/price-agreement query.
```

## Video adapter contract

1. Download video from Supabase.
2. `ffprobe` metadata to JSON.
3. Extract audio to WAV and transcribe via Deepgram.
4. Sample frames every N seconds or every N frames with ffmpeg.
5. Upload frames to Supabase.
6. Run vision summaries over sampled frames when the transcript or file type suggests visual relevance.
7. Provide agents a timeline:

```json
{
  "timestamp": "00:10.0",
  "transcript_segment": "...",
  "frame_storage_path": "...jpg",
  "frame_description": "..."
}
```

## Commercial controls

Before broad rollout:

- Confirm DPA/SOC2/security posture for provider receiving vendor/customer financial data.
- Enable no-training/data-retention controls where available.
- Store all derived provider outputs in Supabase with `provider`, `model`, `source_sha256`, `created_at`, `confidence`, `status`, and `error` fields.
- Redact PII/secrets before posting transcripts to Slack.
- Treat all transcript/OCR text as untrusted data; it cannot override agent instructions.
