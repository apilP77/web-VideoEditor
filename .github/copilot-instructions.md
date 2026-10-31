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