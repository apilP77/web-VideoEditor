# Architecture and design notes

How Web Video Toolkit is built. For setup and an overview, see the [README](../README.md).

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
  { id: "batch-speed",    name: "Batch speed",          icon: "Gauge",    description: "...", component: BatchSpeed },
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

Every video preview (Captions, Transcript, Speed, and Crop and trim) uses the
shared `usePreviewFallback` hook in `src/shared/media/`. It checks whether the
browser really draws the picture: a decode error, no picture size, no frame
within 4 seconds, or a fully black frame (after one look further in) all mean
the picture is unavailable. Then the `PreviewPoster` card replaces the black
frame and a small local preview copy is encoded at 960 pixels on its long edge
and 24 fps, with progress, elapsed time, a Skip button, and a "still working"
note after a minute without progress. When the copy is ready it replaces the
poster and playback continues from the same position.

Captions and Transcript also make a copy of decodable sources larger than
about 2K, shown with a small badge while the original keeps playing; Speed and
Crop and trim do not. When the browser can decode the source, Mediabunny and
WebCodecs scale it; when it cannot, the app tries FFmpeg.wasm first.

The preview copy is only for viewing. Transcription, Speed, and Crop and trim
always use the original file, and sizes, durations, and crop rectangles stay
in the original's pixels. FFmpeg runs one job at a time, so audio extraction,
exports, and metadata reads pause a running preview copy, which restarts after
them. Captions export uses the original when its picture decodes and the
preview copy (limited to 960 pixels) when it does not.

If the copy cannot be made, the poster says so, with technical details. Out-of-
memory failures in a preview copy or an export get a specific message that
suggests closing other tabs or converting to a 1080p H.264 MP4.

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
    batch-speed/
    crop-trim/
  shared/
    batch/                 # the queue runner, caption and speed jobs, batch style, subtitle files
    components/            # UploadBox, BatchQueue, ProcessingRing, ResultCard, ToolLayout, PreviewPoster
    media/                 # usePreviewFallback, preview copy, media info, audio decoding
    ffmpeg/                # loader + helper functions (trim, crop, speed, extractAudio)
    whisper/               # worker + transcribe(chunk) API
    captions/              # layout, styles, animations, canvas renderer, caption export
    storage/               # IndexedDB and localStorage helpers (batch queue, presets, projects)
    utils/                 # file helpers, ZIP writer, time formatting
docs/
  ARCHITECTURE.md          # this file
```

Workers live next to the code that uses them (for example
`src/shared/media/previewProxy.worker.js` and
`src/shared/captions/captionExport.worker.js`).

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

Flag potentially profane and often-misheard words for review. Captions offer eight styles (Classic, Minimal, Bold, Highlight, Pill, Outline, Neon and Block) and eight animations. A highlight color picker customizes emphasis. Pill style automatically chooses black or white text for contrast.

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
Every batch tool plugs into one shared runner (`src/shared/batch/batchRunner.js`). It owns the queue and processes one job at a time, showing per-item status and progress. Users can retry failed items and remove items, and a failed item does not stop the remaining queue. Limits: 10 videos, 4 GB and 30 minutes in total.

A queue item is `{ id, name, size, duration, file, status, percent, stage, result, error }`. Tool-specific work is passed to the runner as one `process(item, context)` function (`captionJob.js`, `speedJob.js`), so the queue behaviour is identical in every batch tool. The queue list and toolbar are the shared `BatchQueue` component, and `useBatchRunner` connects a runner to React.

Each batch tool decides what happens to a result:

- **Batch captions** keeps the queue, captions and settings in IndexedDB for 14 days. Video files cannot be stored, so the user drops them again after a refresh and they are matched by name and size. Captioned videos are rendered and saved one at a time.
- **Batch speed** keeps each finished video in memory until the user saves it, one by one or in a ZIP built one video at a time (`createZipFromBlobs`). Nothing downloads automatically.

Batch speed offers two modes: the same speed for every video, or a speed for each video. Batch crop and trim is planned to work the same way.

### Batch captions (built)
The Batch captions tool is the first user of the shared runner (`src/shared/batch/`).

- **Limits:** 10 videos, 4 GB and 30 minutes in total. Videos are processed one at a time, and a failed video never stops the rest.
- **Shared settings:** one model, language, pace and caption style for the whole batch. Settings can be saved by name and reused (stored in localStorage, up to 12).
- **Caption look:** every style uses one font and a smaller size, with a rounded box behind the spoken word. The preset only picks the highlight colour and animation (`batchStyle.js`). The style cards, the preview and the export all use the same style.
- **Review:** each finished video can be previewed with its captions drawn over it, and each caption can be edited.
- **Output:** per-video SRT, VTT and TXT, a ZIP of all subtitles, and captions burned into the video. Videos are rendered and saved one at a time, so only one finished video is in memory.
- **Refresh:** the queue, captions and settings are kept in IndexedDB for 14 days. Video files cannot be kept by the browser, so after a refresh the videos are dropped on the page again and matched by name and size.

### Saved work
Recent transcripts, caption projects and the last Batch captions queue are kept in IndexedDB for 14 days so users can return to their work after a refresh. Saved batch settings are kept in localStorage. Offline use through a service worker is not built yet.
