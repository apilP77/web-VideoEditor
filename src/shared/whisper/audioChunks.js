const DEFAULT_WINDOW_SECONDS = 0.25
const DEFAULT_SILENCE_THRESHOLD = 0.001
const DEFAULT_PADDING_SECONDS = 0.4
const DEFAULT_MERGE_GAP_SECONDS = 0.75

/**
 * Finds conservative speech regions, retaining quiet sound and padding boundaries.
 *
 * @param {Float32Array} audio Mono audio samples.
 * @param {number} sampleRate Sample rate in hertz.
 * @returns {Array<{start: number, end: number}>} Speech regions as sample offsets.
 */
export function findSpeechRegions(audio, sampleRate = 16_000) {
  if (!(audio instanceof Float32Array) || audio.length === 0) return []
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Sample rate must be a positive finite number.')
  }

  const windowSize = Math.max(1, Math.round(sampleRate * DEFAULT_WINDOW_SECONDS))
  const padding = Math.round(sampleRate * DEFAULT_PADDING_SECONDS)
  const mergeGap = Math.round(sampleRate * DEFAULT_MERGE_GAP_SECONDS)
  const activeWindows = []

  for (let start = 0; start < audio.length; start += windowSize) {
    const end = Math.min(audio.length, start + windowSize)
    let squaredTotal = 0
    let peak = 0
    for (let index = start; index < end; index += 1) {
      const sample = Math.abs(audio[index])
      squaredTotal += sample * sample
      peak = Math.max(peak, sample)
    }

    const rms = Math.sqrt(squaredTotal / (end - start))
    if (rms >= DEFAULT_SILENCE_THRESHOLD || peak >= DEFAULT_SILENCE_THRESHOLD * 4) {
      activeWindows.push({ start, end })
    }
  }

  if (activeWindows.length === 0) {
    return [{ start: 0, end: audio.length }]
  }

  const regions = []
  for (const window of activeWindows) {
    const previous = regions[regions.length - 1]
    if (previous && window.start - previous.end <= mergeGap) {
      previous.end = window.end
    } else {
      regions.push({ start: window.start, end: window.end })
    }
  }

  return regions.map((region) => ({
    start: Math.max(0, region.start - padding),
    end: Math.min(audio.length, region.end + padding),
  }))
}

/**
 * Splits speech regions into sequential chunks with overlap and absolute times.
 *
 * @param {Array<{start: number, end: number}>} regions Speech regions as sample offsets.
 * @param {number} sampleRate Sample rate in hertz.
 * @param {{chunkSeconds?: number, overlapSeconds?: number}} options Chunk lengths.
 * @returns {Array<{startSample: number, endSample: number, start: number, end: number}>} Ordered chunk boundaries.
 */
export function buildAudioChunks(
  regions,
  sampleRate = 16_000,
  { chunkSeconds = 30, overlapSeconds = 1 } = {},
) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Sample rate must be a positive finite number.')
  }
  if (
    !Number.isFinite(chunkSeconds) ||
    !Number.isFinite(overlapSeconds) ||
    chunkSeconds <= 0 ||
    overlapSeconds < 0 ||
    overlapSeconds >= chunkSeconds
  ) {
    throw new RangeError('Chunk length must be positive and overlap shorter than the chunk.')
  }

  const chunkSize = Math.round(chunkSeconds * sampleRate)
  const step = Math.round((chunkSeconds - overlapSeconds) * sampleRate)
  const chunks = []

  for (const region of regions) {
    for (let startSample = region.start; startSample < region.end; startSample += step) {
      const endSample = Math.min(region.end, startSample + chunkSize)
      chunks.push({
        startSample,
        endSample,
        start: startSample / sampleRate,
        end: endSample / sampleRate,
      })
      if (endSample === region.end) break
    }
  }

  return chunks
}

/**
 * Copies one audio chunk into an independent Float32Array for inference.
 *
 * @param {Float32Array} audio Mono audio samples at 16 kHz.
 * @param {number} startSample Inclusive first sample index.
 * @param {number} endSample Exclusive final sample index.
 * @returns {Float32Array} Independent chunk samples.
 */
export function copyAudioChunk(audio, startSample, endSample) {
  if (!(audio instanceof Float32Array)) {
    throw new TypeError('Audio chunks must be copied from a Float32Array.')
  }
  if (
    !Number.isInteger(startSample) ||
    !Number.isInteger(endSample) ||
    startSample < 0 ||
    endSample <= startSample ||
    endSample > audio.length
  ) {
    throw new RangeError('Audio chunk boundaries are outside the sample data.')
  }

  return audio.slice(startSample, endSample)
}
