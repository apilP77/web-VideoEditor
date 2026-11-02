import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { getLostVideoReason } from '../media/conversionCheck.js'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url'
import poppins400 from '@fontsource/poppins/files/poppins-latin-400-normal.woff2?url'
import poppins600 from '@fontsource/poppins/files/poppins-latin-600-normal.woff2?url'
import poppins700 from '@fontsource/poppins/files/poppins-latin-700-normal.woff2?url'
import montserrat400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url'
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2?url'
import montserrat700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url'
import bebasNeue400 from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url'
import anton400 from '@fontsource/anton/files/anton-latin-400-normal.woff2?url'
import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url'
import { getActiveCaption } from './engine.js'
import { drawCaption } from './renderer.js'
import { getMediaCapabilities } from '../media/capabilities.js'
import { getCaptionExportFilename } from './exportHelpers.js'

let activeConversion = null
let cancelRequested = false
const CAPTION_FONT_FILES = [
  ['Inter', inter400, '400'],
  ['Inter', inter600, '600'],
  ['Inter', inter700, '700'],
  ['Poppins', poppins400, '400'],
  ['Poppins', poppins600, '600'],
  ['Poppins', poppins700, '700'],
  ['Montserrat', montserrat400, '400'],
  ['Montserrat', montserrat600, '600'],
  ['Montserrat', montserrat700, '700'],
  ['Bebas Neue', bebasNeue400, '400'],
  ['Anton', anton400, '400'],
  ['Caveat', caveat700, '700'],
]

async function loadCaptionFonts() {
  if (!self.fonts || typeof FontFace === 'undefined') {
    throw new Error('Bundled fonts cannot be loaded in the encoding worker.')
  }
  await Promise.all(
    CAPTION_FONT_FILES.map(async ([family, url, weight]) => {
      const font = await new FontFace(family, `url(${url})`, { weight }).load()
      self.fonts.add(font)
    }),
  )
  await self.fonts.ready
}

function postFallback(reason) {
  self.postMessage({
    type: 'fallback',
    reason: reason instanceof Error ? reason.message : String(reason),
  })
}

async function exportWithWebCodecs({ file, captions, style }) {
  let input
  let surface
  let context
  let captionSurface
  let captionContext

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      postFallback('Offscreen canvas is not available in this browser.')
      return
    }
    await loadCaptionFonts()

    input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    })
    const [videoTrack, audioTracks] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getAudioTracks(),
    ])
    if (!videoTrack) {
      throw new Error('The selected file does not contain a readable video track.')
    }

    const capabilities = await getMediaCapabilities()
    if (!capabilities.h264 || (audioTracks.length > 0 && !capabilities.aac)) {
      postFallback('This browser cannot encode the video as H.264 with AAC audio.')
      return
    }
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled' })
      return
    }

    const width = await videoTrack.getDisplayWidth()
    const height = await videoTrack.getDisplayHeight()
    const firstTimestamp = await input.getFirstTimestamp([videoTrack])
    const duration = await input.computeDuration()
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled' })
      return
    }
    surface = new OffscreenCanvas(width, height)
    context = surface.getContext('2d')
    captionSurface = new OffscreenCanvas(width, height)
    captionContext = captionSurface.getContext('2d')
    if (!context || !captionContext) {
      postFallback('A canvas drawing context is not available in this browser.')
      return
    }

    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    })
    const video = {
      codec: 'avc',
      hardwareAcceleration: 'prefer-hardware',
      forceTranscode: true,
      processedWidth: width,
      processedHeight: height,
      process: (sample) => {
        const frameTime = Number.isFinite(sample.timestamp)
          ? sample.timestamp - firstTimestamp
          : 0
        context.clearRect(0, 0, width, height)
        sample.draw(context, 0, 0)
        const captionIndex = getActiveCaption(captions, frameTime)
        drawCaption(
          captionContext,
          captionIndex >= 0 ? captions[captionIndex] : null,
          frameTime,
          style,
          width,
          height,
        )
        context.drawImage(captionSurface, 0, 0)
        return surface
      },
    }
    const options = {
      input,
      output,
      tracks: 'primary',
      video,
    }
    if (audioTracks.length > 0) {
      options.audio = { codec: 'aac', forceTranscode: true }
    }

    activeConversion = await Conversion.init(options)
    // Without this, a picture the browser cannot decode would export as an
    // audio-only file with no captions.
    const lostVideo = getLostVideoReason(activeConversion)
    if (lostVideo) {
      throw new Error(`This browser cannot decode the video picture for MP4 export (${lostVideo}).`)
    }
    if (cancelRequested) {
      await activeConversion.cancel()
      self.postMessage({ type: 'cancelled' })
      return
    }

    console.info('Caption export: Mediabunny WebCodecs (H.264/AAC).')
    activeConversion.onProgress = (progress, processedTime) => {
      self.postMessage({ type: 'progress', progress, processedTime })
    }
    await activeConversion.execute()
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled' })
      return
    }
    if (!target.buffer) {
      throw new Error('Mediabunny did not produce an MP4 file.')
    }

    const filename = getCaptionExportFilename(file.name, 'mp4')
    self.postMessage(
      { type: 'result', buffer: target.buffer, filename, width, height, duration },
      [target.buffer],
    )
  } catch (error) {
    if (cancelRequested) {
      self.postMessage({ type: 'cancelled' })
    } else {
      postFallback(error)
    }
  } finally {
    activeConversion = null
    input?.dispose()
    surface = null
    context = null
    captionSurface = null
    captionContext = null
  }
}

self.onmessage = (event) => {
  if (event.data?.type === 'cancel') {
    cancelRequested = true
    activeConversion?.cancel().catch((error) => {
      console.error('Could not cancel the caption conversion cleanly.', error)
    })
    return
  }
  if (event.data?.type !== 'export') return
  cancelRequested = false
  exportWithWebCodecs(event.data)
}
