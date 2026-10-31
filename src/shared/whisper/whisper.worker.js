import { env, pipeline } from '@huggingface/transformers'
import { stitchChunks } from '../captions/transcript.js'
import { buildAudioChunks, findSpeechRegions } from './audioChunks.js'

const MODEL_IDS = {
  fast: 'onnx-community/whisper-tiny',
  balanced: 'onnx-community/whisper-base',
  accurate: 'onnx-community/whisper-small',
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

function loadTranscriber(modelId, requestId) {
  if (loadedModelId === modelId && loadedTranscriber) {
    return Promise.resolve(loadedTranscriber)
  }

  const progress_callback = (progress) => {
    self.postMessage({
      type: 'progress',
      requestId,
      progress: {
        stage: 'loading-model',
        percent: Number.isFinite(progress.progress) ? progress.progress : null,
        file: progress.file ?? '',
        status: progress.status ?? '',
      },
    })
  }

  let loadPromise
  let device = 'wasm'
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    device = 'webgpu'
    loadPromise = pipeline('automatic-speech-recognition', modelId, {
      device: 'webgpu',
      progress_callback,
    }).catch((webgpuError) => {
      self.postMessage({
        type: 'progress',
        requestId,
        progress: {
          stage: 'loading-model',
          percent: null,
          file: '',
          status: 'WebGPU unavailable; switching to WASM.',
        },
      })
      return pipeline('automatic-speech-recognition', modelId, {
        device: 'wasm',
        progress_callback,
      }).catch((wasmError) => {
        throw new Error(
          `Could not load the speech model. WebGPU: ${webgpuError.message}. WASM: ${wasmError.message}`,
          { cause: wasmError },
        )
      })
      .then((transcriber) => {
        device = 'wasm'
        return transcriber
      })
    })
  } else {
    loadPromise = pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      progress_callback,
    })
  }

  return loadPromise.then((transcriber) => {
    loadedModelId = modelId
    loadedTranscriber = transcriber
    loadedDevice = device
    return transcriber
  })
}

async function loadWasmTranscriber(modelId, requestId) {
  const transcriber = await pipeline('automatic-speech-recognition', modelId, {
    device: 'wasm',
    progress_callback: (progress) => {
      self.postMessage({
        type: 'progress',
        requestId,
        progress: {
          stage: 'loading-model',
          percent: Number.isFinite(progress.progress) ? progress.progress : null,
          file: progress.file ?? '',
          status: progress.status ?? '',
        },
      })
    },
  })
  loadedModelId = modelId
  loadedTranscriber = transcriber
  loadedDevice = 'wasm'
  return transcriber
}

async function transcribe(request) {
  const { requestId, audio, model, language } = request
  if (activeRequestId !== null) {
    self.postMessage({
      type: 'error',
      requestId,
      message: 'A transcription is already running. Wait for it to finish.',
    })
    return
  }

  activeRequestId = requestId

  try {
    const modelId = MODEL_IDS[model]
    if (!modelId) throw new Error('Choose a valid speech model.')
    if (!(audio instanceof Float32Array) || audio.length === 0) {
      throw new Error('The audio could not be decoded. Choose another file.')
    }

    const transcriber = await loadTranscriber(modelId, requestId)
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

    for (let index = 0; index < audioChunks.length; index += 1) {
      if (isCancelled(requestId)) {
        self.postMessage({ type: 'cancelled', requestId })
        return
      }

      const { startSample, endSample, start, end } = audioChunks[index]
      const audioChunk = audio.subarray(startSample, endSample)
      const options = { return_timestamps: 'word', task: 'transcribe' }
      if (language) options.language = language

      let output
      try {
        output = await transcriber(audioChunk, options)
      } catch (error) {
        if (loadedDevice !== 'webgpu') throw error
        self.postMessage({
          type: 'progress',
          requestId,
          progress: {
            stage: 'loading-model',
            percent: null,
            file: '',
            status: 'WebGPU processing failed; switching to WASM.',
          },
        })
        const wasmTranscriber = await loadWasmTranscriber(modelId, requestId)
        if (isCancelled(requestId)) {
          self.postMessage({ type: 'cancelled', requestId })
          return
        }
        output = await wasmTranscriber(audioChunk, options)
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
      chunks.push({ start, end, words })
      self.postMessage({
        type: 'progress',
        requestId,
        progress: {
          stage: 'transcribing',
          percent: ((index + 1) / chunkCount) * 100,
          chunk: index + 1,
          total: chunkCount,
        },
      })
    }

    self.postMessage({
      type: 'progress',
      requestId,
      progress: { stage: 'finishing', percent: null },
    })
    self.postMessage(
      {
        type: 'result',
        requestId,
        result: {
          language: language ?? detectedLanguage,
          words: stitchChunks(chunks),
        },
      },
    )
  } catch (error) {
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId })
      return
    }
    self.postMessage({
      type: 'error',
      requestId,
      message:
        error instanceof Error
          ? error.message
          : 'Transcription failed. Try another file or speech model.',
    })
  } finally {
    cancelledRequests.delete(requestId)
    activeRequestId = null
  }
}

self.onmessage = (event) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId)
    return
  }
  if (message.type === 'transcribe') {
    void transcribe(message)
  }
}
