import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import {
  buildCropArgs,
  buildExtractAudioArgs,
  buildSpeedArgs,
  buildTrimArgs,
  buildTrimCropArgs,
} from './commands.js'

const coreBaseUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'

let ffmpegInstance = null
let ffmpegLoadPromise = null
let jobQueue = Promise.resolve()
let activeRequestId = null
let activeAbortController = null
let activeFFmpeg = null
const cancelledRequestIds = new Set()
const terminatedInstances = new WeakSet()

function createAbortError() {
  const error = new Error('FFmpeg operation was cancelled.')
  error.name = 'AbortError'
  return error
}

async function getFFmpeg() {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance
  }

  if (!ffmpegLoadPromise) {
    const instance = new FFmpeg()
    ffmpegInstance = instance

    ffmpegLoadPromise = (async () => {
      let coreURL
      let wasmURL

      try {
        coreURL = await toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, 'text/javascript')
        wasmURL = await toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, 'application/wasm')
        await instance.load({ coreURL, wasmURL })
        return instance
      } catch (error) {
        instance.terminate()
        ffmpegInstance = null
        const detail =
          error && typeof error.message === 'string'
            ? ` ${error.message || String(error)}`
            : ` ${String(error)}`
        throw new Error(
          `Could not load FFmpeg. Check your internet connection and try again.${detail}`,
          { cause: error },
        )
      } finally {
        if (coreURL) URL.revokeObjectURL(coreURL)
        if (wasmURL) URL.revokeObjectURL(wasmURL)
      }
    })().finally(() => {
      ffmpegLoadPromise = null
    })
  }

  return ffmpegLoadPromise
}

function getInputExtension(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin'
}

function getOutputDetails(job) {
  const baseName = job.fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'video'

  if (job.type === 'extractAudio') {
    return {
      extension: 'wav',
      mimeType: 'audio/wav',
      filename: `${baseName}-16khz-mono.wav`,
    }
  }

  const suffix = {
    trim: 'trimmed',
    crop: 'cropped',
    trimAndCrop: 'trimmed-cropped',
    changeSpeed: 'speed-changed',
  }[job.type]

  if (!suffix) {
    throw new Error('Unsupported FFmpeg operation.')
  }

  return {
    extension: 'mp4',
    mimeType: 'video/mp4',
    filename: `${baseName}-${suffix}.mp4`,
  }
}

function getCommand(job, inputPath, outputPath) {
  switch (job.type) {
    case 'trim':
      return buildTrimArgs(inputPath, outputPath, job.start, job.end)
    case 'crop':
      return buildCropArgs(inputPath, outputPath, job.crop, job.videoSize)
    case 'trimAndCrop':
      return buildTrimCropArgs(
        inputPath,
        outputPath,
        job.start,
        job.end,
        job.crop,
        job.videoSize,
      )
    case 'changeSpeed':
      return buildSpeedArgs(inputPath, outputPath, job.factor)
    case 'extractAudio':
      return buildExtractAudioArgs(inputPath, outputPath)
    default:
      throw new Error('Unsupported FFmpeg operation.')
  }
}

function postJobError(requestId, error, cleanupErrors = []) {
  const originalMessage =
    error instanceof Error ? error.message : 'An unexpected FFmpeg error occurred.'
  const cleanupMessage =
    cleanupErrors.length > 0
      ? ` Temporary file cleanup failed: ${cleanupErrors.join('; ')}`
      : ''

  self.postMessage({
    type: 'error',
    requestId,
    message: `${originalMessage}${cleanupMessage}`,
  })
}

