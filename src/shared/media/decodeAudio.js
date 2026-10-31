import {
  extractAudio,
  extractAudioFromBuffer,
} from '../ffmpeg/ffmpegClient.js'

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
  const rendered = await context.startRendering()

  if (signal?.aborted) throw createAbortError()
  return rendered.getChannelData(0).slice()
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

/**
 * Decodes local audio or video to 16 kHz mono samples, using FFmpeg if needed.
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

  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio decoding.')
  }

  onProgress?.({
    stage: 'reading-audio',
    percent: null,
    detail: 'Reading audio from this device.',
  })

  const context = new AudioContextConstructor()
  let encodedData
  let decodeError
  try {
    encodedData = await file.arrayBuffer()
    const decoded = await decodeBuffer(context, encodedData)
    return await toMono16k(decoded, signal)
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      throw createAbortError()
    }
    decodeError = error
  } finally {
    if (context.state !== 'closed') await context.close()
  }

  onProgress?.({
    stage: 'reading-audio',
    percent: null,
    detail: 'Using the compatible audio decoder.',
  })

  try {
    const fallbackOptions = {
      signal,
      onProgress: (percent) =>
        onProgress?.({
          stage: 'reading-audio',
          percent: Number.isFinite(percent) ? percent : null,
          detail: 'Converting audio locally.',
        }),
    }
    const extracted = encodedData?.byteLength
      ? await extractAudioFromBuffer(file, encodedData, fallbackOptions)
      : await extractAudio(file, fallbackOptions)
    if (signal?.aborted) throw createAbortError()
    return await decodeBlob(extracted.blob, signal)
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
