let worker
let nextRequestId = 1
const pendingJobs = new Map()

function createAbortError() {
  const error = new Error('FFmpeg operation was cancelled.')
  error.name = 'AbortError'
  return error
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./ffmpegWorker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = handleWorkerMessage
    worker.onerror = handleWorkerError
    worker.onmessageerror = handleWorkerMessageError
  }

  return worker
}

function removePendingJob(requestId, job) {
  pendingJobs.delete(requestId)
  job.signal?.removeEventListener('abort', job.abortHandler)
}

function handleWorkerMessage(event) {
  const message = event.data
  const job = pendingJobs.get(message.requestId)
  if (!job) return

  if (message.type === 'progress') {
    try {
      job.onProgress?.(message.percent)
    } catch (error) {
      removePendingJob(message.requestId, job)
      worker?.postMessage({ type: 'cancel', requestId: message.requestId })
      job.reject(
        new Error(
          error instanceof Error
            ? `Progress callback failed: ${error.message}`
            : 'Progress callback failed.',
        ),
      )
    }
    return
  }

  removePendingJob(message.requestId, job)
  if (message.type === 'cancelled') {
    job.reject(createAbortError())
    return
  }
  if (message.type === 'error') {
    job.reject(new Error(message.message || 'FFmpeg could not process this file.'))
    return
  }

  if (message.type === 'result') {
    job.resolve({
      blob: new Blob([message.data], { type: message.mimeType }),
      filename: message.filename,
    })
    return
  }

  if (message.type === 'inspection') {
    job.resolve(message.log)
    return
  }

  job.reject(new Error('The FFmpeg worker returned an unknown response.'))
}

function failPendingJobs(message) {
  worker?.terminate()
  worker = undefined

  for (const [requestId, job] of pendingJobs) {
    removePendingJob(requestId, job)
    job.reject(new Error(message))
  }
}

function handleWorkerError(event) {
  event.preventDefault()
  failPendingJobs(
    'The FFmpeg worker stopped unexpectedly. Start a new operation to restart it.',
  )
}

function handleWorkerMessageError() {
  failPendingJobs(
    'The FFmpeg worker returned an unreadable response. Start a new operation to restart it.',
  )
}

async function runJob(type, file, options = {}) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new TypeError('Choose a valid local file before processing.')
  }
  if (options.signal && typeof options.signal.addEventListener !== 'function') {
    throw new TypeError('signal must be an AbortSignal.')
  }
  if (options.onProgress && typeof options.onProgress !== 'function') {
    throw new TypeError('onProgress must be a function.')
  }
  if (options.signal?.aborted) {
    throw createAbortError()
  }

  let fileData
  try {
    fileData = await file.arrayBuffer()
  } catch {
    throw new Error('Could not read the selected file. Try choosing it again.')
  }

  if (options.signal?.aborted) {
    throw createAbortError()
  }

  const requestId = nextRequestId++
  return new Promise((resolve, reject) => {
    const job = {
      resolve,
      reject,
      onProgress: options.onProgress,
      signal: options.signal,
      abortHandler: null,
    }

    job.abortHandler = () => {
      try {
        getWorker().postMessage({ type: 'cancel', requestId })
      } catch (error) {
        removePendingJob(requestId, job)
        reject(
          new Error(
            error instanceof Error
              ? `Could not cancel FFmpeg: ${error.message}`
              : 'Could not cancel FFmpeg.',
          ),
        )
      }
    }

    pendingJobs.set(requestId, job)
    options.signal?.addEventListener('abort', job.abortHandler, { once: true })

    try {
      const currentWorker = getWorker()
      currentWorker.postMessage(
        {
          type,
          requestId,
          fileName: file.name,
          fileData,
          ...options.jobData,
        },
        [fileData],
      )

      if (options.signal?.aborted) {
        job.abortHandler()
      }
    } catch (error) {
      removePendingJob(requestId, job)
      reject(
        new Error(
          error instanceof Error
            ? `Could not start FFmpeg: ${error.message}`
            : 'Could not start FFmpeg.',
        ),
      )
    }
  })
}

