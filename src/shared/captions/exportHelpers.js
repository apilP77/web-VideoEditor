/**
 * Flattens edited caption words into one time-ordered subtitle track.
 *
 * @param {Array<{words: Array<{word: string, start: number, end: number}>}>} captions Edited captions.
 * @returns {Array<{word: string, start: number, end: number}>} Timed words for subtitle downloads.
 */
export function getCaptionExportWords(captions) {
  return captions
    .flatMap((caption) => caption.words)
    .filter(
      (word) =>
        typeof word.word === 'string' &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end),
    )
    .sort((left, right) => left.start - right.start || left.end - right.end)
}

/**
 * Builds a safe caption-export filename from the input video's name.
 *
 * @param {string} fileName Original file name.
 * @param {string} extension Output extension without a leading dot.
 * @returns {string} Sanitized caption filename.
 */
export function getCaptionExportFilename(fileName, extension) {
  const baseName = String(fileName)
    .replace(/\.[^.]+$/u, '')
    .replace(/[\\/:*?"<>|]/gu, '_')
    .trim() || 'video'
  const safeExtension = String(extension).replace(/^\.+/u, '').replace(/[^\da-z]/giu, '')
  if (!safeExtension) throw new TypeError('A file extension is required.')
  return `${baseName}-captions.${safeExtension}`
}

/**
 * Indicates whether a caption export should warn about long or high-resolution video.
 *
 * @param {{duration?: number, width?: number, height?: number, frameRate?: number | null}} media Video metadata.
 * @returns {boolean} Whether a longer export and higher memory use are likely.
 */
export function shouldWarnAboutCaptionExport({ duration = 0, width = 0, height = 0, frameRate = null }) {
  return duration > 10 * 60 ||
    (Math.min(width, height) >= 1080 && Number.isFinite(frameRate) && frameRate >= 60)
}
