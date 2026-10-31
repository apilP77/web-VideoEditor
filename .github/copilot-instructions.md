# Project rules

Project: Web Video Toolkit. Free, browser-only video tools (React + Vite +
Tailwind, FFmpeg.wasm, Whisper via Transformers.js). Read README.md and
TODO.md before starting any task.

## Code rules
- Everything runs client-side. No backend, no uploads, no tracking.
- FFmpeg and Whisper run in Web Workers, never on the UI thread.
- Each tool is a folder in src/tools/, registered in src/tools/index.js.
  Shared code goes in src/shared/.
- No temporary test pages. Production-quality code only.
- Simple, readable code. JSDoc on exported functions.

## Tool UI standards
- Every tool page must use the shared `ToolLayout`: back link, accent-colored
  icon tile, approximately 28px title, one-line description, and a quiet
  "Choose a different video" button in the header. Keep content centered at
  about 1100px maximum width.
- Before a file is selected, show one centered `UploadBox` (about 640px wide)
  with an icon, a short instruction, and muted supported-format text.
- Use a two-column editor on desktop (preview left, controls right), stacked
  on tablet and mobile. Cards share the same background, 1px border, 16px
  radius, and 24px gaps.
- Preserve the video's aspect ratio in the preview. Limit it to
  `max-height: min(60vh, 520px)`, use `object-fit: contain`, and place the
  shared `VideoPlayerControls` below it. Portrait video must not fill the
  column.
- Use shared components and helpers (`UploadBox`, `ToolLayout`, `Button`,
  `VideoPlayerControls`, `getMediaInfo`, processing UI, `ResultCard`, and the
  FFmpeg/WebCodecs engine); do not duplicate them in a tool.
- Keep exactly one filled primary button per state. Idle uses "Export video";
  while a result is visible, use outlined "Export again". Processing shows a
  compact bar under the button with stage, actual percent or indeterminate
  progress, elapsed time, and one Cancel button; disable editor controls.
  After 15 seconds without progress, show: "Still working. Long or
  high-resolution videos take longer."
- Show completed results in a shared `ResultCard` below the whole editor,
  spanning its content width. Include a result preview at the same size as the
  editor preview, file information, and one filled "Download video" button.
- If settings change after export, keep the old result and show
  "Settings changed. Export again to update this video." Replace it only
  after a new export completes.
- Errors use plain language and a "Try again" action. Use red only for actual
  processing failures, not media-detection failures.
- Maintain 44px touch targets, labelled controls, `aria-live` status text,
  visible focus states, and `prefers-reduced-motion` support. Warn for videos
  longer than 3 minutes or larger than 500 MB. Revoke object URLs on file
  change and unmount.
- Add a tool to `src/tools/index.js` with icon, accent, and description; set
  `ready: true` only when it is finished and follows this UI pattern.

## New tool checklist
1. Add `src/tools/<id>/` and build the page with `ToolLayout` and shared UI.
2. Register the tool in `src/tools/index.js`.
3. Add unit tests for pure logic.
4. Tick the completed item in `TODO.md`; update `README.md` if the pattern
   changes.

## Git rules
After finishing each TODO item:
1. Run npm run build, npm run lint and npm test. Fix failures first.
2. Tick the finished items in TODO.md.
3. git add . then check git status shows no node_modules or dist.
4. Commit with one short imperative line under 70 characters, for example
   "Add crop and trim tool". No body, no emoji.
5. Do NOT run git push. I will push myself.
6. Run git log -1 --format="%an <%ae> | %s" and show me the result.

Never add Co-authored-by, Signed-off-by, "Generated with", or any mention of
Copilot, AI or assistants in commit messages, code, comments or docs.
Never change git config. Never force push. Never rewrite history.