/**
 * Trims a video using stream copy by default or exact re-encoding when requested.
 *
 * @param {File} file Local video file.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void, exact?: boolean}} options Cancellation, progress, and frame-accuracy options.
 * @returns {Promise<{blob: Blob, filename: string}>} Trimmed video and suggested filename.
 */
export function trimVideo(file, start, end, options = {}) {
  if (!Number.isFinite(start) || start < 0) {
    return Promise.reject(new TypeError('Start time must be zero or greater.'))
  }
  if (!Number.isFinite(end) || end <= start) {
    return Promise.reject(new TypeError('End time must be greater than start time.'))
  }

  return runJob('trim', file, {
    ...options,
    jobData: { start, end, exact: options.exact === true },
  })
}

/**
 * Crops a video using an even-pixel rectangle clamped to its source dimensions.
 *
 * @param {File} file Local video file.
 * @param {{w: number, h: number, x: number, y: number}} crop Requested crop rectangle in pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions in pixels.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void}} options Cancellation and progress options.
 * @returns {Promise<{blob: Blob, filename: string}>} Cropped video and suggested filename.
 */
export function cropVideo(file, crop, videoSize, options = {}) {
  return runJob('crop', file, { ...options, jobData: { crop, videoSize } })
}

/**
 * Trims and crops a video in a single FFmpeg encode.
 *
 * @param {File} file Local video file.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{w: number, h: number, x: number, y: number}} crop Requested crop rectangle in pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions in pixels.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void}} options Cancellation and progress options.
 * @returns {Promise<{blob: Blob, filename: string}>} Trimmed and cropped video and suggested filename.
 */
export function trimAndCrop(file, start, end, crop, videoSize, options = {}) {
  if (!Number.isFinite(start) || start < 0) {
    return Promise.reject(new TypeError('Start time must be zero or greater.'))
  }
  if (!Number.isFinite(end) || end <= start) {
    return Promise.reject(new TypeError('End time must be greater than start time.'))
  }

  return runJob('trimAndCrop', file, {
    ...options,
    jobData: { start, end, crop, videoSize },
  })
}

/**
 * Changes video speed and optionally keeps audio, preserving its natural pitch.
 *
 * @param {File} file Local video file.
 * @param {number} factor Playback speed multiplier; values above 1 are faster.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void, hasAudio?: boolean | 'unknown', removeAudio?: boolean, keepAudioPitchNatural?: boolean}} options Cancellation, audio availability, and pitch settings.
 * @returns {Promise<{blob: Blob, filename: string}>} Speed-adjusted video and suggested filename.
 */
export function changeSpeed(file, factor, options = {}) {
  if (!Number.isFinite(factor) || factor <= 0) {
    return Promise.reject(
      new RangeError('Speed factor must be a positive finite number.'),
    )
  }

  return runJob('changeSpeed', file, {
    ...options,
    jobData: {
      factor,
      hasAudio: options.hasAudio ?? 'unknown',
      removeAudio: options.removeAudio === true,
      keepAudioPitchNatural: options.keepAudioPitchNatural !== false,
    },
  })
}

/**
 * Reads FFmpeg's `-i` stream-information log for media-info fallback.
 *
 * @param {File} file Local media file.
 * @param {{signal?: AbortSignal}} options Cancellation options.
 * @returns {Promise<string>} FFmpeg's input-inspection log.
 */
export function inspectMediaInfo(file, options = {}) {
  return runJob('inspectMediaInfo', file, options)
}

/**
 * Extracts mono 16 kHz PCM audio as a WAV file.
 *
 * @param {File} file Local video or audio file.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void}} options Cancellation and progress options.
 * @returns {Promise<{blob: Blob, filename: string}>} WAV audio and suggested filename.
 */
export function extractAudio(file, options = {}) {
  return runJob('extractAudio', file, { ...options })
}
