# Web Video Toolkit (working title)

A free, privacy-first, browser-based video toolkit. No servers, no uploads, no watermarks, no accounts. Every video is processed on the user's own device.

Inspired by "Oh So Simple" free video tools, with a focus on karaoke-style captions and a design that makes adding new tools easy.

---

## Goals

- 100% free and client-side (static hosting only, zero backend costs)
- Videos never leave the user's device
- Lightweight: chunked transcription, one heavy job at a time
- Easy to extend: adding a tool = one new folder + one line in a registry
- Portfolio-ready: deployed live on Vercel or Netlify

## v1 Tools

| # | Tool | Description |
|---|------|-------------|
| 1 | **Captions generator** | Auto-transcribes speech, edits timed captions, previews styles, and exports captioned video |
| 2 | **Transcript generator** | Transcribes video or audio to an editable, timed transcript and exports `.txt`, `.srt`, or `.vtt` |
| 3 | **Speed changer** | Change a video's speed, choose whether audio pitch stays natural, and preview the result |
| 4 | **Batch captions** | Process several videos one at a time with shared settings and per-item review |
| 5 | **Crop and trim** | Set start/end points and a crop area in one screen; presets for 9:16, 4:5, 1:1, 16:9 |

Tools 1, 2 and 4 share one transcription engine and batch runner.

### Optional quick wins (one FFmpeg command each)
Video to MP3, Remove audio, Flip and rotate, Convert MOV to MP4.

### Later / out of scope for now
Blur faces (needs face-tracking ML), Record with teleprompter, Compress and batch compress.

---

## Tech Stack

| Area | Choice |
|------|--------|
| UI | React + Vite + Tailwind CSS (dark theme) |
| Video processing | `@ffmpeg/ffmpeg` (FFmpeg.wasm) |
| Speech to text | Whisper in the browser via `@huggingface/transformers` (Transformers.js), word-level timestamps |
| Caption preview | HTML `<video>` + shared canvas caption renderer |
| Caption export | Mediabunny Conversion with WebCodecs; real-time MediaRecorder fallback |
| Background work | Web Workers for FFmpeg, Whisper, and fast caption exports |
| Storage | IndexedDB for the batch queue and recent transcripts (14 days); model files cached by the browser |
| Hosting | Vercel or Netlify (free) |

> **Headers:** multi-threaded FFmpeg.wasm needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Set them in `vite.config.ts` for dev and in `vercel.json` / `netlify.toml` for production. The single-threaded FFmpeg core works without them, just slower.

---

## Architecture

There is no backend, so there is no "system design" in the server sense. The app is a frontend pipeline with three layers:

1. **Presentation:** homepage grid, per-tool pages, upload box, progress bar
2. **Processing:** FFmpeg and Whisper workers, caption engine, and a frame-based caption-export worker
3. **Storage:** in-memory file handles, IndexedDB for queues

### Tool registry (the key idea)

The homepage grid is generated from one list. Each tool is a self-contained folder.

```js
// src/tools/index.js
export const tools = [
  { id: "captions",       name: "Captions generator",   icon: "Captions", description: "...", component: Captions },
  { id: "transcript",     name: "Transcript generator", icon: "FileText", description: "...", component: Transcript },
  { id: "speed",          name: "Change video speed",   icon: "Gauge",    description: "...", component: Speed },
  { id: "batch-captions", name: "Batch captions",       icon: "Layers",   description: "...", component: BatchCaptions },
  { id: "crop-trim",      name: "Crop and trim",        icon: "Crop",     description: "...", component: CropTrim },
];
```

Adding a tool later = create `src/tools/<new-tool>/` and add one line above.

### Adding a new tool

Create a self-contained folder under `src/tools/<tool-id>/` with the tool
component and its styles. Reuse shared components from `src/shared/components/`
instead of duplicating page layout, preview controls, processing status, or
result presentation.

Every tool page must wrap its content in `ToolLayout` and use the shared
`getMediaInfo(file)` helper for video dimensions, duration, and audio-track
availability. Use the shared `ProcessingRing` for staged work and
`ResultCard` for completed exports. Keep audio availability as `unknown` when
inspection fails; the export must still work with optional audio mapping.

Add the component to `src/tools/index.js` with its metadata and set `ready: true`
when it is finished. Only ready registry entries appear on the homepage.
Use `ProcessingRing` for staged work and provide actual stage progress only;
unknown progress remains indeterminate. The transcript and captions rings
weight model loading at 25%, audio decoding at 15%, transcription at 55%, and
finishing at 5%.

