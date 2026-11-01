import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { getMediaCapabilities } from './capabilities.js'
import { getPreviewProxySize } from './previewProxy.js'

let activeConversion = null
let cancelRequested = false

async function createProxy({ file, requestId }) {
  let input
  let canvas

  try {
    input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    })
    const [videoTrack, audioTracks] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getAudioTracks(),
    ])
    if (!videoTrack) throw new Error('No readable video track was found.')

    const capabilities = await getMediaCapabilities()
    if (!capabilities.h264) throw new Error('H.264 encoding is unavailable.')

    const sourceWidth = await videoTrack.getDisplayWidth()
    const sourceHeight = await videoTrack.getDisplayHeight()
    const { width, height } = getPreviewProxySize(sourceWidth, sourceHeight)
    if (!width || !height) throw new Error('Video dimensions could not be read.')

    canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('A video preview drawing surface is unavailable.')

    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    })
    const options = {
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        bitrate: 500_000,
        forceTranscode: true,
        processedWidth: width,
        processedHeight: height,
        process(sample) {
          context.clearRect(0, 0, width, height)
          sample.draw(context, 0, 0, width, height)
          return canvas
        },
      },
    }
    if (audioTracks.length > 0) {
      options.audio = {
        codec: 'aac',
        bitrate: 96_000,
        forceTranscode: true,
      }
    }

    activeConversion = await Conversion.init(options)
    if (!activeConversion.isValid) {
      const reasons = activeConversion.discardedTracks
        .map(({ reason }) => reason)
        .filter(Boolean)
        .join('; ')
      throw new Error(reasons || 'Mediabunny could not prepare the preview copy.')
    }
    if (cancelRequested) {
      await activeConversion.cancel()
      self.postMessage({ type: 'cancelled', requestId })
      return
    }

    activeConversion.onProgress = (progress) => {
      self.postMessage({ type: 'progress', requestId, percent: progress * 100 })
    }
    await activeConversion.execute()
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled', requestId })
      return
    }
    if (!target.buffer) throw new Error('Mediabunny did not produce a preview copy.')

    self.postMessage(
      {
        type: 'result',
        requestId,
        buffer: target.buffer,
        filename: `${file.name.replace(/\.[^.]+$/, '')}-preview.mp4`,
      },
      [target.buffer],
    )
  } catch (error) {
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled', requestId })
    } else {
      self.postMessage({
        type: 'error',
        requestId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    activeConversion = null
    input?.dispose()
    canvas = null
  }
}

self.onmessage = (event) => {
  if (event.data?.type === 'cancel') {
    cancelRequested = true
    activeConversion?.cancel().catch((error) => {
      console.error('Could not cancel preview generation cleanly.', error)
    })
    return
  }
  if (event.data?.type !== 'create') return
  cancelRequested = false
  void createProxy(event.data)
}
