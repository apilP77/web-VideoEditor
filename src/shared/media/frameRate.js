import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

/**
 * Estimates a video's frame rate from its frame timestamps.
 *
 * @param {File} file Local video file.
 * @returns {Promise<number | null>} Best-guess frame rate, or null when unavailable.
 */
export async function getVideoFrameRate(file) {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  })

  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) return null
    const metrics = await track.computeFrameRateMetrics()
    return Number.isFinite(metrics.bestGuessFrameRate)
      ? metrics.bestGuessFrameRate
      : null
  } finally {
    input.dispose()
  }
}
