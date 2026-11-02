import { BATCH_MODES } from './batchMode.js'

export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4

/**
 * Keeps a speed inside the supported range.
 *
 * @param {number} value Requested speed.
 * @param {number} [fallback] Used when the value is not a number.
 * @returns {number} Speed between 0.25x and 4x.
 */
export function clampSpeed(value, fallback = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, number))
}

/**
 * Works out which speed one video gets.
 *
 * @param {{mode: string, sharedSpeed: number, itemSpeeds: Record<string, number>, itemId: string}} input
 *   Mode, the "same for all" speed, per-video speeds keyed by item id, and the item.
 * @returns {number} Speed for that video.
 */
export function getItemSpeed({ mode, sharedSpeed, itemSpeeds, itemId }) {
  if (mode === BATCH_MODES.each && Number.isFinite(itemSpeeds?.[itemId])) {
    return clampSpeed(itemSpeeds[itemId], sharedSpeed)
  }
  return clampSpeed(sharedSpeed)
}

/**
 * Explains why the batch cannot start yet, or returns an empty string.
 * A video left at 1x would come out unchanged, so it blocks starting.
 *
 * @param {{items: Array<{id: string, name: string, status: string}>, mode: string, sharedSpeed: number, itemSpeeds: Record<string, number>}} input
 *   Queue items and the speed settings.
 * @returns {string} Message for the user, or '' when ready.
 */
export function getBlockingReason({ items, mode, sharedSpeed, itemSpeeds }) {
  const waiting = items.filter((item) => item.status === 'queued')
  if (waiting.length === 0) return ''
  if (mode === BATCH_MODES.all) {
    return getItemSpeed({ mode, sharedSpeed, itemSpeeds, itemId: '' }) === 1
      ? 'Pick a speed other than 1x; at 1x the videos would not change.'
      : ''
  }
  const unchanged = waiting.filter(
    (item) => getItemSpeed({ mode, sharedSpeed, itemSpeeds, itemId: item.id }) === 1,
  )
  if (unchanged.length === 0) return ''
  return unchanged.length === 1
    ? `${unchanged[0].name} is still at 1x. Change its speed or remove it.`
    : `${unchanged.length} videos are still at 1x. Change their speed or remove them.`
}

/**
 * Length of a video after a speed change.
 *
 * @param {number} duration Original length in seconds.
 * @param {number} speed Speed multiplier.
 * @returns {number | null} New length in seconds, or null when the length is unknown.
 */
export function estimateLength(duration, speed) {
  if (!Number.isFinite(duration) || duration <= 0) return null
  return duration / clampSpeed(speed)
}
