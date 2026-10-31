let worker
let nextRequestId = 1
let activeJob = null

function createAbortError() {
  const error = new Error('Transcription was cancelled.')
  error.name = 'AbortError'
  return error
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./whisper.worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = handleWorkerMessage
    worker.onerror = handleWorkerError
    worker.onmessageerror = handleWorkerMessageError
  }
  return worker
}

function clearJob(job) {
  if (activeJob === job) activeJob = null
  job.signal?.removeEventListener('abort', job.abortHandler)
}

function handleWorkerMessage(event) {
  const message = event.data
  const job = activeJob
  if (!job || job.requestId !== message.requestId) return

  if (message.type === 'progress') {
    try {
      job.onProgress?.(message.progress)
    } catch (error) {
      clearJob(job)
      worker?.terminate()
      worker = undefined
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

  clearJob(job)
  if (message.type === 'cancelled') {
    job.reject(createAbortError())
  } else if (message.type === 'error') {
    job.reject(new Error(message.message || 'Transcription failed. Try again.'))
  } else if (message.type === 'result') {
    job.resolve(message.result)
  } else {
    job.reject(new Error('The speech worker returned an unknown response.'))
  }
}

function failActiveJob(message) {
  const failedWorker = worker
  worker = undefined
  failedWorker?.terminate()
  if (!activeJob) return

  const job = activeJob
  clearJob(job)
  job.reject(new Error(message))
}

function handleWorkerError(event) {
  event.preventDefault()
  failActiveJob(
    'The speech worker stopped unexpectedly. Start a new transcription to restart it.',
  )
}

function handleWorkerMessageError() {
  failActiveJob(
    'The speech worker returned an unreadable response. Start a new transcription to restart it.',
  )
}

/**
 * Transcribes 16 kHz mono audio in a reusable Web Worker.
 *
 * @param {Float32Array} audioFloat32Array Mono audio samples at 16 kHz.
 * @param {{model?: 'fast' | 'balanced' | 'accurate', language?: string, onProgress?: (progress: {stage: string, percent: number | null, file?: string, chunk?: number, total?: number, status?: string}) => void, signal?: AbortSignal}} options Model, language, progress, and cancellation settings.
 * @returns {Promise<{language: string | null, words: Array<{word: string, start: number, end: number}>}>} Detected or selected language and timed words.
 */
export function transcribe(
  audioFloat32Array,
  { model = 'balanced', language, onProgress, signal } = {},
) {
  if (!(audioFloat32Array instanceof Float32Array)) {
    return Promise.reject(new TypeError('Audio must be a Float32Array.'))
  }
  if (signal && typeof signal.addEventListener !== 'function') {
    return Promise.reject(new TypeError('signal must be an AbortSignal.'))
  }
  if (onProgress && typeof onProgress !== 'function') {
    return Promise.reject(new TypeError('onProgress must be a function.'))
  }
  if (signal?.aborted) return Promise.reject(createAbortError())
  if (activeJob) {
    return Promise.reject(
      new Error('A transcription is already running. Wait for it to finish.'),
    )
  }
  if (audioFloat32Array.length === 0) {
    return Promise.reject(new TypeError('Audio must contain at least one sample.'))
  }

  const requestId = nextRequestId++
  const samples =
    audioFloat32Array.byteOffset === 0 &&
    audioFloat32Array.byteLength === audioFloat32Array.buffer.byteLength
      ? audioFloat32Array
      : new Float32Array(audioFloat32Array)

  return new Promise((resolve, reject) => {
    const job = {
      requestId,
      resolve,
      reject,
      onProgress,
      signal,
      abortHandler: null,
    }
    job.abortHandler = () => {
      clearJob(job)
      worker?.terminate()
      worker = undefined
      reject(createAbortError())
    }
    activeJob = job
    signal?.addEventListener('abort', job.abortHandler, { once: true })

    try {
      getWorker().postMessage(
        { type: 'transcribe', requestId, audio: samples, model, language },
        [samples.buffer],
      )
      if (signal?.aborted) job.abortHandler()
    } catch (error) {
      clearJob(job)
      reject(
        new Error(
          error instanceof Error
            ? `Could not start transcription: ${error.message}`
            : 'Could not start transcription.',
        ),
      )
    }
  })
}
