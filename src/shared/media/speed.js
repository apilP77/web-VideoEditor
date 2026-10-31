/**
 * Calculates the output duration for a playback-speed change.
 *
 * @param {number} duration Original duration in seconds.
 * @param {number} speed Playback-speed multiplier.
 * @returns {number} Duration after applying the speed.
 */
export function calculateNewDuration(duration, speed) {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError('Duration must be a non-negative finite number.')
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError('Speed must be a positive finite number.')
  }

  return duration / speed
}
