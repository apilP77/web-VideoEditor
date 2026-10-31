import { env, pipeline } from '@huggingface/transformers'
import { stitchChunks } from '../captions/transcript.js'
import { buildAudioChunks, findSpeechRegions } from './audioChunks.js'
import { getWhisperBackend } from './backend.js'

const MODEL_IDS = {
  fast: 'onnx-community/whisper-tiny',
  balanced: 'onnx-community/whisper-base',
  accurate: 'onnx-community/whisper-small',
}
const DTYPE_BY_DEVICE = {
  webgpu: 'fp32',
  wasm: 'q8',
}
const SAMPLE_RATE = 16_000
const CHUNK_SECONDS = 30
const OVERLAP_SECONDS = 1

env.useBrowserCache = true

let loadedModelId = null
let loadedTranscriber = null
let loadedDevice = null
let activeRequestId = null
const cancelledRequests = new Set()

function isCancelled(requestId) {
  return cancelledRequests.has(requestId)
}

function sendProgress(requestId, progress) {
  self.postMessage({ type: 'progress', requestId, progress })
}

function getTechnicalDetails(error) {
  if (error instanceof Error) {
    return error.stack || error.message
  }
  return String(error)
}

async function loadTranscriber(modelId, device, requestId) {
  if (
    loadedModelId === modelId &&
    loadedDevice === device &&
    loadedTranscriber
  ) {
    return loadedTranscriber
  }

  const transcriber = await pipeline(
    'automatic-speech-recognition',
    modelId,
    {
      device,
      dtype: DTYPE_BY_DEVICE[device],
      progress_callback(progress) {
        sendProgress(requestId, {
          stage: 'loading-model',
          backend: device,
          percent: Number.isFinite(progress.progress) ? progress.progress : null,
          file: progress.file ?? '',
          loadedBytes: Number.isFinite(progress.loaded) ? progress.loaded : null,
          totalBytes: Number.isFinite(progress.total) ? progress.total : null,
          status: progress.status ?? '',
        })
      },
    },
  )

  loadedModelId = modelId
  loadedTranscriber = transcriber
  loadedDevice = device
  console.info(`Transcript speech model backend: ${device}`)
  return transcriber
}

function postError(requestId, userMessage, error, extra = {}) {
  self.postMessage({
    type: 'error',
    requestId,
    userMessage,
    technicalDetails: getTechnicalDetails(error),
    ...extra,
  })
}

async function prepareForRequest(request) {
  const { requestId, model } = request
  const modelId = MODEL_IDS[model]
  if (!modelId) throw new Error('Choose a valid speech model.')

  const device =
    request.device === 'wasm'
      ? 'wasm'
      : request.device === 'webgpu'
        ? 'webgpu'
        : await getWhisperBackend()
  const alreadyLoaded =
    loadedModelId === modelId &&
    loadedDevice === device &&
    loadedTranscriber

  if (!alreadyLoaded) {
    sendProgress(requestId, {
      stage: 'loading-model',
      backend: device,
      percent: null,
      status: device === 'webgpu' ? 'Preparing GPU model.' : 'Preparing CPU model.',
    })
  }

  try {
    return {
      transcriber: await loadTranscriber(modelId, device, requestId),
      device,
    }
  } catch (error) {
    if (isCancelled(requestId)) return null

    if (device === 'webgpu') {
      sendProgress(requestId, {
        stage: 'loading-model',
        backend: 'wasm',
        percent: null,
        status: 'The GPU could not start. Retrying with the CPU.',
      })
      postError(
        requestId,
        'The GPU model could not start.',
        error,
        { retryWithWasm: true },
      )
    } else {
      postError(
        requestId,
        'The speech model could not start. Check your connection and try again.',
        error,
      )
    }
    return null
  }
}

async function runRequest(request, work) {
  const { requestId } = request
  if (activeRequestId !== null) {
    postError(
      requestId,
      'A transcription is already running. Wait for it to finish.',
      'The worker received overlapping transcription requests.',
    )
    return
  }

  activeRequestId = requestId

  try {
    await work()
  } catch (error) {
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId })
      return
    }
    postError(
      requestId,
      'Transcription could not finish. Check the file and try again.',
      error,
    )
  } finally {
    cancelledRequests.delete(requestId)
    activeRequestId = null
  }
}

async function prepareModel(request) {
  await runRequest(request, async () => {
    const prepared = await prepareForRequest(request)
    if (!prepared) return
    if (isCancelled(request.requestId)) {
      self.postMessage({ type: 'cancelled', requestId: request.requestId })
      return
    }
    self.postMessage({
      type: 'result',
      requestId: request.requestId,
      result: { backend: prepared.device, prepared: true },
    })
  })
}

async function transcribe(request) {
  await runRequest(request, async () => {
    const { requestId, audio, language } = request
    if (!(audio instanceof Float32Array) || audio.length === 0) {
      throw new Error('The audio could not be decoded. Choose another file.')
    }

    const prepared = await prepareForRequest(request)
    if (!prepared) return
    const { transcriber, device } = prepared
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId })
      return
    }

    const regions = findSpeechRegions(audio, SAMPLE_RATE)
    const audioChunks = buildAudioChunks(regions, SAMPLE_RATE, {
      chunkSeconds: CHUNK_SECONDS,
      overlapSeconds: OVERLAP_SECONDS,
    })
    const chunkCount = audioChunks.length
    const chunks = []
    let detectedLanguage = null
    sendProgress(requestId, {
      stage: 'transcribing',
      backend: device,
      percent: 0,
      chunk: 0,
      total: chunkCount,
      coveredSeconds: 0,
    })

    for (let index = 0; index < audioChunks.length; index += 1) {
      if (isCancelled(requestId)) {
        self.postMessage({ type: 'cancelled', requestId })
        return
      }

      const { startSample, endSample, start, end } = audioChunks[index]
      const audioChunk = audio.subarray(startSample, endSample)
      const options = { return_timestamps: 'word', task: 'transcribe' }
      if (language) options.language = language

      const output = await transcriber(audioChunk, options)
      if (isCancelled(requestId)) {
        self.postMessage({ type: 'cancelled', requestId })
        return
      }

      const wordChunks = Array.isArray(output.chunks) ? output.chunks : []
      const words = wordChunks
        .filter(
          (word) =>
            typeof word.text === 'string' &&
            Array.isArray(word.timestamp) &&
            Number.isFinite(word.timestamp[0]) &&
            Number.isFinite(word.timestamp[1]),
        )
        .map((word) => ({
          word: word.text,
          start: word.timestamp[0],
          end: word.timestamp[1],
        }))

      detectedLanguage ??=
        output.language ??
        wordChunks.find((word) => typeof word.language === 'string')?.language ??
        null
      chunks.push({ start, end, words })
      sendProgress(requestId, {
        stage: 'transcribing',
        backend: device,
        percent: ((index + 1) / chunkCount) * 100,
        chunk: index + 1,
        total: chunkCount,
        coveredSeconds: end,
      })
    }

    sendProgress(requestId, {
      stage: 'finishing',
      backend: device,
      percent: null,
    })
    self.postMessage({
      type: 'result',
      requestId,
      result: {
        backend: device,
        language: language ?? detectedLanguage,
        words: stitchChunks(chunks),
      },
    })
  })
}

self.onmessage = (event) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId)
    return
  }
  if (message.type === 'transcribe') {
    void transcribe(message)
  } else if (message.type === 'prepare-model') {
    void prepareModel(message)
  }
}
