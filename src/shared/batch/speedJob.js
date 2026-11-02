import { changeSpeed } from '../ffmpeg/ffmpegClient.js'
import { getMediaInfo } from '../media/mediaInfo.js'

const defaultDeps = { changeSpeed, getMediaInfo }

/**
 * Changes the speed of one video for the batch.
 *
 * The caller should save the result straight away and drop it, so a batch
 * never holds more than one finished video in memory.
 *
 * @param {File} file Original video.
 * @param {{speed: number, keepAudioPitchNatural?: boolean, removeAudio?: boolean, signal?: AbortSignal, onProgress?: (update: {percent: number | null, stage: string}) => void}} options
 *   Speed, audio choices, cancellation and progress.
 * @param {typeof defaultDeps} [deps] Replaceable steps, for tests.
 * @returns {Promise<{blob: Blob, filename: string}>} Speed-adjusted video.
 */
export async function changeSpeedForFile(file, options, deps = defaultDeps) {
  const { speed, keepAudioPitchNatural = true, removeAudio = false, signal, onProgress } = options
  if (!Number.isFinite(speed) || speed <= 0 || speed === 1) {
    throw new Error('Choose a speed other than 1x for this video.')
  }
  onProgress?.({ percent: null, stage: 'Getting ready' })

  let hasAudio = 'unknown'
  try {
    const info = await deps.getMediaInfo(file)
    if (typeof info?.hasAudio === 'boolean') hasAudio = info.hasAudio
  } catch {
    // Audio detection is optional; the speed helper handles 'unknown'.
  }

  return deps.changeSpeed(file, speed, {
    signal,
    hasAudio,
    removeAudio,
    keepAudioPitchNatural,
    onProgress: (percent) =>
      onProgress?.({
        percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : null,
        stage: 'Changing speed',
      }),
  })
}
