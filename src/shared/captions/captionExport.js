import { drawCaption } from './renderer.js'
import { getCaptionExportFilename } from './exportHelpers.js'

function createAbortError() {
  const error = new Error('Caption export was cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function exportWithWebCodecs(file, captions, style, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./captionExport.worker.js', import.meta.url),
      { type: 'module' },
    )
    let settled = false
    let lastPercent = -1

    function finish(callback, value) {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
      callback(value)
    }

    function handleAbort() {
      worker.postMessage({ type: 'cancel' })
    }

    worker.onmessage = (event) => {
      const message = event.data
      if (message.type === 'progress') {
        if (!Number.isFinite(message.progress)) return
        const percent = Math.round(message.progress * 100)
        if (percent === lastPercent) return
        lastPercent = percent
        onProgress?.({
          stage: 'encoding',
          percent,
          processedTime: message.processedTime,
        })
      } else if (message.type === 'fallback') {
        finish(resolve, { fallbackReason: message.reason })
      } else if (message.type === 'result') {
        finish(resolve, {
          blob: new Blob([message.buffer], { type: 'video/mp4' }),
          filename: message.filename,
          width: message.width,
          height: message.height,
          duration: message.duration,
          processedWith: 'Mediabunny · WebCodecs · H.264/AAC',
        })
      } else if (message.type === 'cancelled') {
        finish(reject, createAbortError())
      }
    }

    worker.onerror = (event) => {
      event.preventDefault()
      finish(resolve, {
        fallbackReason: event.message || 'The fast video encoder stopped unexpectedly.',
      })
    }
    worker.onmessageerror = () => {
      finish(resolve, {
        fallbackReason: 'The fast video encoder returned unreadable data.',
      })
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    worker.postMessage({ type: 'export', file, captions, style })
    if (signal?.aborted) handleAbort()
  })
}

function chooseRecorderType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return ''
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function exportWithMediaRecorder(file, captions, style, options) {
  const { signal, onProgress, hasAudio } = options
  throwIfAborted(signal)

  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    throw new Error('Real-time video recording is not supported in this browser.')
  }

  const recorderType = chooseRecorderType()
  const sourceUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const captionCanvas = document.createElement('canvas')
  const captionContext = captionCanvas.getContext('2d')
  if (!context || !captionContext) {
    URL.revokeObjectURL(sourceUrl)
    throw new Error('Could not create a canvas for the real-time export.')
  }
  video.src = sourceUrl
  video.playsInline = true
  video.preload = 'auto'

  return new Promise((resolve, reject) => {
    let recorder
    let audioContext = options.audioContext
    let sourceAudioStream
    let animationFrame = 0
    let outputStream
    let settled = false
    let lastReportedPercent = -1
    const chunks = []

    function cleanup() {
      cancelAnimationFrame(animationFrame)
      video.pause()
      video.removeAttribute('src')
      video.load()
      outputStream?.getTracks().forEach((track) => track.stop())
      sourceAudioStream?.getTracks().forEach((track) => track.stop())
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch((error) => {
          console.error('Could not close the export audio context.', error)
        })
      }
      signal?.removeEventListener('abort', handleAbort)
      URL.revokeObjectURL(sourceUrl)
    }

    function finish(error, blob, outputInfo = {}) {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({
        blob,
        filename: getCaptionExportFilename(file.name, 'webm'),
        ...outputInfo,
        processedWith: 'Real-time canvas · MediaRecorder (WebM)',
      })
    }

    function handleAbort() {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      else finish(createAbortError())
    }

    function paintFrame() {
      if (settled || video.paused || video.ended) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const captionIndex = captions.findIndex(
        (caption) =>
          video.currentTime >= caption.start && video.currentTime <= caption.end,
      )
      drawCaption(
        captionContext,
        captionIndex >= 0 ? captions[captionIndex] : null,
        video.currentTime,
        style,
        canvas.width,
        canvas.height,
      )
      context.drawImage(captionCanvas, 0, 0)
      if (Number.isFinite(video.duration) && video.duration > 0) {
        const percent = Math.min(100, Math.round((video.currentTime / video.duration) * 100))
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent
          onProgress?.({
            stage: 'recording',
            percent,
            processedTime: video.currentTime,
          })
        }
      }
      animationFrame = requestAnimationFrame(paintFrame)
    }

    video.onloadedmetadata = async () => {
      try {
        if (settled) return
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        captionCanvas.width = video.videoWidth
        captionCanvas.height = video.videoHeight
        if (!canvas.width || !canvas.height) {
          throw new Error('The browser could not read this video’s dimensions.')
        }

        const canvasStream = canvas.captureStream(30)
        const tracks = [...canvasStream.getVideoTracks()]
        if (hasAudio !== false) {
          let audioTracks = []
          if (audioContext) {
            const resumeError = await options.audioContextReady
            if (!(resumeError instanceof Error)) {
              const audioSource = audioContext.createMediaElementSource(video)
              const audioDestination = audioContext.createMediaStreamDestination()
              audioSource.connect(audioDestination)
              audioTracks = audioDestination.stream.getAudioTracks()
            }
          }
          if (audioTracks.length === 0) {
            sourceAudioStream = video.captureStream?.() ?? video.mozCaptureStream?.()
            audioTracks = sourceAudioStream?.getAudioTracks() ?? []
          }
          if (audioTracks.length === 0 && hasAudio === true) {
            throw new Error('The browser could not capture this video’s audio track.')
          }
          tracks.push(...audioTracks)
          if (settled || signal?.aborted) throw createAbortError()
        }
        outputStream = new MediaStream(tracks)
        recorder = recorderType
          ? new MediaRecorder(outputStream, { mimeType: recorderType })
          : new MediaRecorder(outputStream)
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onerror = (event) => {
          finish(event.error ?? new Error('The browser could not record the video.'))
        }
        recorder.onstop = () => {
          if (signal?.aborted) {
            finish(createAbortError())
            return
          }
          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'video/webm',
          })
          if (blob.size === 0) {
            finish(new Error('The browser did not produce a video recording.'))
            return
          }
          finish(null, blob, {
            width: canvas.width,
            height: canvas.height,
            duration: video.duration,
          })
        }
        video.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop()
        }

        recorder.start(1000)
        await video.play()
        paintFrame()
      } catch (error) {
        finish(error)
      }
    }
    video.onerror = () => {
      finish(new Error('The browser could not decode this video for real-time recording.'))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    if (signal?.aborted) handleAbort()
  })
}

