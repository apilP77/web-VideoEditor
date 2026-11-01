/**
 * Works out the model download speed from two progress reports.
 *
 * The first report has nothing to compare against, so `previous` is null
 * then. Reports may also have no `file` (overall progress across all model
 * files), so a missing file must not be mistaken for a match.
 *
 * @param {{file?: string, bytes: number, time: number} | null} previous
 *   The last measured sample, or null before the first one.
 * @param {{file?: string, loadedBytes?: number | null}} progress
 *   The new loading-model progress report.
 * @param {number} now Current monotonic time in milliseconds.
 * @returns {{bytesPerSecond: number | null, sample: {file?: string, bytes: number, time: number} | null}}
 *   Speed (null when it cannot be measured yet) and the sample to keep.
 */
export function measureDownloadSpeed(previous, progress, now) {
  if (!Number.isFinite(progress?.loadedBytes)) {
    return { bytesPerSecond: null, sample: previous ?? null }
  }

  const sample = { file: progress.file, bytes: progress.loadedBytes, time: now }
  if (
    !previous ||
    previous.file !== progress.file ||
    !(now > previous.time) ||
    progress.loadedBytes < previous.bytes
  ) {
    return { bytesPerSecond: null, sample }
  }

  const bytesPerSecond =
    ((progress.loadedBytes - previous.bytes) / (now - previous.time)) * 1000
  return { bytesPerSecond: bytesPerSecond > 0 ? bytesPerSecond : null, sample }
}
