# TODO

Work top to bottom. Finish and test each phase before starting the next. Each task is small enough to handle as one focused change.

Legend: `[ ]` todo, `[x]` done

---

## Phase 0: Project setup
- [x] Create Vite + React project
- [ ] Install Tailwind CSS and set up a dark theme (background, text, accent purple)
- [x] Install `react-router-dom` and `lucide-react`
- [ ] Add COOP/COEP headers to `vite.config.js` dev server
- [ ] Create folder structure from the README
- [ ] Add `.gitignore`, commit, push to GitHub

## Phase 1: Shell and tool registry
- [x] Create `src/tools/index.js` registry with the 5 tools (placeholder components)
- [x] Build `ToolCard` component (icon, title, description, arrow)
- [x] Build `Home` page: heading, subtitle, responsive grid generated from the registry (4 / 3 / 2 / 1 columns)
- [x] Add a "More on the way" card at the end
- [x] Build `ToolPage` that loads a tool by route `/tool/:id`
- [ ] Build shared `UploadBox` (drag and drop + click to select, accepts video)
- [ ] Build shared `ProgressBar` and `DownloadButton`
- [x] Add a privacy note: "Your videos never leave your device"

## Phase 2: FFmpeg foundation
- [x] Write `shared/ffmpeg/loader` that loads FFmpeg.wasm once and reuses it
- [x] Run FFmpeg in a Web Worker; expose progress callbacks
- [x] Helper: `trimVideo(file, start, end)`
- [x] Helper: `cropVideo(file, {w, h, x, y})`
- [x] Helper: `changeSpeed(file, factor)` (video `setpts`, audio chained `atempo` for factors outside 0.5-2.0)
- [x] Helper: `extractAudio(file)` to 16 kHz mono WAV
- [x] Handle errors and cleanup (delete files from FFmpeg virtual FS after use)
- [x] Add fast trim-only stream copy with an exact re-encode option
- [ ] Use WebCodecs for trim, crop, rotate and audio extraction; keep FFmpeg for speed, GIF and fallback

## Phase 3: Crop and trim tool
- [x] Video preview with `<video>` and playback controls
- [x] Trim UI: start/end range slider with current time markers
- [x] Crop UI: draggable/resizable overlay on the video
- [x] Aspect ratio presets: Free, 9:16, 4:5, 1:1, 16:9
- [x] Convert overlay position to real video pixel coordinates (account for scaled preview)
- [x] Combine trim + crop into a single FFmpeg command
- [x] Progress bar, result preview, download
- [x] Test with landscape to 9:16 conversion
- [x] Prefer the WebCodecs engine for crop and trim with an FFmpeg fallback

## Phase 4: Speed changer tool
- [x] Upload and preview
- [x] Speed selector (0.25x to 4x) with presets and custom value
- [x] Show estimated new duration
- [x] Run `changeSpeed`, preview result, download
- [x] Unit tests for duration calculations, atempo filters, and audio arguments
- [ ] Test audio stays in sync and pitch is preserved

## Phase 5: Transcription engine (the hard part)
- [ ] Spike: run Whisper via Transformers.js on a 10 s WAV in the browser
- [x] Enable word-level timestamps in Whisper output
- [ ] Log a sample `{word, start, end}` output
- [x] Move Whisper into a Web Worker
- [x] Check WebGPU adapter availability and retry failed GPU model loads in a fresh WASM worker
- [x] Model download progress UI and caching
- [ ] Select a larger Whisper model on desktop and a lighter model on phones
- [x] Detect and skip silence before transcription
- [x] Chunking: split audio into ~30 s chunks with ~1 s overlap
- [x] Sequential chunk transcription with per-chunk progress
- [x] Stitching: offset timestamps, remove duplicate words in overlaps
- [x] Auto-detect language with manual override
- [x] Report chunk-specific transcription errors with model and backend details
- [ ] Test on a 3-5 minute video; check memory use
- [x] Cancel button that stops the worker cleanly

## Phase 6: Transcript generator tool
- [x] Upload video or audio, run the transcription engine
- [x] Accept audio-only input when the video's picture cannot be played
- [x] Build an editable transcript that preserves word-level timing
- [x] Flag potentially profane and often-misheard English words for review
- [x] Toggle timestamps on/off
- [x] Export `.txt`
- [x] Export `.srt` (group words into sensible subtitle segments)
- [x] Export `.vtt`
- [x] Copy-to-clipboard button
- [x] Save recent transcripts in IndexedDB for 14 days and resume after refresh

## Phase 7: Caption engine (pure JS, no UI)
- [x] `layoutCaptions(words, pace)` breaks on pauses, punctuation, and pace limits
- [x] Support one, two, three, five-word and sentence caption pace modes
- [x] `getActiveCaption(captions, time)` and `getActiveWordIndex(caption, time)`
- [x] Plain caption style model with font, size, colors, stroke, highlight, and position
- [x] Eight built-in styles: Classic, Minimal, Bold, Highlight, Pill, Outline, Neon, and Block
- [x] Eight time-based caption animations with pure easing functions
- [x] Highlight color controls and automatic text contrast for Pill
- [x] Flag potentially profane and often-misheard words for review
- [x] Unit tests for layout, timing edits, styles, easing, and active-caption lookup