/**
 * Exports a captioned MP4 with Mediabunny and falls back to real-time WebM recording.
 *
 * @param {File} file Local source video.
 * @param {Array<object>} captions Edited timed captions.
 * @param {object} style Caption renderer style.
 * @param {{signal?: AbortSignal, onProgress?: (progress: {stage: string, percent: number, processedTime: number}) => void, onFallback?: (reason: string) => void, hasAudio?: boolean | 'unknown'}} options Progress, cancellation, fallback notification, and audio metadata.
 * @returns {Promise<{blob: Blob, filename: string, width: number, height: number, processedWith: string}>} Captioned video export.
 */
export async function exportCaptionVideo(file, captions, style, options = {}) {
  throwIfAborted(options.signal)
  let audioContext
  let audioContextReady = Promise.resolve(null)
  if (options.hasAudio !== false && typeof AudioContext !== 'undefined') {
    try {
      audioContext = new AudioContext()
      audioContextReady = audioContext.resume().then(
        () => null,
        (error) => error,
      )
    } catch (error) {
      audioContextReady = Promise.resolve(error)
    }
  }

  try {
    let fast
    try {
      fast = await exportWithWebCodecs(file, captions, style, options)
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') {
        throw createAbortError()
      }
      fast = {
        fallbackReason: error instanceof Error ? error.message : String(error),
      }
    }
    if (!fast.fallbackReason) return fast

    throwIfAborted(options.signal)
    options.onFallback?.(fast.fallbackReason)
    try {
      return await exportWithMediaRecorder(file, captions, style, {
        ...options,
        audioContext,
        audioContextReady,
      })
    } catch (fallbackError) {
      if (options.signal?.aborted || fallbackError?.name === 'AbortError') {
        throw createAbortError()
      }
      const error = new Error(
        'Could not export this video. Check available memory and try again.',
        { cause: fallbackError },
      )
      error.technicalDetails = [
        `Fast export: ${fast.fallbackReason}`,
        `Real-time fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      ].join('\n')
      throw error
    }
  } finally {
    if (audioContext && audioContext.state !== 'closed') {
      try {
        await audioContext.close()
      } catch (error) {
        console.error('Could not close the export audio context.', error)
      }
    }
  }
}
