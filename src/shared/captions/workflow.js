/**
 * Determines whether a caption workflow step may be opened.
 *
 * @param {number} step Workflow step number from 1 to 3.
 * @param {boolean} hasCaptions Whether a transcription has completed.
 * @returns {boolean} Whether the step is available.
 */
export function canOpenCaptionStep(step, hasCaptions) {
  if (step === 1 || step === 2) return true
  return step === 3 && hasCaptions
}
