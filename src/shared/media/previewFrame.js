const BLACK_LEVEL = 4

/**
 * Classifies RGBA pixels read back from a video frame.
 *
 * Fully transparent pixels mean the frame was not readable yet (for example
 * mid-seek), which must not be confused with a black, undecodable picture.
 *
 * @param {Uint8ClampedArray | number[]} pixels RGBA pixel data.
 * @returns {'visible' | 'black' | 'unknown'} Frame classification.
 */
export function classifyFramePixels(pixels) {
  let opaque = false
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue
    opaque = true
    if (
      pixels[index] > BLACK_LEVEL ||
      pixels[index + 1] > BLACK_LEVEL ||
      pixels[index + 2] > BLACK_LEVEL
    ) {
      return 'visible'
    }
  }
  return opaque ? 'black' : 'unknown'
}

/**
 * Reads a tiny copy of the video's current frame and classifies it.
 *
 * @param {HTMLVideoElement} video Video element showing the frame.
 * @returns {'visible' | 'black' | 'unknown'} Frame classification.
 */
export function inspectVideoFrame(video) {
  if (!video || video.readyState < 2 || video.seeking) return 'unknown'
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return 'unknown'
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return classifyFramePixels(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    return 'unknown'
  }
}

const CODEC_LABELS = {
  avc: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
}

/**
 * Turns a container codec identifier into a readable name.
 *
 * @param {string | null | undefined} codec Codec such as 'hevc' or 'avc'.
 * @returns {string} Readable codec name, or an empty string.
 */
export function describeCodec(codec) {
  if (!codec) return ''
  const normalized = String(codec).toLowerCase()
  if (CODEC_LABELS[normalized]) return CODEC_LABELS[normalized]
  if (/^(hvc1|hev1|h265)/.test(normalized)) return CODEC_LABELS.hevc
  if (/^(avc1|avc3|h264)/.test(normalized)) return CODEC_LABELS.avc
  return normalized.toUpperCase()
}
