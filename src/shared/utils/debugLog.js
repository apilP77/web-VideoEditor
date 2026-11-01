// TEMPORARY media pipeline logging. Set MEDIA_DEBUG to false (or delete this
// file and its imports, all tagged "[media:") to remove it. Works in the page
// and in workers.
export const MEDIA_DEBUG = true

/**
 * Logs a tagged media-pipeline message when MEDIA_DEBUG is on.
 *
 * @param {string} scope Short area name, such as 'ffmpeg' or 'whisper'.
 * @param {...unknown} details Values to log.
 * @returns {void}
 */
export function debugLog(scope, ...details) {
  if (MEDIA_DEBUG) console.info(`[media:${scope}]`, ...details)
}
