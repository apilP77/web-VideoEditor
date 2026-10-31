# TODO

Work top to bottom. Finish and test each phase before starting the next. Each task is small enough to handle as one focused change.

Legend: `[ ]` todo, `[x]` done

---

## Phase 0: Project setup
- [x] Create Vite + React project
- [ ] Install Tailwind CSS and set up a dark theme (background, text, accent purple)
- [ ] Install `react-router-dom` and `lucide-react`
- [ ] Add COOP/COEP headers to `vite.config.js` dev server
- [ ] Create folder structure from the README
- [ ] Add `.gitignore`, commit, push to GitHub

## Phase 1: Shell and tool registry
- [ ] Create `src/tools/index.js` registry with the 5 tools (placeholder components)
- [ ] Build `ToolCard` component (icon, title, description, arrow)
- [ ] Build `Home` page: heading, subtitle, responsive grid generated from the registry (4 / 2 / 1 columns)
- [ ] Add a "More on the way" card at the end
- [ ] Build `ToolPage` that loads a tool by route `/tool/:id`
- [ ] Build shared `UploadBox` (drag and drop + click to select, accepts video)
- [ ] Build shared `ProgressBar` and `DownloadButton`
- [ ] Build `DeviceWarning` banner for mobile / low-memory devices
- [ ] Add a privacy note: "Your videos never leave your device"

## Phase 2: FFmpeg foundation
- [x] Write `shared/ffmpeg/loader` that loads FFmpeg.wasm once and reuses it
- [x] Run FFmpeg in a Web Worker; expose progress callbacks
- [x] Helper: `trimVideo(file, start, end)`
- [x] Helper: `cropVideo(file, {w, h, x, y})`
- [x] Helper: `changeSpeed(file, factor)` (video `setpts`, audio chained `atempo` for factors outside 0.5-2.0)
- [x] Helper: `extractAudio(file)` to 16 kHz mono WAV
- [x] Handle errors and cleanup (delete files from FFmpeg virtual FS after use)

## Phase 3: Crop and trim tool
- [x] Video preview with `<video>` and playback controls
- [x] Trim UI: start/end range slider with current time markers
- [x] Crop UI: draggable/resizable overlay on the video
- [x] Aspect ratio presets: Free, 9:16, 4:5, 1:1, 16:9
- [x] Convert overlay position to real video pixel coordinates (account for scaled preview)
- [x] Combine trim + crop into a single FFmpeg command
- [x] Progress bar, result preview, download
- [x] Test with landscape to 9:16 conversion

## Phase 4: Speed changer tool
- [ ] Upload and preview
- [ ] Speed selector (0.25x to 4x) with presets and custom value
- [ ] Show estimated new duration
- [ ] Run `changeSpeed`, preview result, download
- [ ] Test audio stays in sync and pitch is preserved

## Phase 5: Transcription engine (the hard part)
- [ ] Spike: run Whisper via Transformers.js on a 10 s WAV in the browser
- [ ] Enable word-level timestamps and log `{word, start, end}` output
- [ ] Move Whisper into a Web Worker
- [ ] Model download progress UI and caching
- [ ] Select a larger Whisper model on desktop and a lighter model on phones
- [ ] Detect and skip silence before transcription
- [ ] Chunking: split audio into ~30 s chunks with ~1 s overlap
- [ ] Sequential chunk transcription with per-chunk progress
- [ ] Stitching: offset timestamps, remove duplicate words in overlaps
- [ ] Auto-detect language from the first 30 seconds with manual override
- [ ] Test on a 3-5 minute video; check memory use
- [ ] Cancel button that stops the worker cleanly

## Phase 6: Transcript generator tool
- [ ] Upload video or audio, run the transcription engine
- [ ] Accept audio-only input when the video's picture cannot be played
- [ ] Build an editable transcript that preserves word-level timing
- [ ] Flag potentially profane and often-misheard words for review
- [ ] Toggle timestamps on/off
- [ ] Export `.txt`
- [ ] Export `.srt` (group words into sensible subtitle segments)
- [ ] Export `.vtt`
- [ ] Copy-to-clipboard button
- [ ] Save recent transcripts in IndexedDB for 14 days and resume after refresh

## Phase 7: Caption engine (pure JS, no UI)
- [ ] `groupWordsIntoLines(words, {min: 4, max: 5})` breaking on pauses and punctuation
- [ ] Support caption pace of 1-3 words per line and up to two lines on screen
- [ ] `getActiveWord(lines, time)` returns the current line and word index
- [ ] Template data format (font, size, colors, stroke, highlight, position)
- [ ] Five built-in styles: Classic, Minimal, Bold, Highlight, and Pill
- [ ] Four caption animations: Bounce, Pop, Fade, and Reveal
- [ ] Highlight color picker and automatic black/white text contrast for Pill
- [ ] Flag potentially profane and often-misheard words for review
- [ ] Unit tests for grouping and active-word lookup

## Phase 8: Captions generator tool
- [ ] Upload video, run transcription with progress
- [ ] Live preview: `<video>` + caption overlay with highlighted active word
- [ ] Style picker for Classic, Minimal, Bold, Highlight, and Pill
- [ ] Edit transcript text while preserving word timing and re-group lines
- [ ] Review flagged words before export
- [ ] Customize pace (1-3 words per line, up to two lines, or 4-5 word preset)
- [ ] Customize font size, position, highlight color, and animation (Bounce, Pop, Fade, Reveal)
- [ ] Export MP4 with captions burned in using FFmpeg
- [ ] Export `.srt`, `.vtt`, and `.txt` alongside the video

## Phase 9: Shared batch system
- [ ] Build one reusable batch runner that every tool can plug into
- [ ] Queue jobs and process one at a time
- [ ] Show per-item status and progress; allow retry and removal
- [ ] Continue processing after an item fails
- [ ] Apply tool settings to all queued items
- [ ] Save and reuse batch presets
- [ ] Add a review/edit step before saving each result
- [ ] Persist queue and results in IndexedDB
- [ ] Download results as a ZIP
- [ ] Free memory between items

## Phase 10: Batch captions tool
- [ ] Use the shared batch runner for multi-file caption jobs
- [ ] Choose one caption style and settings for the whole batch
- [ ] Process each video one at a time (transcribe, render, review)
- [ ] Retry failed items without stopping the remaining queue

## Phase 11: Polish
- [ ] Loading, empty and error states everywhere
- [ ] File size / duration warnings
- [ ] Keyboard accessibility and focus states
- [ ] Responsive layout check (desktop, tablet, mobile)
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
