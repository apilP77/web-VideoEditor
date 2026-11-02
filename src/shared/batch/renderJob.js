import { exportCaptionVideo } from '../captions/captionExport.js'
import { waitForCaptionFonts } from '../captions/styles.js'
import { getMediaInfo } from '../media/mediaInfo.js'

const RENDER_STAGE_LABELS = {
  preparing: 'Getting ready',
  rendering: 'Adding captions',
  encoding: 'Adding captions',
  recording: 'Recording in real time',
  finishing: 'Finishing',
}

/**
 * Turns an export report into overall batch progress.
 *
 * @param {{stage?: string, percent?: number | null}} progress Export report.
 * @returns {{percent: number | null, stage: string}} Percent and label.
 */
export function describeRenderProgress(progress) {
  return {
    percent: Number.isFinite(progress?.percent)
      ? Math.min(100, Math.max(0, Math.round(progress.percent)))
      : null,
    stage: RENDER_STAGE_LABELS[progress?.stage] ?? 'Adding captions',
  }
}

const defaultDeps = { exportCaptionVideo, waitForCaptionFonts, getMediaInfo }

/**
 * Burns captions into one video and returns the encoded file.
 *
 * The caller should save the result straight away and drop it, so a batch
 * never holds more than one rendered video in memory.
 *
 * @param {File} file Original video.
 * @param {object[]} captions Reviewed captions.
 * @param {object} style Caption style shared by the batch.
 * @param {{signal?: AbortSignal, onProgress?: (update: {percent: number | null, stage: string}) => void}} options Cancellation and progress.
 * @param {typeof defaultDeps} [deps] Replaceable steps, for tests.
 * @returns {Promise<{blob: Blob, filename: string, width: number, height: number, processedWith: string}>} Captioned video.
 */
export async function renderCaptionedVideo(file, captions, style, options = {}, deps = defaultDeps) {
  if (!Array.isArray(captions) || captions.length === 0) {
    throw new Error('This video has no captions to add.')
  }
  const { signal, onProgress } = options
  onProgress?.({ percent: null, stage: 'Getting ready' })
  await deps.waitForCaptionFonts()

  let hasAudio = 'unknown'
  try {
    const info = await deps.getMediaInfo(file)
    if (typeof info?.hasAudio === 'boolean') hasAudio = info.hasAudio
  } catch {
    // Audio detection is optional; the exporter handles 'unknown'.
  }

  return deps.exportCaptionVideo(file, captions, style, {
    signal,
    hasAudio,
    onProgress: (progress) => onProgress?.(describeRenderProgress(progress)),
    onFallback: () => onProgress?.({ percent: null, stage: RENDER_STAGE_LABELS.recording }),
  })
}