### Caption engine and preview
`src/shared/captions/engine.js` lays out timed transcript words into captions,
supports pace selection and caption editing operations, and identifies words
that may need review. The style model and easing functions live in
`src/shared/captions/styles.js`; one canvas renderer in
`src/shared/captions/renderer.js` draws the live preview and is shared with the
export pipeline. Caption fonts are bundled locally so the preview does not
request fonts from an external service. Captioned MP4 export runs
Mediabunny's Conversion API in a Web Worker: each decoded frame is drawn at
the source resolution, passed through the shared canvas renderer, and encoded
with WebCodecs as H.264 video and AAC audio while retaining the source audio.
The worker loads the same bundled caption fonts before drawing. Mediabunny
reports conversion progress and can cancel the active conversion.

The Captions generator uses a three-step flow: choose a video, create and edit
timed words, then style and export. Pace, style, and export stay locked until
the transcript is ready; moving back to Words preserves edits.

Video audio extraction does not depend on the picture. Captions and Transcript
use FFmpeg.wasm by default to extract `-vn` 16 kHz mono PCM WAV, so an
undecodable HEVC video track is never passed through browser video decoding
for transcription. Small audio-only files can use browser decoding as a fast
path. Decoded samples stay in memory for transcription retries and are released
when the selected file is changed or cleared.

The Captions preview checks browser video dimensions, codec, `canPlayType`,
decode errors, whether a frame arrives, and whether the rendered frame is
fully black. A 4K source or an undecodable picture gets a small local preview
copy encoded at 960 pixels on its long edge and 24 fps. When the browser can
decode the source, Mediabunny and WebCodecs scale it; when it cannot, the app
tries FFmpeg.wasm first. While conversion runs, the preview shows a poster
card instead of an unexplained black frame. The proxy is only needed for
preview and is never used for transcription. Export uses the original file
when its picture decodes in the browser; otherwise it uses the preview copy
and warns that the output resolution is limited to the proxy.

If neither local conversion path can read the source, the tool explains that
the audio can still be captioned but preview and video export need a browser
with hardware HEVC support or an H.264 MP4 conversion.

If WebCodecs or the fast encoder fails, the tool records a canvas and the
source audio with MediaRecorder as WebM. This fallback plays through the
video in real time, so export takes at least as long as the clip. Both paths
keep the complete result in browser memory; very long or high-resolution
videos can be slow or exceed device memory. The tool warns for videos over
10 minutes and for 1080p-or-higher video at 60 fps or above. Edited captions
can also be downloaded as SRT, VTT, or plain text.

### Folder structure

```
src/
  main.jsx
  App.jsx                  # router + layout
  pages/
    Home.jsx               # grid generated from the registry
    ToolPage.jsx           # wrapper that renders a tool by id
  tools/
    index.js               # the registry
    captions/
    transcript/
    speed/
    batch-captions/
    crop-trim/
  shared/
    components/            # UploadBox, ProcessingRing, ResultCard, ToolLayout
    ffmpeg/                # loader + helper functions (trim, crop, speed, extractAudio)
    whisper/               # worker + transcribe(chunk) API
    captions/              # chunking, stitching, line grouping, templates, renderer
    utils/                 # file helpers, time formatting, device detection
  workers/
    ffmpeg.worker.js
    whisper.worker.js
public/
vercel.json / netlify.toml # COOP/COEP headers
```

---

## Key Designs

### Lightweight transcription (chunking)
1. Accept a video or audio file. Audio-only input keeps transcription available when a video's picture cannot be played by the browser.
2. Detect long silent regions and decode audio to 16 kHz mono samples; video always uses FFmpeg `-vn` WAV extraction so picture decoding is not required.
3. Whisper uses automatic language detection by default, with a manual language override.
4. Choose Whisper tiny (~60-200 MB), base (~110-360 MB), or small (~300 MB-1 GB). Approximate downloads vary by browser backend.
5. Split audio into ~30 s chunks with ~1 s overlap so words aren't cut in half.
6. Transcribe chunks **sequentially** in a Whisper worker (never in parallel).
7. Offset each chunk's timestamps by its start time, then stitch, dropping duplicate words in the overlap region.
8. Output: one array of `{ word, start, end }`.

