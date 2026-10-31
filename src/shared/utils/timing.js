/**
 * Reads a monotonic timestamp for measuring elapsed processing time.
 *
 * @returns {number} Current high-resolution timestamp in milliseconds.
 */
export function getMonotonicTime() {
  return performance.now()
}
