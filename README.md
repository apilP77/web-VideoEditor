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
| 1 | **Captions generator** | Auto-transcribes speech, edits timed words, controls subtitle pace and style, and exports burned-in MP4, SRT, VTT, or TXT |
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
| Caption preview | HTML `<video>` + CSS/JS overlay |
| Caption export | Burn captions into MP4 with FFmpeg; export matching SRT, VTT, and TXT files |
| Background work | Web Workers (FFmpeg and Whisper must never block the UI thread) |
| Storage | IndexedDB for the batch queue and recent transcripts (14 days); model files cached by the browser |
| Hosting | Vercel or Netlify (free) |

> **Headers:** multi-threaded FFmpeg.wasm needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Set them in `vite.config.ts` for dev and in `vercel.json` / `netlify.toml` for production. The single-threaded FFmpeg core works without them, just slower.

---

## Architecture

There is no backend, so there is no "system design" in the server sense. The app is a frontend pipeline with three layers:

1. **Presentation:** homepage grid, per-tool pages, upload box, progress bar
2. **Processing:** FFmpeg worker, Whisper worker, caption engine (pure JS)
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
availability. Use the shared `ProcessingBar` for exports and `ResultCard` for
completed results. Keep audio availability as `unknown` when inspection fails;
the export must still work with optional audio mapping.

Add the component to `src/tools/index.js` with its metadata and set `ready: true`
when it is finished. Only ready registry entries appear on the homepage.

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
    components/            # UploadBox, ProgressBar, ProcessingBar, ToolCard, DownloadButton
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
2. Detect and skip silence before transcription; extract usable audio as 16 kHz mono WAV.
3. Auto-detect language from the first 30 seconds, with a manual language override.
4. Choose a larger Whisper model on desktop and a lighter model on phones. Model downloads are approximately 170-340 MB, depending on the selected model.
5. Split audio into ~30 s chunks with ~1 s overlap so words aren't cut in half.
6. Transcribe chunks **sequentially** in a Whisper worker (never in parallel).
7. Offset each chunk's timestamps by its start time, then stitch, dropping duplicate words in the overlap region.
8. Output: one array of `{ word, start, end }`.

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