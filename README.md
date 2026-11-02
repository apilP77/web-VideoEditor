# Web Video Toolkit

Free video tools that run entirely in your browser. No uploads, no accounts, no watermarks, no server. Your videos are read and processed on your own device.

The toolkit makes captions and transcripts with an AI speech model (Whisper) that runs locally, and edits video with FFmpeg and WebCodecs, also locally.

> **Status:** a working project under active development, not yet deployed. Everything below is built and has automated tests. Browser testing so far covered 1080p H.264 video; 4K and HEVC (H.265) phone video is only partly verified (see [Known limits](#known-limits)).

## Tools

| Tool | What it does |
|------|--------------|
| **Captions generator** | Transcribes speech, lets you edit the words, previews 8 caption styles over your video, and exports an MP4 with the captions burned in. Also exports SRT, VTT and TXT. |
| **Transcript generator** | Turns video or audio into an editable, timed transcript. Exports TXT, SRT and VTT, with timestamps on or off. |
| **Speed changer** | Speeds a clip up or slows it down (0.25x to 4x), keeping the audio in sync, with an option to keep the pitch natural or remove the audio. |
| **Crop and trim** | Set a start and end and drag a crop area in one screen, with presets for 9:16, 4:5, 1:1 and 16:9. |
| **Batch captions** | Captions up to 10 videos in one queue with shared settings. Preview each result with captions drawn on the video, fix words, then export videos or subtitle files (one by one or as a ZIP). Remembers your queue after a refresh. |
| **Batch speed** | Changes the speed of several videos, either one speed for all or a speed for each video. Save videos one by one or all together in a ZIP. |

**Planned:** Batch crop and trim (same crop and trim for all videos, or set each one separately), plus small tools such as video to MP3, remove audio, flip and rotate, and compress. See [TODO.md](TODO.md).

## Privacy

- Videos never leave your device. There is no application backend.
- No analytics and no tracking.
- You can check this: open your browser's Network tab, process a file, and confirm the video is not sent anywhere. The app's own files and the one-time speech model download do appear as requests.
- Fonts used for captions are bundled with the app, not loaded from an outside service.

## Getting started

You need [Node.js](https://nodejs.org/) 22.12 or newer (the app builds on Node 20.19, but the test runner needs 22.12).

```bash
git clone https://github.com/apilP77/web-VideoEditor.git
cd web-VideoEditor
npm install
npm run dev
```

Then open the address Vite prints, usually <http://localhost:5173>.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Starts the development server |
| `npm run build` | Makes a production build in `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run lint` | Checks the code (oxlint) |

The first time you caption or transcribe something, the app downloads a Whisper model (roughly 60 MB to 1 GB depending on the model you pick) and your browser caches it for later runs.

## Tech stack

| Area | Choice |
|------|--------|
| App | React 19, Vite, React Router, plain CSS |
| Video processing | FFmpeg.wasm (`@ffmpeg/ffmpeg`), run in a Web Worker |
| Fast video work | WebCodecs through [Mediabunny](https://mediabunny.dev/) |
| Speech to text | Whisper through Transformers.js (`@huggingface/transformers`), WebGPU when available, otherwise WASM |
| Captions | One shared canvas renderer used by both the live preview and the export |
| Saved work | IndexedDB (batch queue, transcripts, caption projects) and localStorage (saved batch settings), kept 14 days |
| Tests | Vitest |

## How it is organised

Each tool lives in its own folder and is listed in one registry, so adding a tool means one new folder and one line in `src/tools/index.js`. The home page is generated from that list.

```
src/
  tools/            one folder per tool, plus the registry (index.js)
  shared/
    batch/          the queue runner and the caption and speed jobs
    components/     upload box, queue list, progress ring, tool layout, ...
    media/          preview fallback, media info, preview copies, audio decoding
    ffmpeg/         FFmpeg loader and helpers (trim, crop, speed, audio)
    whisper/        speech-to-text worker and chunking
    captions/       caption layout, styles, animations, renderer, export
    storage/        IndexedDB and localStorage helpers
    utils/          ZIP writer, file helpers, timing
docs/
  ARCHITECTURE.md   how the pieces work and why
```

For the design in detail (chunked transcription, the preview fallback for videos the browser cannot show, the batch system and the caption renderer), read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Known limits

- **Speed depends on your device.** Transcription and exports can be slow on older laptops, and phones have tighter memory limits.
- **Large files use a lot of memory.** Results are held in the browser until you save them, so very long or high-resolution videos can run out of memory. Close other tabs, or convert to a 1080p H.264 MP4 first.
- **HEVC (H.265) and 4K video.** Some browsers cannot show the picture of HEVC video. The tools then make a small 960 px preview copy with FFmpeg, which is slow on 4K files. Exports and transcripts use the original file. In **Brave**, the preview of one large phone video stayed blank while Chrome showed a different, smaller video fine; the likely cause is a picture Brave cannot decode. The app now falls back to an FFmpeg preview copy there (not yet confirmed), and burning captions into such a video is not supported in Brave yet: it shows an error instead of saving a file with sound only. The 4K cases are still marked as unverified in [TODO.md](TODO.md).
- **Batch limits.** Up to 10 videos, 4 GB and 30 minutes in total. Batch speed ZIP files are limited to 4 GB.
- **No offline mode yet.** You need a connection the first time, and to download a model.
- **Not deployed.** There is no hosted version, and no COOP/COEP headers are set, so FFmpeg runs single-threaded.

## Roadmap

The full checklist is in [TODO.md](TODO.md). Next up: Batch crop and trim, then the browser verification pass for 4K HEVC, polish (empty and error states, accessibility, mobile layout) and deployment.

## License

No license has been chosen yet.
