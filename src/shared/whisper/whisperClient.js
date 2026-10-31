let worker
let nextRequestId = 1
let activeJob = null
let preferredDevice = null

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
  job.audio = null
}

function startWorkerJob(job, device) {
  job.device = device
  const message = {
    type: job.type,
    requestId: job.requestId,
    model: job.model,
    language: job.language,
    device,
  }
  const transfer = []
  if (job.audio) {
    const audio = new Float32Array(job.audio)
    message.audio = audio
    transfer.push(audio.buffer)
  }
  getWorker().postMessage(message, transfer)
}

function makeTranscriptionError(job, message) {
  const error = new Error(
    message.userMessage || message.message || 'Transcription failed. Try again.',
  )
  const details = [
    job.gpuError && `GPU attempt:\n${job.gpuError}`,
    message.technicalDetails,
  ].filter(Boolean)
  error.technicalDetails = details.join('\n\n')
  return error
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

  if (
    message.type === 'error' &&
    message.retryWithWasm &&
    job.device !== 'wasm' &&
    !job.retriedWithWasm
  ) {
    job.gpuError = message.technicalDetails || message.message || ''
    job.retriedWithWasm = true
    worker?.terminate()
    worker = undefined
    try {
      preferredDevice = 'wasm'
      startWorkerJob(job, 'wasm')
    } catch (error) {
      clearJob(job)
      job.reject(
        makeTranscriptionError(job, {
          userMessage:
            'The speech model could not start. Check your connection and try again.',
          technicalDetails:
            error instanceof Error ? error.stack || error.message : String(error),
        }),
      )
    }
    return
  }

  clearJob(job)
  if (message.type === 'cancelled') {
    job.reject(createAbortError())
  } else if (message.type === 'error') {
    job.reject(makeTranscriptionError(job, message))
  } else if (message.type === 'result') {
    preferredDevice = message.result.backend || job.device
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

function runWhisperJob({
  type,
  audio = null,
  model,
  language,
  onProgress,
  signal,
}) {
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

  const requestId = nextRequestId++
  return new Promise((resolve, reject) => {
    const job = {
      type,
      requestId,
      resolve,
      reject,
      audio,
      model,
      language,
      device: preferredDevice || 'auto',
      retriedWithWasm: false,
      gpuError: '',
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
      startWorkerJob(job, job.device)
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

/**
 * Loads the selected speech model in the reusable worker before audio decoding.
 *
 * @param {'fast' | 'balanced' | 'accurate'} model Model selection.
 * @param {{onProgress?: (progress: {stage: string, percent: number | null, file?: string, loadedBytes?: number | null, totalBytes?: number | null, backend?: string, status?: string}) => void, signal?: AbortSignal}} options Progress and cancellation settings.
 * @returns {Promise<{backend: 'webgpu' | 'wasm', prepared: true}>} Loaded backend information.
 */
export function prepareWhisperModel(model, { onProgress, signal } = {}) {
  if (!['fast', 'balanced', 'accurate'].includes(model)) {
    return Promise.reject(new TypeError('Choose a valid speech model.'))
  }
  return runWhisperJob({
    type: 'prepare-model',
    model,
    onProgress,
    signal,
  })
}

/**
 * Transcribes 16 kHz mono audio in a reusable Web Worker.
 *
 * @param {Float32Array} audioFloat32Array Mono audio samples at 16 kHz.
 * @param {{model?: 'fast' | 'balanced' | 'accurate', language?: string, onProgress?: (progress: {stage: string, percent: number | null, file?: string, loadedBytes?: number | null, totalBytes?: number | null, chunk?: number, total?: number, coveredSeconds?: number, backend?: string, status?: string}) => void, signal?: AbortSignal}} options Model, language, progress, and cancellation settings.
 * @returns {Promise<{backend: 'webgpu' | 'wasm', language: string | null, words: Array<{word: string, start: number, end: number}>}>} Backend, language, and timed words.
 */
export function transcribe(
  audioFloat32Array,
  { model = 'balanced', language, onProgress, signal } = {},
) {
  if (!(audioFloat32Array instanceof Float32Array)) {
    return Promise.reject(new TypeError('Audio must be a Float32Array.'))
  }
  if (audioFloat32Array.length === 0) {
    return Promise.reject(new TypeError('Audio must contain at least one sample.'))
  }
  return runWhisperJob({
    type: 'transcribe',
    audio: audioFloat32Array,
    model,
    language,
    onProgress,
    signal,
  })
}
