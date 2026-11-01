const PREVIEW_LONG_EDGE = 960
const PROXY_THRESHOLD = 2000

/**
 * Decides whether a source needs a smaller preview copy.
 *
 * @param {{width?: number, height?: number, frameAvailable?: boolean}} facts Video dimensions and decode status.
 * @returns {boolean} Whether a proxy is needed.
 */
export function shouldCreatePreviewProxy({
  width = 0,
  height = 0,
  frameAvailable,
}) {
  return frameAvailable === false || Math.max(width, height) > PROXY_THRESHOLD
}

/**
 * Fits video dimensions inside a preview box without changing their aspect ratio.
 *
 * @param {number} width Source width.
 * @param {number} height Source height.
 * @param {number} maxWidth Maximum preview width.
 * @param {number} maxHeight Maximum preview height.
 * @returns {{width: number, height: number}} Even preview dimensions.
 */
export function getPreviewSize(width, height, maxWidth, maxHeight) {
  if (
    ![width, height, maxWidth, maxHeight].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    maxWidth <= 0 ||
    maxHeight <= 0
  ) {
    return { width: 0, height: 0 }
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  }
}

/**
 * Calculates low-resolution proxy dimensions with a 960-pixel long edge.
 *
 * @param {number} width Source display width.
 * @param {number} height Source display height.
 * @returns {{width: number, height: number}} Even proxy dimensions.
 */
export function getPreviewProxySize(width, height) {
  return getPreviewSize(width, height, PREVIEW_LONG_EDGE, PREVIEW_LONG_EDGE)
}