## Phase 8: Captions generator tool
- [x] Upload video and run transcription with staged progress
- [x] Live preview: `<video>` + shared canvas caption renderer
- [x] Style picker for eight caption presets with live thumbnails
- [x] Edit caption text while preserving proportional word timing
- [x] Mark flagged words for review without changing their text
- [x] Customize pace from one word to sentence captions
- [x] Customize font, size, position, highlight color, background, stroke, and animation
- [x] Show detected language and allow a language override
- [x] Save and restore caption projects locally for 14 days
- [x] Export MP4 with burned-in captions using Mediabunny and WebCodecs, with real-time WebM fallback
- [x] Export edited captions as `.srt`, `.vtt`, and `.txt`
- [x] Keep preview object URLs safe and preserve valid media duration metadata
- [x] Make an optional 960px H.264/AAC preview copy when no decoded frame arrives
- [x] Organize Captions as Video, Words, and Style and export steps
- [x] Extract audio with FFmpeg independently of the video picture and cache samples for retries
- [x] Keep the source video visible while checking frames and building an optional preview copy
- [x] Start captioning on upload and show the words as they are heard (confirmed in the browser on 1080p H.264)
- [x] Put the caption editor beside a height-capped preview (confirmed in the browser on 1080p H.264)

## HEVC, 4K and broken-tool fixes (branch `fix/tools-hevc-4k`)
- [x] Stop Vite from reloading the page mid-session by pre-bundling worker dependencies (confirmed: Transcript and Captions finish on 1080p)
- [x] Fix Whisper word timestamps, silent decoded audio, and the model-loading progress crash (unit tests; confirmed in Transcript and Captions on 1080p H.264)
- [x] Fall back to the file's own size and duration when the browser cannot decode the picture (unit tests)
- [ ] Shared preview fallback hook and poster card in all four tools (built; not yet seen in a browser)
- [x] Pause a running preview copy for audio extraction, exports, and metadata reads (unit tests for the rule)
- [x] Recognise out-of-memory failures and show a specific message (unit tests)
- [x] Crop exports use the original's pixels while a preview copy plays (unit tests)
- [ ] Verify Speed on 1080p H.264: preview, export, output size and duration
- [ ] Verify Crop and trim on 1080p H.264: preview, crop, trim, export, output size and duration
- [ ] Verify Captions on the 4K HEVC portrait file: poster, preview copy, captions, export at 960 px
- [ ] Verify Transcript on the 4K HEVC portrait file: poster, preview copy, transcript completes
- [ ] Verify Speed on the 4K HEVC portrait file: poster, export at full size
- [ ] Verify Crop and trim on the 4K HEVC portrait file: poster, crop on the copy, export at full size
- [ ] Check memory use of 4K HEVC preview copies and exports on a typical laptop

## Phase 9: Shared batch system
- [x] Build one reusable batch runner that every tool can plug into (unit tests)
- [x] Queue jobs and process one at a time (unit tests)
- [x] Show per-item status and progress; allow retry and removal (unit tests; seen in the browser)
- [x] Continue processing after an item fails (unit tests)
- [x] Apply tool settings to all queued items
- [x] Save and reuse batch presets (logic unit tested; the saved-settings controls are not yet seen in a browser)
- [x] Add a review/edit step before saving each result (preview with captions and word editing seen in the browser)
- [x] Persist queue and results in IndexedDB (serialization unit tested; refresh and restore not yet confirmed in a browser)
- [x] Download results as a ZIP (subtitle ZIP; unit tests for the ZIP writer)
- [x] Free memory between items (finished items drop decoded media; videos are rendered and saved one at a time)
- [ ] Verify Batch captions on the 127 MB 4K HEVC `Momo.mp4` in Brave (the preview was blank on it)

## Phase 10: Batch captions tool
- [x] Use the shared batch runner for multi-file caption jobs
- [x] Choose one caption style and settings for the whole batch
- [x] Process each video one at a time (transcribe, render, review)
- [x] Retry failed items without stopping the remaining queue

## Phase 11: Polish
- [ ] Loading, empty and error states everywhere
- [ ] File size / duration warnings
- [ ] Keyboard accessibility and focus states
- [ ] Responsive layout check (desktop, tablet, mobile)
- [x] Use a shared tool-page layout and reusable video preview controls
- [x] Share the always-visible video preview across Speed, Crop and trim, and Captions
- [x] Add shared circular progress rings for staged tool processing
- [x] Center the upload step and use a consistent responsive tool layout
- [ ] Browser testing: Chrome, Edge, Firefox, Safari
- [ ] Page per tool with its own title, description, and FAQ
- [ ] Favicon and simple logo
- [ ] Add a service worker for offline use after the first load

## Phase 12: Deploy
- [ ] Add `vercel.json` (or `netlify.toml`) with COOP/COEP headers
- [ ] Deploy to Vercel
- [ ] Verify FFmpeg and Whisper work on the live URL
- [ ] Write final README with screenshots / GIF demo
- [ ] Add the project to your portfolio

## Phase 13: Optional quick-win tools (each is one registry line)
- [ ] Video to MP3
- [ ] Remove audio from video
- [ ] Flip and rotate
- [ ] Convert MOV to MP4
- [ ] Compress video
- [ ] Batch compress
- [ ] Batch trim
- [ ] Batch crop
- [ ] Batch speed change
- [ ] Batch audio extraction

---

## Open decisions
- [ ] Whisper model size (tiny vs base) for the speed/accuracy balance
- [ ] Multi-threaded FFmpeg (needs headers) vs single-threaded
- [ ] Project name and logo
