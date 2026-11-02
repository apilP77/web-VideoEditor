import { getCaptionExportFilename, getCaptionExportWords } from '../captions/exportHelpers.js'
import { toPlainText, toSRT, toVTT } from '../captions/transcript.js'

export const SUBTITLE_FORMATS = Object.freeze([
  { extension: 'srt', label: 'SRT', mimeType: 'application/x-subrip', build: toSRT },
  { extension: 'vtt', label: 'VTT', mimeType: 'text/vtt', build: toVTT },
  { extension: 'txt', label: 'TXT', mimeType: 'text/plain', build: toPlainText },
])

/**
 * Builds one subtitle file from a video's captions.
 *
 * @param {string} videoName Source video file name.
 * @param {object[]} captions Laid-out captions.
 * @param {'srt' | 'vtt' | 'txt'} extension Format to build.
 * @returns {{name: string, data: string, mimeType: string}} File name and text.
 */
export function buildSubtitleFile(videoName, captions, extension) {
  const format = SUBTITLE_FORMATS.find((entry) => entry.extension === extension)
  if (!format) throw new TypeError(`Unknown subtitle format: ${extension}`)
  return {
    name: getCaptionExportFilename(videoName, extension),
    data: format.build(getCaptionExportWords(captions)),
    mimeType: format.mimeType,
  }
}

/**
 * Builds every subtitle format for every finished video, ready to zip.
 *
 * @param {{name: string, result?: {captions?: object[]} | null}[]} items Batch items.
 * @returns {{name: string, data: string}[]} Files, grouped by video.
 */
export function buildAllSubtitleFiles(items) {
  const files = []
  for (const item of items) {
    const captions = item.result?.captions
    if (!Array.isArray(captions) || captions.length === 0) continue
    for (const format of SUBTITLE_FORMATS) {
      const { name, data } = buildSubtitleFile(item.name, captions, format.extension)
      files.push({ name, data })
    }
  }
  return files
}
