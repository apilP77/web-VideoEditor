/** Job types that only make a preview and can be paused for other work. */
const PREEMPTIBLE_TYPES = new Set(['previewProxy'])

/**
 * Whether a job of this type can be paused so other FFmpeg work runs first.
 *
 * @param {string} type FFmpeg job type.
 * @returns {boolean} True for preview-copy jobs.
 */
export function isPreemptibleJob(type) {
  return PREEMPTIBLE_TYPES.has(type)
}

/**
 * Picks the waiting or running jobs to pause when a new job arrives.
 *
 * FFmpeg runs one job at a time. A preview copy of a large video can take
 * minutes, so audio extraction, exports and metadata reads must not queue
 * behind it: the copy is paused and started again after them.
 *
 * @param {Iterable<[number, {type: string, preempted?: boolean}]>} pendingJobs
 *   Jobs sent to the worker that have not finished, by request id.
 * @param {string} incomingType Type of the job about to be sent.
 * @returns {number[]} Request ids to cancel and send again later.
 */
export function getJobsToPreempt(pendingJobs, incomingType) {
  if (isPreemptibleJob(incomingType)) return []
  const ids = []
  for (const [requestId, job] of pendingJobs) {
    if (isPreemptibleJob(job.type) && !job.preempted) ids.push(requestId)
  }
  return ids
}
