import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    // Workers are not crawled at startup. Pre-bundle their dependencies so
    // Vite does not discover them mid-session and force a full page reload,
    // which would discard the selected video and any in-progress work.
    include: ['@huggingface/transformers', 'mediabunny'],
  },
})
