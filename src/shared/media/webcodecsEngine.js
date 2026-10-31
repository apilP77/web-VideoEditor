import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  MPEG_TS,
  Mp4OutputFormat,
  OGG,
  Output,
  QTFF,
  WEBM,
} from 'mediabunny'
import { normalizeCropPixels } from '../utils/cropGeometry.js'
import { getMediaCapabilities } from './capabilities.js'

let nextConversionId = 1

function createAbortError() {
  const error = new Error('Video processing was cancelled.')
  error.name = 'AbortError'
  return error
}

function getBaseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'video'
}

function reportProgress(callback, percent) {
  if (typeof callback === 'function') {
    const safePercent = Number.isFinite(percent)
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : 0
    callback(safePercent)
  }
}

async function convertVideo(file, { start, end, crop, exact = false }, options = {}) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new TypeError('Choose a valid local video file before processing.')
  }
  if (options.signal && typeof options.signal.addEventListener !== 'function') {
    throw new TypeError('signal must be an AbortSignal.')
  }
  if (options.onProgress && typeof options.onProgress !== 'function') {
    throw new TypeError('onProgress must be a function.')
  }
  if (options.signal?.aborted) throw createAbortError()

  const conversionId = nextConversionId++
  const totalTimer = `WebCodecs total #${conversionId}`
  console.time(totalTimer)
  let input
  let conversion
  let cancelPromise
  let cancelError
  const handleAbort = () => {
    if (conversion) {
      cancelPromise = conversion.cancel()
      cancelPromise.catch((error) => {
        cancelError = error
      })
    }
  }

  options.signal?.addEventListener('abort', handleAbort, { once: true })
  try {
    input = new Input({
      source: new BlobSource(file),
      formats: [MP4, QTFF, WEBM, MATROSKA, OGG, MPEG_TS],
    })
    const videoTrack = await input.getPrimaryVideoTrack()
    if (!videoTrack) {
      throw new Error('This file does not contain a video track supported by the browser.')
    }

    const videoSize = {
      width: await videoTrack.getDisplayWidth(),
      height: await videoTrack.getDisplayHeight(),
    }
    const normalizedCrop = crop
      ? normalizeCropPixels(crop, videoSize)
      : null
    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    })
    const capabilities = await getMediaCapabilities()
    const conversionOptions = {
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        hardwareAcceleration: 'prefer-hardware',
        forceTranscode: Boolean(normalizedCrop || exact),
        ...(normalizedCrop
          ? {
              crop: {
                left: normalizedCrop.x,
                top: normalizedCrop.y,
                width: normalizedCrop.w,
                height: normalizedCrop.h,
              },
            }
          : {}),
      },
    }

    if (capabilities?.aac) {
      conversionOptions.audio = { codec: 'aac' }
    }
    if (Number.isFinite(start) && Number.isFinite(end)) {
      conversionOptions.trim = { start, end }
    }

    conversion = await Conversion.init(conversionOptions)
    if (!conversion.isValid) {
      const discarded = conversion.discardedTracks
        .map(({ reason }) => reason)
        .filter(Boolean)
        .join('; ')
      throw new Error(
        discarded
          ? `This video cannot be converted by the fast engine: ${discarded}`
          : 'This video cannot be converted by the fast engine.',
      )
    }
    if (options.signal?.aborted) {
      await conversion.cancel()
      throw createAbortError()
    }

    reportProgress(options.onProgress, 0)
    conversion.onProgress = (progress) => reportProgress(options.onProgress, progress * 95)

    const processingTimer = `WebCodecs processing #${conversionId}`
    console.time(processingTimer)
    try {
      await conversion.execute()
    } finally {
      console.timeEnd(processingTimer)
    }

    if (options.signal?.aborted) throw createAbortError()
    if (!target.buffer) {
      throw new Error('The fast video engine did not produce an output file.')
    }

    reportProgress(options.onProgress, 100)
    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      filename: `${getBaseName(file.name)}-edited.mp4`,
    }
  } catch (error) {
    if (options.signal?.aborted) {
      try {
        await cancelPromise
      } catch (caughtCancelError) {
        const cancelFailure = cancelError ?? caughtCancelError
        throw new Error(
          `Could not cancel video processing: ${cancelFailure instanceof Error ? cancelFailure.message : String(cancelFailure)}`,
          { cause: error },
        )
      }
      throw createAbortError()
    }
    throw error
  } finally {
    options.signal?.removeEventListener('abort', handleAbort)
    input?.dispose()
    console.timeEnd(totalTimer)
  }
}

/**
 * Trims and crops a local video with Mediabunny's WebCodecs conversion pipeline.
 *
 * @param {File} file Local video file.
 * @param {{start?: number, end?: number, x: number, y: number, w: number, h: number, exact?: boolean}} edit Trim range and crop rectangle in source pixels.
 * @param {{onProgress?: (percent: number) => void, signal?: AbortSignal}} options Progress and cancellation options.
 * @returns {Promise<{blob: Blob, filename: string}>} MP4 result and suggested filename.
 */
export function trimAndCrop(file, edit, options = {}) {
  return convertVideo(
    file,
    {
      start: edit.start,
      end: edit.end,
      crop: { x: edit.x, y: edit.y, w: edit.w, h: edit.h },
      exact: edit.exact,
    },
    options,
  )
}

/**
 * Trims a local video using the WebCodecs conversion pipeline.
 *
 * @param {File} file Local video file.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{exact?: boolean}} options Exact-frame re-encoding options.
 * @param {{onProgress?: (percent: number) => void, signal?: AbortSignal}} jobOptions Progress and cancellation options.
 * @returns {Promise<{blob: Blob, filename: string}>} MP4 result and suggested filename.
 */
export function trimVideo(file, start, end, options = {}, jobOptions = {}) {
  return convertVideo(file, { start, end, exact: options.exact }, jobOptions)
}

/**
 * Crops a local video using the WebCodecs conversion pipeline.
 *
 * @param {File} file Local video file.
 * @param {{x: number, y: number, w: number, h: number}} crop Crop rectangle in source pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions (validated against the decoded track).
 * @param {{onProgress?: (percent: number) => void, signal?: AbortSignal}} options Progress and cancellation options.
 * @returns {Promise<{blob: Blob, filename: string}>} MP4 result and suggested filename.
 */
export function cropVideo(file, crop, videoSize, options = {}) {
  return convertVideo(
    file,
    { crop: normalizeCropPixels(crop, videoSize) },
    options,
  )
}