The transcript tool decodes local media to 16 kHz mono with the browser's
AudioContext and falls back to FFmpeg when the browser cannot decode a format.
Transformers.js runs Whisper in a Web Worker, prefers WebGPU, and falls back to
WASM when needed. The first run downloads the selected model; Transformers.js
uses the browser cache for later runs. A user's cache may be cleared by browser
settings. Browser memory and WebGPU support vary, so long files and the larger
model can be slow or exceed device limits.
The worker checks for an available WebGPU adapter before loading a model. GPU
uses fp32 weights and WASM uses quantized q8 weights; if GPU model loading
fails, a new worker retries on CPU. Transformers.js defaults ONNX Runtime's
WASM modules to its versioned jsDelivr CDN. The Vite configuration does not
set COOP/COEP headers, so it does not impose cross-origin isolation restrictions
on those CDN requests.
Transformers.js may not include detected-language metadata in its output; when
it does not, the transcript shows that the language was not reported. Choosing
a language manually records the selected language instead.

### Caption pace, editing, and styles
Caption pace can use 1-3 words per line, up to two lines on screen, or the 4-5 words-per-line preset. Break lines at pauses and punctuation while keeping each word's timing attached during transcript edits.

Flag potentially profane and often-misheard words for review. Captions offer five styles: Classic, Minimal, Bold, Highlight, and Pill; and four animations: Bounce, Pop, Fade, and Reveal. A highlight color picker customizes emphasis. Pill style automatically chooses black or white text for contrast.

Export the finished video as MP4 with captions burned in, and export the transcript as SRT, VTT, or TXT.

### Karaoke highlight
Preview: on each `requestAnimationFrame` (or `timeupdate`), find the active word by current time and apply a highlight class to its `<span>`.

### Templates
A template is plain data (font, size, colors, stroke, background box, highlight color, position, animation). The preview and the exporter both read the same template object, so they match.

```js
{ id: "classic", fontFamily: "Inter", fontSize: 48, color: "#fff",
  highlightBg: "#facc15", highlightColor: "#000", stroke: "#000", position: "bottom" }
```

### Batch system
Every tool can plug into one shared batch runner. It owns the queue and processes one job at a time, showing per-item status and progress. Users can retry failed items, apply settings to all items, save and reuse presets, and review or edit results before downloading a ZIP. A failed item does not stop the remaining queue.

Batch queue items include `{ id, file, status, progress, result, error }` and are stored in IndexedDB. Tool-specific work is supplied to the runner so captions, trim, crop, speed, and audio extraction can share the same queue behavior.

### Saved work and offline use
Save recent transcripts in IndexedDB for 14 days so users can return to their work after a refresh. A service worker caches the app shell for offline use after the first page load. Large models and media still need to be available locally or cached before they can be used offline.

---

## Constraints and Honest Limits

- Processing speed depends on the user's hardware; mobile browsers may have stricter memory limits.
- First transcription downloads a Whisper model (approximately 170-340 MB, depending on the model). Show a progress bar and cache it.
- Very large or 4K files may exceed browser memory. Warn users and set a soft file size limit.
- Browsers differ in codec support. Test Chrome, Edge, Firefox, Safari.
- Processing can be slow on older devices, and mobile browsers may impose stricter memory limits.
- Offline mode begins only after the app has loaded once; uncached models and files are not available offline.

## Trust

- **No uploads:** media is read and processed on the user's device; there is no application backend.
- **No tracking:** the app does not add analytics or tracking requests.
- **Verify locally:** open the browser's Network tab, select and process a local file, and confirm the media is not sent to an application server. Initial app assets and model downloads may still appear as network requests.
- **Honest limits:** video codecs vary by browser; large and 4K files can exhaust memory; processing speed depends on device performance; model downloads are large; and offline use requires the app and any needed model to have been cached first.

---

## Getting Started

```bash
npm create vite@latest web-video-toolkit -- --template react
cd web-video-toolkit
npm install
npm install @ffmpeg/ffmpeg @ffmpeg/util @huggingface/transformers react-router-dom lucide-react
npm install -D tailwindcss @tailwindcss/vite
npm run dev
```

Dev server headers (`vite.config.js`):

```js
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
},
```

## Deployment

1. Push to GitHub.
2. Import the repo in Vercel (or Netlify).
3. Add the COOP/COEP headers in `vercel.json` or `netlify.toml`.
4. Every push to `main` redeploys.

## License

MIT (choose what you like).
#   w e b - V i d e o E d i t o r  
 