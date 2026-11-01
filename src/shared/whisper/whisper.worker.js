import { env, pipeline } from '@huggingface/transformers'
import { stitchChunks } from '../captions/transcript.js'
import {
  buildAudioChunks,
  copyAudioChunk,
  findSpeechRegions,
} from './audioChunks.js'
import { getWhisperBackend } from './backend.js'
import { debugLog } from '../utils/debugLog.js'

// Word-level timestamps need cross-attention outputs, which only the
// `_timestamped` exports include. The plain exports fail with
// "Model outputs must contain cross attentions to extract timestamps".
const MODEL_IDS = {
  fast: 'onnx-community/whisper-tiny_timestamped',
  balanced: 'onnx-community/whisper-base_timestamped',
  accurate: 'onnx-community/whisper-small_timestamped',
}
// Quantizing the Whisper encoder noticeably hurts accuracy, so the CPU path
// keeps the encoder at full precision and only quantizes the decoder.
const DTYPE_BY_DEVICE = {
  webgpu: 'fp32',
  wasm: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
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

  // Transformers.js reports each file separately and also sends a
  // `progress_total` event that sums every model file. Use the total so the
  // UI shows one steadily rising number instead of restarting per file.
  let lastTotal = null
  let lastSentPercent = -1
  const transcriber = await pipeline(
    'automatic-speech-recognition',
    modelId,
    {
      device,
      dtype: DTYPE_BY_DEVICE[device],
      progress_callback(progress) {
        if (
          progress.status === 'progress_total' &&
          Number.isFinite(progress.loaded) &&
          Number.isFinite(progress.total) &&
          progress.total > 0
        ) {
          lastTotal = { loaded: progress.loaded, total: progress.total }
        } else if (progress.status === 'progress') {
          // Per-file events duplicate progress_total; skip the extra message.
          return
        }
        const percent = lastTotal ? (lastTotal.loaded / lastTotal.total) * 100 : null
        // progress_total fires thousands of times; send roughly every 0.5%.
        if (
          progress.status === 'progress_total' &&
          percent !== null &&
          percent < 100 &&
          percent - lastSentPercent < 0.5
        ) {
          return
        }
        if (percent !== null) lastSentPercent = percent
        sendProgress(requestId, {
          stage: 'loading-model',
          backend: device,
          percent,
          loadedBytes: lastTotal?.loaded ?? null,
          totalBytes: lastTotal?.total ?? null,
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
    technicalDetails: error?.technicalDetails ?? getTechnicalDetails(error),
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
      error?.userMessage ??
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
    const { requestId, audio, language, model } = request
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
    debugLog('whisper', 'transcribing', {
      model: MODEL_IDS[model],
      device,
      audioSeconds: Number((audio.length / SAMPLE_RATE).toFixed(2)),
      speechRegions: regions.length,
      chunks: chunkCount,
    })
    if (chunkCount === 0) {
      throw Object.assign(new Error('No audio was found to transcribe.'), {
        userMessage: 'No speech-length audio was found in this file.',
      })
    }
    const chunks = []
    let detectedLanguage = null
    sendProgress(requestId, {
      stage: 'transcribing',
      backend: device,
      percent: 0,
      chunk: chunkCount > 0 ? 1 : 0,
      total: chunkCount,
      coveredSeconds: 0,
    })

    for (let index = 0; index < audioChunks.length; index += 1) {
      if (isCancelled(requestId)) {
        self.postMessage({ type: 'cancelled', requestId })
        return
      }

      const { startSample, endSample, start, end } = audioChunks[index]
      // Chunk times feed caption timestamps and progress text; never let a
      // NaN or reversed range through silently.
      if (![start, end].every(Number.isFinite) || end <= start) {
        throw Object.assign(
          new Error(`Chunk ${index + 1} has an invalid time range (${start}–${end}).`),
          { userMessage: `Transcription failed on chunk ${index + 1} of ${chunkCount}: invalid audio range.` },
        )
      }
      const audioChunk = copyAudioChunk(audio, startSample, endSample)
      const chunkStartedAt = performance.now()
      debugLog('whisper', `chunk ${index + 1}/${chunkCount} start`, {
        from: Number(start.toFixed(2)),
        to: Number(end.toFixed(2)),
        samples: audioChunk.length,
      })
      const options = { return_timestamps: 'word', task: 'transcribe' }
      if (language) options.language = language

      let output
      try {
        output = await transcriber(audioChunk, options)
      } catch (chunkError) {
        const underlyingMessage =
          chunkError instanceof Error ? chunkError.message : String(chunkError)
        const context = `Chunk ${index + 1} of ${chunkCount}; model ${model} (${MODEL_IDS[model]}); backend ${device}.`
        const technicalDetails = [
          context,
          `Underlying error: ${underlyingMessage}`,
          getTechnicalDetails(chunkError),
        ].join('\n\n')
        console.error(`Whisper transcription failed. ${context}`, chunkError)
        const error = new Error(
          `Transcription failed on chunk ${index + 1} of ${chunkCount}. Check the details and try again.`,
          { cause: chunkError },
        )
        error.userMessage = error.message
        error.technicalDetails = technicalDetails
        throw error
      }
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
      debugLog('whisper', `chunk ${index + 1}/${chunkCount} done`, {
        words: words.length,
        ms: Math.round(performance.now() - chunkStartedAt),
        text: words.slice(0, 8).map((word) => word.word).join(''),
      })
      chunks.push({ start, end, words })
      sendProgress(requestId, {
        stage: 'transcribing',
        backend: device,
        percent: ((index + 1) / chunkCount) * 100,
        chunk: Math.min(index + 2, chunkCount),
        completedChunks: index + 1,
        total: chunkCount,
        coveredSeconds: end,
        // Words heard so far, so the page can show a live transcript.
        partialWords: stitchChunks(chunks),
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
