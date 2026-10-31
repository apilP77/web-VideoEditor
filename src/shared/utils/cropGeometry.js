function roundDownEven(value) {
  return Math.floor((value + 1e-7) / 2) * 2
}

function roundNearestEven(value) {
  return Math.round(value / 2) * 2
}

/**
 * Clamps a crop rectangle to a video's dimensions and makes every value even.
 *
 * @param {{x: number, y: number, w: number, h: number}} crop Crop rectangle in source pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions.
 * @returns {{x: number, y: number, w: number, h: number}} Safe even-pixel crop rectangle.
 */
export function normalizeCropPixels(crop, videoSize) {
  const { width, height } = videoSize ?? {}
  const { x, y, w, h } = crop ?? {}
  if (![width, height, x, y, w, h].every(Number.isFinite)) {
    throw new TypeError('Crop coordinates and video dimensions must be finite numbers.')
  }
  if (width < 2 || height < 2 || w <= 0 || h <= 0) {
    throw new RangeError('Video dimensions and crop size must be at least 2 pixels.')
  }

  const videoWidth = roundDownEven(width)
  const videoHeight = roundDownEven(height)
  const cropX = Math.max(0, Math.min(roundDownEven(x), videoWidth - 2))
  const cropY = Math.max(0, Math.min(roundDownEven(y), videoHeight - 2))
  const cropW = roundDownEven(Math.min(w, videoWidth - cropX))
  const cropH = roundDownEven(Math.min(h, videoHeight - cropY))
  if (cropW < 2 || cropH < 2) {
    throw new RangeError('The crop must be at least 2 pixels wide and high.')
  }

  return { x: cropX, y: cropY, w: cropW, h: cropH }
}

/**
 * Converts a crop overlay measured in displayed pixels to even source pixels.
 *
 * @param {{x: number, y: number, w: number, h: number}} displayCrop Crop rectangle in displayed pixels.
 * @param {{width: number, height: number}} displaySize Displayed video dimensions in CSS pixels.
 * @param {{width: number, height: number}} videoSize Intrinsic video dimensions in pixels.
 * @returns {{x: number, y: number, w: number, h: number}} Crop rectangle for FFmpeg.
 */
export function displayedCropToVideoPixels(displayCrop, displaySize, videoSize) {
  const { width: displayWidth, height: displayHeight } = displaySize ?? {}
  const { width: videoWidth, height: videoHeight } = videoSize ?? {}
  if (![displayWidth, displayHeight, videoWidth, videoHeight].every(Number.isFinite)) {
    throw new TypeError('Displayed and source video dimensions must be finite numbers.')
  }
  if (displayWidth <= 0 || displayHeight <= 0) {
    throw new RangeError('Displayed video dimensions must be greater than zero.')
  }

  const scaleX = videoWidth / displayWidth
  const scaleY = videoHeight / displayHeight
  return normalizeCropPixels(
    {
      x: displayCrop.x * scaleX,
      y: displayCrop.y * scaleY,
      w: displayCrop.w * scaleX,
      h: displayCrop.h * scaleY,
    },
    videoSize,
  )
}

/**
 * Returns the largest centered even-pixel crop matching an aspect ratio.
 *
 * @param {{width: number, height: number}} videoSize Source video dimensions.
 * @param {number} aspectRatio Crop width divided by crop height.
 * @returns {{x: number, y: number, w: number, h: number}} Centered crop rectangle.
 */
export function getCenteredAspectCrop(videoSize, aspectRatio) {
  const { width, height } = videoSize ?? {}
  if (![width, height, aspectRatio].every(Number.isFinite) || aspectRatio <= 0) {
    throw new TypeError('Video dimensions and aspect ratio must be positive finite numbers.')
  }
  if (width < 2 || height < 2) {
    throw new RangeError('Video dimensions must be at least 2 pixels.')
  }

  const evenWidth = roundDownEven(width)
  const evenHeight = roundDownEven(height)
  let w = evenWidth
  let h = evenHeight

  if (w / h > aspectRatio) {
    w = roundNearestEven(h * aspectRatio)
  } else {
    h = roundNearestEven(w / aspectRatio)
  }

  const x = roundDownEven((evenWidth - w) / 2)
  const y = roundDownEven((evenHeight - h) / 2)
  return normalizeCropPixels({ x, y, w, h }, videoSize)
}

/**
 * Moves a crop rectangle by a pixel delta, clamping it to the source video.
 *
 * @param {{x: number, y: number, w: number, h: number}} crop Current crop in source pixels.
 * @param {number} deltaX Horizontal movement in source pixels.
 * @param {number} deltaY Vertical movement in source pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions.
 * @returns {{x: number, y: number, w: number, h: number}} Updated even-pixel crop.
 */
export function moveCropPixels(crop, deltaX, deltaY, videoSize) {
  const maxX = roundDownEven(videoSize.width) - crop.w
  const maxY = roundDownEven(videoSize.height) - crop.h
  return normalizeCropPixels(
    {
      ...crop,
      x: Math.max(0, Math.min(crop.x + deltaX, maxX)),
      y: Math.max(0, Math.min(crop.y + deltaY, maxY)),
    },
    videoSize,
  )
}

/**
 * Resizes the crop along one or more edges and keeps it inside the video.
 *
 * @param {{x: number, y: number, w: number, h: number}} crop Current crop in source pixels.
 * @param {string} handle Edge letters being dragged (for example "se").
 * @param {number} deltaX Horizontal movement in source pixels.
 * @param {number} deltaY Vertical movement in source pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions.
 * @returns {{x: number, y: number, w: number, h: number}} Updated even-pixel crop.
 */
export function resizeCropPixels(crop, handle, deltaX, deltaY, videoSize) {
  const maxWidth = roundDownEven(videoSize.width)
  const maxHeight = roundDownEven(videoSize.height)
  let { x, y, w, h } = crop
  const minSize = 16

  if (handle.includes('w')) {
    const right = x + w
    x = Math.max(0, Math.min(right - minSize, x + deltaX))
    w = right - x
  }
  if (handle.includes('e')) {
    w = Math.max(minSize, Math.min(maxWidth - x, w + deltaX))
  }
  if (handle.includes('n')) {
    const bottom = y + h
    y = Math.max(0, Math.min(bottom - minSize, y + deltaY))
    h = bottom - y
  }
  if (handle.includes('s')) {
    h = Math.max(minSize, Math.min(maxHeight - y, h + deltaY))
  }

  return normalizeCropPixels({ x, y, w, h }, videoSize)
}
