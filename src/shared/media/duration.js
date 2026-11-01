/**
 * Selects the first valid positive duration from browser metadata or inspection.
 *
 * @param {...number} candidates Duration values in preference order.
 * @returns {number} The first finite positive duration, or zero when none exists.
 */
export function getMediaDuration(...candidates) {
  return candidates.find((duration) => Number.isFinite(duration) && duration > 0) ?? 0
}
