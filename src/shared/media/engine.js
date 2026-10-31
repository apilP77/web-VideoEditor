import {
  cropVideo as cropWithFFmpeg,
  trimAndCrop as trimAndCropWithFFmpeg,
  trimVideo as trimWithFFmpeg,
} from '../ffmpeg/ffmpegClient.js'
import { getMediaCapabilities } from './capabilities.js'
import { normalizeCropPixels } from '../utils/cropGeometry.js'

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  const error = new Error('Video processing was cancelled.')
  error.name = 'AbortError'
  throw error
}

async function runWithPreferredEngine(operation, fastRun, compatibleRun, options = {}) {
  throwIfAborted(options.signal)
  let supportsFastMode = false
  try {
    supportsFastMode = (await getMediaCapabilities()).h264
  } catch (error) {
    console.warn('Could not check WebCodecs support; using compatible mode.', error)
  }

  if (supportsFastMode) {
    try {
      const result = await fastRun()
      console.info(`${operation}: Fast mode (hardware)`)
      return { ...result, processedWith: 'Fast mode (hardware)' }
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') throw error
      console.warn(`${operation}: fast mode failed; using compatible mode.`, error)
    }
  }

  throwIfAborted(options.signal)
  const result = await compatibleRun()
  console.info(`${operation}: Compatible mode`)
  return { ...result, processedWith: 'Compatible mode' }
}

/**
 * Trims and crops a video, preferring WebCodecs and falling back to FFmpeg.
 *
 * @param {File} file Local video file.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{w: number, h: number, x: number, y: number}} crop Crop rectangle.
 * @param {{width: number, height: number}} videoSize Source dimensions.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void, exact?: boolean}} options Cancellation, progress, and frame-accuracy options.
 * @returns {Promise<{blob: Blob, filename: string, processedWith: string}>} Edited video and suggested filename.
 */
export function trimAndCrop(file, start, end, crop, videoSize, options = {}) {
  const normalizedCrop = normalizeCropPixels(crop, videoSize)
  return runWithPreferredEngine(
    'Trim and crop',
    async () => {
      const { trimAndCrop: trimWithWebCodecs } = await import('./webcodecsEngine.js')
      return trimWithWebCodecs(
        file,
        { start, end, ...normalizedCrop },
        options,
      )
    },
    () => trimAndCropWithFFmpeg(file, start, end, normalizedCrop, videoSize, options),
    options,
  )
}

/**
 * Trims a video, preferring WebCodecs and falling back to FFmpeg.
 *
 * @param {File} file Local video file.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void, exact?: boolean}} options Cancellation, progress, and frame-accuracy options.
 * @returns {Promise<{blob: Blob, filename: string, processedWith: string}>} Trimmed video and suggested filename.
 */
export function trimVideo(file, start, end, options = {}) {
  return runWithPreferredEngine(
    'Trim',
    async () => {
      const { trimVideo: trimWithWebCodecs } = await import('./webcodecsEngine.js')
      return trimWithWebCodecs(file, start, end, { exact: options.exact }, {
        ...options,
      })
    },
    () => trimWithFFmpeg(file, start, end, options),
    options,
  )
}

/**
 * Crops a video, preferring WebCodecs and falling back to FFmpeg.
 *
 * @param {File} file Local video file.
 * @param {{w: number, h: number, x: number, y: number}} crop Crop rectangle.
 * @param {{width: number, height: number}} videoSize Source dimensions.
 * @param {{signal?: AbortSignal, onProgress?: (percent: number) => void}} options Cancellation and progress options.
 * @returns {Promise<{blob: Blob, filename: string, processedWith: string}>} Cropped video and suggested filename.
 */
export function cropVideo(file, crop, videoSize, options = {}) {
  const normalizedCrop = normalizeCropPixels(crop, videoSize)
  return runWithPreferredEngine(
    'Crop',
    async () => {
      const { cropVideo: cropWithWebCodecs } = await import('./webcodecsEngine.js')
      return cropWithWebCodecs(file, normalizedCrop, videoSize, {
        ...options,
      })
    },
    () => cropWithFFmpeg(file, normalizedCrop, videoSize, options),
    options,
  )
}
