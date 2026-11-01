import { createPreviewProxyWithFFmpeg } from '../ffmpeg/ffmpegClient.js'

let nextRequestId = 1

function createAbortError() {
  const error = new Error('Preview generation was cancelled.')
  error.name = 'AbortError'
  return error
}

function convertWithMediabunny(file, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./previewProxy.worker.js', import.meta.url), {
      type: 'module',
    })
    const requestId = nextRequestId++
    let settled = false

    function cleanup() {
      signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
    }

    function finish(callback, value) {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }

    function handleAbort() {
      worker.postMessage({ type: 'cancel', requestId })
      finish(reject, createAbortError())
    }

    worker.onmessage = (event) => {
      const message = event.data
      if (message.requestId !== requestId) return
      if (message.type === 'progress') {
        try {
          onProgress?.(message.percent)
        } catch (error) {
          finish(reject, error)
        }
      } else if (message.type === 'result') {
        finish(resolve, {
          blob: new Blob([message.buffer], { type: 'video/mp4' }),
          filename: message.filename,
        })
      } else if (message.type === 'cancelled') {
        finish(reject, createAbortError())
      } else if (message.type === 'error') {
        finish(reject, new Error(message.message || 'Mediabunny could not make a preview copy.'))
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish(
        reject,
        new Error(event.message || 'Mediabunny preview generation stopped unexpectedly.'),
      )
    }
    worker.onmessageerror = () => {
      finish(reject, new Error('Mediabunny returned an unreadable preview response.'))
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
    if (signal?.aborted) {
      handleAbort()
      return
    }
    worker.postMessage({ type: 'create', requestId, file })
  })
}

/**
 * Makes a small local preview, preferring Mediabunny and falling back to FFmpeg.
 *
 * @param {File} file Original local video.
 * @param {{width: number, height: number, signal?: AbortSignal, onProgress?: (percent: number) => void, preferFFmpeg?: boolean, waitBeforeFFmpeg?: () => Promise<unknown>}} options Source dimensions, cancellation, progress, decoder preference, and an optional wait so higher-priority FFmpeg work (such as audio extraction) runs first.
 * @returns {Promise<{blob: Blob, filename: string}>} H.264/AAC preview proxy.
 */
export async function createPreviewProxy(
  file,
  { width, height, signal, onProgress, preferFFmpeg = false, waitBeforeFFmpeg } = {},
) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new TypeError('Choose a valid local video file.')
  }
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new RangeError('Video dimensions must be positive finite numbers.')
  }
  if (signal?.aborted) throw createAbortError()

  const ffmpeg = async () => {
    // FFmpeg runs one job at a time. Let the caller finish quick, urgent work
    // first so a long preview encode does not hold it up.
    await waitBeforeFFmpeg?.()?.catch?.(() => {})
    if (signal?.aborted) throw createAbortError()
    return createPreviewProxyWithFFmpeg(file, width, height, { signal, onProgress })
  }
  const mediabunny = () => convertWithMediabunny(file, { signal, onProgress })
  let webCodecsError
  let ffmpegError

  if (preferFFmpeg) {
    try {
      return await ffmpeg()
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw createAbortError()
      ffmpegError = error
      console.warn('FFmpeg preview generation failed; trying browser decoding.', error)
    }
    try {
      return await mediabunny()
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw createAbortError()
      webCodecsError = error
    }
  } else {
    try {
      return await mediabunny()
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw createAbortError()
      webCodecsError = error
      console.warn('Mediabunny preview generation failed; trying FFmpeg.', error)
    }
    try {
      return await ffmpeg()
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw createAbortError()
      ffmpegError = error
    }
  }

  const error = new Error(
    "Your browser can't show this video's picture (likely HEVC). Captions can still be created from the audio. To preview and export, try Chrome with hardware HEVC support, or convert the video to H.264 MP4 first.",
    { cause: ffmpegError ?? webCodecsError },
  )
  error.technicalDetails = [
    `Mediabunny: ${webCodecsError?.message ?? 'not attempted'}`,
    `FFmpeg: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`,
  ].join('\n')
  console.error('Both preview-copy methods failed.', error.technicalDetails)
  throw error
}