async function processJob(job) {
  if (cancelledRequestIds.delete(job.requestId)) {
    self.postMessage({ type: 'cancelled', requestId: job.requestId })
    return
  }

  const controller = new AbortController()
  activeRequestId = job.requestId
  activeAbortController = controller
  activeFFmpeg = null

  let inputPath
  let outputPath
  let ffmpeg
  let progressHandler
  let result
  let resultDetails
  let jobError
  let inputMayExist = false
  let outputMayExist = false
  const cleanupErrors = []

  try {
    ffmpeg = await getFFmpeg()
    activeFFmpeg = ffmpeg
    if (controller.signal.aborted) throw createAbortError()

    const inputExtension = getInputExtension(job.fileName)
    resultDetails = getOutputDetails(job)
    inputPath = `input-${job.requestId}.${inputExtension}`
    outputPath = `output-${job.requestId}.${resultDetails.extension}`
    const args = getCommand(job, inputPath, outputPath)

    self.postMessage({ type: 'progress', requestId: job.requestId, percent: 5 })
    inputMayExist = true
    await ffmpeg.writeFile(inputPath, new Uint8Array(job.fileData), {
      signal: controller.signal,
    })
    self.postMessage({ type: 'progress', requestId: job.requestId, percent: 10 })

    progressHandler = ({ progress }) => {
      const percent = Number.isFinite(progress)
        ? Math.min(95, 10 + progress * 85)
        : 10
      self.postMessage({ type: 'progress', requestId: job.requestId, percent })
    }
    ffmpeg.on('progress', progressHandler)

    outputMayExist = true
    const exitCode = await ffmpeg.exec(args, -1, { signal: controller.signal })
    if (exitCode !== 0) {
      throw new Error('FFmpeg could not process this file. Check that the format is supported.')
    }

    const output = await ffmpeg.readFile(outputPath, undefined, {
      signal: controller.signal,
    })
    if (!(output instanceof Uint8Array)) {
      throw new Error('FFmpeg returned an invalid output file.')
    }
    result = output.slice().buffer
  } catch (error) {
    jobError = error
  } finally {
    if (ffmpeg && progressHandler) {
      ffmpeg.off('progress', progressHandler)
    }

    // Terminating the core also discards its complete virtual filesystem.
    const cleanupPaths = terminatedInstances.has(ffmpeg)
      ? []
      : [
          [inputPath, inputMayExist],
          [outputPath, outputMayExist],
        ]
    for (const [path, mayExist] of cleanupPaths) {
      if (ffmpeg && path && mayExist) {
        try {
          await ffmpeg.deleteFile(path)
        } catch (error) {
          cleanupErrors.push(
            error instanceof Error ? error.message : 'could not delete a temporary file',
          )
        }
      }
    }

    activeRequestId = null
    activeAbortController = null
    activeFFmpeg = null
  }

  if (controller.signal.aborted || jobError?.name === 'AbortError') {
    if (cleanupErrors.length > 0) {
      postJobError(
        job.requestId,
        new Error('FFmpeg operation was cancelled.'),
        cleanupErrors,
      )
    } else {
      self.postMessage({ type: 'cancelled', requestId: job.requestId })
    }
    return
  }

  if (jobError) {
    postJobError(job.requestId, jobError, cleanupErrors)
    return
  }

  if (!result || !resultDetails) {
    postJobError(job.requestId, new Error('FFmpeg did not produce an output file.'), cleanupErrors)
    return
  }

  self.postMessage(
    {
      type: 'result',
      requestId: job.requestId,
      data: result,
      mimeType: resultDetails.mimeType,
      filename: resultDetails.filename,
    },
    [result],
  )
  self.postMessage({ type: 'progress', requestId: job.requestId, percent: 100 })
}

self.onmessage = (event) => {
  const message = event.data

  if (message.type === 'cancel') {
    if (message.requestId === activeRequestId) {
      activeAbortController?.abort()
      const instance = activeFFmpeg ?? ffmpegInstance
      if (instance) {
        instance.terminate()
        terminatedInstances.add(instance)
        if (ffmpegInstance === instance) {
          ffmpegInstance = null
        }
      }
    } else {
      cancelledRequestIds.add(message.requestId)
    }
    return
  }

  jobQueue = jobQueue
    .then(() => processJob(message))
    .catch((error) => {
      postJobError(message.requestId, error)
    })
}
