// Set to true to log "[media:...]" pipeline details in the page and workers.
export const MEDIA_DEBUG = false

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
