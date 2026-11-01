import { extractAudio, extractAudioFromBuffer } from '../ffmpeg/ffmpegClient.js'
import { chooseAudioDecodePath } from './audioPath.js'
import { debugLog, MEDIA_DEBUG } from '../utils/debugLog.js'

const TARGET_SAMPLE_RATE = 16_000

function createAbortError() {
  const error = new Error('Audio decoding was cancelled.')
  error.name = 'AbortError'
  return error
}

function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

async function decodeBuffer(context, data) {
  return context.decodeAudioData(data)
}

async function toMono16k(audioBuffer, signal) {
  if (signal?.aborted) throw createAbortError()

  const sampleCount = Math.max(
    1,
    Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE),
  )
  const OfflineContext = window.OfflineAudioContext
  if (!OfflineContext) {
    throw new Error('This browser cannot resample audio for transcription.')
  }

  const context = new OfflineContext(1, sampleCount, TARGET_SAMPLE_RATE)
  const source = context.createBufferSource()
  source.buffer = audioBuffer
  source.connect(context.destination)
  // Without start() the source never plays and the render is pure silence,
  // which Whisper turns into hallucinated text such as "you".
  source.start(0)
  const rendered = await context.startRendering()

  if (signal?.aborted) throw createAbortError()
  const samples = rendered.getChannelData(0).slice()
  if (MEDIA_DEBUG) {
    // RMS of 0 means silent audio, which makes Whisper invent text.
    let squares = 0
    for (let index = 0; index < samples.length; index += 1) squares += samples[index] ** 2
    debugLog('audio', 'decoded 16 kHz mono', {
      seconds: Number((samples.length / TARGET_SAMPLE_RATE).toFixed(2)),
      rms: Number(Math.sqrt(squares / Math.max(1, samples.length)).toFixed(4)),
    })
  }
  return samples
}

async function decodeBlob(blob, signal) {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio decoding.')
  }

  const context = new AudioContextConstructor()
  try {
    const data = await blob.arrayBuffer()
    const decoded = await decodeBuffer(context, data)
    return await toMono16k(decoded, signal)
  } finally {
    if (context.state !== 'closed') await context.close()
  }
}

async function extractAndDecode(file, { signal, onProgress }, fileData) {
  const reportProgress = (percent) =>
    onProgress?.({
      stage: 'reading-audio',
      percent: Number.isFinite(percent) ? percent : null,
      detail: 'Extracting 16 kHz mono audio without decoding the video picture.',
    })
  const output = fileData
    ? await extractAudioFromBuffer(file, fileData, {
        signal,
        onProgress: reportProgress,
      })
    : await extractAudio(file, { signal, onProgress: reportProgress })
  if (signal?.aborted) throw createAbortError()
  return decodeBlob(output.blob, signal)
}

/**
 * Decodes local media to 16 kHz mono samples without decoding video tracks.
 *
 * @param {File} file Local audio or video file.
 * @param {{signal?: AbortSignal, onProgress?: (progress: {stage: string, percent: number | null, detail?: string}) => void}} options Cancellation and progress reporting.
 * @returns {Promise<Float32Array>} Mono audio samples at 16 kHz.
 */
export async function decodeAudio(file, { signal, onProgress } = {}) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new TypeError('Choose a valid local audio or video file.')
  }
  if (signal?.aborted) throw createAbortError()

  onProgress?.({
    stage: 'reading-audio',
    percent: null,
    detail: 'Reading your audio...',
  })

  const path = chooseAudioDecodePath(file)
  debugLog('audio', `extracting audio via ${path}`, {
    file: file.name,
    type: file.type || 'unknown',
    sizeMB: Number((file.size / 1048576).toFixed(1)),
  })
  if (path === 'ffmpeg') {
    return extractAndDecode(file, { signal, onProgress })
  }

  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    return extractAndDecode(file, { signal, onProgress })
  }

  let context
  let encodedData
  let decodeError
  try {
    context = new AudioContextConstructor()
    encodedData = await file.arrayBuffer()
    const decoded = await decodeBuffer(context, encodedData)
    return await toMono16k(decoded, signal)
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      throw createAbortError()
    }
    decodeError = error
  } finally {
    if (context && context.state !== 'closed') await context.close()
  }

  try {
    return await extractAndDecode(file, { signal, onProgress }, encodedData)
  } catch (fallbackError) {
    if (fallbackError?.name === 'AbortError' || signal?.aborted) {
      throw createAbortError()
    }
    throw new Error(
      `Could not decode audio in this file. Browser decoder: ${decodeError?.message ?? 'unsupported format'}. Compatible decoder: ${fallbackError?.message ?? 'failed'}`,
      { cause: fallbackError },
    )
  }
}
